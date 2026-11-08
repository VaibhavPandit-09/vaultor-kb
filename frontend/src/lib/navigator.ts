export const navigatorViews=['sessions','shortcuts','collections','tags','sources'] as const;
export type NavigatorView=typeof navigatorViews[number];
export type NavigatorState={view:NavigatorView|'auto';quickTags:string[];recentTags:string[];scroll:Partial<Record<NavigatorView,number>>};
export const defaultNavigator:NavigatorState={view:'auto',quickTags:[],recentTags:[],scroll:{}};
export function normalizeNavigator(input:unknown):NavigatorState{
 const value=input&&typeof input==='object'?input as Partial<NavigatorState>:{};
 const ids=(items:unknown,max:number)=>Array.isArray(items)?[...new Set(items.filter((id):id is string=>typeof id==='string'&&id.length>0&&id.length<=200))].slice(0,max):[];
 return {view:navigatorViews.includes(value.view as NavigatorView)?value.view as NavigatorView:'auto',quickTags:ids(value.quickTags,8),recentTags:ids(value.recentTags,8),scroll:Object.fromEntries(navigatorViews.flatMap(view=>Number.isFinite(value.scroll?.[view])?[[view,Math.max(0,Math.min(1e7,value.scroll![view]!))]]:[]))};
}
export function navigatorContext(state:NavigatorState,editing:boolean,selected:number,destination?:string):NavigatorView{return state.view!=='auto'?state.view:selected>0?'collections':destination==='collections'?'collections':destination==='tags'?'tags':destination==='sources'?'sources':editing?'sessions':'shortcuts';}
export function rememberNavigatorTag(state:NavigatorState,id:string):NavigatorState{return {...state,recentTags:[id,...state.recentTags.filter(item=>item!==id)].slice(0,8)};}
