export const SOURCE_PAGE_STEP=65528;
/** Read-only overlapping windows avoid splitting a multibyte character out of
 * both neighboring pages. No bytes are modified or returned as Save input. */
export function sourceWindow(bytes:Uint8Array,offset:number){let start=0;if(offset>0)while(start<Math.min(bytes.length,4)&&(bytes[start]&0xc0)===0x80)start++;return new TextDecoder().decode(bytes.subarray(start),{stream:true});}
