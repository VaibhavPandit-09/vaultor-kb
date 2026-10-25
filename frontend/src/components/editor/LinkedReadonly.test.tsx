// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import LinkedReadonly from './LinkedReadonly';
import type {LinkedWorkspace} from '../../lib/linked/workspace';
import type {Opened} from '../../lib/linked/types';
import {readFileSync} from 'node:fs';
afterEach(cleanup);
function preview(source:string,reason='SPECIAL_FILE'){
  const request=vi.fn(),workspace={previewMounted:()=>()=>{},subscribe:()=>()=>{},getSnapshot:()=>0,previewStatus:new Map(),request} as unknown as LinkedWorkspace;
  const bytes=new TextEncoder().encode(source),opened:Opened={id:'source',source:'root',binding:'binding',name:'Guide.md',relative:'Guide.md',identity:'inode',revision:'revision',size:bytes.length,bytes,readonlyReason:reason};
  return {workspace,opened,request};
}
it.each(['SPECIAL_FILE','HARDLINKED_FILE','RECOVERY_VOLUME_UNAVAILABLE','DOCUMENT_SHAPE_LIMIT'])('renders read-only GFM independently of %s saving refusal',reason=>{
  const source='# Guide\r\n\r\nA **bold** paragraph.\r\n\r\n- Item\r\n\r\n| Key | Value |\r\n| --- | --- |\r\n| A | 42 |\r\n',f=preview(source,reason);
  const view=render(<LinkedReadonly {...f}/>);expect(view.getByRole('heading',{name:'Guide'})).toBeTruthy();expect(view.container.querySelector('strong')?.textContent).toBe('bold');expect(view.getByRole('listitem')).toBeTruthy();expect(view.getByRole('table')).toBeTruthy();expect(view.queryByRole('button',{name:'Save'})).toBeNull();
  fireEvent.click(view.getByRole('button',{name:'View source'}));expect(view.container.querySelector('pre')?.textContent).toBe(source);expect(view.queryByRole('heading')).toBeNull();fireEvent.click(view.getByRole('button',{name:'View formatted'}));expect(view.getByRole('heading',{name:'Guide'})).toBeTruthy();expect(f.request).not.toHaveBeenCalled();
});
it('does not execute HTML, load images or grant local-file navigation through the preview',()=>{
  const f=preview('# Safe\n\n<script>alert(1)</script>\n\n![Remote](https://example.test/private.png)\n\n[Local](../secret.md) [Unsafe](javascript:alert(1))');const view=render(<LinkedReadonly {...f}/>);expect(view.container.querySelector('script')).toBeNull();expect(view.container.querySelector('img')).toBeNull();expect(view.container.querySelector('a')).toBeNull();expect(view.getByText('Image: Remote')).toBeTruthy();expect(f.request).not.toHaveBeenCalled();
});
it('invalid UTF8 remains a source-only view rather than a misleading formatted conversion',()=>{
  const f=preview('');f.opened.bytes=new Uint8Array([255,65]);f.opened.size=2;const view=render(<LinkedReadonly {...f}/>);expect(view.queryByLabelText('Read-only Markdown preview')).toBeNull();expect(view.container.querySelector('pre')).toBeTruthy();expect(view.queryByRole('button',{name:'Save'})).toBeNull();
});
it('formats the actual CODEBASE corpus under read-only admission',()=>{
  const source=readFileSync('../docs/CODEBASE.md','utf8'),f=preview(source);const view=render(<LinkedReadonly {...f}/>);expect(view.getByRole('heading',{name:'Vaultor: living codebase and agent guide'})).toBeTruthy();expect(view.getAllByRole('table').length).toBeGreaterThan(0);expect(view.queryByText('Formatted preview is unavailable for this document. Its source remains intact.')).toBeNull();
});
it('over-budget formatted content fails safely into source with no write authority',()=>{
  const error=vi.spyOn(console,'error').mockImplementation(()=>{});try{const f=preview('# Heading\n\n'+'Paragraph\n\n'.repeat(1600));const view=render(<LinkedReadonly {...f}/>);expect(view.getByText('Formatted preview is unavailable for this document. Its source remains intact.')).toBeTruthy();expect(view.container.querySelector('pre')?.textContent).toBe(new TextDecoder().decode(f.opened.bytes));expect(f.request).not.toHaveBeenCalled();}finally{error.mockRestore();}
});
it('a stale large-source page cannot overwrite a freshly rebound read-only view',async()=>{
  let finish!:(value:Uint8Array)=>void;const workspace={previewMounted:()=>()=>{},subscribe:()=>()=>{},getSnapshot:()=>0,previewStatus:new Map(),request:async()=>new Promise<Uint8Array>(resolve=>{finish=resolve;})} as unknown as LinkedWorkspace;
  const old:Opened={id:'source',source:'root',binding:'old',name:'Large.md',relative:'Large.md',identity:'inode',revision:'old',size:300000,bytes:new Uint8Array(),readonlyReason:'LARGE_DOCUMENT'};
  const view=render(<LinkedReadonly workspace={workspace} opened={old}/>);await waitFor(()=>expect(finish).toBeTruthy());view.rerender(<LinkedReadonly workspace={workspace} opened={{...old,binding:'fresh',size:11,bytes:new TextEncoder().encode('Fresh source'),readonlyReason:'SPECIAL_FILE'}}/>);await view.findByText('Fresh source');await act(async()=>{finish(new TextEncoder().encode('Stale page'));});expect(view.queryByText('Stale page')).toBeNull();expect(view.getByText('Fresh source')).toBeTruthy();expect(view.queryByRole('button',{name:'Save'})).toBeNull();
});
