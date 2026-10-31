import { expect,it } from 'vitest';
import {outsidePlacementTarget} from '../src/practice/target-feedback';
import type {RelationPlan} from '../src/guide/relations';
import type {ObjectDetection} from '../src/guide/schema';
const step:RelationPlan['steps'][number]={id:'place',instruction:'Place',explanation:'Base rests on support',correction:'Return',objectId:'part',anchorId:'target',before:'separate',after:'supported_by',startMs:0,changeMs:500,endMs:1000};
const scene=(left:number):ObjectDetection[]=>[{objectId:'part',quality:'observed',score:.99,box:{left,top:.2,right:left+.1,bottom:.5}},{objectId:'target',quality:'observed',score:.99,box:{left:.4,top:.4,right:.7,bottom:.6}}];
it('warns about a clearly moved part outside its target, not an unchanged start',()=>{
 expect(outsidePlacementTarget(step,scene(.1),scene(.1))).toBe(false);
 expect(outsidePlacementTarget(step,scene(.1),scene(.8))).toBe(true);
 expect(outsidePlacementTarget(step,scene(.1),scene(.5))).toBe(false);
});
it('does not infer wrong placement from missing identity or a different kind of rule',()=>{
 const missing=scene(.8);missing[0].quality='ambiguous';
 expect(outsidePlacementTarget(step,scene(.1),missing)).toBe(false);
 expect(outsidePlacementTarget({...step,after:'open'},scene(.1),scene(.8))).toBe(false);
});
it('uses target-relative motion, so camera translation alone is not a wrong-placement warning',()=>{
 const moved=scene(.1).map(d=>({...d,box:{...d.box!,left:d.box!.left+.1,right:d.box!.right+.1}}));
 expect(outsidePlacementTarget(step,scene(.1),moved)).toBe(false);
});
