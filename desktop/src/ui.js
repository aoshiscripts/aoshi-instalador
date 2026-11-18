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
  else if (ch === 'need-token') { if (d.reason) $('#token-reason').textContent = d.reason; show('#m-token', true); }
  else if (ch === 'code-info') { $('#code-ver').textContent = d.version ? 'v' + d.version : ''; if (!d.hasToken) show('#m-token', true); }
  else if (ch === 'code-updated') { $('#code-ver').textContent = d.version ? 'v' + d.version : ''; if (!d.first) notice(`Aoshi Pro ${d.version} baixado.`, { label: 'Recarregar abas', run: () => aoshi.reloadAll() }); }
  else if (ch === 'app-update') {
    if (d.state === 'pronta') notice(`Versão ${d.version} do programa pronta.`, { label: 'Reiniciar e atualizar', run: () => aoshi.installUpdate() });
    else notice(`Baixando a versão ${d.version} do programa…`);
  }
});
document.addEventListener('keydown', e => { if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); openPick('new'); } });
