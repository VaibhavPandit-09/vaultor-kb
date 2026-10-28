import axios from 'axios';
import { reportError } from './diagnostics';
import { connectionAdapter, getConnection } from './platform';
import { ensureCompatible } from './connection';
import { rememberMutation } from './changeFeed';
declare module 'axios' { interface AxiosRequestConfig { backgroundDiagnostic?: boolean; connectionEpoch?:number; workspaceBusySince?:number; workspaceBusyReported?:boolean; onWorkspaceBusy?:()=>void } }
const api = axios.create({ baseURL: '/api', adapter: connectionAdapter });
api.interceptors.request.use(async config => {
  const epoch = getConnection().epoch;
  config.connectionEpoch??=epoch;
  if(config.connectionEpoch!==undefined&&config.connectionEpoch!==epoch)throw new axios.CanceledError('Source workspace changed');
  await ensureCompatible();
  if (epoch !== getConnection().epoch) throw new axios.CanceledError('Connection changed');
  config.headers['X-Request-ID'] = crypto.randomUUID();
  config.headers['X-Vaultor-Protocol'] = '3';
  if (!['get','head','options'].includes(config.method??'get')) rememberMutation(String(config.headers['X-Request-ID']));
  if (config.data && typeof config.data.content === 'string') config.data = { ...config.data, content: JSON.parse(config.data.content) };
  return config;
});
export const isWorkspaceBusy=(error:unknown)=>axios.isAxiosError(error)&&error.response?.status===409&&error.response?.data?.code==='WORKSPACE_BUSY';
api.interceptors.response.use(response => response, async error => {
  const config=error.config;
  // This exact code is emitted by admission before dispatch. It is safe to retry
  // the identical request, including a write; arbitrary conflicts are never retried.
  if(isWorkspaceBusy(error)&&config){
    config.workspaceBusySince??=Date.now();
    if(!config.workspaceBusyReported){config.workspaceBusyReported=true;reportError('workspace.wait '+String(config.method)+' '+String(config.url).split('?')[0],new Error(error.response.data.detail+' '+JSON.stringify({status:error.response.status,code:error.response.data.code,workspace:error.response.headers?.['x-vaultor-workspace']??getConnection().workspaceId,generation:config.headers?.get?.('X-Vaultor-Generation')??getConnection().generation,busy:error.response.data.busy})),error.response.data.requestId??error.response.headers?.['x-request-id'],false,{category:'ui',severity:'info'});}
    if(Date.now()-config.workspaceBusySince<30000){
      config.onWorkspaceBusy?.();
      await new Promise<void>((resolve,reject)=>{
        const signal=config.signal;const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(new axios.CanceledError('Workspace wait cancelled'));};
        const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},500);
        if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
      });
      if(config.connectionEpoch!==getConnection().epoch)throw new axios.CanceledError('Source workspace changed');
      return api.request(config);
    }
    reportError('workspace.busy.timeout',new Error('Workspace access has been blocked for 30 seconds. Retry or inspect the active maintenance operation.'),error.response.data.requestId,true);
    return Promise.reject(error);
  }
  if (!axios.isCancel(error)) reportError(String(error.config?.method ?? 'request') + ' ' + String(error.config?.url ?? '').split('?')[0], new Error(error.response?.data?.detail || error.message), error.response?.headers?.['x-request-id'] ?? error.config?.headers?.['X-Request-ID'], !error.config?.backgroundDiagnostic);
  return Promise.reject(error);
});
export default api;
