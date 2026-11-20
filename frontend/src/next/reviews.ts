import type {ReviewSource} from '../components/ReviewInbox';
import {reviewsChanged,type ReviewPage} from '../lib/reviews';
import {command} from './client';

async function request(path:string, payload:Record<string,unknown>) {
  try {
    return await command<ReviewPage>({kind:'reviews',path,request:payload});
  } catch (error) {
    throw new Error(String(error));
  }
}

export const nextReviewSource:ReviewSource={
  fetch:(key, signal)=>{
    signal.throwIfAborted();
    const [path,resourceId,status,page,size=50]=JSON.parse(key);
    return request(path,{op:'list',resourceId,status:status==='all'?null:status,page,size});
  },
  async change(item,status,generation,scope){
    await request(String(scope),{op:'status',id:item.id,status,generation,revision:item.revision});
    reviewsChanged();
  },
};
