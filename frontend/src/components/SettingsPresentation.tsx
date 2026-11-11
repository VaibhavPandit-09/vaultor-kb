import {useId,useState,type ReactNode,type HTMLAttributes,type Ref} from 'react';
import {getGlassPanelStyle,getOverlayStyle} from '../lib/transparency';
import {MotionIndicator} from './MotionFeedback';
/** Original SettingsModal geometry and glass, independent of preference/service ownership. */
export function SettingsSurface({opacity,onClose,children,dialogRef,...props}:{opacity:number;onClose:()=>void;children:ReactNode;dialogRef:Ref<HTMLDivElement>} & HTMLAttributes<HTMLDivElement>){
 return <div className="settings-overlay" style={getOverlayStyle(opacity,.38)} onClick={onClose}><div {...props} ref={dialogRef} role="dialog" aria-modal="true" data-motion-surface="panel" data-motion-key="settings" className="settings-window" style={getGlassPanelStyle(opacity,16,'canvas')} onClick={event=>event.stopPropagation()}>{children}</div></div>;
}
export function Choices({ label, value, options, onChange }: { label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string,trigger?:HTMLElement) => void }) {
  return <div role="radiogroup" aria-label={label} className="settings-choices" onKeyDown={event => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const current = options.findIndex(option => option.value === value);
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + options.length) % options.length;
    const trigger=event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[index];onChange(options[index].value,trigger);trigger?.focus();
  }}><MotionIndicator axis="horizontal" value={value}/>{options.map(option => <button type="button" role="radio" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} key={option.value} onClick={event => onChange(option.value,event.currentTarget)}>{option.label}</button>)}</div>;
}

export function SettingsRow({label,description,children}:{label:string;description?:ReactNode;children:ReactNode}){return <div className="settings-row"><div className="settings-row-copy"><h4>{label}</h4>{description&&<p>{description}</p>}</div><div className="settings-control">{children}</div></div>;}
export function SettingsBody({rail,mobile,children}:{rail:ReactNode;mobile?:ReactNode;children:ReactNode}){return <div className="settings-body">{rail}{mobile}{children}</div>;}

export function NumberRange({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (value: number) => void }) {
  const errorId=useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const commit = () => {
    const number = Number(draft);
    if (draft === '' || !Number.isFinite(number) || number < min || number > max || Math.abs((number - min) / step - Math.round((number - min) / step)) > 0.001) { setError(`Use ${min}–${max} ${unit}, in steps of ${step}.`); return; }
    onChange(number); setDraft(null); setError('');
  };
  return <div className="settings-range"><div><input type="range" aria-label={label} value={value} min={min} max={max} step={step} onChange={event => { setDraft(null); setError(''); onChange(Number(event.target.value)); }} /><label><input type="number" aria-label={`${label} value`} aria-invalid={Boolean(error)} aria-describedby={error?errorId:undefined} value={draft ?? String(value)} min={min} max={max} step={step} onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={() => { if (draft !== null) commit(); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && draft !== null) { event.preventDefault(); commit(); } }} /><span>{unit}</span></label></div>{error && <p id={errorId} role="alert" className="settings-error">{error}</p>}</div>;
}
