// @vitest-environment jsdom
import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import PreviewLayer from './PreviewLayer';
import PreviewShell from './PreviewShell';
import LibraryPopover from './LibraryPopover';
import { ESCAPE_PRIORITIES,useEscapeLayer } from '../lib/escape/escape';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import api from '../lib/api';
import { loadImage } from '../lib/noteImages';
import type { Resource } from '../types';
vi.mock('../lib/settings',()=>({useSettings:()=>({settings:{local:{uiTransparency:.65}}})}));
vi.mock('../lib/api',()=>({default:{get:vi.fn()}}));
vi.mock('../lib/platform',()=>({getPlatform:()=>({kind:'browser'})}));
vi.mock('../lib/noteImages',()=>({IMAGE_BYTES:20*1024*1024,loadImage:vi.fn()}));
vi.mock('./ResourceCollections',()=>({default:()=> <button>Membership</button>}));
vi.mock('./PinButton',()=>({default:()=> <button>Pin</button>}));
vi.mock('./ResourceActions',()=>({default:()=> <button>Actions</button>}));
const pdf={id:'pdf',type:'file',title:'Reading.pdf',mimeType:'application/pdf',size:1000} as Resource;
const base={resource:pdf,onCollection:vi.fn(),animationMode:'smooth' as const,overrideActive:false,open:true,onClose:vi.fn(),onToggleMode:vi.fn(),onOpenExternal:vi.fn(),onDownload:vi.fn()};
beforeEach(()=>{
 vi.mocked(api.get).mockResolvedValue({data:new Blob(['disposable'])});
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 URL.createObjectURL=vi.fn(()=> 'blob:preview');URL.revokeObjectURL=vi.fn();
});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
it('keeps the real PDF iframe and one blob request across rapid Side/Floating reversals',async()=>{
 const view=render(<PreviewLayer {...base} mode="side"/>,{wrapper:EscapeManagerProvider});
 const frame=await screen.findByTitle('PDF Preview'),shell=screen.getByRole('region');
 for(const mode of ['modal','side','modal','side'] as const)view.rerender(<PreviewLayer {...base} mode={mode}/>);
 expect(screen.getByTitle('PDF Preview')).toBe(frame);expect(screen.getByRole('region')).toBe(shell);
 expect(api.get).toHaveBeenCalledTimes(1);expect(URL.revokeObjectURL).not.toHaveBeenCalled();
 view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:preview');
});
it('retains image zoom, canvas scroll and managed-image ownership through both modes',async()=>{
 const release=vi.fn();vi.mocked(loadImage).mockResolvedValue({url:'blob:image',release});
 const image={...pdf,id:'image',title:'Zoom.png',mimeType:'image/png'};
 const view=render(<PreviewLayer {...base} resource={image} mode="side"/>,{wrapper:EscapeManagerProvider});
 const img=await screen.findByAltText('Zoom.png') as HTMLImageElement;Object.defineProperty(img,'naturalWidth',{value:1600});fireEvent.load(img);
 fireEvent.click(screen.getByRole('button',{name:'Actual size'}));fireEvent.click(screen.getByRole('button',{name:'+'}));
 const scroll=img.closest('.overflow-auto') as HTMLElement;scroll.scrollTop=120;
 view.rerender(<PreviewLayer {...base} resource={image} mode="modal"/>);expect(screen.getByAltText('Zoom.png')).toBe(img);expect(img.style.width).toBe('2000px');expect(scroll.scrollTop).toBe(120);
 view.rerender(<PreviewLayer {...base} resource={image} mode="side"/>);expect(loadImage).toHaveBeenCalledTimes(1);expect(release).not.toHaveBeenCalled();
 view.unmount();expect(release).toHaveBeenCalledOnce();
});
it('retains in-flight actions across mode changes and Escape calls the existing close owner',async()=>{
 let done!:()=>void;const open=vi.fn(()=>new Promise<void>(resolve=>{done=resolve;}));
 const view=render(<PreviewLayer {...base} onOpenExternal={open} mode="side"/>,{wrapper:EscapeManagerProvider});
 fireEvent.click(screen.getByRole('button',{name:'Open file in external application'}));
 view.rerender(<PreviewLayer {...base} onOpenExternal={open} mode="modal"/>);
 expect((screen.getByRole('button',{name:'Open file in external application'}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Open file in external application'}));expect(open).toHaveBeenCalledOnce();
 await act(async()=>done());await waitFor(()=>expect(screen.getByText('Opened in your application')).toBeTruthy());
 fireEvent.keyDown(document,{key:'Escape'});expect(base.onClose).toHaveBeenCalledOnce();
});
it('freezes a moving shell through click and an open menu, then resumes without replacing its child',async()=>{
 let id=0;const frames=new Map<number,FrameRequestCallback>();vi.stubGlobal('requestAnimationFrame',(f:FrameRequestCallback)=>{frames.set(++id,f);return id;});vi.stubGlobal('cancelAnimationFrame',(i:number)=>frames.delete(i));
 const flush=()=>{for(let i=0;i<2;i++){const values=[...frames.values()];frames.clear();values.forEach(f=>f(16));}};
 const props={transparency:.7,label:'Preview',onClose:vi.fn()};
 const content=<button aria-haspopup="dialog" aria-expanded="false">Mode</button>;
 const view=render(<PreviewShell {...props} mode="side">{content}</PreviewShell>),shell=screen.getByRole('region'),button=screen.getByRole('button');
 shell.getBoundingClientRect=()=>({left:500,top:34,width:400,height:500} as DOMRect);
 fireEvent.pointerDown(button);view.rerender(<PreviewShell {...props} mode="modal">{content}</PreviewShell>);
 expect(screen.getByRole('dialog')).toBe(shell);expect(shell.style.left).toBe('500px');
 button.setAttribute('aria-expanded','true');fireEvent.pointerUp(document);act(flush);expect(shell.style.left).toBe('500px');
 await act(async()=>button.setAttribute('aria-expanded','false'));act(flush);expect(shell.style.left).toBe('');expect(screen.getByRole('button')).toBe(button);
});

it('dismisses a preview-owned utility menu before the preview through centralized Escape',async()=>{
 const close=vi.fn();function Harness(){useEscapeLayer({active:true,priority:ESCAPE_PRIORITIES.preview,close,restoreFocusOnEscape:false});return <PreviewShell mode="modal" transparency={.7} label="Preview" onClose={close}><LibraryPopover label="Utility">{()=> <button>Menu action</button>}</LibraryPopover></PreviewShell>;}
 render(<Harness/>,{wrapper:EscapeManagerProvider});fireEvent.click(screen.getByRole('button',{name:'Utility'}));
 await screen.findByRole('button',{name:'Menu action'});fireEvent.keyDown(document,{key:'Escape'});
 expect(close).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Menu action'})).toBeNull();
 fireEvent.keyDown(document,{key:'Escape'});expect(close).toHaveBeenCalledOnce();
});
