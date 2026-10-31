import { expect, it } from 'vitest';
import { MotionWindows } from '../src/practice/motion-windows';
const signature=(v:number)=>Array(768).fill(v) as number[];
function observe(c:MotionWindows, t:number, v:number) {
 return c.observe(signature(v), t, ()=>({frame:t,image:'local',width:640,height:480}));
}
it('keeps capturing a second action while the first request is pending',()=>{
 const c=new MotionWindows();
 observe(c,0,0); observe(c,100,10); observe(c,500,10);
 const first=observe(c,900,10)!;
 expect(first.frames.map(f=>f.frame)).toEqual([0,500,900]);
 observe(c,1100,20);observe(c,1500,20);
 const second=observe(c,1900,20)!;
 expect(second.frames.map(f=>f.frame)).toEqual([900,1500,1900]);
});
it('detects gradual motion without advancing the pre-action appearance',()=>{
 const c=new MotionWindows();observe(c,0,0);
 for(let i=1;i<=4;i++)observe(c,i*100,i);
 expect(c.moving).toBe(true);
 observe(c,800,4);
 expect(observe(c,1200,4)?.frames[0].frame).toBe(0);
});
it('ignores an unchanged view and resets after pause',()=>{
 const c=new MotionWindows();observe(c,0,10);
 for(let t=100;t<4000;t+=100)expect(observe(c,t,10)).toBeNull();
 c.reset();expect(observe(c,5000,50)).toBeNull();expect(c.moving).toBe(false);
});
it('rejects actions beyond the bounded evidence interval',()=>{
 const c=new MotionWindows();observe(c,0,0);observe(c,100,20);
 observe(c,8100,20);expect(()=>observe(c,8600,20)).toThrow('eight-second');
});
