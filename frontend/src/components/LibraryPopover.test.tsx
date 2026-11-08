// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import LibraryPopover from './LibraryPopover';
vi.stubGlobal('ResizeObserver',class {observe(){} disconnect(){}});
afterEach(cleanup);
it('dismisses via Escape or outside click and restores its trigger on Escape',async()=>{
 render(<EscapeManagerProvider><button>Outside</button><LibraryPopover label="Options">{()=> <button>Inside</button>}</LibraryPopover></EscapeManagerProvider>);
 const trigger=screen.getByRole('button',{name:'Options'});fireEvent.click(trigger);await waitFor(()=>expect(document.activeElement).toBe(screen.getByText('Inside')));fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(screen.queryByText('Inside')).toBeNull();expect(document.activeElement).toBe(trigger);fireEvent.click(trigger);fireEvent.pointerDown(screen.getByText('Outside'));expect(screen.queryByText('Inside')).toBeNull();
});

it('row commands own context invocation over a background menu; keyboard/Escape restore the row',async()=>{render(<EscapeManagerProvider><section className="library-view"><LibraryPopover contextTarget=".library-view" label="Background">{()=> <button>New note</button>}</LibraryPopover><div className="library-row"><button>Resource row</button><LibraryPopover contextTarget=".library-row" label="Row commands">{()=> <><button>Open resource</button><button disabled>Unavailable</button><button>Copy resource</button></>}</LibraryPopover></div><div className="library-row"><button>No supported row actions</button></div></section></EscapeManagerProvider>);const row=screen.getByText('Resource row');fireEvent.keyDown(row,{key:'F10',shiftKey:true});await screen.findByRole('menu',{name:'Row commands'});expect(screen.queryByRole('menu',{name:'Background'})).toBeNull();fireEvent.keyDown(screen.getByText('Open resource'),{key:'End'});expect(document.activeElement).toBe(screen.getByText('Copy resource'));fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(document.activeElement).toBe(row);fireEvent.contextMenu(screen.getByText('No supported row actions'));expect(screen.queryByRole('menu')).toBeNull();});
