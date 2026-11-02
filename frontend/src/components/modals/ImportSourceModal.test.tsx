import {EscapeManagerProvider} from '../../lib/escape/EscapeManagerProvider';
// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import ImportSourceModal from './ImportSourceModal';
afterEach(cleanup);
it('offers separate native browsing choices and classifies drops through one acquisition surface',()=>{
 const browse=vi.fn(),drop=vi.fn();render(<EscapeManagerProvider><ImportSourceModal pending={false} error="" onBrowse={browse} onDrop={drop} onClose={()=>{}}/></EscapeManagerProvider>);
 fireEvent.click(screen.getByRole('button',{name:'Browse files'}));fireEvent.click(screen.getByRole('button',{name:'Browse folder'}));expect(browse.mock.calls).toEqual([[false],[true]]);
 const file=new File(['# Note'],'note.md');fireEvent.drop(screen.getByText('Drop files or folders here, or browse.'),{dataTransfer:{files:[file],items:[]}});expect(drop).toHaveBeenCalledWith([file]);
});
it('keeps preparation non-reentrant and exposes actionable errors',()=>{
 const browse=vi.fn(),drop=vi.fn(),close=vi.fn();render(<EscapeManagerProvider><ImportSourceModal pending error="Source changed. Reselect." onBrowse={browse} onDrop={drop} onClose={close}/></EscapeManagerProvider>);
 expect(screen.getByRole('alert').textContent).toContain('Reselect');fireEvent.click(screen.getByRole('button',{name:'Browse files'}));fireEvent.click(screen.getByRole('button',{name:'Close modal'}));
 fireEvent.drop(screen.getByText('Drop files or folders here, or browse.'),{dataTransfer:{files:[new File(['x'],'x.md')],items:[]}});expect(browse).not.toHaveBeenCalled();expect(drop).not.toHaveBeenCalled();expect(close).not.toHaveBeenCalled();
});
