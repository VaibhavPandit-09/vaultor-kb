import type {JSONContent} from '@tiptap/core';
export type ReferenceOccurrence={path:string;kind:'image'|'note-link'|'file-link'|'resource-link';label:string};
export type ReferenceEntry={id:string;title:string;type:string;mimeType?:string;available:boolean;trashed:boolean;revision?:string;noteLinks:number;fileLinks:number;images:number;otherLinks:number;occurrences:ReferenceOccurrence[]};
export type ReferencePage={items:ReferenceEntry[];page:number;size:number;totalItems:number;totalPages:number;totalOccurrences:number;sourceRevision:string};
export type LocalReference={id:string;title:string;content:JSONContent};
export function localReferences(notes:LocalReference[],targetId:string){return notes.filter(note=>{let found=false;function visit(node:JSONContent){if(['image','resourceLink'].includes(node.type??'')&&node.attrs?.resourceId===targetId)found=true;node.content?.forEach(visit);}visit(note.content);return found;});}
