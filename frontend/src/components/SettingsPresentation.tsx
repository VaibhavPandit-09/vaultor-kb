import type {ReactNode} from 'react';
import {MotionIndicator} from './MotionFeedback';
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
