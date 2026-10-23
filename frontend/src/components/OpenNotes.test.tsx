// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import OpenNotes from './OpenNotes';
import type { Pane } from '../lib/paneNavigation';
import type { ReactNode } from 'react';
vi.mock('./LibraryPopover',()=>({default:({label,children}:{label:string;children:(close:()=>void)=>ReactNode})=><div aria-label={label}>{children(()=>{})}</div>}));
afterEach(cleanup);
const sessions:Pane[]=Array.from({length:7},(_,i)=>({paneId:'s'+i,id:'n'+i,cursor:0,history:[{visitId:'v'+i,resourceId:'n'+i,title:'Note '+i}]}));
it('identifies active and visible sessions and exposes keyboard accessible close/split actions',()=>{
 const onOpen=vi.fn(),onClose=vi.fn(),onSplit=vi.fn(),onCloseOthers=vi.fn();
 render(<OpenNotes sessions={sessions} panes={[sessions[2]]} activeId="s2" canSplit onOpen={onOpen} onClose={onClose} onSplit={onSplit} onCloseOthers={onCloseOthers}/>);
 expect(screen.getByTitle('Note 2').getAttribute('aria-current')).toBe('page');expect(screen.getByText('Pane 1')).toBeTruthy();
 fireEvent.click(screen.getByTitle('Note 1'));expect(onOpen).toHaveBeenCalledWith('n1');
 fireEvent.click(screen.getByLabelText('Close Note 1'));expect(onClose).toHaveBeenCalledWith('s1');
 fireEvent.click(screen.getAllByText('Open in another pane')[0]);expect(onSplit).toHaveBeenCalledWith('n0');
 fireEvent.click(screen.getAllByText('Close other notes')[0]);expect(onCloseOthers).toHaveBeenCalledWith('s0');
 fireEvent.click(screen.getByText('Close all notes'));expect(onCloseOthers).toHaveBeenLastCalledWith();
});
it('finds sessions without another scroll container and keeps a filter editable after closing notes',()=>{
 const props={panes:[],activeId:null,canSplit:true,onOpen:vi.fn(),onClose:vi.fn(),onSplit:vi.fn(),onCloseOthers:vi.fn()};
 const result=render(<OpenNotes {...props} sessions={sessions}/>);
 fireEvent.change(screen.getByLabelText('Find open note'),{target:{value:'Note 6'}});
 expect(screen.queryByTitle('Note 0')).toBeNull();expect(screen.getByTitle('Note 6')).toBeTruthy();
 result.rerender(<OpenNotes {...props} sessions={sessions.slice(0,2)}/>);
 expect(screen.getByLabelText('Find open note')).toBeTruthy();expect(screen.getByText('No matching open notes')).toBeTruthy();
});
