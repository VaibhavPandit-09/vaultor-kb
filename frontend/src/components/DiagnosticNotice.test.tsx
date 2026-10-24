// @vitest-environment jsdom
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import DiagnosticNotice from './DiagnosticNotice';
import type {DiagnosticEvent} from '../lib/diagnostics';
afterEach(cleanup);
const event={id:'event-id',message:'UI failure',severity:'error',category:'application'} as DiagnosticEvent;
it('offers save retry only for an actual outstanding save failure',()=>{
 const retry=vi.fn(),props={onDetails:vi.fn(),onRetrySaves:retry,onDismiss:vi.fn()};
 const view=render(<DiagnosticNotice {...props} event={event} saveFailed/>);expect(screen.queryByText('Retry saves')).toBeNull();expect(screen.queryByText(/event-id/)).toBeNull();
 view.rerender(<DiagnosticNotice {...props} event={{...event,category:'save'}} saveFailed/>);fireEvent.click(screen.getByText('Retry saves'));expect(retry).toHaveBeenCalledOnce();
 view.rerender(<DiagnosticNotice {...props} event={{...event,category:'save'}} saveFailed={false}/>);expect(screen.queryByRole('alert')).toBeNull();
 view.rerender(<DiagnosticNotice {...props} event={{...event,category:'layout',severity:'info'}} saveFailed/>);expect(screen.queryByRole('alert')).toBeNull();
});
