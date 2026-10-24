const {contextBridge,ipcRenderer}=require('electron');
// No filesystem methods, native paths, keys, arbitrary channels or HTTP access.
contextBridge.exposeInMainWorld('linkedGate3',Object.freeze({context:()=>ipcRenderer.invoke('linked-g3-context'),request:value=>ipcRenderer.invoke('linked-g3-request',value)}));
