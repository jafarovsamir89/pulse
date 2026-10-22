import test from 'node:test';
import assert from 'node:assert/strict';
import { matchGroups } from './matchmaker.mjs';
const u=(id,gender='woman',mode='open',extra={})=>({id,age:25,status:'active',language:'ru',topic:'talk',slot:'21:00',mode,gender,joinedAt:Number(id.replace(/\D/g,''))||0,...extra});

test('no rooms for fewer than four participants; no fake members',()=>{
  const result=matchGroups([u('u1'),u('u2'),u('u3')]);
  assert.equal(result.rooms.length,0); assert.deepEqual(result.waiting,['u1','u2','u3']);
});
test('open room supports different genders and hides nothing behind a fake balance',()=>{
  const result=matchGroups([u('u1','nonbinary'),u('u2','man'),u('u3','woman'),u('u4','unknown')]);
  assert.equal(result.rooms.length,1); assert.equal(result.rooms[0].members.length,4);
});
test('balanced 2+2 uses only opt-in and correct split',()=>{
  const result=matchGroups([u('u1','man','balanced'),u('u2','man','balanced'),u('u3','woman','balanced'),u('u4','woman','balanced')]);
  assert.equal(result.rooms.length,1);
  assert.equal(result.rooms[0].members.length,4);
  assert.equal(result.waiting.length,0);
});
test('balanced shortage must wait and NEVER silently move to open',()=>{
  const result=matchGroups([u('u1','man','balanced'),u('u2','man','balanced'),u('u3','man','balanced'),u('u4','woman','balanced')]);
  assert.equal(result.rooms.length,0); assert.equal(result.waiting.length,4);
});
test('balanced 3+3 yields a six-person room',()=>{
  const result=matchGroups([u('u1','man','balanced'),u('u2','man','balanced'),u('u3','man','balanced'),u('u4','woman','balanced'),u('u5','woman','balanced'),u('u6','woman','balanced')]);
  assert.equal(result.rooms.length,1); assert.equal(result.rooms[0].members.length,6);
});
test('minors/suspended users excluded',()=>{
  const result=matchGroups([u('u1'),u('u2'),u('u3'),u('u4','woman','open',{age:16}),u('u5','woman','open',{status:'suspended'})]);
  assert.equal(result.rooms.length,0); assert.deepEqual(result.waiting,['u1','u2','u3']);
});
test('do not mix incompatible topics, languages and time slots',()=>{
  const result=matchGroups([u('u1'),u('u2'),u('u3'),u('u4','man','open',{language:'az'}),u('u5','man','open',{topic:'games'}),u('u6','man','open',{slot:'22:00'})]);
  assert.equal(result.rooms.length,0);
});
test('duplicate identity never occupies two slots',()=>{
  const result=matchGroups([u('u1'),u('u2'),u('u3'),u('u4'),u('u1','man','open',{topic:'games'})]);
  assert.equal(result.rooms.length,1);
  assert.deepEqual(result.rooms[0].members,['u1','u2','u3','u4']);
});
test('seven in pool: serve six and honestly waitlist one',()=>{
  const result=matchGroups([1,2,3,4,5,6,7].map(i=>u(`u${i}`)));
  assert.equal(result.rooms.length,1);assert.equal(result.rooms[0].members.length,6);assert.equal(result.waiting.length,1);
});

test('eight open participants are seated in two valid 4-person rooms',()=>{
  const r=matchGroups(Array.from({length:8},(_,i)=>u(`u${i+1}`)));
  assert.deepEqual(r.rooms.map(v=>v.members.length).sort(),[4,4]);assert.equal(r.waiting.length,0);
});
test('thirteen open participants all seated without invalid partial room',()=>{
  const r=matchGroups(Array.from({length:13},(_,i)=>u(`u${i+1}`)));
  assert.equal(r.waiting.length,0);assert.equal(r.rooms.flatMap(x=>x.members).length,13);
  assert.ok(r.rooms.every(x=>x.members.length>=4 && x.members.length<=6));
});
test('four balanced pairs produce two 2+2 rooms, not one 3+3 plus leftovers',()=>{
  const r=matchGroups([
    ...Array.from({length:4},(_,i)=>u(`u${i+1}`,'man','balanced')),
    ...Array.from({length:4},(_,i)=>u(`u${i+5}`,'woman','balanced'))
  ]);
  assert.equal(r.waiting.length,0);assert.deepEqual(r.rooms.map(x=>x.members.length).sort(),[4,4]);
});
