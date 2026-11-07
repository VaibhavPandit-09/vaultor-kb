import type {Resource} from '../types';
export type ResourceClipboardData={resources:Resource[];mode:'copy'|'cut'|'links';collection?:string;receipt:string;generation:string};
export type PreparedExportCopy={receipt:string;filename:string;expires:number;canOpen:boolean};
export type NativeActivityTask={id:string;title:string;kind:string;state:'running'|'paused'|'attention'|'complete';phase:string;done?:number;total?:number;unit?:string};
export type ResourceClipboardService={copy:(ids:string[],mode:'copy'|'cut'|'links',collection?:string)=>Promise<number>;read:()=>Promise<ResourceClipboardData|null>;consume:(receipt:string)=>Promise<void>};
