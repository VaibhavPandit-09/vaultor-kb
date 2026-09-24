// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
import LibraryPopover from './LibraryPopover';
afterEach(cleanup);
it('dismisses via Escape or outside click and restores its trigger on Escape',async()=>{
 render(<EscapeManagerProvider><button>Outside</button><LibraryPopover label="Options">{()=> <button>Inside</button>}</LibraryPopover></EscapeManagerProvider>);
 const trigger=screen.getByText('Options');fireEvent.click(trigger);await waitFor(()=>expect(document.activeElement).toBe(screen.getByText('Inside')));fireEvent.keyDown(document.activeElement!,{key:'Escape'});expect(screen.queryByText('Inside')).toBeNull();expect(document.activeElement).toBe(trigger);fireEvent.click(trigger);fireEvent.pointerDown(screen.getByText('Outside'));expect(screen.queryByText('Inside')).toBeNull();
});
