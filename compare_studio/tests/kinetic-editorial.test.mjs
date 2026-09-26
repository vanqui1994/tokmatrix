import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKineticHtml, kineticRole } from '../tools/kinetic-editorial.mjs';
import { renderKineticTemplatePreview } from '../tools/preview-template.mjs';
const fixture = () => ({slug:'safe-demo',cfg:{lang:'vi',topicTitle:'A < B'},meta:{},totalDuration:8,timedBeats:[
  {start:0.5,duration:3,line:'First <script>bad()</script>',punchline:'A & B'},
  {start:4,duration:3,line:'Second',punchline:'End',voSrc:'assets/vo/beat-2.mp3'}
]});
test('six narrative roles include the perspective shift and preserve explicit direction',()=>{
 assert.deepEqual(Array.from({length:6},(_,i)=>kineticRole({},i,6)),['hook','explain','tension','shift','action','resolve']);
 assert.equal(kineticRole({role:'tension'},1,6),'tension');
});
test('content is escaped and measured audio timings survive the redesign',()=>{
 const input=fixture(),before=JSON.stringify(input),html=generateKineticHtml(input);
 assert.equal(JSON.stringify(input),before);
 assert.ok(html.includes('A &lt; B'));
 assert.ok(html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
 assert.ok(html.includes('src="assets/vo/beat-2.mp3" data-start="4" data-duration="3"'));
 assert.ok(!html.includes('tl.call('));
 assert.ok(!html.includes('>100%<'));
});
test('invalid timelines fail rather than silently render overlapping or truncated beats',()=>{
 for(const patch of [{start:-1},{duration:0},{duration:9}]){
  const x=fixture();Object.assign(x.timedBeats[0],patch);assert.throws(()=>generateKineticHtml(x),/timing/);
 }
 const x=fixture();x.timedBeats[1].start=0;assert.throws(()=>generateKineticHtml(x),/timing/);
});
test('all language previews contain no nonexistent audio and retain the timeline contract',()=>{
 for(const lang of ['vi','en','de','fr','ja','ko']){
  const {html,root,timing}=renderKineticTemplatePreview(lang);
  assert.ok(!html.includes('<audio'));
  assert.equal(timing.length,6);assert.equal(root,50);
  assert.ok(html.includes('data-template="kinetic-editorial-v2"'));
  assert.ok(html.includes('data:font/woff2;base64,'));
 }
});
