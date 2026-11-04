// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { EscapeManagerProvider } from '../lib/escape/EscapeManagerProvider';
import LibraryPopover from './LibraryPopover';
vi.stubGlobal('ResizeObserver', class { observe(){} disconnect(){} });
afterEach(cleanup);
it('right-click and Shift+F10 share actions without activating the resource; keys restore the source', async()=>{
 const open=vi.fn(), action=vi.fn();
 render(<EscapeManagerProvider><div className="library-row"><button onClick={open}>Target</button><LibraryPopover contextTarget=".library-row" label="Actions">{close=><><button disabled>Unavailable</button><button onClick={()=>{action();close();}}>Rename</button><button>Pin</button></>}</LibraryPopover></div></EscapeManagerProvider>);
 const source=screen.getByText('Target');
 fireEvent.contextMenu(source,{clientX:1000,clientY:700});
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Rename'})));
 expect(open).not.toHaveBeenCalled();
 fireEvent.keyDown(document.activeElement!,{key:'ArrowDown'});expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Pin'}));
 fireEvent.keyDown(document.activeElement!,{key:'Home'});expect(document.activeElement).toBe(screen.getByRole('menuitem',{name:'Rename'}));
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('menu')).toBeNull();expect(document.activeElement).toBe(source);
 fireEvent.keyDown(source,{key:'F10',shiftKey:true});await screen.findByRole('menu');
 fireEvent.click(screen.getByRole('menuitem',{name:'Rename'}));expect(action).toHaveBeenCalledOnce();expect(document.activeElement).toBe(source);
});
it('keeps text editing context separate and nested rows choose only their own actions',async()=>{
 render(<EscapeManagerProvider><div className="row"><LibraryPopover contextTarget=".row" label="Parent">{()=> <button>Parent action</button>}</LibraryPopover><div className="row"><input aria-label="Text"/><button>Child</button><LibraryPopover contextTarget=".row" label="Child actions">{()=> <button>Child action</button>}</LibraryPopover></div></div></EscapeManagerProvider>);
 fireEvent.contextMenu(screen.getByRole('textbox'));expect(screen.queryByRole('menu')).toBeNull();
 fireEvent.contextMenu(screen.getByText('Child'));await screen.findByRole('menu');expect(screen.queryByText('Parent action')).toBeNull();expect(screen.getByText('Child action')).toBeTruthy();
});

it('context-only markers stay hidden even when their button class has a display rule',()=>{
 const view=render(<EscapeManagerProvider><span data-tag-target><style>{'.library-button { display:inline-flex }'}</style><button>Tag</button><LibraryPopover contextOnly contextTarget="[data-tag-target]" label="Tag actions">{()=> <button>Delete tag</button>}</LibraryPopover></span></EscapeManagerProvider>);
 const marker=view.container.querySelector<HTMLButtonElement>('button[hidden]');expect(getComputedStyle(marker!).display).toBe('none');fireEvent.contextMenu(screen.getByText('Tag'));expect(screen.getByRole('menu')).toBeTruthy();
});
