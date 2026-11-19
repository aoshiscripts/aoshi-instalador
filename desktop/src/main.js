// Aoshi Pro Desktop — processo principal.
// Abas (cada uma com perfil de proxy e cookies próprios), Aoshi Pro injetado nas páginas do Tribal Wars,
// script baixado do repositório privado com o token de leitura do usuário, e atualização automática.
'use strict';
const { app, BrowserWindow, WebContentsView, ipcMain, session, safeStorage, Menu, MenuItem, shell, dialog } = require('electron');
// Extensões do Chrome: API do Chrome (abas, popups, botão na barra) e instalação pela Chrome Web Store.
let ECE = null, CWS = null;
try { ECE = require('electron-chrome-extensions').ElectronChromeExtensions; } catch (e) { console.warn('[extensões] sem electron-chrome-extensions', e.message); }
try { CWS = require('electron-chrome-web-store'); } catch (e) { console.warn('[extensões] sem electron-chrome-web-store', e.message); }
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
// Privacidade: sem descoberta de IP local pelo WebRTC
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'disable_non_proxied_udp');
app.commandLine.appendSwitch('webrtc-ip-handling-policy', 'disable_non_proxied_udp');

// ---------- Armazenamento ----------
const DATA_FILE = () => path.join(app.getPath('userData'), 'aoshi-desktop.json');
let store = { profiles: [], tabs: [], sharedModels: '[]', code: '', etag: '', when: 0, at: 0, token: '', win: null, settings: {} };
// Configurações (tela ⚙ da barra)
const DEFAULTS = {
  home: HOME, startup: 'restore', search: 'google', zoom: 100,
  blockTrackers: true, dnt: true, webrtcProxy: true, denyPerms: true, clearOnExit: false,
  downloadDir: '', askDownload: false,
  checkMin: 5, autoStart: false, confirmClose: false,
  accent: '#7c3aed', tabProxy: true, tabCompact: false
};
const S = () => Object.assign({}, DEFAULTS, store.settings || {});
const SEARCH = { google: 'https://www.google.com/search?q=', bing: 'https://www.bing.com/search?q=', duck: 'https://duckduckgo.com/?q=' };
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
  if (!force && Date.now() - (store.at || 0) < (Number(S().checkMin) || CHECK_MIN) * 60000) return 'Já está na última versão.';
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
// ---------- Ponte SOCKS5 com usuário e senha ----------
// O Chrome não aceita SOCKS5 com login. Para esses proxies o programa abre um mini proxy local (só neste computador,
// em 127.0.0.1): as abas falam com ele, e ele fala com o SOCKS5 entregando o usuário e a senha.
let SocksClient = null;
try { SocksClient = require('socks').SocksClient; } catch (e) { console.warn('[proxy] sem a biblioteca socks', e.message); }
const net = require('net');
const bridges = new Map(); // credenciais → { server, port }
const needsBridge = p => !!(SocksClient && p && p.proxy && p.proxy.host && String(p.proxy.type || '').toLowerCase() === 'socks5' && p.proxy.user);
const socksOpts = p => ({ host: String(p.proxy.host).trim(), port: Number(p.proxy.port) || 1080, type: 5, userId: p.proxy.user || undefined, password: p.proxy.pass || undefined });
function splitHostPort(t, def) {
  const m = String(t).match(/^\[([^\]]+)\]:(\d+)$/) || String(t).match(/^([^:]+):(\d+)$/);
  return m ? [m[1], Number(m[2])] : [String(t), def];
}
async function socksBridge(p) {
  const key = [p.proxy.host, p.proxy.port, p.proxy.user, p.proxy.pass].join('|');
  const have = bridges.get(key); if (have) return have.port;
  const up = socksOpts(p);
  const server = net.createServer(client => {
    let buf = Buffer.alloc(0);
    client.on('error', () => {});
    const onData = chunk => {
      buf = Buffer.concat([buf, chunk]);
      const end = buf.indexOf('\r\n\r\n');
      if (end < 0) { if (buf.length > 65536) client.destroy(); return; }
      client.removeListener('data', onData); client.pause();
      const head = buf.slice(0, end).toString('latin1'), rest = buf.slice(end + 4);
      const lines = head.split('\r\n'), [method, target, ver] = lines[0].split(' ');
      let host, port, first = null;
      if (method === 'CONNECT') [host, port] = splitHostPort(target, 443);
      else {
        let u; try { u = new URL(target); } catch (_) { client.end('HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n'); return; }
        host = u.hostname; port = Number(u.port) || 80;
        const hdrs = lines.slice(1).filter(l => !/^(proxy-connection|proxy-authorization|connection|keep-alive):/i.test(l));
        first = Buffer.concat([Buffer.from(`${method} ${u.pathname}${u.search} ${ver || 'HTTP/1.1'}\r\n${hdrs.join('\r\n')}\r\nConnection: close\r\n\r\n`, 'latin1'), rest]);
      }
      SocksClient.createConnection({ proxy: up, command: 'connect', destination: { host, port }, timeout: 20000 }).then(({ socket }) => {
        if (method === 'CONNECT') { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (rest.length) socket.write(rest); }
        else socket.write(first);
        socket.pipe(client); client.pipe(socket); client.resume();
        const kill = () => { socket.destroy(); client.destroy(); };
        socket.on('error', kill); client.on('error', kill); socket.on('close', () => client.destroy()); client.on('close', () => socket.destroy());
      }).catch(e => {
        const auth = /auth/i.test(e.message);
        try { client.end(`HTTP/1.1 ${auth ? '407 Proxy Authentication Required' : '502 Bad Gateway'}\r\nContent-Length: 0\r\n\r\n`); } catch (_) {}
      });
    };
    client.on('data', onData);
  });
  await new Promise((res, rej) => { server.once('error', rej); server.listen(0, '127.0.0.1', res); });
  const port = server.address().port;
  bridges.set(key, { server, port });
  return port;
}
// regra de proxy da sessão (usa a ponte quando é SOCKS5 com login)
async function proxyRulesFor(p) {
  if (needsBridge(p)) return `http://127.0.0.1:${await socksBridge(p)}`;
  return proxyRules(p);
}
// erro do SOCKS em português (teste direto, sem passar pelo Chrome)
function socksError(m) {
  m = String(m || '');
  if (/auth/i.test(m)) return 'o SOCKS5 recusou o usuário ou a senha';
  if (/ECONNREFUSED/i.test(m)) return 'não conectou no SOCKS5 (endereço ou porta errados, ou proxy fora do ar)';
  if (/ENOTFOUND|EAI_AGAIN/i.test(m)) return 'o endereço do proxy não existe (confira o nome)';
  if (/timed? ?out|ETIMEDOUT/i.test(m)) return 'o SOCKS5 demorou demais para responder';
  return 'falha no SOCKS5: ' + m.slice(0, 120);
}
const chromeUA = () => session.defaultSession.getUserAgent().replace(/\s?Electron\/\S+/, '').replace(/\s?aoshi-pro-desktop\/\S+/i, '').replace(/\s?Aoshi Pro\/\S+/i, '');
// ---------- Privacidade ----------
// Rastreadores conhecidos bloqueados; pedidos levam "não rastrear" (DNT e GPC).
const TRACKERS = /(^|\.)(google-analytics\.com|googletagmanager\.com|googletagservices\.com|doubleclick\.net|googlesyndication\.com|adservice\.google\.[a-z.]+|facebook\.net|connect\.facebook\.com|hotjar\.(com|io)|clarity\.ms|scorecardresearch\.com|quantserve\.com|criteo\.(com|net)|taboola\.com|outbrain\.com|adnxs\.com|amazon-adsystem\.com|mixpanel\.com|segment\.(io|com)|bat\.bing\.com|ads\.yahoo\.com|yandex\.ru\/metrika|mc\.yandex\.ru|tiktok\.com\/i18n\/pixel|analytics\.tiktok\.com|newrelic\.com|nr-data\.net)$/i;
function hardenSession(ses, part) {
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => {
    // trava de proteção: aba com proxy só navega com o proxy conferido (nunca pela sua conexão)
    if (part && part !== 'persist:aoshi-direto') {
      const g = guard.get(part);
      if (!g || g.state !== 'ok') {
        if (d.resourceType === 'mainFrame' && d.webContents) showBlocked(d.webContents, part, d.url);
        recheckSoon(part);
        return cb({ cancel: true });
      }
    }
    try { const h = new URL(d.url).hostname; if (S().blockTrackers && TRACKERS.test(h) && d.resourceType !== 'mainFrame') return cb({ cancel: true }); } catch (_) {}
    cb({});
  });
  ses.webRequest.onBeforeSendHeaders((d, cb) => { const h = d.requestHeaders; if (S().dnt) { h['DNT'] = '1'; h['Sec-GPC'] = '1'; } cb({ requestHeaders: h }); });
  // sem acesso a câmera, microfone, localização, notificações etc. (o jogo não usa)
  const okPerm = perm => !S().denyPerms || ['clipboard-sanitized-write', 'fullscreen'].includes(perm);
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(okPerm(perm)));
  ses.setPermissionCheckHandler((wc, perm) => okPerm(perm));
  // downloads: pasta escolhida nas configurações (ou perguntar onde salvar)
  ses.on('will-download', (e, item) => {
    const st = S();
    if (!st.askDownload) {
      const dir = st.downloadDir && fs.existsSync(st.downloadDir) ? st.downloadDir : app.getPath('downloads');
      let file = path.join(dir, item.getFilename()), n = 1;
      while (fs.existsSync(file)) { const ext = path.extname(item.getFilename()); file = path.join(dir, path.basename(item.getFilename(), ext) + ` (${n++})` + ext); }
      item.setSavePath(file);
    }
    ui('download', { state: 'start', name: item.getFilename() });
    item.once('done', (_, state) => ui('download', { state, name: item.getFilename(), file: item.getSavePath() }));
  });
}
const webrtcPolicy = t => (t && t.profileId) || S().webrtcProxy ? 'disable_non_proxied_udp' : 'default';

// ---------- Extensões ----------
// Cada proxy é uma sessão separada; as extensões ficam numa pasta só e são carregadas em todas as sessões.
// Instalar numa aba (Chrome Web Store) carrega a extensão nas outras sessões abertas na hora.
const EXT_DIR = () => path.join(app.getPath('userData'), 'Extensions');
const extOf = new Map();     // partição → ElectronChromeExtensions
const sesOf = new Map();     // partição → sessão
const loadExt = async (ses, p) => (ses.extensions && ses.extensions.loadExtension ? ses.extensions.loadExtension(p, { allowFileAccess: false }) : ses.loadExtension(p, { allowFileAccess: false }));
const getExt = (ses, id) => (ses.extensions && ses.extensions.getExtension ? ses.extensions.getExtension(id) : ses.getExtension(id));
const allExt = ses => (ses.extensions && ses.extensions.getAllExtensions ? ses.extensions.getAllExtensions() : ses.getAllExtensions());
const removeExt = (ses, id) => (ses.extensions && ses.extensions.removeExtension ? ses.extensions.removeExtension(id) : ses.removeExtension(id));
let syncing = false;
function onExtLoaded(fromPart, ext) {
  if (syncing || !ext || !ext.path || !String(ext.path).startsWith(EXT_DIR())) return;
  syncing = true;
  Promise.all([...sesOf].filter(([p]) => p !== fromPart).map(([, s]) => getExt(s, ext.id) ? null : loadExt(s, ext.path).catch(() => null)))
    .finally(() => { syncing = false; ui('extensions', { list: extList() }); });
}
function extList() {
  const s = sesOf.get('persist:aoshi-direto') || [...sesOf.values()][0];
  if (!s) return [];
  return allExt(s).filter(e => String(e.path || '').startsWith(EXT_DIR())).map(e => ({ id: e.id, name: e.name, version: e.version || (e.manifest && e.manifest.version) || '', icon: extIconData(e) }));
}
// ícone da extensão lido do próprio pacote (manifest), para quando o ícone do botão não vem
const iconCache = new Map();
function extIconData(e) {
  if (iconCache.has(e.id + e.version)) return iconCache.get(e.id + e.version);
  let out = '';
  try {
    const m = e.manifest || {}, act = m.action || m.browser_action || {};
    const pick = obj => { if (!obj) return ''; if (typeof obj === 'string') return obj; const ks = Object.keys(obj).map(Number).filter(n => n > 0).sort((a, b) => a - b); const k = ks.find(n => n >= 64) || ks[ks.length - 1]; return k ? obj[k] : ''; };
    // ícone oficial (o do manifest "icons", o mesmo da Chrome Web Store); o do botão só quando não tem
    const rel = pick(m.icons) || pick(act.default_icon);
    if (rel) {
      const { nativeImage } = require('electron');
      const img = nativeImage.createFromPath(path.join(e.path, String(rel).replace(/^\//, '')));
      if (!img.isEmpty()) out = img.resize({ width: 64, height: 64, quality: 'best' }).toDataURL();
    }
  } catch (_) {}
  iconCache.set(e.id + e.version, out);
  return out;
}
async function setupExtensions(ses, part, profileId) {
  sesOf.set(part, ses);
  if (!ECE) return;
  try {
    const ext = new ECE({
      session: ses,
      // abas e janelas que as extensões pedem viram abas deste mesmo proxy
      createTab: async details => { const t = await newTab(profileId, details.url || S().home || HOME, details.active !== false, '', { shared: true }); return [t.view.webContents, win]; },
      selectTab: wc => { const t = tabs.find(x => alive(x) && x.view.webContents === wc); if (t) { activeId = t.id; layout(); pushTabs(); } },
      removeTab: wc => { const t = tabs.find(x => alive(x) && x.view.webContents === wc); if (t) closeTab(t.id); else setTimeout(pushTabs, 0); },
      createWindow: async details => { for (const u of [].concat(details.url || S().home || HOME)) await newTab(profileId, u, true, '', { shared: true }); return win; },
      removeWindow: () => {}
    });
    extOf.set(part, ext);
    const onLoad = (_, e) => onExtLoaded(part, e);
    (ses.extensions && ses.extensions.on ? ses.extensions : ses).on('extension-loaded', onLoad);
    // atualização das extensões fica em segundo plano (não segura a abertura das abas)
    if (CWS) await withTimeout(CWS.installChromeWebStore({
      session: ses, extensionsPath: EXT_DIR(), autoUpdate: false, allowUnpackedExtensions: true,
      beforeInstall: async d => {
        const r = await dialog.showMessageBox(win, { type: 'question', buttons: ['Adicionar extensão', 'Cancelar'], defaultId: 0, cancelId: 1, title: 'Aoshi Pro', message: `Adicionar "${d.localizedName}"?`, detail: 'A extensão vai valer em todas as abas, com qualquer proxy.', icon: d.icon });
        return { action: r.response === 0 ? 'allow' : 'deny' };
      }
    }), 8000);
    if (part === 'persist:aoshi-direto' && CWS.updateExtensions && !extUpdTimer) {
      const upd = () => CWS.updateExtensions(ses).catch(() => {});
      setTimeout(upd, 60000); extUpdTimer = setInterval(upd, 5 * 3600000);
    }
  } catch (e) { console.warn('[extensões]', e); }
}
let extUpdTimer = null;
const withTimeout = (pr, ms) => Promise.race([pr, new Promise(r => setTimeout(r, ms))]);

const prepared = new Set();
async function sessionFor(profileId) {
  const part = 'persist:aoshi-' + (profileId || 'direto');
  const ses = session.fromPartition(part);
  if (!prepared.has(part)) {
    prepared.add(part);
    ses.setUserAgent(chromeUA());
    hardenSession(ses, part);
    await setupExtensions(ses, part, profileId || '');
  }
  const prof = profileOf(profileId);
  const rules = await proxyRulesFor(prof);
  if (profileId) {
    // aba com proxy: servidor fixo, sem cair para conexão direta; sem proxy válido, aponta para um endereço morto
    await ses.setProxy({ mode: 'fixed_servers', proxyRules: rules || 'http://127.0.0.1:9', proxyBypassRules: '<-loopback>' });
    await ses.closeAllConnections?.();
    if (!rules) guard.set(part, { state: 'down', reason: 'o proxy desta aba foi apagado ou está sem endereço', at: Date.now() });
    else { const g = guard.get(part); if (g && g.state === 'ok' && Date.now() - g.at < 120000) checkGuard(part, prof); else await checkGuard(part, prof); }
  } else {
    await ses.setProxy({ mode: 'direct' });
    await ses.closeAllConnections?.();
  }
  return ses;
}

// ---------- Janela e abas ----------
let win = null;
const tabs = []; // { id, profileId, view }
let activeId = null;
const ui = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send('ui', ch, data || {}); };
let modalOpen = false; // janelinhas da barra ficam por baixo das abas: esconde a aba enquanto uma está aberta
function layout() {
  if (!win || win.isDestroyed()) return;
  const [w, h] = win.getContentSize();
  tabs.forEach(t => {
    if (!alive(t)) return;
    if (t.id === activeId && !modalOpen) { t.view.setBounds({ x: 0, y: BAR_H, width: w, height: Math.max(0, h - BAR_H) }); t.view.setVisible(true); }
    else t.view.setVisible(false);
  });
}
function tabInfo(t) {
  const wc = t.view.webContents, p = profileOf(t.profileId);
  const gd = t.profileId ? (guard.get('persist:aoshi-' + t.profileId) || {}) : null;
  return { guard: gd ? (gd.state || 'checking') : '', guardIp: gd && gd.ip || '', name: t.name || '', country: p && p.country || '', proxyHost: p && p.proxy ? `${p.proxy.host}:${p.proxy.port}` : '', proxyIp: p && p.ip || '', wcId: wc.id, partition: 'persist:aoshi-' + (t.profileId || 'direto'), zoom: Math.round(wc.getZoomFactor() * 100), id: t.id, title: /blocked\.html/i.test(wc.getURL()) ? 'Bloqueada: proxy falhou' : (wc.getTitle() || 'Nova aba'), url: /^file:.*blocked\.html/i.test(wc.getURL()) ? (t.blockedUrl || wc.getURL()) : wc.getURL(), profileId: t.profileId || '', profileName: p ? p.name : 'Sem proxy', color: p ? p.color : '', loading: wc.isLoading(), canBack: wc.navigationHistory?.canGoBack?.() ?? wc.canGoBack(), canFwd: wc.navigationHistory?.canGoForward?.() ?? wc.canGoForward() };
}
// aba viva = ainda tem a página (uma extensão pode fechar a aba que ela abriu)
const alive = t => { try { return !!(t && t.view && t.view.webContents && !t.view.webContents.isDestroyed()); } catch (_) { return false; } };
function pruneTabs() {
  for (let i = tabs.length - 1; i >= 0; i--) if (!alive(tabs[i])) { const [t] = tabs.splice(i, 1); try { win.contentView.removeChildView(t.view); } catch (_) {} if (activeId === t.id) activeId = (tabs[i] || tabs[i - 1] || {}).id || null; }
}
function pushTabs() {
  pruneTabs();
  if (!tabs.length && win && !win.isDestroyed()) { newTab('', S().home || HOME); return; }
  if (!tabs.some(t => t.id === activeId) && tabs.length) { activeId = tabs[tabs.length - 1].id; layout(); }
  persistTabs();
  ui('tabs', { tabs: tabs.map(t => { try { return tabInfo(t); } catch (_) { return null; } }).filter(Boolean), active: activeId, links: linkInfo() }); selectExtTab();
}
let lastSel = null;
function selectExtTab() {
  const t = tabs.find(x => x.id === activeId); if (!t || lastSel === t.id) return; lastSel = t.id;
  try { const e = extOf.get('persist:aoshi-' + (t.profileId || 'direto')); e && e.selectTab(t.view.webContents); } catch (_) {}
}
function persistTabs() {
  store.tabs = tabs.filter(alive).map(t => { let u = t.view.webContents.getURL() || HOME; if (/^file:.*blocked\.html/i.test(u)) u = t.blockedUrl || HOME; return { profileId: t.profileId || '', url: u, name: t.name || '' }; });
  // vínculo aba ↔ proxy: fica guardado mesmo depois de fechar a aba (nome e última página)
  store.links = store.links || {};
  store.tabs.forEach(x => { if (x.profileId && profileOf(x.profileId)) store.links[x.profileId] = { name: x.name, url: /^https?:/i.test(x.url) ? x.url : ((store.links[x.profileId] || {}).url || HOME), at: Date.now() }; });
  save();
}
const linkInfo = () => {
  const links = store.links || {}, out = {};
  Object.keys(links).forEach(pid => { if (!profileOf(pid)) return; const t = tabs.find(x => alive(x) && x.profileId === pid); out[pid] = Object.assign({}, links[pid], { open: t ? t.id : '', name: t ? t.name : links[pid].name }); });
  return out;
};

async function newTab(profileId, url, activate = true, name = '', opts = {}) {
  // um proxy = uma aba: se o proxy já está numa aba aberta, vai para ela em vez de abrir outra
  if (profileId && !opts.shared) {
    const have = tabs.find(x => alive(x) && x.profileId === profileId);
    if (have) {
      activeId = have.id; layout(); pushTabs();
      const p = profileOf(profileId);
      ui('notice', { text: `${p ? p.name : 'Este proxy'} já está vinculado à aba "${have.name || have.view.webContents.getTitle() || 'sem nome'}". Um proxy só pode ficar em uma aba.` });
      return have;
    }
    const link = (store.links || {})[profileId];
    if (link && !name) name = link.name || '';
  }
  const ses = await sessionFor(profileId);
  // sandbox ligado: necessário para a API das extensões nas páginas
  const view = new WebContentsView({ webPreferences: { session: ses, contextIsolation: true, sandbox: true, preload: path.join(__dirname, 'preload.js'), spellcheck: false } });
  const t = { id: crypto.randomUUID(), profileId: profileId || '', view, name: String(name || '').slice(0, 40) };
  tabs.push(t);
  win.contentView.addChildView(view);
  const wc = view.webContents;
  const ext = extOf.get('persist:aoshi-' + (profileId || 'direto'));
  try { ext && ext.addTab(wc, win); } catch (_) {}
  // fechada por fora (ex.: a extensão fecha a aba dela): sai da lista
  wc.once('destroyed', () => { if (tabs.includes(t)) setTimeout(() => { pushTabs(); layout(); }, 0); });
  // botão direito: itens das extensões + básicos
  wc.on('context-menu', (_, params) => {
    const menu = new Menu();
    try { (ext ? ext.getContextMenuItems(wc, params) : []).forEach(i => menu.append(i)); } catch (_) {}
    if (menu.items.length) menu.append(new MenuItem({ type: 'separator' }));
    if (params.linkURL) menu.append(new MenuItem({ label: t.profileId ? 'Abrir link nesta aba (proxy vinculado)' : 'Abrir link em nova aba', click: () => t.profileId ? wc.loadURL(params.linkURL) : newTab('', params.linkURL, true) }));
    if (params.isEditable) { menu.append(new MenuItem({ label: 'Recortar', role: 'cut' })); menu.append(new MenuItem({ label: 'Colar', role: 'paste' })); }
    if (params.selectionText || params.isEditable) menu.append(new MenuItem({ label: 'Copiar', role: 'copy' }));
    menu.append(new MenuItem({ label: 'Voltar', enabled: wc.navigationHistory?.canGoBack?.() ?? wc.canGoBack(), click: () => wc.navigationHistory?.goBack ? wc.navigationHistory.goBack() : wc.goBack() }));
    menu.append(new MenuItem({ label: 'Recarregar', click: () => wc.reload() }));
    menu.append(new MenuItem({ label: 'Inspecionar', click: () => wc.inspectElement(params.x, params.y) }));
    menu.popup({ window: win });
  });
  // WebRTC só pelo proxy: o site não descobre o IP real por ele
  try { wc.setWebRTCIPHandlingPolicy(webrtcPolicy(t)); } catch (_) {}
  wc.on('did-finish-load', () => { if (t.zoom == null) wc.setZoomFactor((Number(S().zoom) || 100) / 100); });
  wc.on('found-in-page', (_, r) => { if (t.id === activeId) ui('find', { matches: r.matches, active: r.activeMatchOrdinal }); });
  // janela nova: aba com proxy abre na própria aba (o proxy não vai para outra); sem proxy, abre outra aba
  wc.setWindowOpenHandler(({ url: u }) => { if (t.profileId) { if (/^https?:/i.test(u)) wc.loadURL(u); } else newTab('', u, true); return { action: 'deny' }; });
  wc.on('dom-ready', () => { try { if (TW_HOST.test(new URL(wc.getURL()).hostname)) inject(wc); } catch (_) {} });
  ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading'].forEach(ev => wc.on(ev, pushTabs));
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) { e.preventDefault(); wc.reload(); }
    if (input.control && input.key.toLowerCase() === 't') { e.preventDefault(); ui('new-tab'); }
    if (input.control && input.key.toLowerCase() === 'w') { e.preventDefault(); closeTab(t.id); }
    if (input.key === 'F12') { e.preventDefault(); wc.toggleDevTools(); }
    if (input.control && input.key.toLowerCase() === 'f') { e.preventDefault(); ui('find-open'); }
    if (input.control && (input.key === '=' || input.key === '+')) { e.preventDefault(); zoomTab(t, +0.1); }
    if (input.control && input.key === '-') { e.preventDefault(); zoomTab(t, -0.1); }
    if (input.control && input.key === '0') { e.preventDefault(); t.zoom = null; wc.setZoomFactor((Number(S().zoom) || 100) / 100); pushTabs(); }
  });
  wc.loadURL(url || S().home || HOME);
  if (activate) activeId = t.id;
  layout(); pushTabs();
  return t;
}
function zoomTab(t, d) { const wc = t.view.webContents; t.zoom = Math.max(0.3, Math.min(3, Math.round((wc.getZoomFactor() + d) * 10) / 10)); wc.setZoomFactor(t.zoom); pushTabs(); }
function closeTab(id) {
  const i = tabs.findIndex(t => t.id === id); if (i < 0) return;
  const [t] = tabs.splice(i, 1);
  try { win.contentView.removeChildView(t.view); t.view.webContents.close(); } catch (_) {}
  if (activeId === id) activeId = (tabs[i] || tabs[i - 1] || {}).id || null;
  if (!tabs.length) newTab('', S().home || HOME); else { layout(); pushTabs(); }
}
async function setTabProfile(id, profileId) {
  const t = tabs.find(x => x.id === id); if (!t) return;
  if (profileId === t.profileId) return;
  const busy = profileId && tabs.find(x => alive(x) && x.id !== id && x.profileId === profileId);
  if (busy) { const p = profileOf(profileId); ui('notice', { text: `${p ? p.name : 'Esse proxy'} já está vinculado à aba "${busy.name || busy.view.webContents.getTitle() || 'sem nome'}".` }); return; }
  // a aba troca de proxy: o vínculo antigo sai (o proxy velho fica livre); o novo vínculo nasce com o nome da aba
  if (t.profileId && store.links) delete store.links[t.profileId];
  if (profileId && store.links) delete store.links[profileId];
  const url = t.view.webContents.getURL() || HOME;
  // trocar de perfil = trocar a sessão (cookies e proxy): recria a aba no mesmo lugar
  const i = tabs.indexOf(t);
  try { win.contentView.removeChildView(t.view); t.view.webContents.close(); } catch (_) {}
  tabs.splice(i, 1);
  const nt = await newTab(profileId, url, activeId === id, t.name);
  tabs.splice(tabs.indexOf(nt), 1); tabs.splice(i, 0, nt);
  if (activeId === id) activeId = nt.id;
  layout(); pushTabs();
}

function createWindow() {
  const b = store.win || {};
  try { if (ECE && ECE.handleCRXProtocol) ECE.handleCRXProtocol(session.defaultSession); } catch (e) { console.warn('[extensões] crx', e.message); }
  win = new BrowserWindow({
    width: b.width || 1400, height: b.height || 900, x: b.x, y: b.y, minWidth: 800, minHeight: 500,
    title: 'Aoshi Pro', backgroundColor: '#121216', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'ui-preload.js'), contextIsolation: true, sandbox: false }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'ui.html'));
  win.once('ready-to-show', () => { if (b.max) win.maximize(); win.show(); });
  win.on('resize', layout);
  win.on('close', e => {
    if (S().confirmClose && tabs.length > 1 && !win.__closing) {
      const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Fechar', 'Cancelar'], defaultId: 0, cancelId: 1, title: 'Aoshi Pro', message: `Fechar o Aoshi Pro com ${tabs.length} abas abertas?` });
      if (r !== 0) { e.preventDefault(); return; }
      win.__closing = true;
    }
    store.win = Object.assign(win.getNormalBounds(), { max: win.isMaximized() }); persistTabs(); saveNow();
  });
  win.webContents.on('did-finish-load', async () => {
    const st = S();
    const list = st.startup === 'restore' && store.tabs && store.tabs.length ? store.tabs : [{ profileId: '', url: st.home || HOME }];
    for (let i = 0; i < list.length; i++) await newTab(list[i].profileId, list[i].url, i === 0, list[i].name);
    ui('profiles', { profiles: store.profiles });
    ui('code-info', { version: versionOf(code()), when: store.when, hasToken: !!decToken(store.token) });
    checkCode(true);
  });
}

// ---------- Mensagens da barra (ui.html) ----------
ipcMain.handle('tab:new', (_, profileId, url) => newTab(profileId, url).then(() => true));
// abas vinculadas: abrir a aba do proxy (com o nome e a última página) ou desfazer o vínculo
ipcMain.handle('link:open', async (_, pid) => { const l = (store.links || {})[pid]; if (!l || !profileOf(pid)) return false; await newTab(pid, l.url || HOME, true, l.name || ''); return true; });
ipcMain.handle('link:remove', (_, pid) => { if (store.links) delete store.links[pid]; const t = tabs.find(x => alive(x) && x.profileId === pid); if (t) closeTab(t.id); else { save(); pushTabs(); } return true; });
ipcMain.handle('tab:close', (_, id) => closeTab(id));
// nome da aba (ex.: "br143 aoshi") — aparece no lugar do título da página
ipcMain.handle('tab:rename', (_, id, name) => { const t = tabs.find(x => x.id === id); if (t) { t.name = String(name || '').trim().slice(0, 40); pushTabs(); } });
// botão direito na aba: menu do programa (fica por cima da página)
ipcMain.handle('tab:menu', (_, id) => {
  const t = tabs.find(x => x.id === id); if (!t) return;
  Menu.buildFromTemplate([
    { label: 'Renomear aba…', click: () => ui('tab-rename', { id }) },
    ...(t.name ? [{ label: 'Tirar o nome', click: () => { t.name = ''; pushTabs(); } }] : []),
    { label: 'Trocar o proxy…', click: () => { activeId = id; layout(); pushTabs(); ui('tab-proxy', { id }); } },
    t.profileId ? { label: 'Duplicar aba (o proxy vinculado não vai para outra aba)', enabled: false } : { label: 'Duplicar aba', click: () => newTab('', t.view.webContents.getURL() || HOME, true, t.name ? t.name + ' 2' : '') },
    ...(t.profileId ? [{ label: 'Desvincular o proxy desta aba (fecha a aba)', click: () => { delete (store.links || {})[t.profileId]; closeTab(id); } }] : []),
    { type: 'separator' },
    { label: 'Recarregar', click: () => t.view.webContents.reload() },
    { label: 'Fechar aba', click: () => closeTab(id) }
  ]).popup({ window: win });
});
ipcMain.handle('tab:activate', (_, id) => { activeId = id; layout(); pushTabs(); selectExtTab(); });
ipcMain.handle('tab:profile', (_, id, profileId) => setTabProfile(id, profileId));
ipcMain.handle('tab:nav', (_, id, what, arg) => {
  const t = tabs.find(x => x.id === id); if (!t) return; const wc = t.view.webContents;
  if (what === 'back') wc.navigationHistory?.goBack ? wc.navigationHistory.goBack() : wc.goBack();
  else if (what === 'fwd') wc.navigationHistory?.goForward ? wc.navigationHistory.goForward() : wc.goForward();
  else if (what === 'reload') wc.reload();
  else if (what === 'go') { let u = String(arg || '').trim(); if (!/^https?:\/\//i.test(u)) u = /^[^\s]+\.[a-z]{2,}(\/|$)/i.test(u) ? 'https://' + u : (SEARCH[S().search] || SEARCH.google) + encodeURIComponent(u); wc.loadURL(u); }
  else if (what === 'home') wc.loadURL(S().home || HOME);
  else if (what === 'find') { if (arg && arg.text) wc.findInPage(arg.text, { forward: arg.forward !== false, findNext: !!arg.next }); else wc.stopFindInPage('clearSelection'); }
  else if (what === 'zoom') { if (arg === 0) { t.zoom = null; wc.setZoomFactor((Number(S().zoom) || 100) / 100); pushTabs(); } else zoomTab(t, arg); }
  else if (what === 'devtools') wc.toggleDevTools();
});
const proxyKey = p => p && p.proxy ? [p.proxy.type, p.proxy.host, p.proxy.port, p.proxy.user, p.proxy.pass].join('|') : '';
ipcMain.handle('profiles:save', (_, list) => {
  const before = new Map(store.profiles.map(p => [p.id, proxyKey(p)]));
  const keepIds = new Set((Array.isArray(list) ? list : []).map(p => p && p.id).filter(Boolean));
  if (store.links) Object.keys(store.links).forEach(pid => { if (!keepIds.has(pid)) delete store.links[pid]; });
  store.profiles = (Array.isArray(list) ? list : []).slice(0, 5000).map(p => ({
    id: p.id || crypto.randomUUID(), name: String(p.name || 'Proxy').slice(0, 40), color: p.color || '#8b5cf6',
    proxy: { type: p.proxy?.type || 'http', host: String(p.proxy?.host || '').trim(), port: Number(p.proxy?.port) || '', user: String(p.proxy?.user || ''), pass: String(p.proxy?.pass || '') },
    // resultado do último teste: país, IP visto pelos sites e latência até o Tribal Wars
    status: ['ok', 'bad'].includes(p.status) ? p.status : '', ip: String(p.ip || '').slice(0, 64), country: String(p.country || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 2),
    countryName: String(p.countryName || '').slice(0, 60), latency: Number.isFinite(Number(p.latency)) && p.latency !== null && p.latency !== '' ? Math.round(Number(p.latency)) : null,
    error: String(p.error || '').slice(0, 160), testedAt: Number(p.testedAt) || 0
  }));
  save(); ui('profiles', { profiles: store.profiles });
  // só as abas cujo proxy mudou de verdade recarregam (salvar o resultado de um teste não mexe nelas)
  tabs.forEach(t => { if (!t.profileId) return; const p = profileOf(t.profileId); if (p && before.get(p.id) !== proxyKey(p)) sessionFor(t.profileId).then(() => t.view.webContents.reload()); });
  return store.profiles;
});
// Testa o proxy direto pelo Node (sem o Chromium): conecta no proxy, entrega o usuário e a senha no próprio pedido
// (Proxy-Authorization / login do SOCKS5) e abre HTTPS por dentro. Assim o teste é igual em HTTP, HTTPS e SOCKS5,
// dá o erro exato e não cria uma sessão do navegador por proxy (aguenta listas de milhares).
const tls = require('tls');
const https = require('https');
function proxyTunnel(p, host, port, ms) {
  const type = String(p.proxy.type || 'http').toLowerCase();
  const ph = String(p.proxy.host).trim(), pp = Number(p.proxy.port) || (type === 'socks5' ? 1080 : 8080);
  if (type === 'socks5' || type === 'socks') {
    if (!SocksClient) return Promise.reject(new Error('SOCKS sem a biblioteca'));
    return SocksClient.createConnection({ proxy: socksOpts(p), command: 'connect', destination: { host, port }, timeout: ms })
      .then(r => r.socket, e => { throw new Error('SOCKS ' + (e.message || e)); });
  }
  return new Promise((resolve, reject) => {
    let done = false;
    const fail = e => { if (done) return; done = true; try { sock.destroy(); } catch (_) {} reject(e); };
    const sock = type === 'https' ? tls.connect({ host: ph, port: pp, servername: net.isIP(ph) ? undefined : ph, rejectUnauthorized: false }) : net.connect({ host: ph, port: pp });
    sock.setTimeout(ms, () => fail(new Error('TIMED_OUT')));
    sock.once('error', e => fail(new Error(/ECONNREFUSED/.test(e.code) ? 'PROXY_CONNECTION_FAILED' : /ENOTFOUND|EAI_AGAIN/.test(e.code) ? 'NAME_NOT_RESOLVED' : /ECONNRESET/.test(e.code) ? 'CONNECTION_RESET' : (e.code || e.message))));
    sock.once(type === 'https' ? 'secureConnect' : 'connect', () => {
      const auth = p.proxy.user ? `Proxy-Authorization: Basic ${Buffer.from(`${p.proxy.user}:${p.proxy.pass || ''}`).toString('base64')}\r\n` : '';
      sock.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}Proxy-Connection: keep-alive\r\n\r\n`);
    });
    let buf = Buffer.alloc(0);
    const onData = d => {
      buf = Buffer.concat([buf, d]);
      const end = buf.indexOf('\r\n\r\n'); if (end < 0) { if (buf.length > 16384) fail(new Error('EMPTY_RESPONSE')); return; }
      sock.removeListener('data', onData);
      const code = Number((buf.slice(0, end).toString('latin1').match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/) || [])[1]);
      if (code === 200) { done = true; sock.setTimeout(0); resolve(sock); }
      else if (code === 407) fail(new Error('407'));
      else fail(new Error(code ? 'TUNNEL_CONNECTION_FAILED ' + code : 'EMPTY_RESPONSE'));
    };
    sock.on('data', onData);
    sock.once('end', () => fail(new Error('EMPTY_RESPONSE')));
  });
}
function proxyGet(p, url, ms, method) {
  const u = new URL(url), port = Number(u.port) || 443;
  return proxyTunnel(p, u.hostname, port, ms).then(raw => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { req.destroy(new Error('TIMED_OUT')); }, ms);
    const req = https.request({ host: u.hostname, port, path: u.pathname + u.search, method: method || 'GET', servername: u.hostname,
      createConnection: () => tls.connect({ socket: raw, servername: u.hostname }),
      headers: { 'User-Agent': chromeUA(), 'Accept': 'application/json,*/*', 'Connection': 'close' } }, res => {
      const chunks = []; res.on('data', c => { if (chunks.length < 64) chunks.push(c); });
      res.on('end', () => { clearTimeout(timer); raw.destroy(); resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }); });
      res.on('error', e => { clearTimeout(timer); raw.destroy(); reject(e); });
    });
    req.on('error', e => { clearTimeout(timer); raw.destroy(); reject(new Error(/CERT|SSL|certificate/i.test(e.message) ? 'CERT ' + e.message : (e.code || e.message))); });
    req.end();
  }));
}
// ---------- Trava de proteção do IP ----------
// Cada aba com proxy só carrega depois de conferir, pelo próprio proxy, que o IP que os sites veem NÃO é o seu.
// Se o proxy cair, recusar a senha ou devolver o seu IP real, a aba fica bloqueada (nenhum pedido sai) e mostra
// um aviso; volta sozinha quando o proxy voltar. O Chromium também está sem a opção de cair para conexão direta.
const guard = new Map(); // partição → { state: 'ok'|'down'|'checking', ip, reason, at }
const guardRuns = new Map();
async function checkGuard(part, prof) {
  if (guardRuns.has(part)) return guardRuns.get(part);
  const run = (async () => {
    const prev = guard.get(part);
    let res;
    try {
      let ip = '';
      for (const url of ['https://api.ipify.org?format=json', 'https://ipv4.icanhazip.com/']) {
        try { const r = await proxyGet(prof, url, 12000); const t = r.text.trim(); const v = t.startsWith('{') ? JSON.parse(t).ip : t; if (net.isIP(String(v || ''))) { ip = v; break; } } catch (e) { if (/^407$|PROXY_CONNECTION_FAILED|NAME_NOT_RESOLVED|^SOCKS .*auth/i.test(String(e.message))) throw e; }
      }
      if (!ip) throw new Error('o proxy não respondeu');
      const mine = await directIp();
      if (mine && ip === mine) res = { state: 'down', reason: `o proxy devolveu o seu IP real (${ip})`, at: Date.now() };
      else if (!mine) res = prev && prev.state === 'ok' && prev.ip === ip ? prev : { state: 'ok', ip, at: Date.now(), unverified: true };
      else res = { state: 'ok', ip, at: Date.now() };
    } catch (e) {
      const m = String(e && e.message || e);
      res = { state: 'down', reason: /^SOCKS /.test(m) ? socksError(m) : proxyError(m), at: Date.now() };
    }
    guard.set(part, res);
    const wasOk = prev && prev.state === 'ok';
    if (res.state !== 'ok') {
      try { await session.fromPartition(part).closeAllConnections(); } catch (_) {}
      if (wasOk) tabs.forEach(t => { if (alive(t) && 'persist:aoshi-' + t.profileId === part) showBlocked(t.view.webContents, part, t.view.webContents.getURL()); });
    } else if (prev && prev.state === 'down') {
      // voltou: as abas bloqueadas carregam de novo a página que queriam
      tabs.forEach(t => { if (alive(t) && 'persist:aoshi-' + t.profileId === part && t.blockedUrl) { const u = t.blockedUrl; t.blockedUrl = ''; t.view.webContents.loadURL(u); } });
    }
    pushTabs();
    return res;
  })();
  guardRuns.set(part, run);
  try { return await run; } finally { guardRuns.delete(part); }
}
const recheckAt = new Map();
function recheckSoon(part) {
  if (Date.now() - (recheckAt.get(part) || 0) < 10000) return;
  recheckAt.set(part, Date.now());
  const prof = profileOf(part.replace('persist:aoshi-', ''));
  if (prof && prof.proxy && prof.proxy.host) checkGuard(part, prof);
}
function showBlocked(wc, part, url) {
  const t = tabs.find(x => alive(x) && x.view.webContents === wc);
  if (url && /^https?:/i.test(url) && t) t.blockedUrl = url;
  const g = guard.get(part) || {}, prof = profileOf(part.replace('persist:aoshi-', ''));
  const q = new URLSearchParams({ r: g.reason || 'conferindo o proxy…', p: prof ? `${prof.name} (${prof.proxy.host}:${prof.proxy.port})` : 'proxy apagado', u: url || '' });
  setImmediate(() => { try { if (!wc.isDestroyed()) wc.loadFile(path.join(__dirname, 'blocked.html'), { search: q.toString() }); } catch (_) {} });
}
// confere de novo, a cada minuto, os proxies das abas abertas
setInterval(() => {
  const parts = new Set(tabs.filter(t => alive(t) && t.profileId).map(t => 'persist:aoshi-' + t.profileId));
  parts.forEach(part => { const prof = profileOf(part.replace('persist:aoshi-', '')); if (prof && prof.proxy && prof.proxy.host) checkGuard(part, prof); else guard.set(part, { state: 'down', reason: 'o proxy desta aba foi apagado', at: Date.now() }); });
}, 60000);
ipcMain.on('guard:retry', e => { const t = tabs.find(x => alive(x) && x.view.webContents === e.sender); if (t && t.profileId) { recheckAt.delete('persist:aoshi-' + t.profileId); recheckSoon('persist:aoshi-' + t.profileId); } });
// IP da sua conexão sem proxy (para saber se um proxy está vazando o seu IP)
let myIp = { ip: '', at: 0 };
async function directIp() {
  if (myIp.ip && Date.now() - myIp.at < 10 * 60000) return myIp.ip;
  try { const r = await session.defaultSession.fetch('https://api.ipify.org?format=json', { cache: 'no-store' }); const j = await r.json(); if (net.isIP(j.ip)) myIp = { ip: j.ip, at: Date.now() }; } catch (_) {}
  return myIp.ip;
}
// país de um IP: pergunta a vários serviços (direto, sem proxy) e fica com o que a maioria disser
const geoCache = new Map();
async function geoOf(ip) {
  if (geoCache.has(ip)) return geoCache.get(ip);
  const ask = async (url, rd) => { try { const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 8000); const r = await session.defaultSession.fetch(url, { cache: 'no-store', signal: ctl.signal }); clearTimeout(tm); const v = rd(await r.json()); return /^[A-Za-z]{2}$/.test(v && v.cc || '') ? { cc: v.cc.toUpperCase(), name: v.name || '' } : null; } catch (_) { return null; } };
  const got = (await Promise.all([
    ask(`https://api.country.is/${ip}`, j => ({ cc: j.country })),
    ask(`https://ipwho.is/${ip}?fields=success,country,country_code`, j => j.success === false ? null : { cc: j.country_code, name: j.country }),
    ask(`https://ipinfo.io/${ip}/json`, j => ({ cc: j.country })),
    ask(`https://freeipapi.com/api/json/${ip}`, j => ({ cc: j.countryCode, name: j.countryName })),
    ask(`https://ipapi.co/${ip}/json/`, j => j.error ? null : { cc: j.country_code, name: j.country_name })
  ])).filter(Boolean);
  const votes = {}; got.forEach(g => { votes[g.cc] = (votes[g.cc] || 0) + 1; });
  const cc = Object.keys(votes).sort((x, y) => votes[y] - votes[x])[0] || '';
  const out = { cc, name: (got.find(g => g.cc === cc && g.name) || {}).name || '' };
  if (cc) geoCache.set(ip, out);
  return out;
}
ipcMain.handle('profiles:test', async (_, p) => {
  if (!p || !p.proxy || !p.proxy.host) return { ok: false, message: 'sem endereço' };
  const t0 = Date.now();
  try {
    // 1) IP de saída visto pela internet, pedido PELO proxy
    let ip = '', errs = [];
    for (const [url, rd] of [
      ['https://api.ipify.org?format=json', t => JSON.parse(t).ip],
      ['https://ipv4.icanhazip.com/', t => t.trim()],
      ['https://ipwho.is/?fields=ip', t => JSON.parse(t).ip]
    ]) {
      if (Date.now() - t0 > 40000) break;
      try {
        const r = await proxyGet(p, url, 15000);
        let v = ''; try { v = String(rd(r.text) || '').trim(); } catch (_) {}
        if (net.isIP(v)) { ip = v; break; }
        errs.push('resposta sem IP (' + r.status + ')');
      } catch (e) {
        const m = String(e && e.message || e); errs.push(m);
        if (/^407$|PROXY_CONNECTION_FAILED|NAME_NOT_RESOLVED|^SOCKS .*auth/i.test(m)) break;
      }
    }
    if (!ip) throw new Error(errs.join(' | ') || 'sem resposta');
    // 2) se o IP for o seu próprio, o tráfego não passou pelo proxy
    const mine = await directIp();
    if (mine && mine === ip) return { ok: false, message: `o proxy devolveu o seu IP real (${ip}): ele não está escondendo a conexão. Confira o tipo (clique em ${String(p.proxy.type || 'http').toUpperCase()} para trocar) e se o plano no provedor está ativo` };
    // 3) país do IP: votação entre vários bancos de localização (um só às vezes erra)
    const geo = await geoOf(ip);
    // latência: ida e volta até o Tribal Wars por este proxy (melhor de 2)
    let best = Infinity;
    for (let i = 0; i < 2; i++) { const s0 = performance.now(); try { await proxyGet(p, 'https://www.tribalwars.com.br/favicon.ico', 10000, 'HEAD'); best = Math.min(best, performance.now() - s0); } catch (_) {} }
    return { ok: true, ip, country: String(geo.cc || '').toLowerCase(), countryName: geo.name || '', latency: Number.isFinite(best) ? Math.round(best) : null };
  } catch (e) {
    const m = String(e && e.message || 'sem resposta');
    return { ok: false, message: /^SOCKS /.test(m) ? socksError(m) : proxyError(m) };
  }
});
// erro do Chromium → explicação em português
function proxyError(m) {
  const map = [
    [/(^|\D)407(\D|$)|PROXY_AUTH/i, 'o proxy recusou o usuário ou a senha'],
    [/PROXY_CONNECTION_FAILED|CONNECTION_REFUSED/i, 'não conectou no proxy (endereço ou porta errados, ou proxy fora do ar)'],
    [/NAME_NOT_RESOLVED|PROXY_.*RESOLV/i, 'o endereço do proxy não existe (confira o nome)'],
    [/TUNNEL_CONNECTION_FAILED/i, 'o proxy recusou abrir a conexão (talvez o tipo esteja errado: troque HTTP/SOCKS5)'],
    [/SOCKS/i, 'falha no SOCKS (talvez o tipo esteja errado: troque HTTP/SOCKS5)'],
    [/aborted|TIMED_OUT/i, 'o proxy demorou demais para responder'],
    [/EMPTY_RESPONSE|CONNECTION_(RESET|CLOSED)/i, 'o proxy fechou a conexão sem responder (tipo errado ou plano sem esse acesso)'],
    [/CERT|SSL/i, 'erro de certificado pelo proxy']
  ];
  const hit = map.find(([re]) => re.test(m));
  return hit ? `${hit[1]} — ${m.replace(/net::/g, '').slice(0, 120)}` : m.replace(/net::/g, '').slice(0, 160);
}
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
ipcMain.handle('ext:list', () => extList());
ipcMain.handle('ext:store', () => newTab((tabs.find(x => x.id === activeId) || {}).profileId || '', 'https://chromewebstore.google.com/category/extensions', true).then(() => true));
ipcMain.handle('ext:remove', async (_, id) => {
  const primary = sesOf.get('persist:aoshi-direto') || (await sessionFor(''));
  try { if (CWS && CWS.uninstallExtension) await CWS.uninstallExtension(id, { session: primary, extensionsPath: EXT_DIR() }); } catch (e) { console.warn(e); }
  sesOf.forEach(s => { try { if (getExt(s, id)) removeExt(s, id); } catch (_) {} });
  // pasta descompactada que não veio da Web Store
  try { fs.readdirSync(EXT_DIR()).forEach(d => { const m = path.join(EXT_DIR(), d, 'manifest.json'); if (d === id || (fs.existsSync(m) && JSON.parse(fs.readFileSync(m, 'utf8')).__aoshiId === id)) fs.rmSync(path.join(EXT_DIR(), d), { recursive: true, force: true }); }); } catch (_) {}
  ui('extensions', { list: extList() });
  return extList();
});
// extensão descompactada (pasta com manifest.json): copia para a pasta das extensões e carrega em todas as sessões
ipcMain.handle('ext:load-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Escolha a pasta da extensão (com o manifest.json)', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return { ok: false };
  const src = r.filePaths[0];
  if (!fs.existsSync(path.join(src, 'manifest.json'))) return { ok: false, message: 'essa pasta não tem manifest.json' };
  const dest = path.join(EXT_DIR(), 'unpacked-' + path.basename(src).replace(/[^\w.-]+/g, '_'));
  fs.mkdirSync(EXT_DIR(), { recursive: true });
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(src, dest, { recursive: true });
  if (!prepared.size) await sessionFor('');
  let loaded = null, err = null;
  for (const s of sesOf.values()) { try { const e = await loadExt(s, dest); loaded = loaded || e; } catch (e) { err = e; } }
  ui('extensions', { list: extList() });
  return loaded ? { ok: true, name: loaded.name } : { ok: false, message: err ? err.message : 'não carregou' };
});
ipcMain.handle('settings:get', async () => {
  let size = 0; try { for (const part of new Set(['direto'].concat(store.profiles.map(p => p.id)))) size += await session.fromPartition('persist:aoshi-' + part).getCacheSize(); } catch (_) {}
  return { chrome: process.versions.chrome, electron: process.versions.electron, extCount: extList().length, profileCount: store.profiles.length, settings: S(), version: app.getVersion(), script: versionOf(code()), scriptWhen: store.when, hasToken: !!decToken(store.token), downloadsDefault: app.getPath('downloads'), cacheMB: Math.round(size / 1048576), profiles: store.profiles.map(p => ({ id: p.id, name: p.name })) };
});
ipcMain.handle('settings:save', (_, next) => {
  const prev = S();
  store.settings = Object.assign({}, store.settings || {}, next || {});
  const st = S(); saveNow();
  if (st.webrtcProxy !== prev.webrtcProxy) tabs.forEach(t => { try { t.view.webContents.setWebRTCIPHandlingPolicy(webrtcPolicy(t)); } catch (_) {} });
  if (st.zoom !== prev.zoom) tabs.forEach(t => { if (t.zoom == null) t.view.webContents.setZoomFactor((Number(st.zoom) || 100) / 100); });
  if (st.checkMin !== prev.checkMin) restartCheckTimer();
  if (st.autoStart !== prev.autoStart && app.isPackaged) { try { app.setLoginItemSettings({ openAtLogin: !!st.autoStart }); } catch (_) {} }
  return st;
});
ipcMain.handle('settings:reset', () => { store.settings = {}; saveNow(); restartCheckTimer(); tabs.forEach(t => { try { t.view.webContents.setWebRTCIPHandlingPolicy(webrtcPolicy(t)); if (t.zoom == null) t.view.webContents.setZoomFactor(1); } catch (_) {} }); return S(); });
// Limpar dados de navegação: de um perfil ou de todos
ipcMain.handle('data:clear', async (_, { profileId, what }) => {
  const parts = profileId === '*' ? ['direto'].concat(store.profiles.map(p => p.id)) : [profileId || 'direto'];
  const storages = { cookies: ['cookies'], storage: ['localstorage', 'indexdb', 'serviceworkers', 'cachestorage', 'websql', 'filesystem'], all: undefined }[what || 'all'];
  for (const part of parts) {
    const ses = session.fromPartition('persist:aoshi-' + part);
    if (what === 'cache') await ses.clearCache();
    else { await ses.clearStorageData(storages ? { storages } : undefined); if (what === 'all') await ses.clearCache(); }
  }
  return true;
});
ipcMain.handle('downloads:pick', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Pasta dos downloads', properties: ['openDirectory', 'createDirectory'], defaultPath: S().downloadDir || app.getPath('downloads') });
  return r.canceled ? '' : r.filePaths[0];
});
ipcMain.handle('downloads:open', (_, file) => { if (file) shell.showItemInFolder(file); else shell.openPath(S().downloadDir || app.getPath('downloads')); });
ipcMain.handle('token:clear', () => { store.token = ''; saveNow(); ui('code-info', { version: versionOf(code()), when: store.when, hasToken: false }); return true; });
ipcMain.handle('app:check-update', async () => {
  if (!app.isPackaged) return 'Só funciona no programa instalado.';
  try { const r = await require('electron-updater').autoUpdater.checkForUpdates(); const v = r && r.updateInfo && r.updateInfo.version; return v && v !== app.getVersion() ? `Versão ${v} encontrada: baixando.` : 'Você já está na versão mais nova.'; } catch (e) { return 'Não consegui conferir: ' + (e.message || e); }
});
ipcMain.handle('app:open-releases', () => shell.openExternal('https://github.com/aoshiscripts/aoshi-instalador/releases'));
ipcMain.handle('ui:modal', (_, on) => { modalOpen = !!on; layout(); });
ipcMain.handle('tabs:reload-all', () => tabs.forEach(t => t.view.webContents.reload()));
ipcMain.handle('app:update-install', () => { try { require('electron-updater').autoUpdater.quitAndInstall(); } catch (_) {} });
ipcMain.handle('app:version', () => app.getVersion());

// ---------- Mensagens das páginas do jogo (preload.js) ----------
ipcMain.handle('page:check', () => checkCode(true));
ipcMain.handle('page:info', () => ({ when: store.when, version: app.getVersion() }));
ipcMain.on('page:models', (_, json) => { try { if (Array.isArray(JSON.parse(json))) { store.sharedModels = json; save(); } } catch (_) {} });

// Proxy com usuário e senha.
const testCreds = new Map(); // host:porta → usuário e senha de um teste em andamento
app.on('login', (event, wc, details, authInfo, callback) => {
  if (!authInfo.isProxy) return;
  let creds = testCreds.get(`${String(authInfo.host).toLowerCase()}:${Number(authInfo.port)}`) || null;
  if (!creds && wc) { const t = tabs.find(x => x.view.webContents === wc); const p = t && profileOf(t.profileId); creds = p && p.proxy; }
  if (!creds && details && details.url) { /* pedidos sem aba (ex.: favicon): usa o primeiro perfil com esse host */ const p = store.profiles.find(x => x.proxy && authInfo.host === x.proxy.host && Number(authInfo.port) === Number(x.proxy.port)) || store.profiles.find(x => x.proxy && authInfo.host === x.proxy.host); creds = p && p.proxy; }
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

let checkTimer = null;
function restartCheckTimer() { clearInterval(checkTimer); checkTimer = setInterval(() => checkCode(false), Math.max(1, Number(S().checkMin) || CHECK_MIN) * 60000); }
// Limpar dados ao fechar (cookies, cache e armazenamento de todos os perfis)
let clearing = false;
app.on('before-quit', e => {
  if (!S().clearOnExit || clearing) return;
  e.preventDefault(); clearing = true;
  const parts = ['direto'].concat(store.profiles.map(p => p.id));
  Promise.all(parts.map(p => { const ses = session.fromPartition('persist:aoshi-' + p); return Promise.all([ses.clearStorageData(), ses.clearCache()]).catch(() => {}); })).finally(() => app.quit());
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
// Windows guarda os ícones num cache e continua mostrando o antigo depois de uma atualização.
// Na primeira vez que cada versão abre: regrava os atalhos (área de trabalho, menu Iniciar e barra de tarefas)
// apontando para o ícone do programa e manda o Windows recarregar o cache de ícones.
function refreshWindowsIcons() {
  if (process.platform !== 'win32' || !app.isPackaged) return;
  // O Windows guarda o ícone pelo caminho do arquivo: um .ico com o nome da versão obriga ele a desenhar o novo.
  const exe = process.execPath, roam = process.env.APPDATA || '', ver = app.getVersion();
  let ico = exe;
  try {
    const dir = path.join(app.getPath('userData'), 'icons');
    fs.mkdirSync(dir, { recursive: true });
    ico = path.join(dir, `aoshi-pro-${ver}.ico`);
    if (!fs.existsSync(ico)) fs.writeFileSync(ico, fs.readFileSync(path.join(__dirname, 'icon.ico')));
    fs.readdirSync(dir).forEach(f => { if (/^aoshi-pro-.*\.ico$/i.test(f) && path.join(dir, f) !== ico) try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} });
  } catch (_) { ico = exe; }
  const links = [
    path.join(app.getPath('desktop'), 'Aoshi Pro.lnk'),
    path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'Desktop', 'Aoshi Pro.lnk'),
    path.join(roam, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Aoshi Pro.lnk'),
    path.join(roam, 'Microsoft', 'Internet Explorer', 'Quick Launch', 'User Pinned', 'TaskBar', 'Aoshi Pro.lnk')
  ];
  let changed = false;
  links.forEach(lnk => {
    try {
      if (!fs.existsSync(lnk)) return;
      const cur = shell.readShortcutLink(lnk);
      // só atalhos do Aoshi Pro (mesmo que apontem para uma instalação antiga em outra pasta)
      if (!cur || !/aoshi pro\.exe$/i.test(cur.target || '')) return;
      if (cur.icon === ico && path.resolve(cur.target).toLowerCase() === path.resolve(exe).toLowerCase()) return;
      changed = shell.writeShortcutLink(lnk, 'replace', Object.assign({}, cur, { target: exe, cwd: path.dirname(exe), icon: ico, iconIndex: 0 })) || changed;
    } catch (_) {}
  });
  if (changed || store.iconsFor !== ver) {
    store.iconsFor = ver; save();
    try {
      const { spawn } = require('child_process');
      const ie4 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'ie4uinit.exe');
      if (fs.existsSync(ie4)) spawn(ie4, ['-show'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } catch (_) {}
  }
}
// erro inesperado no processo principal: registra e segue (sem a janela "A JavaScript error occurred")
process.on('uncaughtException', e => { try { console.error('[Aoshi Pro]', e); fs.appendFileSync(path.join(app.getPath('userData'), 'erros.log'), new Date().toISOString() + ' ' + (e && e.stack || e) + '\n'); } catch (_) {} });
process.on('unhandledRejection', e => { try { console.error('[Aoshi Pro]', e); } catch (_) {} });
app.whenReady().then(async () => {
  load();
  refreshWindowsIcons();
  // a sessão sem proxy (e as extensões dela) ficam prontas antes da barra aparecer
  try { await withTimeout(sessionFor(''), 6000); } catch (_) {}
  createWindow();
  restartCheckTimer();
  try { if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: !!S().autoStart }); } catch (_) {}
  setupAutoUpdate();
});
app.on('window-all-closed', () => app.quit());
