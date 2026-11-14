// These tests assert intended behavior and intentionally fail on audited v0.10.4.
// They are separate from npm test so the unchanged baseline stays identifiable.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cells,validateGame} from '../../src/model.js';
import {engage} from '../../src/actions.js';
import {executeBotCard} from '../../src/bots.js';
import {preview} from '../../src/engine.js';
import {decode,encode,MAX_CAMPAIGNS} from '../../src/storage.js';
import {attritionPosition,attritionIntent,attackPriorityPosition,marchPriorityPosition,
  trainPosition,multipleGroupsPosition,collectionWithHistory} from './cases.mjs';

test('F1a: human German-Troop attrition alternates participating Cells and Russians',()=>{
  const before=attritionPosition(true);
  const result=preview(before,attritionIntent);
  assert.deepEqual([cells(result.after.board.hel,'r'),result.after.board.hel.u],[1,1]);
});
test('F1b: bot German-Troop attrition uses the same alternating loss procedure',()=>{
  const g=attritionPosition(false);
  engage(g,[],{f:'r',id:'hel',defenders:['g'],attackCount:3,russians:2,bot:true,die:3});
  validateGame(g);
  assert.deepEqual([cells(g.board.hel,'r'),g.board.hel.u],[1,1]);
});
test('F2a: Limited #58 selects the Capability group before comparing destination Population',()=>{
  const g=attackPriorityPosition('s');
  assert.equal(executeBotCard(g,'s',58,1,[]).n,1);
  validateGame(g);
  assert.equal(g.board.tam.sA,1,'The Tampere Capability group should be selected.');
});
test('F2b: Limited #52 selects the Capability group before comparing Town and Province targets',()=>{
  const g=attackPriorityPosition('r');
  assert.equal(executeBotCard(g,'r',52,1,[]).n,1);
  validateGame(g);
  assert.equal(g.board.ham.rA,1,'The Häme Capability group should be selected.');
});
test('F2c: Limited #53 selects the German-threatened group before the Support group',()=>{
  const g=marchPriorityPosition();
  assert.equal(executeBotCard(g,'r',53,1,[]).n,1);
  validateGame(g);
  assert.equal(cells(g.board.ham,'r'),1,'Move three of the four Reds away from two German Troops.');
});
test('F3a: Senate bot Train Attack includes the Jaeger already at its destination',()=>{
  const g=trainPosition('s');
  assert.equal(executeBotCard(g,'s',58,1,[]).n,1);
  validateGame(g);
  assert.equal(cells(g.board.hel,'r'),0,'Strength 7 must hit on the seeded 5.');
});
test('F3b: Reds bot Train Attack includes a Cannon already at its destination',()=>{
  const g=trainPosition('r');
  assert.equal(executeBotCard(g,'r',52,1,[]).n,1);
  validateGame(g);
  assert.equal(cells(g.board.hel,'s'),2,'Strength 1 must hit on the seeded 1.');
});
test('F4: full #59 can send two separate groups from an eleven-Cell origin',()=>{
  const g=multipleGroupsPosition(), log=[];
  const result=executeBotCard(g,'s',59,99,log);
  assert.equal(result.special,'Prepare');
  validateGame(g);
  assert.equal(result.n,2,'Helsinki and Turku are separate eligible destinations.');
});
test('F5: an export made below the supported campaign limit can be imported again',()=>{
  const collection=collectionWithHistory(156);
  assert(collection.campaigns.length<MAX_CAMPAIGNS);
  const raw=encode(collection);
  assert.doesNotThrow(()=>decode(raw),'Export All must produce an importable backup.');
});
test('control: the same history in a single campaign still round-trips',()=>{
  const collection=collectionWithHistory(1);
  assert.deepEqual(decode(encode(collection)),collection);
});
