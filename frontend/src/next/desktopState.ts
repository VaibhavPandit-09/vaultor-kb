import type {DesktopHistory} from './desktopNavigation';
import type {Criteria} from './searchState';
import {defaultCriteria} from './searchState';
export type Screen='resources'|'collections'|'tags'|'sources'|'settings';
export const commandDefinitions=[
 ['palette','Command palette','Ctrl+K'],['settings','Settings','Ctrl+,'],['search','Search Library','Ctrl+Shift+F'],
 ['library','Open Library','Ctrl+Shift+L'],['collections','Browse Collections',''],['tags','Browse Tags',''],['sources','Browse Linked Sources',''],
 ['pinned','Pinned resources',''],['recent','Recent resources',''],['trash','Open Trash',''],['new','Create note','Ctrl+N'],
 ['back','Navigate Back','Alt+ArrowLeft'],['forward','Navigate Forward','Alt+ArrowRight'],['split','Split active note','Ctrl+Shift+\\'],['closePane','Close active pane','Ctrl+W'],['help','Help','F1'],
] as const;
export type CommandId=typeof commandDefinitions[number][0];
export type Preferences={theme:'light'|'dark'|'oled'|'system';motion:'smooth'|'fast'|'reduced';accent:string;startup:'library'|'collections'|'tags'|'sources';restoreSession:boolean;sidebarOpen:boolean;autoCompanion:boolean;openBeside:boolean;focusEditor:boolean;shortcuts:Partial<Record<CommandId,string>>};
export const defaults:Preferences={theme:'system',motion:'smooth',accent:'blue',startup:'library',restoreSession:true,sidebarOpen:true,autoCompanion:true,openBeside:false,focusEditor:true,shortcuts:{}};
export const accents:Record<string,string>={blue:'#3b82f6',purple:'#8b5cf6',green:'#22c55e',orange:'#f97316',teal:'#14b8a6',pink:'#ec4899'};
export function binding(id:CommandId,p:Preferences){const configured=p.shortcuts[id];return configured!==undefined&&!protectedKeys.has(configured)&&(configured===''||configured.includes('Ctrl+')||configured.includes('Alt+')||/^F\d+$/.test(configured))?configured:commandDefinitions.find(c=>c[0]===id)![2];}
export function shortcut(event:Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'>){if(['Control','Meta','Alt','Shift'].includes(event.key))return '';const key=event.key.length===1?event.key.toUpperCase():event.key;return [event.ctrlKey||event.metaKey?'Ctrl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',key].filter(Boolean).join('+');}
const protectedKeys=new Set(['Ctrl+A','Ctrl+C','Ctrl+X','Ctrl+V','Ctrl+S','Ctrl+Z','Ctrl+Y','Ctrl+B','Ctrl+I','Ctrl+U','Ctrl+F','Ctrl+H','Ctrl+P','Ctrl+Shift+Z','Alt+F4']);
export function shortcutError(id:CommandId,key:string,p:Preferences){if(!key)return '';if(protectedKeys.has(key)||(!key.includes('Ctrl+')&&!key.includes('Alt+')&&!/^F\d+$/.test(key)))return 'This binding belongs to text editing, lists or Windows.';const other=commandDefinitions.find(c=>c[0]!==id&&binding(c[0],p)===key);return other?`Already used by ${other[1]}.`:'';}
export type StoredDocument={id:string;source?:string;path?:string};
export type BrowseState={screen:Screen;collection:string|null;criteria:Criteria};
export type BrowserMemory={query:string;expanded:string[];page:number};
export type WorkspaceSession={history?:DesktopHistory;remembered?:{id:string;title:string;source?:string;path?:string}[];browsers?:Partial<Record<Screen,BrowserMemory>>;version:1;documents:StoredDocument[];activePane:number;ratio:number;browse:BrowseState;sidebar:boolean;companion:string};
export function decodeSession(value:unknown):WorkspaceSession|undefined{
 if(!value||typeof value!=='object')return;const s=value as WorkspaceSession;
 if(s.version!==1||!Array.isArray(s.documents)||s.documents.length>2||s.documents.some(d=>typeof d.id!=='string'||d.id.length>200||d.source!==undefined&&(typeof d.source!=='string'||typeof d.path!=='string'||d.path.length>4096)))return;
 if(!s.browse||!['resources','collections','tags','sources','settings'].includes(s.browse.screen)||s.browse.collection!==null&&typeof s.browse.collection!=='string')return;
 const c=s.browse.criteria??defaultCriteria;
 const history=s.history&&Array.isArray(s.history.entries)&&s.history.entries.length<=32&&s.history.entries.every(r=>r&&((r.kind==='notes'&&Array.isArray(r.ids)&&r.ids.length<=2&&r.ids.every(id=>typeof id==='string'))||r.kind==='library'||r.kind==='browse'&&r.browse&&['resources','collections','tags','sources','settings'].includes(r.browse.screen)))?s.history:undefined;
 return {...s,history,remembered:Array.isArray(s.remembered)?s.remembered.slice(0,64).filter(r=>r&&typeof r.id==='string'&&typeof r.title==='string'&&(!r.source||typeof r.source==='string'&&typeof r.path==='string')):[],activePane:Math.max(0,Math.min(1,Number(s.activePane)||0)),ratio:Math.max(30,Math.min(70,Number(s.ratio)||50)),browse:{...s.browse,criteria:{query:typeof c.query==='string'?c.query.slice(0,256):'',content:c.content===true,order:['created','updated','title'].includes(c.order)?c.order:'created',view:['library','pinned','recent','trash'].includes(c.view??'')?c.view:'library',tag:typeof c.tag==='string'?c.tag:undefined,tagName:typeof c.tagName==='string'?c.tagName:undefined}}};
}
