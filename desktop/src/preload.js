// Aoshi Pro Desktop — roda no começo de cada página das abas (mundo isolado, mas com o mesmo DOM).
// Faz o papel que o instalador do Tampermonkey fazia: redutores de ícones aplicados antes do mapa desenhar,
// botão "Atualizar" do Hub, e os modelos do Hub guardados para todos os mundos.
'use strict';
const { ipcRenderer } = require('electron');

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
