// @vitest-environment jsdom
import OpenNotes from './OpenNotes';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import { DesktopInteractionProvider, SidebarOpenNotesShortcut, TagDropTarget, PaneDropTarget } from './DesktopInteraction';
import { INTERNAL_DRAG, dropIntent, revealNote, useDragItems, useDesktopInteraction, useDropTarget, type DragPayload } from '../lib/desktopInteraction';
vi.mock('../lib/resourceBatchCommands',()=>({boundedResources:vi.fn(),changeMembership:vi.fn(),pinResources:vi.fn(),reparentCollection:vi.fn(),requireCommandScope:vi.fn()}));
vi.mock('../lib/resourceActions',()=>({requestResourceAction:vi.fn()}));
import { changeMembership } from '../lib/resourceBatchCommands';
import type { Resource } from '../types';
const resource={id:'a',title:'A',type:'note',tags:[],createdAt:'',updatedAt:''} as Resource;
afterEach(()=>{cleanup();vi.clearAllMocks();});
const transfer=()=>{const values=new Map<string,string>();return {types:[INTERNAL_DRAG],effectAllowed:'none',dropEffect:'none',setDragImage:vi.fn(),setData:(key:string,value:string)=>values.set(key,value),getData:(key:string)=>values.get(key)??'',values};};
function Source(){const drag=useDesktopInteraction();return <button draggable onDragStart={event=>drag?.start(event,{kind:'resources',resources:[resource]})}>Drag A</button>;}
function Harness({source='one',onPane=vi.fn(),onImport=vi.fn()}:{source?:string;onPane?:(resource:Resource,pane:string)=>Promise<void>;onImport?:(files:File[])=>void}){return <EscapeManagerProvider><DesktopInteractionProvider generation="generation" sourceKey={source} onPane={onPane} onImport={onImport}><Source/><TagDropTarget tagId="tag" name="Topic">Target tag</TagDropTarget><PaneDropTarget paneId="pane"><div contentEditable suppressContentEditableWarning>Editor</div></PaneDropTarget></DesktopInteractionProvider></EscapeManagerProvider>;}
it('collection drops add membership; cycles, trash resources and multi-resource pane drops are invalid',()=>{
 const payload={kind:'resources',resources:[resource],ticket:'ticket',scope:{epoch:0},sourceKey:'one'} as Extract<DragPayload,{kind:'resources'}>;
 expect(dropIntent(payload,{kind:'collection',collection:{id:'c',name:'C',count:0}})).toContain('Add resource');
 expect(dropIntent({...payload,resources:[resource,{...resource,id:'b'}]},{kind:'pane',paneId:'p'})).toBeNull();
 expect(dropIntent({...payload,resources:[{...resource,trashedAt:'today'}]},{kind:'trash'})).toBeNull();
 expect(dropIntent({kind:'collection',collection:{id:'a',name:'A',count:0},ticket:'t',scope:{epoch:0},sourceKey:'s'},{kind:'collection',collection:{id:'child',name:'Child',count:0,ancestors:[{id:'a',name:'A'}]}})).toBeNull();
});
it('drag data holds only an opaque ticket; valid target invokes the scoped membership command once',async()=>{
 render(<Harness/>);const data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});expect([...data.values.keys()]).toEqual([INTERNAL_DRAG]);expect(data.getData(INTERNAL_DRAG)).not.toContain('A');
 fireEvent.dragOver(screen.getByText('Target tag'),{dataTransfer:data,clientY:100});expect(screen.getByText('Target tag').getAttribute('data-drop-state')).toBe('valid');
 fireEvent.drop(screen.getByText('Target tag'),{dataTransfer:data});await waitFor(()=>expect(changeMembership).toHaveBeenCalledWith(['a'],'tag','tag','add',expect.objectContaining({generation:'generation'})));
 fireEvent.drop(screen.getByText('Target tag'),{dataTransfer:data});expect(changeMembership).toHaveBeenCalledTimes(1);
});
it('Escape, source changes and forged tickets cannot execute a drop',async()=>{
 const view=render(<Harness/>);let data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});fireEvent.keyDown(window,{key:'Escape'});fireEvent.drop(screen.getByText('Target tag'),{dataTransfer:data});expect(changeMembership).not.toHaveBeenCalled();
 data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});view.rerender(<Harness source="two"/>);fireEvent.drop(screen.getByText('Target tag'),{dataTransfer:data});expect(changeMembership).not.toHaveBeenCalled();
 data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});data.setData(INTERNAL_DRAG,'forged');fireEvent.drop(screen.getByText('Target tag'),{dataTransfer:data});expect(changeMembership).not.toHaveBeenCalled();
});
it('pane chrome opens a resource while leaving native editor insertion handlers alone',async()=>{
 const pane=vi.fn(async()=>{}),insert=vi.fn();render(<Harness onPane={pane}/>);const editor=screen.getByText('Editor').parentElement!;editor.addEventListener('drop',insert);const data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});fireEvent.drop(editor,{dataTransfer:data});await waitFor(()=>expect(pane).toHaveBeenCalledWith(resource,'pane'));
});
it('external files enter import review and never use internal organization commands',()=>{
 const imports=vi.fn();render(<Harness onImport={imports}/>);const file=new File(['data'],'example.txt',{type:'text/plain'});fireEvent.drop(screen.getByText('Target tag'),{dataTransfer:{types:['Files'],files:[file],items:[]}});expect(imports).toHaveBeenCalledWith([file],undefined);expect(changeMembership).not.toHaveBeenCalled();
});

function CollectionTarget(){const drop=useDropTarget({kind:'collection',collection:{id:'collection-id',name:'Destination',count:0}});return <div {...drop}>Collection destination</div>;}
function TagSource(){const drag=useDesktopInteraction();return <button draggable onDragStart={event=>drag?.start(event,{kind:'tag',id:'topic',name:'Topic'})}>Drag topic</button>;}
it('external collection drops preserve the explicit destination for review',()=>{
 const imports=vi.fn();render(<EscapeManagerProvider><DesktopInteractionProvider sourceKey="one" onPane={vi.fn()} onImport={imports}><CollectionTarget/></DesktopInteractionProvider></EscapeManagerProvider>);const file=new File(['data'],'example.pdf'),data={types:['Files'],files:[file],items:[]};fireEvent.dragOver(screen.getByText('Collection destination'),{dataTransfer:data});expect(screen.getByText('Collection destination').getAttribute('data-drop-state')).toBe('valid');fireEvent.drop(screen.getByText('Collection destination'),{dataTransfer:data});expect(imports).toHaveBeenCalledWith([file],expect.objectContaining({id:'collection-id'}));expect(changeMembership).not.toHaveBeenCalled();
});
it('tag sources apply to the target resource through the shared scoped membership command',async()=>{
 render(<EscapeManagerProvider><DesktopInteractionProvider sourceKey="one" onPane={vi.fn()} onImport={vi.fn()}><TagSource/><PaneDropTarget paneId="p" resource={resource}>Resource target</PaneDropTarget></DesktopInteractionProvider></EscapeManagerProvider>);const data=transfer();fireEvent.dragStart(screen.getByText('Drag topic'),{dataTransfer:data});fireEvent.drop(screen.getByText('Resource target'),{dataTransfer:data});await waitFor(()=>expect(changeMembership).toHaveBeenCalledWith(['a'],'tag','topic','add',expect.anything()));
});
it('the editor capture path inserts a link and prevents duplicate native insertion; source change discards pending resolution',async()=>{
 const {Editor}=await import('@tiptap/core'),{default:StarterKit}=await import('@tiptap/starter-kit'),{ResourceLinkExtension}=await import('./editor/ResourceLinkExtension'),{registerEditorDrop}=await import('../lib/editorDrop');
 const editor=new Editor({element:document.createElement('div'),extensions:[StarterKit,ResourceLinkExtension.extend({addNodeView(){return null;}})],content:'<p>abc</p>'});await new Promise(resolve=>setTimeout(resolve,0));vi.spyOn(editor.view,'posAtCoords').mockReturnValue({pos:2,inside:0});vi.spyOn(editor.view,'coordsAtPos').mockReturnValue({left:0,right:0,top:0,bottom:0});const unregister=registerEditorDrop({editor,managed:true,resource});const pane=vi.fn(),native=vi.fn();
 let resolve!:(resources:Resource[])=>void;const resolveResources=vi.fn(()=>new Promise<Resource[]>(done=>{resolve=done;}));
 const view=(source:string)=><EscapeManagerProvider><DesktopInteractionProvider sourceKey={source} onPane={pane} onImport={vi.fn()} onResolveResources={resolveResources}><Source/><div data-testid="host"/></DesktopInteractionProvider></EscapeManagerProvider>;
 const result=render(view('one'));screen.getByTestId('host').append(editor.view.dom);editor.view.dom.addEventListener('drop',native);
 try{let data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});fireEvent.drop(editor.view.dom,{dataTransfer:data});expect(native).not.toHaveBeenCalled();resolve([resource]);await waitFor(()=>expect(editor.getJSON().content![0].content!.some(node=>node.type==='resourceLink')).toBe(true));expect(pane).not.toHaveBeenCalled();editor.commands.undo();expect(editor.getText()).toBe('abc');
 data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});fireEvent.drop(editor.view.dom,{dataTransfer:data});result.rerender(view('two'));resolve([resource]);await waitFor(()=>expect(resolveResources).toHaveBeenCalledTimes(2));await new Promise(resolve=>setTimeout(resolve,0));expect(editor.getText()).toBe('abc');
 }finally{unregister();editor.destroy();}
});

it('external editor drop reviews one file at the pointer, refuses multiple files/read-only, and leaves native image dragging alone',async()=>{
 const {Editor}=await import('@tiptap/core'),{default:StarterKit}=await import('@tiptap/starter-kit'),{registerEditorDrop}=await import('../lib/editorDrop');
 const editor=new Editor({element:document.createElement('div'),extensions:[StarterKit],content:'<p>abc</p>'});await new Promise(resolve=>setTimeout(resolve,0));vi.spyOn(editor.view,'posAtCoords').mockReturnValue({pos:2,inside:0});const importFile=vi.fn(),unregister=registerEditorDrop({editor,managed:true,resource,importFile}),native=vi.fn();
 render(<EscapeManagerProvider><DesktopInteractionProvider sourceKey="one" onPane={vi.fn()} onImport={vi.fn()}><div data-testid="external-host"/></DesktopInteractionProvider></EscapeManagerProvider>);screen.getByTestId('external-host').append(editor.view.dom);editor.view.dom.addEventListener('drop',native);
 try{const file=new File(['data'],'source.pdf',{type:'application/pdf'}),data={types:['Files'],files:[file],items:[],getData:()=>''};fireEvent.drop(editor.view.dom,{dataTransfer:data});expect(importFile).toHaveBeenCalledWith(editor,2,[file]);expect(native).not.toHaveBeenCalled();expect(editor.getText()).toBe('abc');importFile.mockClear();fireEvent.drop(editor.view.dom,{dataTransfer:{...data,files:[file,file]}});expect(importFile).not.toHaveBeenCalled();editor.setEditable(false);fireEvent.drop(editor.view.dom,{dataTransfer:data});expect(importFile).not.toHaveBeenCalled();editor.setEditable(true);fireEvent.drop(editor.view.dom,{dataTransfer:{...data,files:[new File(['image'],'source.png',{type:'image/png'})]}});expect(native).toHaveBeenCalledOnce();expect(importFile).not.toHaveBeenCalled();}finally{unregister();editor.destroy();}
});

it('dismisses routine drag success after three seconds, preserves errors, and cancels stale dismissal timers',async()=>{
 vi.useFakeTimers();
 try{render(<Harness/>);let data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});await act(async()=>{fireEvent.drop(screen.getByText('Target tag'),{dataTransfer:data});});expect(screen.getByRole('status').textContent).toContain('Done.');expect(screen.getByRole('status').getAttribute('data-motion-surface')).toBe('notice');await act(async()=>vi.advanceTimersByTime(2999));expect(screen.getByRole('status')).toBeTruthy();await act(async()=>vi.advanceTimersByTime(1));expect(screen.queryByRole('status')).toBeNull();
 data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});await act(async()=>{fireEvent.drop(screen.getByText('Target tag'),{dataTransfer:data});});vi.mocked(changeMembership).mockRejectedValueOnce(new Error('Needs attention'));data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});await act(async()=>{fireEvent.drop(screen.getByText('Target tag'),{dataTransfer:data});});await act(async()=>vi.advanceTimersByTime(10000));expect(screen.getByRole('alert').textContent).toContain('Needs attention');fireEvent.click(screen.getByLabelText('Dismiss organization status'));expect(screen.queryByRole('alert')).toBeNull();
 }finally{vi.useRealTimers();}
});

const openSessions=[{paneId:'sa',id:'a',history:[{visitId:'va',resourceId:'a',title:'A'}],cursor:0},{paneId:'sb',id:'b',history:[{visitId:'vb',resourceId:'b',title:'B'}],cursor:0}];
function OpenNoteHarness({reveal=vi.fn(),arrange=vi.fn(),reorder=vi.fn(),source='one',visible=true}:{reveal?:(id:string)=>unknown;arrange?:(id:string,target?:string,edge?:'before'|'after'|'swap')=>unknown;reorder?:(id:string,before:string|null)=>void;source?:string;visible?:boolean}){return <EscapeManagerProvider><DesktopInteractionProvider sourceKey={source} generation="generation" onRevealResource={async(resource,valid)=>{if(valid())await reveal(resource.id);}} onPane={vi.fn()} onImport={vi.fn()} onArrangeSession={async(...args)=>{await arrange(...args);}} onReorderSession={reorder}><Source/><OpenNotes resources={{a:{...resource,content:'Never serialize this body'},b:{...resource,id:'b',title:'B',type:'note'}}} sessions={openSessions} panes={visible?openSessions:[]} activeId="sa" canSplit onOpen={vi.fn()} onSplit={vi.fn()} onClose={vi.fn()} onCloseOthers={vi.fn()}/><CollectionTarget/><TagDropTarget tagId="tag" name="Topic">Target tag</TagDropTarget><PaneDropTarget paneId="sb">Pane target</PaneDropTarget></DesktopInteractionProvider></EscapeManagerProvider>;}
function overAt(element:HTMLElement,data:ReturnType<typeof transfer>,x:number,y:number){const event=new MouseEvent('dragover',{bubbles:true,cancelable:true,clientX:x,clientY:y});Object.defineProperty(event,'dataTransfer',{value:data});fireEvent(element,event);}
it('resource titles share scoped organization while explicit grips reorder or arrange sessions',async()=>{
 const arrange=vi.fn(async()=>{}),reorder=vi.fn();render(<OpenNoteHarness arrange={arrange} reorder={reorder}/>);let data=transfer();fireEvent.dragStart(screen.getByTitle('A'),{dataTransfer:data});expect(data.effectAllowed).toBe('copy');expect([...data.values.keys()]).toEqual([INTERNAL_DRAG]);fireEvent.drop(screen.getByText('Collection destination'),{dataTransfer:data});await waitFor(()=>expect(changeMembership).toHaveBeenCalledWith(['a'],'collection','collection-id','add',expect.objectContaining({generation:'generation'})));
 data=transfer();fireEvent.dragStart(screen.getByLabelText('Arrange A'),{dataTransfer:data});fireEvent.drop(screen.getByTitle('B'),{dataTransfer:data});await waitFor(()=>expect(reorder).toHaveBeenCalledWith('sa','sb'));
 data=transfer();fireEvent.dragStart(screen.getByLabelText('Arrange A'),{dataTransfer:data});fireEvent.drop(screen.getByText('Pane target'),{dataTransfer:data});await waitFor(()=>expect(arrange).toHaveBeenCalledWith('sa','sb','swap'));
 const payload={kind:'resources',resources:[resource],ticket:'t',scope:{epoch:0},sourceKey:'one'} as Extract<DragPayload,{kind:'resources'}>;for(const target of [{kind:'tag',id:'tag',name:'Topic'},{kind:'pinned'},{kind:'trash'}] as const)expect(dropIntent(payload,target)).not.toBeNull();
});
it('hover reveal requires a stationary pause, survives nested dragleave, fires once, and re-arms after Escape',async()=>{
 vi.useFakeTimers();try{const reveal=vi.fn(async()=>{});render(<OpenNoteHarness reveal={reveal}/>);let data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});const row=screen.getByTitle('B').parentElement!;overAt(row,data,20,20);await act(async()=>vi.advanceTimersByTime(700));overAt(row,data,40,20);await act(async()=>vi.advanceTimersByTime(300));expect(reveal).not.toHaveBeenCalled();fireEvent(row,new MouseEvent('dragleave',{bubbles:true,relatedTarget:screen.getByTitle('B')}));await act(async()=>vi.advanceTimersByTime(600));expect(reveal).toHaveBeenCalledOnce();expect(reveal).toHaveBeenCalledWith('b');overAt(row,data,40,20);await act(async()=>vi.advanceTimersByTime(1500));expect(reveal).toHaveBeenCalledOnce();fireEvent.keyDown(window,{key:'Escape'});expect(row.hasAttribute('data-drag-reveal')).toBe(false);
 data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});overAt(row,data,20,20);await act(async()=>vi.advanceTimersByTime(900));expect(reveal).toHaveBeenCalledTimes(2);
 }finally{vi.useRealTimers();}
});
it('passing and cancellation do not reveal; inactive managed rows use the same reveal callback',async()=>{
 vi.useFakeTimers();try{const reveal=vi.fn(),arrange=vi.fn(),view=render(<OpenNoteHarness reveal={reveal} arrange={arrange}/>);let data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});overAt(screen.getByTitle('B').parentElement!,data,20,20);await act(async()=>vi.advanceTimersByTime(400));fireEvent.dragLeave(screen.getByTitle('B').parentElement!);await act(async()=>vi.advanceTimersByTime(1000));expect(reveal).not.toHaveBeenCalled();data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});overAt(screen.getByTitle('B').parentElement!,data,20,20);fireEvent.keyDown(window,{key:'Escape'});await act(async()=>vi.advanceTimersByTime(1000));expect(reveal).not.toHaveBeenCalled();view.rerender(<OpenNoteHarness reveal={reveal} arrange={arrange} visible={false}/>);data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});overAt(screen.getByTitle('B').parentElement!,data,20,20);await act(async()=>vi.advanceTimersByTime(1200));expect(reveal).toHaveBeenCalledWith('b');expect(arrange).not.toHaveBeenCalled();}finally{vi.useRealTimers();}
});

function SnapshotRows({ids}:{ids:string[]}){const items=useDragItems(ids);return <div data-testid="frozen-order">{items.join(',')}</div>;}
it('loaded resource order stays stable during reveal-driven recency refresh, then resumes chronology',()=>{
 const view=(ids:string[])=><EscapeManagerProvider><DesktopInteractionProvider sourceKey="one" onPane={vi.fn()} onImport={vi.fn()}><Source/><SnapshotRows ids={ids}/></DesktopInteractionProvider></EscapeManagerProvider>;const result=render(view(['a','b','c'])),data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});result.rerender(view(['b','c','a']));expect(screen.getByTestId('frozen-order').textContent).toBe('a,b,c');fireEvent.keyDown(window,{key:'Escape'});expect(screen.getByTestId('frozen-order').textContent).toBe('b,c,a');
});
it('unsupported and linked resource rows do not advertise managed editor reveal',()=>{
 const payload={kind:'resources',resources:[resource],ticket:'t',scope:{epoch:0},sourceKey:'one'} as DragPayload;for(const type of ['linked','file','future'])expect(revealNote(payload,{kind:'resource',resource:{...resource,type}})).toBeUndefined();expect(revealNote(payload,{kind:'resource',resource:{...resource,trashedAt:'today'}})).toBeUndefined();expect(revealNote(payload,{kind:'resource',resource})).toBe(resource);
});

it('a tag applies to an Open Notes resource destination without invoking note reveal',async()=>{
 const reveal=vi.fn();render(<EscapeManagerProvider><DesktopInteractionProvider sourceKey="one" onPane={vi.fn()} onImport={vi.fn()} onRevealResource={reveal}><TagSource/><OpenNotes resources={{a:resource}} sessions={[openSessions[0]]} panes={[openSessions[0]]} activeId="sa" canSplit onOpen={vi.fn()} onSplit={vi.fn()} onClose={vi.fn()} onCloseOthers={vi.fn()}/></DesktopInteractionProvider></EscapeManagerProvider>);const data=transfer();fireEvent.dragStart(screen.getByText('Drag topic'),{dataTransfer:data});fireEvent.drop(screen.getByTitle('A'),{dataTransfer:data});await waitFor(()=>expect(changeMembership).toHaveBeenCalledWith(['a'],'tag','topic','add',expect.anything()));expect(reveal).not.toHaveBeenCalled();
});

it('opening the first note during a drag does not insert sidebar rows above its source until completion',()=>{
 const view=(sessions:typeof openSessions)=><EscapeManagerProvider><DesktopInteractionProvider sourceKey="one" onPane={vi.fn()} onImport={vi.fn()}><Source/><SidebarOpenNotesShortcut count={sessions.length} onOpen={vi.fn()}>Open notes navigation</SidebarOpenNotesShortcut><OpenNotes resources={{a:resource}} sessions={sessions} panes={sessions} activeId={null} canSplit onOpen={vi.fn()} onSplit={vi.fn()} onClose={vi.fn()} onCloseOthers={vi.fn()}/><p>Recent source position</p></DesktopInteractionProvider></EscapeManagerProvider>;const result=render(view([])),data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});result.rerender(view([openSessions[0]]));expect(screen.queryByText('Open notes navigation')).toBeNull();expect(screen.queryByTitle('A')).toBeNull();fireEvent.keyDown(window,{key:'Escape'});expect(screen.getByText('Open notes navigation')).toBeTruthy();expect(screen.getByTitle('A')).toBeTruthy();
});
