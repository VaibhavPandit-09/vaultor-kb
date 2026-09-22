import axios from 'axios';
import { reportError } from './diagnostics';
import type { Resource } from '../types';
const api = axios.create({ baseURL: '/api' });
api.interceptors.request.use(config => {
  config.headers['X-Request-ID'] = crypto.randomUUID();
  if (config.data && typeof config.data.content === 'string') config.data = { ...config.data, content: JSON.parse(config.data.content) };
  return config;
});
api.interceptors.response.use(response => response, error => {
  if (!axios.isCancel(error)) reportError(String(error.config?.method ?? 'request') + ' ' + String(error.config?.url ?? '').split('?')[0], new Error(error.response?.data?.detail || error.message), error.response?.headers?.['x-request-id']);
  return Promise.reject(error);
});
export async function listResources(): Promise<Resource[]> {
  const result: Resource[] = [];
  for (let page = 0; ; page++) {
    const { data } = await api.get('/resources', { params: { page, size: 200 } });
    result.push(...data.items);
    if (page + 1 >= data.totalPages) return result;
  }
}
export default api;
