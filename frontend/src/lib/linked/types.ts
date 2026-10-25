import type {JSONContent} from '@tiptap/core';
export type Source={id:string;name:string;status:string;enabled:boolean};
export type Entry={id:string;root:string;name:string;relative:string;identity:string;directory:boolean;markdown:boolean;unsupported:boolean;size:number;parent:string|null};
export type Opened={id:string;source:string;binding:string;name:string;relative:string;identity:string;revision:string;bytes:Uint8Array;size:number;readonlyReason:string};
export type Protected={version:number;protected:boolean;validated:boolean;reason?:string};
export type Receipt={state:string;version:number;operation?:string;identity?:string;revision?:string;reason?:string};
export type SourceDraft={block:number;text:string;expected:JSONContent};
export type LinkedRequest=<T>(operation:string,payload?:Record<string,unknown>)=>Promise<T>;
