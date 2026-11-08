/** A server read may have started before our own Save acknowledgement. Never replay that older body over a live document. */
export function noteReconciliation(startedRevision:string|undefined,currentRevision:string|undefined,remoteRevision:string|undefined,draftBase:string|undefined,pending:boolean,saving:boolean){
 const advanced=startedRevision!==currentRevision;
 return {preserve:advanced||draftBase!==undefined||pending,conflict:!advanced&&!saving&&draftBase!==undefined&&draftBase!==remoteRevision};
}
