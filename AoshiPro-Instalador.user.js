// ==UserScript==
// @name         Aoshi Pro • Instalador
// @namespace    aoshi.scripts.tw
// @version      1.12
// @updateURL    https://raw.githubusercontent.com/aoshiscripts/aoshi-instalador/main/AoshiPro-Instalador.user.js
// @downloadURL  https://raw.githubusercontent.com/aoshiscripts/aoshi-instalador/main/AoshiPro-Instalador.user.js
// @description  Carrega o Aoshi Pro direto do repositório privado do GitHub (aoshiscripts/aoshi-pro) e mantém atualizado sozinho.
// @match        https://*.tribalwars.com.br/game.php*
// @match        https://*.tribalwars.com.pt/game.php*
// @match        https://*.tribalwars.net/game.php*
// @match        https://*.tribalwars.co.uk/game.php*
// @match        https://*.tribalwars.us/game.php*
// @match        https://*.guerrastribales.es/game.php*
// @match        https://tribalwars.com.br/*
// @match        https://www.tribalwars.com.br/*
// @match        https://tribalwars.com.pt/*
// @match        https://www.tribalwars.com.pt/*
// @match        https://tribalwars.net/*
// @match        https://www.tribalwars.net/*
// @match        https://tribalwars.co.uk/*
// @match        https://www.tribalwars.co.uk/*
// @match        https://tribalwars.us/*
// @match        https://www.tribalwars.us/*
// @match        https://guerrastribales.es/*
// @match        https://www.guerrastribales.es/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      api.github.com
// @run-at       document-start
// @noframes
// ==/UserScript==

/* Como funciona
   - O script de verdade fica no GitHub (repositório privado). Este instalador baixa, guarda uma cópia compactada
     no Tampermonkey (não legível) e roda essa cópia em toda página do jogo, sem esperar a internet.
     No editor do Tampermonkey aparece só este instalador, nunca o código do Aoshi Pro.
   - A cada CHECK_MIN minutos ele pergunta ao GitHub se mudou. Se mudou, baixa a versão nova e ela passa a valer
     na próxima página aberta (aparece um aviso no canto).
   - Repositório privado: precisa de um token de LEITURA do GitHub, colado uma única vez (fica guardado só no
     seu Tampermonkey). Menu do Tampermonkey › "Aoshi Pro: trocar token" para mudar.
   - Sem internet ou com o GitHub fora do ar, roda a última cópia guardada. */
// Bem no começo da página (antes do mapa desenhar): redutores de ícones já aplicados, sem os ícones aparecerem grandes primeiro.
// Mesmos IDs de estilo do Aoshi Pro: ele reconhece, e desligar o redutor remove normalmente.
(function () {
  try {
    if (window.top !== window.self || !/[?&]screen=map\b/.test(location.search)) return;
    const r60 = localStorage.getItem('aoshi-module-redutor-60') === '1';
    const r50 = !r60 && localStorage.getItem('aoshi-module-redutor-50') === '1';
    if (!r60 && !r50) return;
    const st = document.createElement('style');
    st.id = r60 ? 'aoshi-group-icon-reducer-60' : 'aoshi-group-icon-reducer-50';
    st.textContent = r60
      ? '[id^="map_icons_"],#map_container img[src*="/map/reserved_"]{transform:scale(.6)!important;transform-origin:bottom right!important;transition:none!important;animation:none!important}[id^="map_icons_"] img{width:13px!important;height:13px!important;max-width:13px!important;max-height:13px!important;transform:scale(.6)!important;transform-origin:bottom right!important}#map_container img[src*="/map/reserved_"]{transform:scale(.70)!important}'
      : '#map_container img[id^="map_icons_"],#map_container img[src*="/map/reserved_"]{transform:scale(.5)!important;transform-origin:bottom right!important;transition:none!important;animation:none!important}#map_container img[src*="/map/reserved_"]{transform:scale(.70)!important}';
    (document.head || document.documentElement).appendChild(st);
  } catch (_) {}
})();

// O resto espera a página carregar (como antes).
const aoshiInstallerMain = () => (function () {
  'use strict';
  if (window.top !== window.self) return;

  const OWNER = 'aoshiscripts', REPO = 'aoshi-pro', FILE = 'AoshiPro-Hub.user.js', BRANCH = 'main';
  const CHECK_MIN = 5;
  const K = { token: 'aoshi-gh-token', code: 'aoshi-gh-code', etag: 'aoshi-gh-etag', at: 'aoshi-gh-checked', when: 'aoshi-gh-updated' };
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}?ref=${BRANCH}`;

  // Roda o código na página (mesmo contexto de um script instalado direto).
  // Modelos do Hub guardados no Tampermonkey: valem em todos os mundos (o localStorage é separado por mundo).
  const SHARED_MODELS = 'aoshi-shared-models';
  function run(code) {
    const s = document.createElement('script');
    let shared = '[]'; try { shared = JSON.stringify(JSON.parse(GM_getValue(SHARED_MODELS, '[]'))); } catch (_) {}
    s.textContent = 'window.__AOSHI_SHARED_MODELS = ' + shared.replace(/</g, '\\u003c') + ';\n(function(){\n' + code + '\n})();';
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  }

  function toast(text, bad, action) {
    const old = document.getElementById('aoshi-installer-toast'); if (old) old.remove();
    const box = document.createElement('div');
    box.id = 'aoshi-installer-toast';
    box.style.cssText = 'position:fixed;right:16px;bottom:44px;z-index:2147483000;max-width:340px;padding:10px 12px;border-radius:10px;' +
      'background:#17171c;color:#f4f4f5;border:1px solid ' + (bad ? '#dc2626' : '#7c3aed') + ';font:12px/1.45 system-ui,Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45)';
    const msg = document.createElement('div'); msg.textContent = text; box.appendChild(msg);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = action.label;
      b.style.cssText = 'margin-top:8px;padding:4px 10px;border-radius:6px;border:0;background:#7c3aed;color:#fff;font:600 12px system-ui,Arial,sans-serif;cursor:pointer';
      b.addEventListener('click', action.run); box.appendChild(b);
    }
    const x = document.createElement('span');
    x.textContent = '×'; x.title = 'Fechar';
    x.style.cssText = 'position:absolute;right:8px;top:4px;cursor:pointer;font-size:15px;color:#a1a1aa';
    x.addEventListener('click', () => box.remove()); box.appendChild(x);
    document.body.appendChild(box);
    if (!bad && !action) setTimeout(() => box.remove(), 8000);
  }

  // Janelinha para colar o token (uma vez).
  function askToken(reason) {
    if (document.getElementById('aoshi-installer-token')) return;
    const box = document.createElement('div');
    box.id = 'aoshi-installer-token';
    box.style.cssText = 'position:fixed;left:50%;top:120px;transform:translateX(-50%);z-index:2147483001;width:min(460px,92vw);padding:14px 16px;border-radius:12px;' +
      'background:#17171c;color:#f4f4f5;border:1px solid #7c3aed;font:12.5px/1.5 system-ui,Segoe UI,Arial,sans-serif;box-shadow:0 12px 32px rgba(0,0,0,.55)';
    box.innerHTML = '<div style="font-weight:700;font-size:14px;margin-bottom:6px">Aoshi <span style="color:#a78bfa">Pro</span> • Instalador</div>' +
      '<div class="r" style="margin-bottom:8px"></div>' +
      '<input type="password" placeholder="github_pat_…" autocomplete="off" style="width:100%;box-sizing:border-box;padding:7px 9px;border-radius:7px;border:1px solid #3f3f46;background:#0f0f12;color:#f4f4f5;font:12px monospace">' +
      '<div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="ok" style="padding:6px 12px;border-radius:7px;border:0;background:#7c3aed;color:#fff;font-weight:600;cursor:pointer">Salvar e instalar</button>' +
      '<button type="button" class="no" style="padding:6px 12px;border-radius:7px;border:1px solid #3f3f46;background:transparent;color:#d4d4d8;cursor:pointer">Agora não</button></div>' +
      '<div class="e" style="margin-top:8px;color:#f87171"></div>';
    box.querySelector('.r').textContent = reason || 'Cole o token de leitura do GitHub (repositório aoshiscripts/aoshi-pro). Ele fica guardado só no seu Tampermonkey.';
    document.body.appendChild(box);
    const input = box.querySelector('input'), err = box.querySelector('.e');
    box.querySelector('.no').addEventListener('click', () => box.remove());
    box.querySelector('.ok').addEventListener('click', () => {
      const token = input.value.trim();
      if (!token) { err.textContent = 'Cole o token.'; return; }
      err.style.color = '#a1a1aa'; err.textContent = 'Conferindo no GitHub…';
      fetchCode(token, '').then(r => {
        if (r.kind !== 'new') { err.style.color = '#f87171'; err.textContent = r.message || 'O GitHub não aceitou esse token.'; return; }
        GM_setValue(K.token, token);
        store(r).then(() => { box.remove(); toast('Aoshi Pro instalado. Recarregando a página…'); setTimeout(() => location.reload(), 900); });
      });
    });
    input.focus();
  }

  // Busca o arquivo no GitHub. Com ETag: se não mudou, o GitHub responde 304 e não baixa nada.
  function fetchCode(token, etag) {
    return new Promise(resolve => {
      const headers = { 'Accept': 'application/vnd.github.raw+json', 'Authorization': 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' };
      if (etag) headers['If-None-Match'] = etag;
      GM_xmlhttpRequest({
        method: 'GET', url: API, headers, timeout: 30000,
        onload: res => {
          if (res.status === 304) return resolve({ kind: 'same' });
          if (res.status === 200 && res.responseText && res.responseText.indexOf('==UserScript==') !== -1) {
            const m = /^etag:\s*(.+)$/im.exec(res.responseHeaders || '');
            return resolve({ kind: 'new', code: res.responseText, etag: m ? m[1].trim() : '' });
          }
          if (res.status === 401) return resolve({ kind: 'auth', message: 'Token inválido ou vencido.' });
          if (res.status === 403 || res.status === 404) return resolve({ kind: 'auth', message: 'O token não tem acesso de leitura ao repositório ' + OWNER + '/' + REPO + ' (ou o arquivo ainda não foi enviado).' });
          resolve({ kind: 'error', message: 'GitHub respondeu ' + res.status + '.' });
        },
        onerror: () => resolve({ kind: 'error', message: 'Sem conexão com o GitHub.' }),
        ontimeout: () => resolve({ kind: 'error', message: 'O GitHub demorou demais para responder.' })
      });
    });
  }
  // A cópia fica guardada compactada (gzip + base64): não aparece como código legível no Tampermonkey.
  const b64 = bytes => { let out = ''; for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(out); };
  const unb64 = text => { const bin = atob(text), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return bytes; };
  async function pack(code) {
    const raw = new TextEncoder().encode(code);
    if (typeof CompressionStream !== 'function') return 'b6:' + b64(raw);
    const buf = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
    return 'gz:' + b64(new Uint8Array(buf));
  }
  async function unpack(saved) {
    if (!saved) return '';
    if (saved.startsWith('b6:')) return new TextDecoder().decode(unb64(saved.slice(3)));
    if (!saved.startsWith('gz:')) return saved; // cópia antiga, sem compactar
    const buf = await new Response(new Blob([unb64(saved.slice(3))]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    return new TextDecoder().decode(buf);
  }
  async function store(r) { GM_setValue(K.code, await pack(r.code)); GM_setValue(K.etag, r.etag || ''); GM_setValue(K.when, Date.now()); GM_setValue(K.at, Date.now()); }

  // Conversa com o botão "Atualizar" do Hub (o script roda na página, o instalador no Tampermonkey).
  const root = document.documentElement;
  // "Pendente" = já existe no Tampermonkey uma cópia mais nova do que a que esta página está rodando.
  const ranWhen = Number(GM_getValue(K.when, 0)) || 0;
  let lastPending = false;
  const mark = () => {
    const when = Number(GM_getValue(K.when, 0)) || 0;
    const pending = ranWhen > 0 && when !== ranWhen;
    root.dataset.aoshiInstaller = '1'; root.dataset.aoshiInstallerV = '1.10';
    root.dataset.aoshiUpdated = String(when || ''); root.dataset.aoshiPending = pending ? '1' : '';
    return pending;
  };
  const sync = () => { const p = mark(); if (p !== lastPending) { lastPending = p; document.dispatchEvent(new Event('aoshi-installer-result')); } };
  const reply = msg => { root.dataset.aoshiInstallerMsg = msg; mark(); document.dispatchEvent(new Event('aoshi-installer-result')); };

  function check(force) {
    const token = GM_getValue(K.token, '');
    if (!token) { askToken(); if (force) reply('Falta colar o token do GitHub.'); return; }
    if (!force && Date.now() - Number(GM_getValue(K.at, 0)) < CHECK_MIN * 60000) return;
    GM_setValue(K.at, Date.now());
    const had = !!GM_getValue(K.code, '');
    fetchCode(token, had ? GM_getValue(K.etag, '') : '').then(async r => {
      if (r.kind === 'new') {
        await store(r);
        if (!had) { toast('Aoshi Pro instalado. Recarregando a página…'); setTimeout(() => location.reload(), 900); }
        else toast('Aoshi Pro atualizado. A versão nova vale a partir da próxima página.', false, { label: 'Recarregar agora', run: () => location.reload() });
        sync();
        if (force) reply('Versão nova baixada. Recarregue a página para usar.');
      } else if (r.kind === 'same') { if (force) { toast('Aoshi Pro já está na última versão.'); reply('Já está na última versão.'); } }
      else if (r.kind === 'auth') { if (had) toast(r.message + ' Rodando a última cópia guardada.', true, { label: 'Trocar token', run: () => askToken(r.message) }); else askToken(r.message); }
      else if (force || !had) toast(r.message + (had ? ' Rodando a última cópia guardada.' : ''), true);
      if (force && r.kind !== 'new' && r.kind !== 'same') reply(r.message || 'Não deu para conferir agora.');
    });
  }

  try {
    GM_registerMenuCommand('Aoshi Pro: atualizar agora', () => check(true));
    GM_registerMenuCommand('Aoshi Pro: trocar token', () => askToken('Cole o novo token de leitura do GitHub.'));
    GM_registerMenuCommand('Aoshi Pro: apagar cópia guardada', () => { GM_deleteValue(K.code); GM_deleteValue(K.etag); GM_deleteValue(K.at); toast('Cópia apagada. Recarregue a página para baixar de novo.'); });
  } catch (_) {}

  mark();
  document.addEventListener('aoshi-installer-check', () => check(true));
  // O Hub salvou/excluiu um modelo: guarda a lista para todos os mundos.
  document.addEventListener('aoshi-shared-models-save', () => {
    try { const v = root.dataset.aoshiSharedModels || '[]'; if (Array.isArray(JSON.parse(v))) GM_setValue(SHARED_MODELS, v); delete root.dataset.aoshiSharedModels; root.dataset.aoshiSharedOk = String(Date.now()); } catch (_) {}
  });
  // Hub aberto: conferida rápida e silenciosa (no máximo uma por minuto).
  document.addEventListener('aoshi-installer-peek', () => { if (Date.now() - Number(GM_getValue(K.at, 0)) > 60000) { GM_setValue(K.at, 0); check(false); } });
  unpack(GM_getValue(K.code, '')).then(code => { if (code) run(code); })
    .catch(() => { GM_deleteValue(K.code); GM_deleteValue(K.etag); GM_deleteValue(K.at); })
    .finally(() => {
      check(false);
      // Página aberta por muito tempo (automáticos rodando): confere sozinho de tempos em tempos.
      setInterval(() => check(false), 60000);
      // Outra aba pode ter baixado a versão nova: avisa o Hub desta página também.
      setInterval(sync, 5000);
    });
})();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', aoshiInstallerMain, { once: true }); else aoshiInstallerMain();
