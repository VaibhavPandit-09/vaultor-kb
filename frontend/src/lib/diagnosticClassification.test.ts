// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {browserLayoutNotification,reportBrowserError,reportError,getLocalDiagnostics} from './diagnostics';
it('rate limits only exact native delivery events and keeps thrown or unrelated errors visible',()=>{
 const listener=vi.fn();window.addEventListener('vaultor:error',listener);
 const message='ResizeObserver loop completed with undelivered notifications.';
 const native=new ErrorEvent('error',{message,filename:window.location.href,lineno:0,colno:0});expect(browserLayoutNotification(native)).toBe(true);
 const start=getLocalDiagnostics().length;for(let n=0;n<40;n++)reportBrowserError(native);
 expect(getLocalDiagnostics()).toHaveLength(start+1);expect(getLocalDiagnostics().at(-1)).toMatchObject({category:'layout',severity:'info',occurrences:40});expect(listener).not.toHaveBeenCalled();
 reportBrowserError(new ErrorEvent('error',{message,error:new Error(message),filename:'app.js',lineno:3}));expect(listener).toHaveBeenCalledTimes(1);expect(getLocalDiagnostics().at(-1)).toMatchObject({category:'application',severity:'error'});
 reportError('browser.rejection',new Error('ResizeObserver callback actually failed'));expect(listener).toHaveBeenCalledTimes(2);
 window.removeEventListener('vaultor:error',listener);
});
it('keeps genuine saves and recovery failures distinct from recoverable UI operations',()=>{
 expect(reportError('note.save',new Error('Offline'),undefined,true,{category:'save',severity:'error'})).toMatchObject({category:'save',severity:'error'});
 expect(reportError('recovery.storage',new Error('Disk failure'),undefined,false,{category:'recovery',severity:'critical'})).toMatchObject({category:'recovery',severity:'critical'});
 expect(reportError('get /resources',new Error('Offline'))).toMatchObject({category:'ui',severity:'warning'});
 expect(reportError('render.workspace',new Error('Crash'))).toMatchObject({severity:'critical'});
});
