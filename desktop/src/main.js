// Aoshi Pro Desktop — processo principal.
// Abas (cada uma com perfil de proxy e cookies próprios), Aoshi Pro injetado nas páginas do Tribal Wars,
// script baixado do repositório privado com o token de leitura do usuário, e atualização automática.
'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, safeStorage, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');

const OWNER = 'aoshiscripts', REPO = 'aoshi-pro', FILE = 'AoshiPro-Hub.user.js', BRANCH = 'main';
const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}?ref=${BRANCH}`;
const CHECK_MIN = 5;              // confere o script novo a cada 5 min
const BAR_H = 76;                 // altura da barra (abas + endereço)
const HOME = 'https://www.tribalwars.com.br/';
const TW_HOST = /(^|\.)(tribalwars|die-staemme|staemme|plemiona|guerretribale|divokekmeny|klanhaboru|triburile|vojnaplemen)\./i;

if (!app.requestSingleInstanceLock()) { app.quit(); }

// ---------- Armazenamento ----------
const DATA_FILE = () => path.join(app.getPath('userData'), 'aoshi-desktop.json');
let store = { profiles: [], tabs: [], sharedModels: '[]', code: '', etag: '', when: 0, at: 0, token: '', win: null };
function load() { try { store = Object.assign(store, JSON.parse(fs.readFileSync(DATA_FILE(), 'utf8'))); } catch (_) {} }
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { fs.writeFileSync(DATA_FILE(), JSON.stringify(store)); } catch (_) {} }, 300); }
function saveNow() { clearTimeout(saveT); try { fs.writeFileSync(DATA_FILE(), JSON.stringify(store)); } catch (_) {} }
// token e código ficam cifrados/compactados no disco (o código não fica legível na pasta do programa)
const encToken = t => { try { return safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(t).toString('base64') : 'b64:' + Buffer.from(t).toString('base64'); } catch (_) { return 'b64:' + Buffer.from(t).toString('base64'); } };
const decToken = s => { try { if (!s) return ''; if (s.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(s.slice(4), 'base64')); if (s.startsWith('b64:')) return Buffer.from(s.slice(4), 'base64').toString(); return s; } catch (_) { return ''; } };
const packCode = c => 'gz:' + zlib.gzipSync(Buffer.from(c)).toString('base64');
const unpackCode = s => { try { return s && s.startsWith('gz:') ? zlib.gunzipSync(Buffer.from(s.slice(3), 'base64')).toString() : (s || ''); } catch (_) { return ''; } };

// ---------- Script do Aoshi Pro ----------
let codeCache = '';
async function fetchCode(token, etag) {
  const headers = { Accept: 'application/vnd.github.raw+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'AoshiProDesktop' };
  if (etag) headers['If-None-Match'] = etag;
  try {
    const r = await fetch(API, { headers });
    if (r.status === 304) return { kind: 'same' };
    const text = await r.text();
    if (r.status === 200 && text.includes('==UserScript==')) return { kind: 'new', code: text, etag: r.headers.get('etag') || '' };
    if (r.status === 401) return { kind: 'auth', message: 'Token inválido ou vencido.' };
    if (r.status === 403 || r.status === 404) return { kind: 'auth', message: `O token não tem acesso de leitura ao repositório ${OWNER}/${REPO}.` };
    return { kind: 'error', message: 'GitHub respondeu ' + r.status + '.' };
  } catch (_) { return { kind: 'error', message: 'Sem conexão com o GitHub.' }; }
}
async function checkCode(force) {
  const token = decToken(store.token);
  if (!token) { ui('need-token'); return 'Falta colar o token do GitHub.'; }
  if (!force && Date.now() - (store.at || 0) < CHECK_MIN * 60000) return 'Já está na última versão.';
  store.at = Date.now(); save();
  const had = !!store.code;
  const r = await fetchCode(token, had ? store.etag : '');
  if (r.kind === 'new') {
    store.code = packCode(r.code); store.etag = r.etag; store.when = Date.now(); codeCache = r.code; saveNow();
    ui('code-updated', { first: !had, version: versionOf(r.code) });
    if (!had) tabs.forEach(t => t.view.webContents.reload());
    return 'Versão nova baixada. Recarregue a página para usar.';
  }
  if (r.kind === 'same') return 'Já está na última versão.';
  if (r.kind === 'auth') ui('need-token', { reason: r.message });
  return r.message || 'Não consegui conferir agora.';
}
const versionOf = code => (String(code).match(/@version\s+([^\s]+)/) || [])[1] || '';
function code() { if (!codeCache) codeCache = unpackCode(store.code); return codeCache; }

// Roda o Aoshi Pro na página (mesmo mundo da página, como o instalador do Tampermonkey).
function inject(wc) {
  const c = code(); if (!c) return;
  let shared = '[]'; try { shared = JSON.stringify(JSON.parse(store.sharedModels || '[]')); } catch (_) {}
  const src = 'if (!window.__AOSHI_DESKTOP_RAN) { window.__AOSHI_DESKTOP_RAN = 1; window.__AOSHI_SHARED_MODELS = ' + shared.replace(/</g, '\\u003c') + ';\n(function(){\n' + c + '\n})(); }';
  wc.executeJavaScript(src).catch(() => {});
}

// ---------- Perfis de proxy ----------
const profileOf = id => store.profiles.find(p => p.id === id) || null;
function proxyRules(p) {
  if (!p || !p.proxy || !p.proxy.host) return null;
  const type = (p.proxy.type || 'http').toLowerCase();
  return `${type === 'socks5' ? 'socks5' : type === 'https' ? 'https' : 'http'}://${p.proxy.host}:${p.proxy.port || (type === 'socks5' ? 1080 : 8080)}`;
}
const chromeUA = () => session.defaultSession.getUserAgent().replace(/\s?Electron\/\S+/, '').replace(/\s?aoshi-pro-desktop\/\S+/i, '').replace(/\s?Aoshi Pro\/\S+/i, '');
const prepared = new Set();
async function sessionFor(profileId) {
  const part = 'persist:aoshi-' + (profileId || 'direto');
  const ses = session.fromPartition(part);
  if (!prepared.has(part)) {
    prepared.add(part);
    ses.setUserAgent(chromeUA());
  }
  const rules = proxyRules(profileOf(profileId));
  await ses.setProxy(rules ? { proxyRules: rules, proxyBypassRules: '<local>' } : { mode: 'direct' });
  await ses.closeAllConnections?.();
  return ses;
}

// ---------- Janela e abas ----------
let win = null;
const tabs = []; // { id, profileId, view }
let activeId = null;
const ui = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send('ui', ch, data || {}); };
let modalOpen = false; // janelinhas da barra ficam por baixo das abas: esconde a aba enquanto uma está aberta
function layout() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  tabs.forEach(t => {
    if (t.id === activeId && !modalOpen) { t.view.setBounds({ x: 0, y: BAR_H, width: w, height: Math.max(0, h - BAR_H) }); t.view.setVisible(true); }
    else t.view.setVisible(false);
  });
}
function tabInfo(t) {
  const wc = t.view.webContents, p = profileOf(t.profileId);
  return { id: t.id, title: wc.getTitle() || 'Nova aba', url: wc.getURL(), profileId: t.profileId || '', profileName: p ? p.name : 'Sem proxy', color: p ? p.color : '', loading: wc.isLoading(), canBack: wc.navigationHistory?.canGoBack?.() ?? wc.canGoBack(), canFwd: wc.navigationHistory?.canGoForward?.() ?? wc.canGoForward() };
}
function pushTabs() { ui('tabs', { tabs: tabs.map(tabInfo), active: activeId }); persistTabs(); }
function persistTabs() { store.tabs = tabs.map(t => ({ profileId: t.profileId || '', url: t.view.webContents.getURL() || HOME })); save(); }

async function newTab(profileId, url, activate = true) {
  const ses = await sessionFor(profileId);
  const view = new WebContentsView({ webPreferences: { session: ses, contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'preload.js'), spellcheck: false } });
  const t = { id: crypto.randomUUID(), profileId: profileId || '', view };
  tabs.push(t);
  win.contentView.addChildView(view);
  const wc = view.webContents;
  wc.setWindowOpenHandler(({ url: u }) => { newTab(t.profileId, u, true); return { action: 'deny' }; });
  wc.on('dom-ready', () => { try { if (TW_HOST.test(new URL(wc.getURL()).hostname)) inject(wc); } catch (_) {} });
  ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading'].forEach(ev => wc.on(ev, pushTabs));
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { e.preventDefault(); wc.reload(); }
    if (input.control && input.key.toLowerCase() === 't') { e.preventDefault(); ui('new-tab'); }
    if (input.control && input.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(t.id); }
    if (input.key === 'F12') { e.preventDefault(); wc.toggleDevTools(); }
  });
  wc.loadURL(url || HOME);
  if (activate) activeId = t.id;
  layout(); pushTabs();
  return t;
}
function closeTab(id) {
  const i = tabs.findIndex(t => t.id === id); if (i < 0) return;
  const [t] = tabs.splice(i, 1);
  try { win.contentView.removeChildView(t.view); t.view.webContents.close(); } catch (_) {}
  if (activeId === id) activeId = (tabs[i] || tabs[i - 1] || {}).id || null;
  if (!tabs.length) newTab('', HOME); else { layout(); pushTabs(); }
}
async function setTabProfile(id, profileId) {
  const t = tabs.find(x => x.id === id); if (!t) return;
  const url = t.view.webContents.getURL() || HOME;
  // trocar de perfil = trocar a sessão (cookies e proxy): recria a aba no mesmo lugar
  const i = tabs.indexOf(t);
  try { win.contentView.removeChildView(t.view); t.view.webContents.close(); } catch (_) {}
  tabs.splice(i, 1);
  const nt = await newTab(profileId, url, activeId === id);
  tabs.splice(tabs.indexOf(nt), 1); tabs.splice(i, 0, nt);
  if (activeId === id) activeId = nt.id;
  layout(); pushTabs();
}

function createWindow() {
  const b = store.win || {};
  win = new BrowserWindow({
    width: b.width || 1400, height: b.height || 900, x: b.x, y: b.y, minWidth: 800, minHeight: 500,
    title: 'Aoshi Pro', backgroundColor: '#121216', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'ui-preload.js'), contextIsolation: true, sandbox: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'ui.html'));
  win.once('ready-to-show', () => { if (b.max) win.maximize(); win.show(); });
  win.on('resize', layout);
  win.on('close', () => { store.win = Object.assign(win.getNormalBounds(), { max: win.isMaximized() }); persistTabs(); saveNow(); });
  win.webContents.on('did-finish-load', async () => {
    const list = store.tabs && store.tabs.length ? store.tabs : [{ profileId: '', url: HOME }];
    for (let i = 0; i < list.length; i++) await newTab(list[i].profileId, list[i].url, i === 0);
    ui('profiles', { profiles: store.profiles });
    ui('code-info', { version: versionOf(code()), when: store.when, hasToken: !!decToken(store.token) });
    checkCode(true);
  });
}

// ---------- Mensagens da barra (ui.html) ----------
ipcMain.handle('tab:new', (_, profileId, url) => newTab(profileId, url).then(() => true));
ipcMain.handle('tab:close', (_, id) => closeTab(id));
ipcMain.handle('tab:activate', (_, id) => { activeId = id; layout(); pushTabs(); });
ipcMain.handle('tab:profile', (_, id, profileId) => setTabProfile(id, profileId));
ipcMain.handle('tab:nav', (_, id, what, arg) => {
  const t = tabs.find(x => x.id === id); if (!t) return; const wc = t.view.webContents;
  if (what === 'back') wc.navigationHistory?.goBack ? wc.navigationHistory.goBack() : wc.goBack();
  else if (what === 'fwd') wc.navigationHistory?.goForward ? wc.navigationHistory.goForward() : wc.goForward();
  else if (what === 'reload') wc.reload();
  else if (what === 'go') { let u = String(arg || '').trim(); if (!/^https?:\/\//i.test(u)) u = /\.[a-z]{2,}/i.test(u) ? 'https://' + u : 'https://www.google.com/search?q=' + encodeURIComponent(u); wc.loadURL(u); }
  else if (what === 'devtools') wc.toggleDevTools();
});
ipcMain.handle('profiles:save', (_, list) => {
  store.profiles = (Array.isArray(list) ? list : []).map(p => ({ id: p.id || crypto.randomUUID(), name: String(p.name || 'Proxy').slice(0, 40), color: p.color || '#8b5cf6', proxy: { type: p.proxy?.type || 'http', host: String(p.proxy?.host || '').trim(), port: Number(p.proxy?.port) || '', user: String(p.proxy?.user || ''), pass: String(p.proxy?.pass || '') } }));
  save(); ui('profiles', { profiles: store.profiles });
  // abas abertas com perfil alterado: aplica o proxy novo
  tabs.forEach(t => { if (t.profileId) sessionFor(t.profileId).then(() => t.view.webContents.reload()); });
  return store.profiles;
});
// Testa o proxy: abre uma sessão temporária com ele e pergunta o IP visto pela internet.
ipcMain.handle('profiles:test', async (_, p) => {
  const ses = session.fromPartition('aoshi-test-' + Date.now());
  const rules = proxyRules(p);
  await ses.setProxy(rules ? { proxyRules: rules } : { mode: 'direct' });
  testCreds = p && p.proxy ? p.proxy : null;
  try {
    const r = await ses.fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    const j = await r.json();
    return { ok: true, ip: j.ip };
  } catch (e) { return { ok: false, message: e.message || 'sem resposta' }; }
  finally { testCreds = null; }
});
ipcMain.handle('token:set', async (_, token) => {
  token = String(token || '').trim();
  const r = await fetchCode(token, '');
  if (r.kind !== 'new') return { ok: false, message: r.message || 'O GitHub não aceitou esse token.' };
  store.token = encToken(token); store.code = packCode(r.code); store.etag = r.etag; store.when = Date.now(); store.at = Date.now(); codeCache = r.code; saveNow();
  tabs.forEach(t => t.view.webContents.reload());
  ui('code-info', { version: versionOf(r.code), when: store.when, hasToken: true });
  return { ok: true, version: versionOf(r.code) };
});
ipcMain.handle('code:check', () => checkCode(true));
ipcMain.handle('ui:modal', (_, on) => { modalOpen = !!on; layout(); });
ipcMain.handle('tabs:reload-all', () => tabs.forEach(t => t.view.webContents.reload()));
ipcMain.handle('app:update-install', () => { try { require('electron-updater').autoUpdater.quitAndInstall(); } catch (_) {} });
ipcMain.handle('app:version', () => app.getVersion());

// ---------- Mensagens das páginas do jogo (preload.js) ----------
ipcMain.handle('page:check', () => checkCode(true));
ipcMain.handle('page:info', () => ({ when: store.when, version: app.getVersion() }));
ipcMain.on('page:models', (_, json) => { try { if (Array.isArray(JSON.parse(json))) { store.sharedModels = json; save(); } } catch (_) {} });

// Proxy com usuário e senha.
let testCreds = null;
app.on('login', (event, wc, details, authInfo, callback) => {
  if (!authInfo.isProxy) return;
  let creds = testCreds;
  if (!creds && wc) { const t = tabs.find(x => x.view.webContents === wc); const p = t && profileOf(t.profileId); creds = p && p.proxy; }
  if (!creds && details && details.url) { /* pedidos sem aba (ex.: favicon): usa o primeiro perfil com esse host */ const p = store.profiles.find(x => x.proxy && authInfo.host === x.proxy.host); creds = p && p.proxy; }
  if (creds && creds.user) { event.preventDefault(); callback(creds.user, creds.pass || ''); }
});

// ---------- Atualização do programa ----------
function setupAutoUpdate() {
  if (!app.isPackaged) return;
  let au; try { au = require('electron-updater').autoUpdater; } catch (_) { return; }
  au.autoDownload = true; au.autoInstallOnAppQuit = true;
  au.on('update-available', i => ui('app-update', { state: 'baixando', version: i.version }));
  au.on('update-downloaded', i => ui('app-update', { state: 'pronta', version: i.version }));
  au.on('error', () => {});
  au.checkForUpdates().catch(() => {});
  setInterval(() => au.checkForUpdates().catch(() => {}), 6 * 3600 * 1000);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  load();
  createWindow();
  setInterval(() => checkCode(false), CHECK_MIN * 60000);
  setupAutoUpdate();
});
app.on('window-all-closed', () => app.quit());
