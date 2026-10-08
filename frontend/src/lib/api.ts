import axios from 'axios';
import { reportError } from './diagnostics';
import { connectionAdapter, getConnection } from './platform';
import { ensureCompatible } from './connection';
import { rememberMutation } from './changeFeed';
declare module 'axios' { interface AxiosRequestConfig { backgroundDiagnostic?: boolean } }
const api = axios.create({ baseURL: '/api', adapter: connectionAdapter });
api.interceptors.request.use(async config => {
  const epoch = getConnection().epoch;
  await ensureCompatible();
  if (epoch !== getConnection().epoch) throw new axios.CanceledError('Connection changed');
  config.headers['X-Request-ID'] = crypto.randomUUID();
  config.headers['X-Vaultor-Protocol'] = '3';
  if (!['get','head','options'].includes(config.method??'get')) rememberMutation(String(config.headers['X-Request-ID']));
  if (config.data && typeof config.data.content === 'string') config.data = { ...config.data, content: JSON.parse(config.data.content) };
  return config;
});
api.interceptors.response.use(response => response, error => {
  if (!axios.isCancel(error)) reportError(String(error.config?.method ?? 'request') + ' ' + String(error.config?.url ?? '').split('?')[0], new Error(error.response?.data?.detail || error.message), error.response?.headers?.['x-request-id'] ?? error.config?.headers?.['X-Request-ID'], !error.config?.backgroundDiagnostic);
  return Promise.reject(error);
});
export default api;
