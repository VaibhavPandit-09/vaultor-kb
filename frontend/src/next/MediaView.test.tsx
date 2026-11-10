// @vitest-environment jsdom
import {act,fireEvent,render,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import NextEditor from './NextEditor';
import {SharedNoteDocuments} from '../lib/sharedNoteDocuments';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
vi.mock('@tauri-apps/api/core',()=>({invoke:vi.fn(async()=>new Uint8Array([137,80,78,71]).buffer)}));
it('releases an offscreen image URL while retaining its decoded aspect ratio',async()=>{
 let callback!:IntersectionObserverCallback;vi.stubGlobal('IntersectionObserver',class{constructor(fn:IntersectionObserverCallback){callback=fn;}observe(){}disconnect(){}});
 const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=vi.fn(()=> 'blob:m9-fixture');URL.revokeObjectURL=vi.fn();
 const mounted=render(<EscapeManagerProvider><NextEditor note={{id:'media',title:'Media',revision:1,content:{type:'doc',content:[{type:'image',attrs:{resourceId:'image',alt:'Fixture',width:60}}]}}} documents={new SharedNoteDocuments()} changed={()=>{}} locked={false} pane={0}/></EscapeManagerProvider>);
 try{await waitFor(()=>expect(callback).toBeDefined());act(()=>callback([{isIntersecting:true}]as IntersectionObserverEntry[],{}as IntersectionObserver));await waitFor(()=>expect(mounted.queryByAltText('Fixture')).toBeTruthy());const image=mounted.getByAltText('Fixture');Object.defineProperties(image,{naturalWidth:{value:512},naturalHeight:{value:256}});fireEvent.load(image);expect(mounted.container.querySelector<HTMLElement>('.managed-image-frame')?.style.aspectRatio).toBe('2 / 1');act(()=>callback([{isIntersecting:false}]as IntersectionObserverEntry[],{}as IntersectionObserver));expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:m9-fixture');expect(mounted.container.querySelector<HTMLElement>('.managed-image-frame')?.style.aspectRatio).toBe('2 / 1');}finally{mounted.unmount();URL.createObjectURL=create;URL.revokeObjectURL=revoke;vi.unstubAllGlobals();}
});
