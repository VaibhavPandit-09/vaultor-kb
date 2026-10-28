// @vitest-environment jsdom
import {StrictMode,useState,useRef,useLayoutEffect} from 'react';
import {createPortal} from 'react-dom';
import {cleanup,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import AppModal from './AppModal';
import LibraryPopover from '../LibraryPopover';
import {EscapeManagerProvider} from '../../lib/escape/EscapeManagerProvider';
import {useTopDialogScope} from '../../lib/dialogFocus';
vi.mock('../../lib/settings',()=>({useOptionalSettings:()=>null}));
beforeEach(()=>{
 vi.spyOn(HTMLElement.prototype,'getClientRects').mockImplementation(()=>[{width:10,height:10}] as unknown as DOMRectList);
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>setTimeout(()=>callback(0),0));
 vi.stubGlobal('cancelAnimationFrame',clearTimeout);
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
function Harness({blocked=false,handoff=false}:{blocked?:boolean;handoff?:boolean}){
 const [open,setOpen]=useState(false),[child,setChild]=useState(false);
 return <EscapeManagerProvider><button onClick={()=>setOpen(true)}>Launch</button><button>Outside</button>
 <AppModal open={open} title="Parent" description="Scope and warnings" onClose={()=>{if(!blocked){setOpen(false);if(handoff)setChild(true);}}} footer={<button>Commit</button>}>
  <input autoFocus aria-label="Value"/><button onClick={()=>setChild(true)}>Open child</button>
  <LibraryPopover label="Utility">{()=> <button>Portal action</button>}</LibraryPopover>
  {!handoff&&child&&createPortal(<AppModal open title="Child" onClose={()=>setChild(false)}><button>Child action</button></AppModal>,document.body)}
 </AppModal>
 {handoff&&child&&<AppModal open title="Handoff" onClose={()=>setChild(false)}><input autoFocus aria-label="New target"/></AppModal>}
 </EscapeManagerProvider>;
}
async function launch(props?:{blocked?:boolean;handoff?:boolean}){render(<StrictMode><Harness {...props}/></StrictMode>);screen.getByText('Launch').focus();fireEvent.click(screen.getByText('Launch'));await waitFor(()=>expect(screen.getByRole('dialog',{name:'Parent'})).toBeTruthy());}
it('honors descendant autofocus, wraps Tab, contains external focus and restores the invoking control after click close',async()=>{
 await launch();expect(document.activeElement).toBe(screen.getByLabelText('Value'));
 const dialog=screen.getByRole('dialog'),close=screen.getByLabelText('Close modal'),commit=screen.getByText('Commit');
 expect(screen.getByText('Scope and warnings').closest('.app-modal-body')).toBeTruthy();expect(commit.closest('.app-modal-body')).toBeNull();
 commit.focus();expect(fireEvent.keyDown(commit,{key:'Tab'})).toBe(false);expect(document.activeElement).toBe(close);
 expect(fireEvent.keyDown(close,{key:'Tab',shiftKey:true})).toBe(false);expect(document.activeElement).toBe(commit);
 screen.getByText('Outside').focus();expect(dialog.contains(document.activeElement)).toBe(true);
 fireEvent.click(close);await waitFor(()=>expect(document.activeElement).toBe(screen.getByText('Launch')));
});
it('lets a registered global Activity control join modal Tab order in both directions',()=>{
 function GlobalControl(){const scope=useTopDialogScope(),root=useRef<HTMLDivElement>(null);useLayoutEffect(()=>{const node=root.current;if(!node||!scope)return;scope.portals.add(node);return()=>{scope.portals.delete(node);};},[scope]);return <div ref={root}><button>Global Activity</button></div>;}
 render(<EscapeManagerProvider><AppModal open title="Settings" onClose={()=>{}} footer={<button>Save settings</button>}><input aria-label="Setting"/></AppModal><GlobalControl/></EscapeManagerProvider>);
 const save=screen.getByText('Save settings'),activity=screen.getByText('Global Activity'),close=screen.getByLabelText('Close modal');save.focus();fireEvent.keyDown(save,{key:'Tab'});expect(document.activeElement).toBe(activity);fireEvent.keyDown(activity,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(save);activity.focus();fireEvent.keyDown(activity,{key:'Tab'});expect(document.activeElement).toBe(close);
});
it('lets the deepest dialog own focus and Escape, then restores its parent trigger',async()=>{
 await launch();const trigger=screen.getByText('Open child');trigger.focus();fireEvent.click(trigger);
 const child=screen.getByRole('dialog',{name:'Child'});expect(child.contains(document.activeElement)).toBe(true);
 screen.getByLabelText('Value').focus();expect(child.contains(document.activeElement)).toBe(true);
 fireEvent.keyDown(window,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Child'})).toBeNull());expect(screen.getByRole('dialog',{name:'Parent'})).toBeTruthy();await waitFor(()=>expect(document.activeElement).toBe(trigger));
 fireEvent.keyDown(window,{key:'Escape'});await waitFor(()=>expect(document.activeElement).toBe(screen.getByText('Launch')));
});
it('owns portaled menu focus, stacking and menu-first Escape without trapping focus back in the shell',async()=>{
 await launch();fireEvent.click(screen.getByRole('button',{name:'Utility'}));const action=await screen.findByText('Portal action');await waitFor(()=>expect(document.activeElement).toBe(action));
 expect(action.closest<HTMLElement>('.library-popover')?.style.zIndex).toBe('95');
 const commit=screen.getByText('Commit');commit.focus();fireEvent.keyDown(commit,{key:'Tab'});expect(document.activeElement).toBe(action);
 fireEvent.keyDown(action,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(commit);
 fireEvent.keyDown(window,{key:'Escape'});await waitFor(()=>expect(screen.queryByText('Portal action')).toBeNull());expect(screen.getByRole('dialog',{name:'Parent'})).toBeTruthy();
});
it('keeps pending guarded dialogs mounted and focused after close attempts',async()=>{
 await launch({blocked:true});fireEvent.click(screen.getByLabelText('Close modal'));fireEvent.keyDown(window,{key:'Escape'});
 expect(screen.getByRole('dialog',{name:'Parent'}).contains(document.activeElement)).toBe(true);expect(screen.getByLabelText('Value')).toBeTruthy();
});
it('does not steal focus from a caller handoff into a new dialog',async()=>{
 await launch({handoff:true});fireEvent.click(within(screen.getByRole('dialog',{name:'Parent'})).getByLabelText('Close modal'));
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByLabelText('New target')));expect(screen.queryByRole('dialog',{name:'Parent'})).toBeNull();
});

it('restores the owning utility trigger after an asynchronous menu-to-dialog handoff',async()=>{
 function Handoff(){const [open,setOpen]=useState(false);return <EscapeManagerProvider><LibraryPopover label="Source utility">{close=><button onClick={async()=>{setOpen(true);await Promise.resolve();close();}}>Open review</button>}</LibraryPopover><AppModal open={open} title="Review" onClose={()=>setOpen(false)}>Review body</AppModal></EscapeManagerProvider>;}
 render(<Handoff/>);fireEvent.click(screen.getByRole('button',{name:'Source utility'}));const action=await screen.findByText('Open review');await waitFor(()=>expect(document.activeElement).toBe(action));fireEvent.click(action);await screen.findByRole('dialog',{name:'Review'});
 fireEvent.keyDown(window,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Review'})).toBeNull());await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('button',{name:'Source utility'})));
});
