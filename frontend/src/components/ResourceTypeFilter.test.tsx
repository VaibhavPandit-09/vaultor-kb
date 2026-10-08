// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import ResourceTypeFilter from './ResourceTypeFilter';
import {resourceKind,resourceDescription} from '../lib/resourceKinds';
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('searches types, keeps restored unknown filters visible and restores keyboard focus on Escape',async()=>{
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 const change=vi.fn();
 render(<EscapeManagerProvider><ResourceTypeFilter collections value="future" onChange={change}/></EscapeManagerProvider>);
 const trigger=screen.getByRole('button',{name:'Filter resource type'});fireEvent.click(trigger);
 const input=screen.getByLabelText('Find a type');await waitFor(()=>expect(document.activeElement).toBe(input));
 expect(screen.getByRole('button',{name:'future'}).getAttribute('aria-pressed')).toBe('true');
 fireEvent.change(input,{target:{value:'col'}});expect(screen.queryByRole('button',{name:'Notes'})).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Collections'}));expect(change).toHaveBeenCalledWith('collection');expect(document.activeElement).toBe(trigger);
 fireEvent.click(trigger);fireEvent.keyDown(document,{key:'Escape'});await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(document.activeElement).toBe(trigger);
});
it('keeps resource type and file format distinct and never describes unknown types as files',()=>{
 expect(resourceDescription({type:'file',mimeType:'application/pdf',title:'x'})).toBe('PDF');
 expect(resourceDescription({type:'future',title:'x'})).toBe('future');
 expect(resourceKind('future').mode).toBe('unsupported');
});
