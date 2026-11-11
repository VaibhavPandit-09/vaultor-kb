// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import NextHelp from './NextHelp';
import {nextHelpTopics} from './helpModel';
import {defaults} from './desktopState';
import {EscapeManagerProvider} from '../lib/escape/EscapeManagerProvider';
const clipboard=vi.hoisted(()=>vi.fn().mockResolvedValue(''));
vi.mock('./media',()=>({native:clipboard}));
vi.mock('./linked',()=>({linkedCommand:vi.fn().mockResolvedValue({})}));
afterEach(cleanup);
it('derives bounded topics from the authoritative experimental article',()=>{expect(nextHelpTopics('# Next\nOverview\n## Search\nSaved content\n## Linked sources\nExternal files').map(t=>[t.id,t.content])).toEqual([['next-foundation','# Next\nOverview\n'],['search','# Search\nSaved content\n'],['linked-sources','# Linked sources\nExternal files']]);});
it('uses original searchable Help, live bindings and Rust clipboard without mounting an editor',async()=>{render(<EscapeManagerProvider><NextHelp preferences={{...defaults,shortcuts:{settings:'Ctrl+Shift+Q'}}} close={()=>{}}/></EscapeManagerProvider>);expect(screen.getByRole('dialog')).toBeTruthy();expect(screen.queryByText('Review ecosystem')).toBeNull();fireEvent.change(screen.getByLabelText('Search Help'),{target:{value:'Ctrl+Shift+Q'}});fireEvent.click(screen.getByRole('button',{name:/Current keyboard shortcuts/}));expect(await screen.findByText('Ctrl+Shift+Q')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Copy article'}));await waitFor(()=>expect(clipboard).toHaveBeenCalledWith('clipboardWrite',null,expect.stringContaining('# Current keyboard shortcuts')));expect(document.querySelector('.tiptap')).toBeNull();});
