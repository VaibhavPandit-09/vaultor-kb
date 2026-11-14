import {normalizeSidebarSections,type SidebarSections} from '../lib/sidebarPreferences';
import type {Pane,ReadingPosition} from '../lib/paneNavigation';
import type {DesktopHistory} from './desktopNavigation';
import type {Criteria} from './searchState';
import {defaultCriteria} from './searchState';
export type Screen='resources'|'collections'|'tags'|'sources'|'pins'|'settings';
export const commandDefinitions=[
 ['palette','Command palette','Ctrl+K'],['settings','Settings','Ctrl+,'],['search','Search Library','Ctrl+Shift+F'],
 ['library','Open Library','Ctrl+Shift+L'],['collections','Browse Collections',''],['tags','Browse Tags',''],['sources','Browse Linked Sources',''],
 ['pinned','Pinned resources',''],['recent','Recent resources',''],['trash','Open Trash',''],['new','Create note','Ctrl+N'],
 ['workspace','Open local workspace',''],['assignTags','Assign tags to current resources',''],['pinResource','Pin current resources',''],['exportResource','Export current resources',''],
 ['back','Navigate Back','Ctrl+Alt+ArrowLeft'],['forward','Navigate Forward','Ctrl+Alt+ArrowRight'],['previousPane','Focus previous pane','Alt+ArrowLeft'],['nextPane','Focus next pane','Alt+ArrowRight'],['previousSession','Previous open note','Ctrl+Alt+PageUp'],['nextSession','Next open note','Ctrl+Alt+PageDown'],['split','Split active note','Ctrl+Shift+\\'],['closePane','Close active pane','Ctrl+W'],['help','Help','F1'],
] as const;
export type CommandId=typeof commandDefinitions[number][0];
export type Preferences={maxVisiblePanes:1|2;noteOpening:'fill'|'reuse';autosaveDelay:number;focusMode:boolean;previewMode:'side'|'floating';sidebarWidth:number;theme:'light'|'dark'|'oled'|'system';motion:'smooth'|'fast'|'reduced';accent:string;opacity:number;density:'comfortable'|'compact';sidebarMode:'fixed'|'floating';sidebarSections:SidebarSections;startup:'library'|'collections'|'tags'|'sources';restoreSession:boolean;sidebarOpen:boolean;autoCompanion:boolean;openBeside:boolean;focusEditor:boolean;shortcuts:Partial<Record<CommandId,string>>};
export const defaults:Preferences={maxVisiblePanes:2,noteOpening:'reuse',autosaveDelay:1000,focusMode:false,previewMode:'side',sidebarWidth:288,theme:'system',motion:'smooth',accent:'blue',opacity:.85,density:'comfortable',sidebarMode:'fixed',sidebarSections:normalizeSidebarSections(undefined),startup:'library',restoreSession:true,sidebarOpen:true,autoCompanion:true,openBeside:false,focusEditor:true,shortcuts:{}};
export const behaviorKeys=['maxVisiblePanes','noteOpening','autosaveDelay','focusMode'] as const;
export const accents:Record<string,string>={blue:'#3b82f6',purple:'#8b5cf6',green:'#22c55e',orange:'#f97316',red:'#ef4444',teal:'#14b8a6',pink:'#ec4899',cyan:'#06b6d4'};
export function binding(id:CommandId,p:Preferences){const configured=p.shortcuts[id];return configured!==undefined&&!protectedKeys.has(configured)&&(configured===''||configured.includes('Ctrl+')||configured.includes('Alt+')||/^F\d+$/.test(configured))?configured:commandDefinitions.find(c=>c[0]===id)![2];}
export function shortcut(event:Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'|'shiftKey'>&{code?:string}){if(['Control','Meta','Alt','Shift'].includes(event.key))return '';const key=event.code?.startsWith('Digit')?event.code.slice(5):event.key==='|'?'\\':event.key.length===1?event.key.toUpperCase():event.key;return [event.ctrlKey||event.metaKey?'Ctrl':'',event.altKey?'Alt':'',event.shiftKey?'Shift':'',key].filter(Boolean).join('+');}
const protectedKeys=new Set(['Ctrl+A','Ctrl+C','Ctrl+X','Ctrl+V','Ctrl+S','Ctrl+Z','Ctrl+Y','Ctrl+B','Ctrl+I','Ctrl+U','Ctrl+F','Ctrl+H','Ctrl+P','Ctrl+Shift+Z','Alt+F4','Ctrl+E','Ctrl+Shift+X','Ctrl+Shift+H','Ctrl+Alt+C','Ctrl+Alt+1','Ctrl+Alt+2','Ctrl+Alt+3','Ctrl+Alt+4','Ctrl+Alt+5','Ctrl+Alt+6','Ctrl+Shift+7','Ctrl+Shift+8','Ctrl+Shift+9','Ctrl+Enter','Ctrl+Backspace','Ctrl+Delete']);
export function shortcutError(id:CommandId,key:string,p:Preferences){if(!key)return '';if(protectedKeys.has(key)||(!key.includes('Ctrl+')&&!key.includes('Alt+')&&!/^F\d+$/.test(key)))return 'This binding belongs to text editing, lists or Windows.';const other=commandDefinitions.find(c=>c[0]!==id&&binding(c[0],p)===key);return other?`Already used by ${other[1]}.`:'';}
export type StoredDocument={id:string;source?:string;path?:string};
export type BrowseState={screen:Screen;collection:string|null;criteria:Criteria};
export type BrowserMemory={hierarchy?:boolean;query:string;expanded:string[];page:number};
export type JourneyReceipt={sessions:Pane[];panes:Pane[];activePaneId:string|null;positions:Record<string,ReadingPosition>};
export type WorkspaceSession={companionScroll?:Record<string,number>;journeys?:JourneyReceipt;history?:DesktopHistory;remembered?:{id:string;title:string;source?:string;path?:string}[];browsers?:Partial<Record<Screen,BrowserMemory>>;version:1;documents:StoredDocument[];activePane:number;ratio:number;browse:BrowseState;sidebar:boolean;companion:string};
export function decodeSession(value:unknown):WorkspaceSession|undefined{
 if(!value||typeof value!=='object')return;const s=value as WorkspaceSession;
 if(s.version!==1||!Array.isArray(s.documents)||s.documents.length>2||s.documents.some(d=>typeof d.id!=='string'||d.id.length>200||d.source!==undefined&&(typeof d.source!=='string'||typeof d.path!=='string'||d.path.length>4096)))return;
 if(!s.browse||!['resources','collections','tags','sources','pins','settings'].includes(s.browse.screen)||s.browse.collection!==null&&typeof s.browse.collection!=='string')return;
 const c=s.browse.criteria??defaultCriteria;
 const history=s.history&&Array.isArray(s.history.entries)&&s.history.entries.length<=32&&s.history.entries.every(r=>r&&((r.kind==='notes'&&Array.isArray(r.ids)&&r.ids.length<=2&&r.ids.every(id=>typeof id==='string'))||r.kind==='library'||r.kind==='browse'&&r.browse&&['resources','collections','tags','sources','pins','settings'].includes(r.browse.screen)))?s.history:undefined;
 return {...s,history:history?{...history,entries:history.entries.map(r=>r.kind==='browse'&&r.browse.screen==='settings'?{kind:'library' as const}:r)}:undefined,remembered:Array.isArray(s.remembered)?s.remembered.slice(0,64).filter(r=>r&&typeof r.id==='string'&&typeof r.title==='string'&&(!r.source||typeof r.source==='string'&&typeof r.path==='string')):[],activePane:Math.max(0,Math.min(1,Number(s.activePane)||0)),ratio:Math.max(30,Math.min(70,Number(s.ratio)||50)),browse:{...s.browse,screen:s.browse.screen==='settings'?'resources':s.browse.screen,criteria:{kind:['note','file','image','pdf','audio','video','text','other'].includes(c.kind??'')?c.kind:undefined,query:typeof c.query==='string'?c.query.slice(0,256):'',content:c.content===true,order:['created','updated','title'].includes(c.order)?c.order:'created',view:['library','pinned','recent','trash'].includes(c.view??'')?c.view:'library',tag:typeof c.tag==='string'?c.tag:undefined,tagName:typeof c.tagName==='string'?c.tagName:undefined}}};
}
