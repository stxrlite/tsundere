const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tsundereInstaller", {
  meta: () => ipcRenderer.invoke("installer:meta"),
  detect: () => ipcRenderer.invoke("installer:detect"),
  install: (options) => ipcRenderer.invoke("installer:install", options),
  open: (target) => ipcRenderer.invoke("installer:open", target)
});
