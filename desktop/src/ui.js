// Barra do Aoshi Pro Desktop: abas, endereço, proxy de cada aba, perfis e token.
'use strict';
const $ = s => document.querySelector(s);
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let state = { tabs: [], active: null }, profiles = [];
const active = () => state.tabs.find(t => t.id === state.active);
const profName = id => (profiles.find(p => p.id === id) || {}).name || 'Sem proxy';
const profColor = id => (profiles.find(p => p.id === id) || {}).color || '#52525b';

// ---------- Abas ----------
function renderTabs() {
  if (editingTab && document.querySelector('#tabs .tab-edit')) return; // não redesenha enquanto renomeia
  const tabsHTML = state.tabs.map(t => {
    const tip = [t.name ? `${t.name} — ${t.title}` : t.title, t.profileId ? `Proxy: ${t.profileName}${t.proxyHost ? ' (' + t.proxyHost + ')' : ''}${t.proxyIp ? ' · IP ' + t.proxyIp : ''}` : 'Sem proxy (conexão direta)', 'Duplo clique: renomear · botão direito: mais opções'].join('\n');
    const mark = /^[a-z]{2}$/.test(t.country || '') ? `<img class="tflag" src="flags/${t.country}.svg" alt="">` : `<span class="dot" style="background:${t.profileId ? esc(t.color || profColor(t.profileId)) : '#52525b'}"></span>`;
    return `<div class="tab${t.id === state.active ? ' on' : ''}${t.loading ? ' loading' : ''}${t.name ? ' named' : ''}" data-id="${t.id}" title="${esc(tip)}">
    ${mark}<span class="t">${esc(t.name || t.title)}</span><span class="p">${esc(t.profileName)}</span><span class="x" data-x="${t.id}" title="Fechar (Ctrl+W)">✕</span></div>`;
  }).join('');
  if ($('#tabs').dataset.html !== tabsHTML) { $('#tabs').innerHTML = tabsHTML; $('#tabs').dataset.html = tabsHTML; }
  const a = active();
  if (a) {
    if (document.activeElement !== $('#addr')) $('#addr').value = a.url;
    $('#back').disabled = !a.canBack; $('#fwd').disabled = !a.canFwd;
    $('#proxy-name').textContent = a.profileName;
    // extensões: botões da sessão (proxy) e da aba ativa
    if (extPart !== a.partition || extTab !== String(a.wcId)) { extPart = a.partition; extTab = String(a.wcId); observeExt(extPart); }
    $('#proxy-chip .dot').style.background = a.profileId ? (a.color || profColor(a.profileId)) : '#52525b';
    document.title = `${a.title} — Aoshi Pro`;
    const zc = $('#zoom-chip'); zc.hidden = !a.zoom || a.zoom === (settings.zoom || 100); zc.textContent = (a.zoom || 100) + '%';
  }
}
$('#tabs').addEventListener('click', e => {
  const x = e.target.closest('[data-x]'); if (x) { e.stopPropagation(); aoshi.closeTab(x.dataset.x); return; }
  const t = e.target.closest('.tab'); if (t) aoshi.activate(t.dataset.id);
});
$('#tabs').addEventListener('auxclick', e => { const t = e.target.closest('.tab'); if (t && e.button === 1) aoshi.closeTab(t.dataset.id); });
$('#tabs').addEventListener('contextmenu', e => { const t = e.target.closest('.tab'); if (t) { e.preventDefault(); aoshi.tabMenu(t.dataset.id); } });
// renomear a aba: duplo clique (ou pelo botão direito)
let editingTab = null;
function startRename(id) {
  const el = document.querySelector(`#tabs .tab[data-id="${CSS.escape(id)}"]`); if (!el) return;
  const t = state.tabs.find(x => x.id === id) || {};
  editingTab = id;
  const span = el.querySelector('.t');
  const inp = document.createElement('input');
  inp.className = 'tab-edit'; inp.value = t.name || ''; inp.placeholder = 'Nome da aba'; inp.maxLength = 40;
  span.replaceWith(inp); inp.focus(); inp.select();
  let done = false;
  const finish = save => { if (done) return; done = true; editingTab = null; $('#tabs').dataset.html = ''; if (save) aoshi.renameTab(id, inp.value); renderTabs(); };
  inp.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') finish(true); else if (ev.key === 'Escape') finish(false); });
  inp.addEventListener('blur', () => finish(true));
  inp.addEventListener('mousedown', ev => ev.stopPropagation());
  inp.addEventListener('click', ev => ev.stopPropagation());
}
// duplo clique feito à mão: o primeiro clique ativa a aba e a barra se redesenha
let lastDown = { id: '', at: 0 };
$('#tabs').addEventListener('mousedown', e => {
  const t = e.target.closest('.tab'); if (!t || e.button !== 0 || e.target.closest('.x, .tab-edit')) return;
  const now = Date.now();
  if (lastDown.id === t.dataset.id && now - lastDown.at < 450) { e.preventDefault(); lastDown = { id: '', at: 0 }; setTimeout(() => startRename(t.dataset.id), 30); return; }
  lastDown = { id: t.dataset.id, at: now };
});

// ---------- Navegação ----------
$('#back').onclick = () => state.active && aoshi.nav(state.active, 'back');
$('#fwd').onclick = () => state.active && aoshi.nav(state.active, 'fwd');
$('#reload').onclick = () => state.active && aoshi.nav(state.active, 'reload');
$('#addr').addEventListener('keydown', e => { if (e.key === 'Enter' && state.active) { aoshi.nav(state.active, 'go', $('#addr').value); $('#addr').blur(); } });
$('#addr').addEventListener('focus', () => $('#addr').select());
$('#add').onclick = () => openPick('new');
$('#home').onclick = () => state.active && aoshi.nav(state.active, 'home');
$('#zoom-chip').onclick = () => state.active && aoshi.nav(state.active, 'zoom', 0);

// ---------- Buscar na página (Ctrl+F) ----------
function openFind() { $('#findbar').hidden = false; $('#find-q').focus(); $('#find-q').select(); }
function closeFind() { $('#findbar').hidden = true; $('#find-n').textContent = ''; state.active && aoshi.nav(state.active, 'find', null); }
$('#find-q').addEventListener('input', () => { const t = $('#find-q').value; if (!t) { $('#find-n').textContent = ''; aoshi.nav(state.active, 'find', null); return; } aoshi.nav(state.active, 'find', { text: t }); });
$('#find-q').addEventListener('keydown', e => { if (e.key === 'Enter') { const t = $('#find-q').value; if (t) aoshi.nav(state.active, 'find', { text: t, next: true, forward: !e.shiftKey }); } if (e.key === 'Escape') closeFind(); });
$('#find-next').onclick = () => { const t = $('#find-q').value; if (t) aoshi.nav(state.active, 'find', { text: t, next: true }); };
$('#find-prev').onclick = () => { const t = $('#find-q').value; if (t) aoshi.nav(state.active, 'find', { text: t, next: true, forward: false }); };
$('#find-x').onclick = closeFind;
$('#proxy-chip').onclick = () => openPick('change');

// ---------- Janelinhas ----------
function show(id, on) {
  $(id).hidden = !on;
  aoshi.modal(!!document.querySelector('.modal:not([hidden])'));
}
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) show('#' + m.id, false); });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach(m => show('#' + m.id, false)); });

// Escolher o proxy (nova aba ou trocar o da aba atual)
let pickMode = 'new', pickSel = '';
function openPick(mode) {
  pickMode = mode;
  const a = active();
  pickSel = mode === 'change' && a ? a.profileId : (localStorage.getItem('last-profile') || '');
  if (pickSel && !profiles.some(p => p.id === pickSel)) pickSel = '';
  $('#pick-title').textContent = mode === 'new' ? 'Nova aba' : 'Proxy desta aba';
  $('#pick-ok').textContent = mode === 'new' ? 'Abrir' : 'Aplicar';
  $('#pick-url-row').hidden = mode !== 'new';
  $('#pick-q').value = '';
  renderPick();
  show('#m-pick', true);
}
function renderPick() {
  const q = ($('#pick-q').value || '').trim().toLowerCase();
  const items = [{ id: '', label: 'Sem proxy', meta: 'conexão direta', html: '<span class="num">—</span><span class="flag none">🖥</span>' }]
    .concat(profiles.map((p, i) => ({ id: p.id, i, p, label: p.name, meta: `${p.proxy.host}:${p.proxy.port}` })))
    .filter(it => !q || !it.p || `${it.i + 1} ${it.label} ${it.meta} ${it.p.countryName} ${countryPT(it.p)} ${it.p.country} ${it.p.ip}`.toLowerCase().includes(q));
  $('#pick-q').hidden = profiles.length < 6;
  $('#pick-list').innerHTML = items.map(it => `<div class="pick${it.id === pickSel ? ' on' : ''}${it.p && it.p.status === 'bad' ? ' is-bad' : ''}" data-id="${esc(it.id)}">${it.p ? `<span class="num">${it.i + 1}</span>${flagOf(it.p)}` : it.html}<span class="n">${esc(it.label)}</span><span class="m">${esc(it.meta)}</span>${it.p ? latOf(it.p) : ''}</div>`).join('') || '<div class="hint">Nada com esse filtro.</div>';
}
$('#pick-q').addEventListener('input', renderPick);
$('#pick-list').addEventListener('click', e => { const p = e.target.closest('.pick'); if (!p) return; pickSel = p.dataset.id; renderPick(); });
$('#pick-list').addEventListener('dblclick', () => $('#pick-ok').click());
$('#pick-ok').onclick = async () => {
  localStorage.setItem('last-profile', pickSel);
  show('#m-pick', false);
  if (pickMode === 'new') await aoshi.newTab(pickSel, $('#pick-url').value.trim() || 'https://www.tribalwars.com.br/');
  else if (state.active) await aoshi.setProfile(state.active, pickSel);
};
$('#pick-manage').onclick = () => { show('#m-pick', false); openProfiles(); };

// ---------- Proxies ----------
// Lista numerada; cada proxy é um perfil (cookies próprios). Colar uma lista grande: um por linha,
// endereço:porta:usuário:senha. Os novos são testados sozinhos (país, IP e latência até o Tribal Wars).
const COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#eab308', '#3b82f6'];
const testing = new Set();
let regionPT = null; try { regionPT = new Intl.DisplayNames(['pt-BR'], { type: 'region' }); } catch (_) {}
const countryPT = p => { const cc = (p && p.country || '').toUpperCase(); if (/^[A-Z]{2}$/.test(cc)) { try { return regionPT ? regionPT.of(cc) : (p.countryName || cc); } catch (_) {} } return p && p.countryName || ''; };
const flagOf = p => p && /^[a-z]{2}$/.test(p.country || '') ? `<img class="flag" src="flags/${p.country}.svg" alt="${esc(p.country.toUpperCase())}" title="${esc(countryPT(p))}">` : '<span class="flag none" title="País ainda não detectado">🌐</span>';
const latOf = p => {
  if (!p) return '';
  if (testing.has(p.id)) return '<span class="lat t">testando…</span>';
  if (p.status === 'bad') return `<span class="lat bad" title="${esc(p.error || '')}">falhou</span>`;
  if (p.status === 'ok') return p.latency == null ? '<span class="lat ok">ok</span>' : `<span class="lat ${p.latency < 200 ? 'ok' : p.latency < 500 ? 'mid' : 'slow'}">${p.latency} ms</span>`;
  return '<span class="lat">—</span>';
};
function parseProxy(line, type) {
  let s = String(line || '').trim();
  if (!s || s.startsWith('#')) return null;
  let t = type || 'http';
  const m = s.match(/^(https?|socks5h?|socks4?):\/\//i);
  if (m) { t = /^socks/i.test(m[1]) ? 'socks5' : m[1].toLowerCase(); s = s.slice(m[0].length); }
  let host, port, user = '', pass = '';
  if (s.includes('@')) { const at = s.lastIndexOf('@'); const cred = s.slice(0, at), hp = s.slice(at + 1); [user, pass = ''] = cred.split(':'); [host, port] = hp.split(':'); }
  else { const parts = s.split(':'); if (parts.length < 2) return null; [host, port] = parts; user = parts[2] || ''; pass = parts.slice(3).join(':'); }
  host = String(host || '').trim(); port = Number(port);
  if (!host || !(port > 0 && port < 65536)) return null;
  return { type: t, host, port, user: user.trim(), pass: pass.trim() };
}
let saveTimer = 0;
const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(async () => { profiles = await aoshi.saveProfiles(profiles); renderProfiles(); renderTabs(); }, 250); };
function addProxies(text, type) {
  const have = new Set(profiles.map(p => `${p.proxy.host}:${p.proxy.port}:${p.proxy.user}`.toLowerCase()));
  let added = 0, dup = 0, bad = 0; const fresh = [];
  String(text || '').split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    const px = parseProxy(line, type); if (!px) { bad++; return; }
    const k = `${px.host}:${px.port}:${px.user}`.toLowerCase(); if (have.has(k)) { dup++; return; }
    have.add(k);
    const n = profiles.length + 1;
    const p = { id: (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)), name: `Proxy ${n}`, color: COLORS[(n - 1) % COLORS.length], proxy: px, status: '', latency: null };
    profiles.push(p); fresh.push(p); added++;
  });
  $('#px-stat').textContent = `${added} adicionado(s)` + (dup ? ` · ${dup} repetido(s)` : '') + (bad ? ` · ${bad} linha(s) fora do formato` : '');
  saveSoon(); renderProfiles();
  testList(fresh);
  return added;
}
// testa vários ao mesmo tempo (16 por vez)
let testQueue = [], running = 0;
function testList(list) {
  list.forEach(p => { if (!testQueue.includes(p.id) && !testing.has(p.id)) testQueue.push(p.id); });
  pump();
}
function pump() {
  while (running < 16 && testQueue.length) {
    const id = testQueue.shift(), p = profiles.find(x => x.id === id); if (!p) continue;
    running++; testing.add(id); renderRow(id);
    aoshi.testProfile(p).then(r => {
      const cur = profiles.find(x => x.id === id); if (!cur) return;
      Object.assign(cur, r.ok ? { status: 'ok', ip: r.ip, country: r.country || '', countryName: r.countryName || '', latency: r.latency, error: '' } : { status: 'bad', latency: null, error: r.message || 'não conectou' }, { testedAt: Date.now() });
    }).catch(() => {}).finally(() => {
      running--; testing.delete(id); renderRow(id); updateStat(); saveSoon(); pump();
    });
  }
  updateStat();
}
let wasTesting = false;
function updateStat() {
  const left = testQueue.length + running;
  if (left) { $('#px-stat').textContent = `Testando… faltam ${left}`; wasTesting = true; }
  else if (wasTesting) { wasTesting = false; const ok = profiles.filter(p => p.status === 'ok').length, bad = profiles.filter(p => p.status === 'bad').length; $('#px-stat').textContent = `Teste concluído: ${ok} funcionando, ${bad} com falha.`; }
  const ok = profiles.filter(p => p.status === 'ok').length, bad = profiles.filter(p => p.status === 'bad').length;
  $('#px-count').textContent = `${profiles.length} proxies · ${ok} funcionando · ${bad} com falha`;
}
const rowHTML = (p, i) => `<div class="pxr${p.status === 'bad' ? ' is-bad' : ''}" data-id="${esc(p.id)}">
  <span class="num">${i + 1}</span>${flagOf(p)}
  <input class="nm" data-k="name" value="${esc(p.name)}" title="Nome">
  <span class="addr" title="${esc(p.proxy.type)}://${esc(p.proxy.host)}:${esc(p.proxy.port)}">${esc(p.proxy.host)}:${esc(p.proxy.port)}</span>
  <span class="usr">${p.proxy.user ? esc(p.proxy.user) : '<i>sem login</i>'}</span>
  <span class="cty" title="${esc(p.ip ? 'IP visto pelos sites: ' + p.ip : '')}">${esc(countryPT(p))}</span>
  ${latOf(p)}
  <button class="ghost sm" data-test title="Testar de novo">Testar</button><button class="ghost sm" data-open title="Abre uma aba com este proxy numa página que mostra o IP e o país">Abrir</button><button class="ghost sm" data-del title="Excluir">✕</button>
  ${p.status === 'bad' && p.error ? `<div class="pxerr">${esc(p.error)}</div>` : ''}</div>`;
function renderProfiles() {
  const q = ($('#px-q').value || '').trim().toLowerCase();
  const list = profiles.map((p, i) => [p, i]).filter(([p, i]) => !q || `${i + 1} ${p.name} ${p.proxy.host}:${p.proxy.port} ${p.proxy.user} ${p.countryName} ${countryPT(p)} ${p.country} ${p.ip}`.toLowerCase().includes(q));
  $('#prof-list').innerHTML = profiles.length ? `<div class="pxr head"><span>#</span><span></span><span>Nome</span><span>Endereço</span><span>Usuário</span><span>País</span><span>Latência</span><span></span><span></span><span></span></div>` + list.map(([p, i]) => rowHTML(p, i)).join('') : '<div class="hint empty">Nenhum proxy ainda. Cole uma lista acima ou adicione um.</div>';
  updateStat();
}
function renderRow(id) {
  const el = document.querySelector(`.pxr[data-id="${CSS.escape(id)}"]`); if (!el) return;
  const i = profiles.findIndex(p => p.id === id); if (i < 0) return;
  el.outerHTML = rowHTML(profiles[i], i);
}
function openProfiles() { renderProfiles(); show('#m-prof', true); }
$('#px-bulk-add').onclick = () => { const n = addProxies($('#px-bulk').value, $('#px-type').value); if (n) $('#px-bulk').value = ''; };
$('#px-one-add').onclick = () => { const v = $('#px-one').value; if (!parseProxy(v, 'http')) { $('#px-stat').textContent = 'Formato: endereço:porta:usuário:senha'; return; } if (addProxies(v, $('#px-type').value)) $('#px-one').value = ''; };
$('#px-one').addEventListener('keydown', e => { if (e.key === 'Enter') $('#px-one-add').click(); });
$('#px-q').addEventListener('input', renderProfiles);
$('#px-test-all').onclick = () => testList(profiles);
$('#px-del-bad').onclick = () => { const n = profiles.filter(p => p.status === 'bad').length; if (!n) { $('#px-stat').textContent = 'Nenhum proxy com falha.'; return; } profiles = profiles.filter(p => p.status !== 'bad'); $('#px-stat').textContent = `${n} removido(s).`; saveSoon(); renderProfiles(); };
$('#px-del-all').onclick = e => {
  const b = e.currentTarget;
  if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmar: excluir todos'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Excluir todos'; }, 4000); return; }
  b.dataset.confirm = ''; b.textContent = 'Excluir todos'; testQueue = []; profiles = []; saveSoon(); renderProfiles();
};
$('#prof-list').addEventListener('change', e => {
  const row = e.target.closest('.pxr'); if (!row || e.target.dataset.k !== 'name') return;
  const p = profiles.find(x => x.id === row.dataset.id); if (!p) return;
  p.name = e.target.value.trim().slice(0, 40) || p.name; saveSoon();
});
$('#prof-list').addEventListener('click', e => {
  const row = e.target.closest('.pxr'); if (!row || row.classList.contains('head')) return;
  const id = row.dataset.id;
  if (e.target.closest('[data-del]')) { profiles = profiles.filter(p => p.id !== id); testQueue = testQueue.filter(x => x !== id); saveSoon(); renderProfiles(); return; }
  if (e.target.closest('[data-test]')) { const p = profiles.find(x => x.id === id); if (p) testList([p]); }
  if (e.target.closest('[data-open]')) { show('#m-prof', false); aoshi.newTab(id, 'https://ipwho.is/'); }
});
$('#btn-profiles').onclick = openProfiles;

// ---------- Configurações ----------
let settings = {}, setInfo = {};
const fmtWhen = t => t ? new Date(t).toLocaleString('pt-BR') : '—';
async function openSettings(sec) {
  setInfo = await aoshi.getSettings(); settings = setInfo.settings;
  const zs = $('[data-s="zoom"]'); if (!zs.options.length) zs.innerHTML = [67, 75, 80, 90, 100, 110, 125, 150, 175, 200].map(z => `<option value="${z}">${z}%</option>`).join('');
  document.querySelectorAll('#m-set [data-s]').forEach(el => { const v = settings[el.dataset.s]; if (el.type === 'checkbox') el.checked = !!v; else el.value = String(v ?? ''); });
  document.querySelectorAll('#m-set input[name="startup"]').forEach(r => { r.checked = r.value === settings.startup; });
  $('#down-dir').value = settings.downloadDir || setInfo.downloadsDefault;
  $('#clr-prof').innerHTML = '<option value="*">Todos os proxies</option><option value="">Sem proxy</option>' + setInfo.profiles.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('#clr-info').textContent = `Cache ocupando cerca de ${setInfo.cacheMB} MB.`;
  $('#set-script').textContent = setInfo.script ? 'v' + setInfo.script : '—';
  $('#set-script-when').textContent = fmtWhen(setInfo.scriptWhen);
  $('#set-token-st').textContent = setInfo.hasToken ? 'Token salvo (cifrado neste computador).' : 'Nenhum token salvo.';
  $('#set-ver').textContent = 'v' + setInfo.version;
  $('#set-app-msg').textContent = '';
  $('#set-brand-ver').textContent = 'Aoshi Pro Desktop v' + setInfo.version;
  $('#set-about').textContent = `Versão ${setInfo.version} · Chrome ${setInfo.chrome} · Electron ${setInfo.electron}`;
  $('#down-dir-txt').textContent = settings.downloadDir || setInfo.downloadsDefault;
  $('#set-px-count').textContent = setInfo.profileCount ? `${setInfo.profileCount} proxies cadastrados` : 'Nenhum proxy cadastrado';
  document.querySelectorAll('#m-set .swatch').forEach(b => b.classList.toggle('on', b.dataset.accent.toLowerCase() === String(settings.accent || '#7c3aed').toLowerCase()));
  $('#set-q').value = ''; filterSettings('');
  showSec(sec || document.querySelector('.set-nav a.on')?.dataset.sec || 'geral');
  show('#m-set', true);
}
function showSec(sec, keepQuery) {
  if (!keepQuery && $('#set-q') && $('#set-q').value) { $('#set-q').value = ''; filterSettings(''); }
  document.querySelectorAll('.set-nav a').forEach(a => a.classList.toggle('on', a.dataset.sec === sec));
  document.querySelectorAll('.set-body section').forEach(s => { s.hidden = s.dataset.sec !== sec; });
  if (sec === 'ext') renderExt();
}
async function saveSetting(k, v) { settings = await aoshi.saveSettings({ [k]: v }); applyLook(settings); renderTabs(); }
// ---------- Aparência ----------
function shade(hex, f) { const n = parseInt(String(hex).slice(1), 16); if (!Number.isFinite(n)) return hex; let r = n >> 16, g = (n >> 8) & 255, b = n & 255; r = Math.round(r + (255 - r) * f); g = Math.round(g + (255 - g) * f); b = Math.round(b + (255 - b) * f); return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1); }
function applyLook(st) {
  st = st || {};
  const acc = /^#[0-9a-f]{6}$/i.test(st.accent || '') ? st.accent : '#7c3aed';
  document.documentElement.style.setProperty('--acc', acc);
  document.documentElement.style.setProperty('--acc2', shade(acc, 0.18));
  document.body.classList.toggle('no-tabproxy', st.tabProxy === false);
  document.body.classList.toggle('tab-compact', !!st.tabCompact);
}
aoshi.getSettings().then(i => { settings = i.settings; applyLook(settings); }).catch(() => {});
$('#m-set').addEventListener('click', e => {
  const sw = e.target.closest('.swatch'); if (sw) { document.querySelectorAll('#m-set .swatch').forEach(b => b.classList.toggle('on', b === sw)); saveSetting('accent', sw.dataset.accent); return; }
  const it = e.target.closest('.item.radio'); if (it && !e.target.matches('input')) { const r = it.querySelector('input[type=radio]'); if (r && !r.checked) { r.checked = true; saveSetting('startup', r.value); } }
});
// busca nas configurações: mostra só os itens que combinam, de todas as seções
function filterSettings(q) {
  q = String(q || '').trim().toLowerCase();
  $('.set-body').classList.toggle('searching', !!q);
  const secs = [...document.querySelectorAll('.set-body section')];
  if (!q) { secs.forEach(sec => { sec.querySelectorAll('.item, .group, h4').forEach(el => { el.hidden = false; }); }); $('.set-empty').hidden = true; showSec(document.querySelector('.set-nav a.on')?.dataset.sec || 'geral', true); return; }
  let any = false;
  secs.forEach(sec => {
    let secHit = false;
    sec.querySelectorAll('.group').forEach(g => {
      let gHit = false;
      g.querySelectorAll(':scope > .item').forEach(it => { const hit = (it.textContent + ' ' + (sec.querySelector('.sec-head')?.textContent || '')).toLowerCase().includes(q); it.hidden = !hit; gHit = gHit || hit; });
      g.hidden = !gHit; const h = g.previousElementSibling; if (h && h.tagName === 'H4') h.hidden = !gHit;
      secHit = secHit || gHit;
    });
    sec.hidden = !secHit; any = any || secHit;
  });
  $('.set-empty').hidden = any;
}
$('#set-q').addEventListener('input', e => filterSettings(e.target.value));
$('.set-nav').addEventListener('click', e => { const a = e.target.closest('a[data-sec]'); if (a) showSec(a.dataset.sec); });
// ---------- Extensões ----------
async function renderExt(list) {
  list = list || await aoshi.extList();
  extNames = list;
  $('#ext-list').innerHTML = list.length ? list.map(e => `<div class="item"><div class="txt ext-n"><img src="${esc(e.icon || 'crx://extension-icon/' + e.id + '/32/2?partition=persist:aoshi-direto')}" alt=""><span><b>${esc(e.name)}</b><small>versão ${esc(e.version)}</small></span></div><div class="ctl"><label class="sw" title="Mostrar o botão na barra"><input type="checkbox" data-pin="${esc(e.id)}"${unpinned().has(e.id) ? '' : ' checked'}><span></span></label><button class="ghost sm" data-ext-del="${esc(e.id)}">Remover</button></div></div>`).join('') : '<div class="item"><div class="txt"><small>Nenhuma extensão instalada ainda.</small></div></div>';
}
$('#ext-store').onclick = async () => { show('#m-set', false); await aoshi.extStore(); };
// ---------- Botões das extensões na barra e menu da peça ----------
// Cada extensão fixada vira um botão ao lado do endereço (ícone, contador e janelinha). O menu da peça
// lista todas, com fixar/desafixar, como no Chrome.
let extNames = [], extPart = 'persist:aoshi-direto', extTab = '', extState = { actions: [] }, extObserved = null;
const unpinned = () => { try { return new Set(JSON.parse(localStorage.getItem('ext-unpinned') || '[]')); } catch (_) { return new Set(); } };
function setPinned(id, on) { const u = unpinned(); if (on) u.delete(id); else u.add(id); localStorage.setItem('ext-unpinned', JSON.stringify([...u])); renderExtBar(); renderExtMenu(); }
const extIcon = (id, mod) => `crx://extension-icon/${encodeURIComponent(id)}/32/2?tabId=${encodeURIComponent(extTab)}&partition=${encodeURIComponent(extPart)}${mod ? '&t=' + mod : ''}`;
const actInfo = a => Object.assign({}, a, (a.tabs || {})[extTab] || {});
const extName = id => (extNames.find(e => e.id === id) || {}).name || '';
const extPkgIcon = id => (extNames.find(e => e.id === id) || {}).icon || '';
// a barra usa o ícone oficial da extensão (do pacote); se não tiver, o ícone do botão; se esse falhar, o do pacote
function iconFallback(root) {
  root.querySelectorAll('img[data-ext-icon]').forEach(img => {
    if (img.dataset.fb) return; img.dataset.fb = '1';
    const fb = () => { const d = extPkgIcon(img.dataset.extIcon); if (d && img.src !== d) img.src = d; else img.style.visibility = 'hidden'; };
    img.addEventListener('error', fb);
    if (img.complete && !img.naturalWidth) fb();
  });
}
function renderExtBar() {
  const u = unpinned();
  const bar = $('#ext-bar');
  bar.innerHTML = (extState.actions || []).filter(a => !u.has(a.id)).map(a => { const i = actInfo(a); return `<button class="icon ext-btn" data-ext="${esc(a.id)}" title="${esc(i.title || extName(a.id))}"><img src="${extPkgIcon(a.id) || extIcon(a.id, i.iconModified)}" data-ext-icon="${esc(a.id)}" alt=""><span class="badge"${i.text ? '' : ' hidden'} style="background:${esc(i.color || 'var(--acc)')}">${esc(i.text || '')}</span></button>`; }).join('');
  iconFallback(bar);
}
function renderExtMenu() {
  const box = $('#em-list'); if (!box) return;
  const u = unpinned(), acts = new Map((extState.actions || []).map(a => [a.id, a]));
  const list = extNames.length ? extNames : (extState.actions || []).map(a => ({ id: a.id, name: a.title || a.id }));
  setTimeout(() => iconFallback(box), 0);
  box.innerHTML = list.length ? list.map(e => `<div class="em-item" data-ext="${esc(e.id)}"><img src="${extPkgIcon(e.id) || extIcon(e.id)}" data-ext-icon="${esc(e.id)}" alt=""><span class="n">${esc(e.name)}</span><button class="icon pin${u.has(e.id) ? '' : ' on'}" data-pin-toggle="${esc(e.id)}" title="${u.has(e.id) ? 'Fixar na barra' : 'Tirar da barra'}"><svg viewBox="0 0 24 24" width="15" height="15" fill="${u.has(e.id) ? 'none' : 'currentColor'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M9 4h6l-1 6 3 3v2h-4v5l-1 1-1-1v-5H7v-2l3-3z"/></svg></button></div>`).join('') : '<div class="em-empty">Nenhuma extensão instalada.<br>Abra a Chrome Web Store para adicionar.</div>';
}
function observeExt(part) {
  if (!window.browserAction) return;
  if (extObserved !== part) { try { if (extObserved) browserAction.removeObserver(extObserved); browserAction.addObserver(part); } catch (_) {} extObserved = part; }
  browserAction.getState(part).then(st => { extState = st || { actions: [] }; renderExtBar(); }).catch(() => {});
}
// nomes e ícones oficiais logo ao abrir (a barra usa o ícone do pacote)
setTimeout(() => aoshi.extList().then(l => { if (l && l.length) { extNames = l; renderExtBar(); renderExtMenu(); } }).catch(() => {}), 800);
if (window.browserAction) browserAction.addEventListener('update', st => { if (st) extState = st; renderExtBar(); renderExtMenu(); });
function activateExt(id, el) {
  if (!window.browserAction) return;
  const r = el.getBoundingClientRect();
  browserAction.activate(extPart, { eventType: 'click', extensionId: id, tabId: Number(extTab), alignment: 'bottom left', anchorRect: { x: r.left, y: r.top, width: r.width, height: r.height } });
}
$('#ext-bar').addEventListener('click', e => { const b = e.target.closest('.ext-btn'); if (b) activateExt(b.dataset.ext, b); });
$('#btn-ext').onclick = async () => { extNames = await aoshi.extList(); renderExtMenu(); show('#m-extmenu', true); };
$('#em-list').addEventListener('click', e => {
  const pin = e.target.closest('[data-pin-toggle]'); if (pin) { const id = pin.dataset.pinToggle; setPinned(id, unpinned().has(id)); return; }
  const it = e.target.closest('.em-item'); if (!it) return;
  show('#m-extmenu', false);
  const btn = document.querySelector(`#ext-bar .ext-btn[data-ext="${CSS.escape(it.dataset.ext)}"]`) || $('#btn-ext');
  setTimeout(() => activateExt(it.dataset.ext, btn), 60);
});
$('#em-store').onclick = async () => { show('#m-extmenu', false); await aoshi.extStore(); };
$('#em-manage').onclick = () => { show('#m-extmenu', false); openSettings('ext'); };
$('#ext-list').addEventListener('change', e => { const c = e.target.closest('[data-pin]'); if (c) setPinned(c.dataset.pin, c.checked); });
aoshi.extList().then(l => { extNames = l; }).catch(() => {});
$('#ext-folder').onclick = async () => { const r = await aoshi.extLoadFolder(); $('#ext-msg').textContent = r.ok ? `"${r.name}" carregada.` : (r.message ? 'Não carregou: ' + r.message : ''); renderExt(); };
$('#ext-list').addEventListener('click', async e => { const b = e.target.closest('[data-ext-del]'); if (!b) return; if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Confirmar'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Remover'; }, 4000); return; } renderExt(await aoshi.extRemove(b.dataset.extDel)); });
$('#m-set').addEventListener('change', e => {
  const el = e.target;
  if (el.name === 'startup') return saveSetting('startup', el.value);
  const k = el.dataset.s; if (!k) return;
  let v = el.type === 'checkbox' ? el.checked : el.value;
  if (k === 'zoom' || k === 'checkMin') v = Number(v);
  if (k === 'home') { v = String(v).trim(); if (v && !/^https?:\/\//i.test(v)) { v = 'https://' + v; el.value = v; } }
  saveSetting(k, v);
});
$('#btn-settings').onclick = () => openSettings();
$('#clr-go').onclick = async () => {
  const what = $('#clr-what').value, prof = $('#clr-prof').value;
  $('#clr-info').textContent = 'Limpando…';
  await aoshi.clearData({ profileId: prof, what });
  $('#clr-info').textContent = 'Pronto. ' + (what === 'cache' ? 'Cache limpo.' : 'Recarregue as abas desse perfil.');
};
$('#set-proxies').onclick = () => { show('#m-set', false); openProfiles(); };
$('#down-pick').onclick = async () => { const d = await aoshi.pickDownloads(); if (d) { $('#down-dir').value = d; $('#down-dir-txt').textContent = d; saveSetting('downloadDir', d); } };
$('#down-open').onclick = () => aoshi.openDownloads();
$('#set-check').onclick = async () => { const msg = await aoshi.checkCode(); notice(msg, /nova/i.test(msg) ? { label: 'Recarregar abas', run: () => aoshi.reloadAll() } : null); const i = await aoshi.getSettings(); $('#set-script').textContent = i.script ? 'v' + i.script : '—'; $('#set-script-when').textContent = fmtWhen(i.scriptWhen); };
$('#set-reload').onclick = () => aoshi.reloadAll();
$('#set-token').onclick = () => { show('#m-set', false); show('#m-token', true); };
$('#set-token-clear').onclick = async () => { await aoshi.clearToken(); $('#set-token-st').textContent = 'Nenhum token salvo.'; };
$('#set-app-check').onclick = async () => { $('#set-app-msg').textContent = 'Procurando…'; $('#set-app-msg').textContent = await aoshi.checkAppUpdate(); };
$('#set-releases').onclick = () => aoshi.openReleases();
$('#set-reset').onclick = async () => { settings = await aoshi.resetSettings(); show('#m-set', false); openSettings('prog'); notice('Configurações restauradas.'); };

// Token do GitHub
$('#token-ok').onclick = async () => {
  const v = $('#token').value.trim(); if (!v) { $('#token-err').textContent = 'Cole o token.'; return; }
  $('#token-err').style.color = '#9a9aa6'; $('#token-err').textContent = 'Conferindo…';
  const r = await aoshi.setToken(v);
  if (!r.ok) { $('#token-err').style.color = ''; $('#token-err').textContent = r.message; return; }
  $('#token').value = ''; show('#m-token', false);
  notice(`Aoshi Pro ${r.version} instalado.`);
};

// Aviso na barra
let noticeT = null;
function notice(text, action) {
  const n = $('#notice');
  n.innerHTML = `<span>${esc(text)}</span>` + (action ? `<button>${esc(action.label)}</button>` : '') + '<button class="icon" title="Fechar">✕</button>';
  n.hidden = false;
  const btns = n.querySelectorAll('button');
  if (action) btns[0].onclick = () => { action.run(); n.hidden = true; };
  btns[btns.length - 1].onclick = () => { n.hidden = true; };
  clearTimeout(noticeT); if (!action) noticeT = setTimeout(() => { n.hidden = true; }, 7000);
}
$('#btn-update').onclick = async () => { const msg = await aoshi.checkCode(); notice(msg, /nova/i.test(msg) ? { label: 'Recarregar abas', run: () => aoshi.reloadAll() } : null); };

// ---------- Eventos do processo principal ----------
aoshi.on((ch, d) => {
  if (ch === 'tabs') { state = d; renderTabs(); }
  else if (ch === 'profiles') {
    profiles = d.profiles || []; renderTabs();
    // 1.4.7: o teste antigo dava 407 falso em proxy HTTP com senha → testa de novo esses, uma vez
    // 1.4.9: país detectado de novo com a votação entre serviços
    if (!localStorage.getItem('px-geo-149')) { localStorage.setItem('px-geo-149', '1'); localStorage.setItem('px-retest-147', '1'); const again = profiles.filter(p => p.status === 'ok' || (p.status === 'bad' && /407|usuário ou a senha/.test(p.error || ''))); if (again.length) testList(again); }
    else if (!localStorage.getItem('px-retest-147')) { localStorage.setItem('px-retest-147', '1'); const again = profiles.filter(p => p.status === 'bad' && /407|usuário ou a senha/.test(p.error || '')); if (again.length) testList(again); }
  }
  else if (ch === 'tab-rename') startRename(d.id);
  else if (ch === 'tab-proxy') openPick('change');
  else if (ch === 'extensions') { extNames = d.list || []; observeExt(extPart); renderExtMenu(); if (!$('#m-set').hidden && !document.querySelector('section[data-sec="ext"]').hidden) renderExt(d.list || []); }
  else if (ch === 'new-tab') openPick('new');
  else if (ch === 'find-open') openFind();
  else if (ch === 'find') { $('#find-n').textContent = d.matches ? `${d.active}/${d.matches}` : '0/0'; }
  else if (ch === 'download') {
    if (d.state === 'start') notice(`Baixando ${d.name}…`);
    else if (d.state === 'completed') notice(`${d.name} baixado.`, { label: 'Mostrar na pasta', run: () => aoshi.openDownloads(d.file) });
    else if (d.state !== 'cancelled') notice(`Não consegui baixar ${d.name}.`);
  }
  else if (ch === 'need-token') { if (d.reason) $('#token-reason').textContent = d.reason; show('#m-token', true); }
  else if (ch === 'code-info') { $('#code-ver').textContent = d.version ? 'v' + d.version : ''; if (!d.hasToken) show('#m-token', true); }
  else if (ch === 'code-updated') { $('#code-ver').textContent = d.version ? 'v' + d.version : ''; if (!d.first) notice(`Aoshi Pro ${d.version} baixado.`, { label: 'Recarregar abas', run: () => aoshi.reloadAll() }); }
  else if (ch === 'app-update') {
    if (d.state === 'pronta') notice(`Versão ${d.version} do programa pronta.`, { label: 'Reiniciar e atualizar', run: () => aoshi.installUpdate() });
    else notice(`Baixando a versão ${d.version} do programa…`);
  }
});
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); openPick('new'); }
  if (e.ctrlKey && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind(); }
});
aoshi.getSettings().then(i => { settings = i.settings; });
