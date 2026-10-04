import { useContext, useEffect, useState } from 'react';
import { Ellipsis, Maximize, Minimize2, Minus, Plug, X } from 'lucide-react';
import { unwrap } from '../lib/desktop';

import { DesktopConnectionContext } from '../lib/desktopConnectionContext';
export function DesktopConnectionButton() {
  const connection = useContext(DesktopConnectionContext);
  if (!connection) return null;
  return <button className="desktop-connection-button" onClick={connection.open} title="Connections & hosting"><Plug size={15}/><span className="truncate">{connection.name}</span><span className={connection.online ? 'desktop-online' : 'desktop-offline'} aria-label={connection.online ? 'Connected' : 'Connection interrupted'}/></button>;
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
  return <div className="desktop-window-controls" role="group" aria-label="Window controls">
    <div className="desktop-drag-grip" title="Drag window" onDoubleClick={() => action('maximize')}/>
    <button aria-label="Window menu" title="Window menu · Connections & hosting" onClick={() => action('menu')}><Ellipsis size={16}/></button>
    <button aria-label="Minimize" title="Minimize" onClick={() => action('minimize')}><Minus size={16}/></button>
    <button aria-label={maximized ? 'Restore window' : 'Maximize'} title={maximized ? 'Restore window' : 'Maximize'} onClick={() => action('maximize')}>{maximized ? <Minimize2 size={14}/> : <Maximize size={14}/>}</button>
    <button className="desktop-close" aria-label="Close window" title="Close to tray" onClick={() => action('close')}><X size={17}/></button>
    {error && <span role="alert" className="desktop-window-error">{error}</span>}
  </div>;
}
