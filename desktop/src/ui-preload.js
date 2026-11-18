// Ponte entre a barra (ui.html) e o processo principal.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('aoshi', {
  on: fn => ipcRenderer.on('ui', (_, ch, data) => fn(ch, data)),
  newTab: (profileId, url) => ipcRenderer.invoke('tab:new', profileId, url),
  closeTab: id => ipcRenderer.invoke('tab:close', id),
  activate: id => ipcRenderer.invoke('tab:activate', id),
  setProfile: (id, profileId) => ipcRenderer.invoke('tab:profile', id, profileId),
  nav: (id, what, arg) => ipcRenderer.invoke('tab:nav', id, what, arg),
  saveProfiles: list => ipcRenderer.invoke('profiles:save', list),
  testProfile: p => ipcRenderer.invoke('profiles:test', p),
  setToken: t => ipcRenderer.invoke('token:set', t),
  checkCode: () => ipcRenderer.invoke('code:check'),
  reloadAll: () => ipcRenderer.invoke('tabs:reload-all'),
  installUpdate: () => ipcRenderer.invoke('app:update-install'),
  version: () => ipcRenderer.invoke('app:version'),
  modal: on => ipcRenderer.invoke('ui:modal', on),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: s => ipcRenderer.invoke('settings:save', s),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  clearData: o => ipcRenderer.invoke('data:clear', o),
  pickDownloads: () => ipcRenderer.invoke('downloads:pick'),
  openDownloads: f => ipcRenderer.invoke('downloads:open', f),
  clearToken: () => ipcRenderer.invoke('token:clear'),
  checkAppUpdate: () => ipcRenderer.invoke('app:check-update'),
  openReleases: () => ipcRenderer.invoke('app:open-releases')
});
