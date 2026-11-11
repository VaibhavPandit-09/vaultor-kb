import {useId,useRef,type ComponentProps} from 'react';
import {createPortal} from 'react-dom';
import {SettingsSurface} from '../components/SettingsPresentation';
import {DialogFocusContext,useDialogFocus} from '../lib/dialogFocus';
import {ESCAPE_PRIORITIES,PopoverPriorityContext,useEscapeLayer} from '../lib/escape/escape';
import DesktopSettings from './DesktopSettings';

/** Floating original Settings surface; the workspace/editor tree stays mounted. */
export default function DesktopSettingsDialog(props:ComponentProps<typeof DesktopSettings>&{close:()=>void}){
 const root=useRef<HTMLDivElement>(null),titleId=useId();
 const {scope,onKeyDown}=useDialogFocus(root);
 const priority=ESCAPE_PRIORITIES.modal+scope.depth*10;
 useEscapeLayer({active:true,priority,close:props.close,restoreFocusOnEscape:false});
 return createPortal(<SettingsSurface opacity={props.value.opacity} onClose={props.close} dialogRef={root} aria-labelledby={titleId} onKeyDown={onKeyDown}><DialogFocusContext value={scope}><PopoverPriorityContext value={priority+1}><DesktopSettings {...props} titleId={titleId}/></PopoverPriorityContext></DialogFocusContext></SettingsSurface>,document.body);
}
