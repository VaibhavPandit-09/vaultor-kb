import api from './api';
import { getConnection } from './platform';
export type ReviewStatus = 'open' | 'resolved' | 'dismissed';
export type ReviewItem = {
  id:string; resourceId:string; targetTitle:string; targetType:string; comment:string; quote:string; context:string;
  locator:{kind:'block'|'page'|'resource';path?:string;page?:number}|null;
  author:string;createdAt:string;updatedAt:string;status:ReviewStatus;revision:string;
  availability:'available'|'missing'|'trashed'|'deleting';attachment:'resource'|'attached'|'changed'|'unverified'|'unavailable';
};
export type ReviewPage = {items:ReviewItem[];page:number;size:number;totalItems:number;totalPages:number;counts:Record<ReviewStatus,number>;generation:string};
export type ReviewCreation = {id:string;epoch:number;body:{generation:string;resourceId:string;comment:string;baseRevision?:string}};
const event='vaultor:reviews-changed';
export function reviewsChanged(){window.dispatchEvent(new Event(event));}
export function subscribeReviews(listener:()=>void){window.addEventListener(event,listener);return()=>window.removeEventListener(event,listener);}
export async function fetchReviewPage(key:string,signal:AbortSignal) {
  const [epoch,resourceId,status,page,size=50]=JSON.parse(key) as [number,string|null,string,number,number?];
  return (await api.get<ReviewPage>('/reviews',{params:{resourceId,status,page,size},signal,connectionEpoch:epoch,backgroundDiagnostic:true})).data;
}
/** Keep this exact UUID/body for uncertain retries; a changed comment needs a new intent. */
export function reviewIntent(generation:string,resourceId:string,comment:string,baseRevision?:string):ReviewCreation {
  return {id:crypto.randomUUID(),epoch:getConnection().epoch,body:{generation,resourceId,comment,baseRevision}};
}
export async function sendReview(intent:ReviewCreation) {
  const result=(await api.put<ReviewItem>('/reviews/'+intent.id,intent.body,{connectionEpoch:intent.epoch})).data;
  reviewsChanged();return result;
}
export async function changeReview(item:ReviewItem,status:ReviewStatus,generation:string,epoch:number) {
  const result=(await api.patch<ReviewItem>('/reviews/'+item.id+'/status',{generation,status},{headers:{'If-Match':'"'+item.revision+'"'},connectionEpoch:epoch})).data;
  reviewsChanged();return result;
}
export function reviewError(error:unknown){return (error as {response?:{data?:{detail?:string}}})?.response?.data?.detail ?? (error instanceof Error?error.message:'Review action failed. Retry.');}
