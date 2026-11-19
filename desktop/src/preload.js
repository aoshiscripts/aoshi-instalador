// Aoshi Pro Desktop — roda no começo de cada página das abas (mundo isolado, mas com o mesmo DOM).
// Faz o papel que o instalador do Tampermonkey fazia: redutores de ícones aplicados antes do mapa desenhar,
// botão "Atualizar" do Hub, e os modelos do Hub guardados para todos os mundos.
'use strict';
const { ipcRenderer, contextBridge, webFrame } = require('electron');

const isTW = /(^|\.)(tribalwars|die-staemme|staemme|plemiona|guerretribale|divokekmeny|klanhaboru|triburile|vojnaplemen)\./i.test(location.hostname);

if (isTW) {
  // Redutores de ícones no começo da página (mesmos ids de estilo do Aoshi Pro).
  try {
    if (/[?&]screen=map\b/.test(location.search)) {
      const r60 = localStorage.getItem('aoshi-module-redutor-60') === '1';
      const r50 = !r60 && localStorage.getItem('aoshi-module-redutor-50') === '1';
      if (r60 || r50) {
        const put = () => {
          if (document.getElementById(r60 ? 'aoshi-group-icon-reducer-60' : 'aoshi-group-icon-reducer-50')) return;
          const st = document.createElement('style');
          st.id = r60 ? 'aoshi-group-icon-reducer-60' : 'aoshi-group-icon-reducer-50';
          st.textContent = r60
            ? '[id^="map_icons_"],#map_container img[src*="/map/reserved_"]{transform:scale(.6)!important;transform-origin:bottom right!important;transition:none!important;animation:none!important}[id^="map_icons_"] img{width:13px!important;height:13px!important;max-width:13px!important;max-height:13px!important;transform:scale(.6)!important;transform-origin:bottom right!important}#map_container img[src*="/map/reserved_"]{transform:scale(.68)!important}'
            : '#map_container img[id^="map_icons_"],#map_container img[src*="/map/reserved_"]{transform:scale(.5)!important;transform-origin:bottom right!important;transition:none!important;animation:none!important}#map_container img[src*="/map/reserved_"]{transform:scale(.68)!important}';
          (document.head || document.documentElement).appendChild(st);
        };
        if (document.documentElement) put(); else document.addEventListener('readystatechange', put, { once: true });
      }
    }
  } catch (_) {}

  const root = () => document.documentElement;
  const mark = info => { const r = root(); if (!r) return; r.dataset.aoshiInstaller = '1'; r.dataset.aoshiInstallerV = 'desktop'; if (info && info.when) r.dataset.aoshiUpdated = String(info.when); };
  ipcRenderer.invoke('page:info').then(mark).catch(() => {});
  document.addEventListener('DOMContentLoaded', () => ipcRenderer.invoke('page:info').then(mark).catch(() => {}));

  // Botão "Atualizar" do Hub
  document.addEventListener('aoshi-installer-check', () => {
    ipcRenderer.invoke('page:check').then(msg => {
      const r = root(); if (!r) return;
      r.dataset.aoshiInstallerMsg = msg;
      document.dispatchEvent(new Event('aoshi-installer-result'));
    }).catch(() => {});
  });

  // Modelos do Hub: valem em todos os mundos (guardados no programa)
  document.addEventListener('aoshi-shared-models-save', () => {
    const r = root(); if (!r) return;
    const v = r.dataset.aoshiSharedModels || '[]';
    ipcRenderer.send('page:models', v);
    delete r.dataset.aoshiSharedModels;
    r.dataset.aoshiSharedOk = String(Date.now());
  });
}


// ---------- Scripts de usuário (gerenciador do Aoshi Pro Desktop, no lugar do Tampermonkey) ----------
// Pergunta ao programa quais scripts valem para esta página e roda cada um no mundo da página, no momento do
// @run-at. As funções GM_ falam com o programa por uma ponte que só aceita o token de cada script.
if (/^https?:$/.test(location.protocol)) {
  let list = [];
  try { list = ipcRenderer.sendSync('us:match', location.href) || []; } catch (_) { list = []; }
  if (list.length) {
    try { contextBridge.exposeInMainWorld('__aoshiUS', { call: (token, op, a) => ipcRenderer.invoke('us:call', token, op, a) }); } catch (_) {}
    const J = v => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    const wrap = sc => `(function(){
const __b = window.__aoshiUS, __t = ${J(sc.token)}, __vals = ${J(sc.values || {})}, __res = ${J(sc.resources || {})};
const GM_info = { script: { name: ${J(sc.name)}, version: ${J(sc.version)}, namespace: ${J(sc.namespace)}, description: ${J(sc.description)} }, scriptHandler: 'Aoshi Pro Desktop', version: '1' };
const unsafeWindow = window;
const __call = (op, a) => __b ? __b.call(__t, op, a) : Promise.reject(new Error('ponte indisponível'));
const __lis = {};
function GM_getValue(k, d) { return Object.prototype.hasOwnProperty.call(__vals, k) ? __vals[k] : d; }
function GM_setValue(k, v) { const old = __vals[k]; try { v = JSON.parse(JSON.stringify(v)); } catch (_) {} __vals[k] = v; __call('set', { k, v }).catch(() => {}); Object.values(__lis).forEach(l => { if (l.k === k) try { l.f(k, old, v, false); } catch (_) {} }); }
function GM_deleteValue(k) { delete __vals[k]; __call('del', { k }).catch(() => {}); }
function GM_listValues() { return Object.keys(__vals); }
function GM_addValueChangeListener(k, f) { const id = Math.random().toString(36).slice(2); __lis[id] = { k, f }; return id; }
function GM_removeValueChangeListener(id) { delete __lis[id]; }
function GM_addStyle(css) { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); return s; }
function GM_addElement(a, b, c) { const parent = typeof a === 'string' ? (document.head || document.documentElement) : a; const tag = typeof a === 'string' ? a : b; const attrs = (typeof a === 'string' ? b : c) || {}; const el = document.createElement(tag); Object.entries(attrs).forEach(([k, v]) => { if (k === 'textContent') el.textContent = v; else el.setAttribute(k, v); }); parent.appendChild(el); return el; }
function GM_setClipboard(text) { __call('clip', { text: String(text) }).catch(() => {}); }
function GM_notification(d, title) { const o = typeof d === 'string' ? { text: d, title } : (d || {}); __call('notify', { text: o.text, title: o.title }).catch(() => {}); }
function GM_openInTab(url, opt) { const bg = typeof opt === 'boolean' ? opt : !!(opt && (opt.active === false || opt.loadInBackground)); __call('open', { url: new URL(url, location.href).href, background: bg }).catch(() => {}); return { close() {}, closed: false }; }
function GM_download(d, name) { const url = typeof d === 'string' ? d : d && d.url; if (url) __call('download', { url: new URL(url, location.href).href }).catch(() => {}); }
function GM_registerMenuCommand(name, fn) { return Math.random().toString(36).slice(2); }
function GM_unregisterMenuCommand() {}
function GM_getResourceURL(n) { return __res[n] || ''; }
function GM_getResourceText(n) { const u = __res[n]; if (!u) return ''; try { const b = atob(u.split(',')[1] || ''); return decodeURIComponent(escape(b)); } catch (_) { return ''; } }
function GM_log() { console.log('[' + GM_info.script.name + ']', ...arguments); }
function GM_xmlhttpRequest(d) {
  d = d || {}; let aborted = false;
  let data = d.data; if (data != null && typeof data !== 'string') { if (data instanceof URLSearchParams) data = data.toString(); else if (typeof data === 'object' && !(data instanceof FormData) && !(data instanceof Blob)) { try { data = JSON.stringify(data); } catch (_) { data = String(data); } } else if (!(data instanceof FormData) && !(data instanceof Blob)) data = String(data); else data = null; }
  __call('xhr', { method: d.method || 'GET', url: new URL(d.url, location.href).href, headers: d.headers || {}, data, timeout: d.timeout || 0, responseType: d.responseType || '', anonymous: !!d.anonymous }).then(r => {
    if (aborted) return;
    if (!r || r.error) { const ev = { error: r && r.error, status: 0, finalUrl: d.url, readyState: 4, context: d.context }; ((r && r.timeout) ? d.ontimeout : d.onerror)?.(ev); d.onloadend?.(ev); return; }
    let response = r.text;
    if (d.responseType === 'json') { try { response = JSON.parse(r.text); } catch (_) { response = null; } }
    else if (d.responseType === 'arraybuffer' || d.responseType === 'blob') { const bin = Uint8Array.from(atob(r.b64 || ''), c => c.charCodeAt(0)); response = d.responseType === 'blob' ? new Blob([bin], { type: r.ctype || '' }) : bin.buffer; }
    else if (d.responseType === 'document') { response = new DOMParser().parseFromString(r.text, 'text/html'); }
    const res = { status: r.status, statusText: r.statusText, responseText: r.text, response, responseHeaders: r.headers, finalUrl: r.finalUrl, readyState: 4, context: d.context };
    try { d.onreadystatechange?.(res); } catch (e) { console.error(e); }
    try { d.onload?.(res); } catch (e) { console.error(e); }
    try { d.onloadend?.(res); } catch (e) { console.error(e); }
  }, err => { if (!aborted) { const ev = { error: String(err), status: 0 }; d.onerror?.(ev); d.onloadend?.(ev); } });
  return { abort() { aborted = true; try { d.onabort?.({}); } catch (_) {} } };
}
const GM = { info: GM_info, getValue: async (k, d) => GM_getValue(k, d), setValue: async (k, v) => GM_setValue(k, v), deleteValue: async k => GM_deleteValue(k), listValues: async () => GM_listValues(), addStyle: async c => GM_addStyle(c), addElement: (a, b, c) => GM_addElement(a, b, c), setClipboard: async t => GM_setClipboard(t), notification: async (d, t) => GM_notification(d, t), openInTab: async (u, o) => GM_openInTab(u, o), download: async (d, n) => GM_download(d, n), registerMenuCommand: async (n, f) => GM_registerMenuCommand(n, f), getResourceUrl: async n => GM_getResourceURL(n), getResourceText: async n => GM_getResourceText(n),
  xmlHttpRequest: d => new Promise((ok, no) => { GM_xmlhttpRequest(Object.assign({}, d, { onload: r => { d.onload?.(r); ok(r); }, onerror: e => { d.onerror?.(e); no(e); }, ontimeout: e => { d.ontimeout?.(e); no(e); } })); }) };
try {
${(sc.requires || []).join('\n;\n')}
;
${sc.code}
} catch (e) { console.error('[Aoshi Scripts] ' + ${J(sc.name)}, e); }
})();
//# sourceURL=aoshi-script/${encodeURIComponent(sc.name)}.user.js`;
    const run = sc => { try { webFrame.executeJavaScript(wrap(sc)); } catch (e) { console.error('[Aoshi Scripts]', sc.name, e); } };
    const start = list.filter(x => x.runAt === 'document-start'), end = list.filter(x => x.runAt === 'document-end' || x.runAt === 'document-body'), idle = list.filter(x => !['document-start', 'document-end', 'document-body'].includes(x.runAt));
    start.forEach(run);
    if (end.length || idle.length) {
      const onReady = () => { end.forEach(run); if (document.readyState === 'complete') idle.forEach(run); else window.addEventListener('load', () => idle.forEach(run), { once: true }); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady, { once: true }); else onReady();
    }
  }
}
