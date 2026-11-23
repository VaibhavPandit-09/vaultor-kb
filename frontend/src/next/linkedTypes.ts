import type {JSONContent} from '@tiptap/core';
export type LinkedSource={id:string;path:string;available?:boolean};
export type LinkedEntry={name:string;path:string;directory:boolean;blocked:boolean;id?:string|null};
export type LinkedPage={entries:LinkedEntry[];next:string|null;hidden:number};
export type LinkedInspection={current:{identity?:string;revision?:string;text?:string;reason?:string|null;error?:string};publication?:{status:string;stage:string;capture:string;originalHash:string;candidateHash:string;error?:string|null}|null};
export type LinkedDocument={id:string;documentId:string;sourceId:string;path:string;identity:string;revision:string;title:string;base:string;content:JSONContent;editable:boolean;reason:string|null;frontmatter:string;draft:{token:string;sequence:number;state?:string;error?:string|null}|null;current:LinkedInspection|null};
export type LinkedDraftSummary={id:string;path:string;sequence:number;status:string|null};
export type LinkedRequest=
 |{op:'archived';workspace:string;after?:string|null}|{op:'rebindDescriptor';workspace:string;id:string;path:string}|{op:'rebindDescriptors';workspace:string;ids:string[];path:string}
 |{op:'web';url:string}|{op:'sources'}|{op:'register';path:string}|{op:'remove';source:string}|{op:'directory';source:string;path:string;after?:string|null}|{op:'open';source:string;path:string}|{op:'follow';id:string;href:string}
 |{op:'identify';source:string;path:string}|{op:'openId'|'location'|'relationships'|'check'|'pdfInfo';id:string}|{op:'external';id:string;reveal:boolean}|{op:'asset';id:string;href:string}
 |{op:'protect';id:string;revision:string;base:string;content:JSONContent;token:string;sequence:number}|{op:'save';id:string;token:string;sequence:number}
 |{op:'drafts'}|{op:'recover'|'inspect'|'resolve';id:string}|{op:'discard';id:string;token:string;sequence:number};

export type LinkedRelationships={incoming:{id:string;title:string;occurrences:number}[];outgoing:{id:string|null;title:string|null;path:string;occurrences:number}[]};
