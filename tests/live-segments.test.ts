import {beforeEach,expect,it,vi} from 'vitest';
import type OpenAI from 'openai';
import {segmentNamedPart} from '../src/server/guide/live-segments';
const state=vi.hoisted(()=>({score:.95,count:1}));
vi.mock('server-only',()=>({}));
vi.mock('../src/server/guide/crop',()=>({conceptCrop:async()=>({left:100,top:40,width:200,height:160,image:'data:image/jpeg;base64,AA=='}),originalBox:(b:{left:number;top:number;right:number;bottom:number},o:{left:number;top:number})=>({left:b.left+o.left,top:b.top+o.top,right:b.right+o.left,bottom:b.bottom+o.top})}));
vi.mock('@meta-sam/parser',()=>({
 parseImageStream:()=>({async *[Symbol.asyncIterator](){yield {records:[]};},finalResult:Promise.resolve({outcome:{status:'completed'},diagnostics:[],records:[]})}),
 recordsOfKind:(_:unknown,kind:string)=>Array.from({length:state.count},(_,i)=>kind==='box'?{objectId:String(i),left:20,top:20,right:60,bottom:80,confidence:state.score}:{objectId:String(i),confidence:state.score,mask:{width:2,height:2},bounds:{left:20,top:20,right:60,bottom:80}}),
 decodeMaskToRaster:()=>new Uint8Array([1,1,0,1]),
}));
const client={post:vi.fn(async()=>({}))} as unknown as OpenAI;
const run=()=>segmentNamedPart(client,'image',{width:640,height:480},{id:'part',concept:'distinct part',box:{left:.18,top:.1,right:.3,bottom:.3}},new AbortController().signal);
beforeEach(()=>{state.score=.95;state.count=1;vi.clearAllMocks();});
it('projects masks and boxes from native crop back to full-frame coordinates',async()=>{
 const r=await run();expect(r.detection.quality).toBe('observed');expect(r.detection.box).toEqual({left:120/640,top:60/480,right:160/640,bottom:120/480});expect(r.foreground?.bounds).toEqual(r.detection.box);expect(r.foreground?.bits).toBe('0A==');
});
it('abstains when two matching masks compete',async()=>{state.count=2;const r=await run();expect(r.detection.quality).toBe('ambiguous');expect(r.foreground).toBeNull();});
it('keeps the evidence threshold and makes no retry for weak segmentation',async()=>{state.score=.89;const r=await run();expect(r.detection.quality).toBe('missing');expect(client.post).toHaveBeenCalledTimes(1);});
