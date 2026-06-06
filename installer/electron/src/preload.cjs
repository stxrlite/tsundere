const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("tsundereInstaller", {
  meta: () => ipcRenderer.invoke("installer:meta"),
  detect: () => ipcRenderer.invoke("installer:detect"),
  status: () => ipcRenderer.invoke("installer:status"),
  install: (options) => ipcRenderer.invoke("installer:install", options),
  open: (target) => ipcRenderer.invoke("installer:open", target),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("installer:progress", listener);
    return () => ipcRenderer.removeListener("installer:progress", listener);
  },
  minimize: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximize: () => ipcRenderer.invoke("window:toggleMaximize"),
  close: () => ipcRenderer.invoke("window:close")
});
