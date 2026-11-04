// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import { DesktopInteractionProvider, TagDropTarget, PaneDropTarget } from './DesktopInteraction';
import { INTERNAL_DRAG, dropIntent, useDesktopInteraction, type DragPayload } from '../lib/desktopInteraction';
vi.mock('../lib/resourceBatchCommands',()=>({boundedResources:vi.fn(),changeMembership:vi.fn(),pinResources:vi.fn(),reparentCollection:vi.fn()}));
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
it('internal editor drop opens the target pane and never reaches editor insertion handlers',async()=>{
 const pane=vi.fn(async()=>{}),insert=vi.fn();render(<Harness onPane={pane}/>);const editor=screen.getByText('Editor');editor.addEventListener('drop',insert);const data=transfer();fireEvent.dragStart(screen.getByText('Drag A'),{dataTransfer:data});fireEvent.drop(editor,{dataTransfer:data});await waitFor(()=>expect(pane).toHaveBeenCalledWith(resource,'pane'));expect(insert).not.toHaveBeenCalled();
});
it('external files enter import review and never use internal organization commands',()=>{
 const imports=vi.fn();render(<Harness onImport={imports}/>);const file=new File(['data'],'example.txt',{type:'text/plain'});fireEvent.drop(screen.getByText('Target tag'),{dataTransfer:{types:['Files'],files:[file],items:[]}});expect(imports).toHaveBeenCalledWith([file]);expect(changeMembership).not.toHaveBeenCalled();
});
