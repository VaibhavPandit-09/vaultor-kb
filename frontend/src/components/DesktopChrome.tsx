import WindowControls from './WindowControls';
import { useContext, useEffect, useState } from 'react';
import { Ellipsis, Plug, Layers } from 'lucide-react';
import { unwrap } from '../lib/desktop';

import { WorkspaceSelectionContext } from '../lib/workspaceSelection';
import { DesktopConnectionContext } from '../lib/desktopConnectionContext';
export function DesktopConnectionButton() {
  const connection = useContext(DesktopConnectionContext);
  const workspace=useContext(WorkspaceSelectionContext);
  if(workspace)return <div className="flex items-center min-w-0"><button className="desktop-connection-button flex-1 min-w-0" onClick={workspace.open} title={workspace.server+' · Switch workspace'}><Layers size={15}/><span className="truncate">{workspace.name}</span></button>{connection&&<button className="p-2 rounded-lg hover:bg-card" aria-label="Connections and sharing" title={connection.name+' · Connections and sharing'} onClick={connection.open}><Plug size={16}/></button>}</div>;
  if (!connection) return null;
  return <button className="desktop-connection-button" onClick={connection.open} title="Connections and sharing"><Plug size={15}/><span className="truncate">{connection.name}</span><span className={connection.online ? 'desktop-online' : 'desktop-offline'} aria-label={connection.online ? 'Connected' : 'Connection interrupted'}/></button>;
}
export default function DesktopChrome() {
  const bridge = window.vaultorDesktop;
  const [maximized, setMaximized] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!bridge?.windowStatus) return;
    void bridge.windowStatus().then(unwrap).then(s => setMaximized(s.maximized)).catch(() => {});
    return bridge.onWindowStatus?.(s => setMaximized(s.maximized));
  }, [bridge]);
  if (!bridge?.windowAction) return null;
  const action = (value: 'menu' | 'minimize' | 'maximize' | 'close') => { setError(''); void bridge.windowAction!(value).then(unwrap).then(s => setMaximized(s.maximized)).catch(e => setError(e.message)); };
  return <WindowControls maximized={maximized} minimize={()=>action('minimize')} maximize={()=>action('maximize')} close={()=>action('close')} closeTitle="Close to tray" error={error} drag={<div className="desktop-drag-grip" title="Drag window" onDoubleClick={()=>action('maximize')}/>} menu={<button aria-label="App menu" title="App menu" onClick={()=>action('menu')}><Ellipsis size={16}/></button>}/>;
}
