import { expect, it } from 'vitest';
import { RequestSlots } from './requestSlots';
import axios from 'axios';

it('bounds bursts, preserves queued order and releases each slot exactly once',async()=>{
 const slots=new RequestSlots(2),signal=new AbortController().signal;
 let active=0,peak=0;const started:number[]=[];
 await Promise.all(Array.from({length:40},async(_,index)=>{
   const release=await slots.acquire(signal);active++;peak=Math.max(peak,active);started.push(index);
   await new Promise(resolve=>setTimeout(resolve,1));active--;release();release();
 }));
 expect(peak).toBe(2);expect(started).toEqual(Array.from({length:40},(_,i)=>i));
});
it('cancels departed-connection requests before dispatch without consuming the next slot',async()=>{
 const slots=new RequestSlots(1),first=await slots.acquire(new AbortController().signal);
 const old=new AbortController();const cancelled=slots.acquire(old.signal).catch(error=>error);
 let ran=false;const next=slots.acquire(new AbortController().signal).then(release=>{ran=true;release();});
 old.abort();expect(axios.isCancel(await cancelled)).toBe(true);expect(ran).toBe(false);first();await next;expect(ran).toBe(true);
 const already=new AbortController();already.abort();await expect(slots.acquire(already.signal)).rejects.toMatchObject({code:'ERR_CANCELED'});
});
