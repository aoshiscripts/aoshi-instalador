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
  $('#tabs').innerHTML = state.tabs.map(t => `<div class="tab${t.id === state.active ? ' on' : ''}${t.loading ? ' loading' : ''}" data-id="${t.id}" title="${esc(t.title)} — ${esc(t.profileName)}">
    <span class="dot" style="background:${t.profileId ? esc(t.color || profColor(t.profileId)) : '#52525b'}"></span><span class="t">${esc(t.title)}</span><span class="p">${esc(t.profileName)}</span><span class="x" data-x="${t.id}" title="Fechar (Ctrl+W)">✕</span></div>`).join('');
  const a = active();
  if (a) {
    if (document.activeElement !== $('#addr')) $('#addr').value = a.url;
    $('#back').disabled = !a.canBack; $('#fwd').disabled = !a.canFwd;
    $('#proxy-name').textContent = a.profileName;
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
$('#tabs').addEventListener('contextmenu', e => { const t = e.target.closest('.tab'); if (t) { e.preventDefault(); aoshi.activate(t.dataset.id); openPick('change'); } });

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
  renderPick();
  show('#m-pick', true);
}
function renderPick() {
  const items = [{ id: '', name: 'Sem proxy', color: '#52525b', meta: 'conexão direta' }].concat(profiles.map(p => ({ id: p.id, name: p.name, color: p.color, meta: p.proxy && p.proxy.host ? `${p.proxy.type || 'http'}://${p.proxy.host}:${p.proxy.port}` : 'sem endereço' })));
  $('#pick-list').innerHTML = items.map(i => `<div class="pick${i.id === pickSel ? ' on' : ''}" data-id="${esc(i.id)}"><span class="dot" style="background:${esc(i.color)}"></span><span class="n">${esc(i.name)}</span><span class="m">${esc(i.meta)}</span></div>`).join('');
}
$('#pick-list').addEventListener('click', e => { const p = e.target.closest('.pick'); if (!p) return; pickSel = p.dataset.id; renderPick(); });
$('#pick-list').addEventListener('dblclick', () => $('#pick-ok').click());
$('#pick-ok').onclick = async () => {
  localStorage.setItem('last-profile', pickSel);
  show('#m-pick', false);
  if (pickMode === 'new') await aoshi.newTab(pickSel, $('#pick-url').value.trim() || 'https://www.tribalwars.com.br/');
  else if (state.active) await aoshi.setProfile(state.active, pickSel);
};
$('#pick-manage').onclick = () => { show('#m-pick', false); openProfiles(); };

// Perfis de proxy
let draft = [];
const COLORS = ['#8b5cf6', '#22c55e', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#eab308', '#3b82f6'];
function openProfiles() { draft = JSON.parse(JSON.stringify(profiles)); renderProfiles(); show('#m-prof', true); }
function renderProfiles() {
  $('#prof-list').innerHTML = (draft.length ? `<div class="prof-head"><span></span><span>Nome</span><span>Tipo</span><span>Endereço</span><span>Porta</span><span>Usuário</span><span>Senha</span><span></span><span></span></div>` : '<div class="hint">Nenhum perfil ainda. Clique em "+ Novo perfil".</div>') +
    draft.map((p, i) => `<div class="prof" data-i="${i}">
      <input type="color" data-k="color" value="${esc(p.color || '#8b5cf6')}" title="Cor da aba">
      <input data-k="name" value="${esc(p.name)}" placeholder="Nome">
      <select data-k="type">${['http', 'https', 'socks5'].map(t => `<option value="${t}"${(p.proxy.type || 'http') === t ? ' selected' : ''}>${t.toUpperCase()}</option>`).join('')}</select>
      <input data-k="host" value="${esc(p.proxy.host)}" placeholder="ip ou endereço">
      <input data-k="port" value="${esc(p.proxy.port)}" placeholder="porta" inputmode="numeric">
      <input data-k="user" value="${esc(p.proxy.user)}" placeholder="usuário (opcional)">
      <input data-k="pass" type="password" value="${esc(p.proxy.pass)}" placeholder="senha (opcional)">
      <button class="ghost" data-test="${i}" title="Mostra o IP que o site vê por este proxy">Testar</button>
      <button class="ghost" data-del="${i}" title="Excluir">✕</button>
      <div class="res" data-res="${i}"></div></div>`).join('');
}
$('#prof-list').addEventListener('input', e => {
  const row = e.target.closest('.prof'); if (!row) return;
  const p = draft[+row.dataset.i], k = e.target.dataset.k;
  if (k === 'name' || k === 'color') p[k] = e.target.value; else p.proxy[k] = e.target.value;
});
$('#prof-list').addEventListener('click', async e => {
  const d = e.target.closest('[data-del]'); if (d) { draft.splice(+d.dataset.del, 1); renderProfiles(); return; }
  const t = e.target.closest('[data-test]'); if (!t) return;
  const i = +t.dataset.test, res = document.querySelector(`[data-res="${i}"]`);
  res.className = 'res'; res.textContent = 'Testando…';
  const r = await aoshi.testProfile(draft[i]);
  res.className = 'res ' + (r.ok ? 'ok' : 'bad');
  res.textContent = r.ok ? `Funcionando · o site vê o IP ${r.ip}` : `Não conectou: ${r.message}`;
});
$('#prof-add').onclick = () => { draft.push({ id: '', name: `Proxy ${draft.length + 1}`, color: COLORS[draft.length % COLORS.length], proxy: { type: 'http', host: '', port: '', user: '', pass: '' } }); renderProfiles(); };
$('#prof-save').onclick = async () => { profiles = await aoshi.saveProfiles(draft); show('#m-prof', false); renderTabs(); };
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
  $('#clr-prof').innerHTML = '<option value="*">Todos os perfis</option><option value="">Sem proxy</option>' + setInfo.profiles.map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  $('#clr-info').textContent = `Cache ocupando cerca de ${setInfo.cacheMB} MB.`;
  $('#set-script').textContent = setInfo.script ? 'v' + setInfo.script : '—';
  $('#set-script-when').textContent = fmtWhen(setInfo.scriptWhen);
  $('#set-token-st').textContent = setInfo.hasToken ? 'Token salvo (cifrado neste computador).' : 'Nenhum token salvo.';
  $('#set-ver').textContent = 'v' + setInfo.version;
  $('#set-app-msg').textContent = '';
  showSec(sec || document.querySelector('.set-nav a.on')?.dataset.sec || 'geral');
  show('#m-set', true);
}
function showSec(sec) {
  document.querySelectorAll('.set-nav a').forEach(a => a.classList.toggle('on', a.dataset.sec === sec));
  document.querySelectorAll('.set-body section').forEach(s => { s.hidden = s.dataset.sec !== sec; });
}
async function saveSetting(k, v) { settings = await aoshi.saveSettings({ [k]: v }); renderTabs(); }
$('.set-nav').addEventListener('click', e => { const a = e.target.closest('a[data-sec]'); if (a) showSec(a.dataset.sec); });
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
$('#down-pick').onclick = async () => { const d = await aoshi.pickDownloads(); if (d) { $('#down-dir').value = d; saveSetting('downloadDir', d); } };
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
  else if (ch === 'profiles') { profiles = d.profiles || []; renderTabs(); }
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
