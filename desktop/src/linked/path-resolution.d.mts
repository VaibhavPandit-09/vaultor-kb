export function markdownDestination(from:string,href:string,boundaryDepth?:number,nativeSource?:boolean):{relative:string;fragment:string}|undefined;
export function matchMarkdownPath(paths:string[],relative:string):string|undefined;
export function markdownPathMatcher(paths:string[]):(relative:string)=>string|undefined;
