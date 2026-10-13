import { createContext } from 'react';
export type WorkspaceSummary = {id:string;name:string};
export const WorkspaceSelectionContext=createContext<{name:string;server:string;open():void}|null>(null);
export const workspaceId = (id:string) => /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id);
export function validateWorkspaceList(value:unknown):WorkspaceSummary[]{
  if(!Array.isArray(value)||value.length>8||value.some(v=>!v||!workspaceId(v.id)||typeof v.name!=='string'||!v.name||v.name.length>100)||new Set(value.map(v=>v.id)).size!==value.length)throw Error('Invalid workspace list.');
  return value;
}
