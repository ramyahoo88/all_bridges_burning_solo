// Regression cases first reproduced in v0.10.2. The release test script runs all twelve.
import test from 'node:test';
import assert from 'node:assert/strict';
import {position} from '../../test/fixtures.mjs';
import {preview} from '../../src/engine.js';
import {travel} from '../../src/actions.js';
import {executeBotCard} from '../../src/bots.js';
import {botMessage} from '../../src/bot-operations.js';
import {clone, control, validateGame} from '../../src/model.js';
import {roll} from '../../src/random.js';
import {distance, SPACE_IDS} from '../../src/data.js';
import {decode, encodeCampaign, newCampaign} from '../../src/storage.js';
import {editorHtml} from '../../src/ui-board.js';

function rngFor(die) {
  for(let rng=0;rng<1000;rng++) if(roll({rng},[])===die) return rng;
  throw Error('No seed found');
}
function germanPosition() {
  const g=position({phase:2,current:26});
  g.stage='german';g.german='before';g.tracks.gOut=3;
  return g;
}

test('F1: German attackers do not suffer Cell-only attrition',()=>{
  const g=germanPosition();g.board.hel.g=3;g.board.hel.rI=3;g.rng=rngFor(3);
  validateGame(g);
  const p=preview(g,{type:'german'});
  assert.equal(p.after.board.hel.rI,0);
  assert.equal(p.after.tracks.rPow,1);
  assert.equal(p.after.board.hel.g,3,'Removing three Reds Cells must not remove a German Troop');
});

test('F2a: Germany advances toward a Russian-only enemy',()=>{
  const g=germanPosition();g.board.kar.g=3;g.board.hel.u=1;g.rng=2;
  validateGame(g);
  const p=preview(g,{type:'german'}), destination=SPACE_IDS.find(id=>p.after.board[id].g);
  assert(distance(destination,'hel')<distance('kar','hel'),
    `Karelia -> ${destination} moves away from the only enemy`);
});

test('F2b: Germany takes no March when no enemy remains',()=>{
  const g=germanPosition();g.board.kar.g=3;
  const p=preview(g,{type:'german'});
  assert.equal(p.after.board.kar.g,3);
});

test('F2c: Germany gets closer when Reds are more than two spaces away',()=>{
  const g=germanPosition();g.board.tur.g=3;g.board.vaa.rI=1;g.rng=0;
  const p=preview(g,{type:'german'}), destination=SPACE_IDS.find(id=>p.after.board[id].g);
  assert(distance(destination,'vaa')<distance('tur','vaa'),
    `Turku -> ${destination} does not approach Vaasa`);
});

test('F3a: Senate March can use a smaller group to preserve Town Control',()=>{
  const g=position({phase:2});g.board.hel.sI=8;g.board.hel.mI=4;g.board.tur.rI=1;
  validateGame(g);
  const legal=clone(g);
  travel(legal,'s','hel','uus',{count:3,caps:[]});
  assert.equal(control(legal.board.hel),'s');
  assert(distance('uus','tur')<distance('hel','tur'));
  const result=executeBotCard(g,'s',59,1,[]);
  assert.equal(result.n,1,'The legal three-Cell March must not be discarded with the five-Cell candidate');
});

test('F3b: Senate Train Attack can use a smaller group to preserve Town Control',()=>{
  const g=position({phase:2});g.board.hel.sI=6;g.board.hel.mI=2;
  g.board.hel.caps.s=['train'];g.board.uus.rI=1;
  validateGame(g);
  // A three-Cell Train attack hel -> uus is legal and leaves Senate Control.
  const legal=clone(g);travel(legal,'s','hel','uus',{count:3,caps:['train']});
  assert.equal(control(legal.board.hel),'s');
  const result=executeBotCard(g,'s',58,1,[]);
  assert.equal(result.n,1,'A legal three- or four-Cell Train Attack exists');
});

test('F4: Senate selects its Capability group before an ordinary group',()=>{
  const g=position({phase:2});g.board.ham.sI=4;g.board.ham.caps.s=['officer'];
  g.board.tam.sI=1;g.board.uus.sI=4;
  validateGame(g);
  const result=executeBotCard(g,'s',59,1,[]);
  assert.equal(result.n,1);
  assert.equal(g.board.ham.sI,1,'The Capability group in Häme is selected before the ordinary Uusimaa group');
});

test('F5: a Captured Moderates Cell cannot Message again in the same Command',()=>{
  const g=position({phase:2});Object.assign(g.board.hel,{mI:1,person:true});
  g.board.tam.mI=1;g.board.uus.mI=1;g.board.uus.rA=6;
  g.news=[{id:1,space:'ham',owner:null}];
  validateGame(g);
  const log=[];botMessage(g,63,3,log);
  assert(log.some(line=>line==='Capture stops the Cell in Uusimaa.'));
  assert.equal(g.board.hel.mI,2);
  assert.equal(g.board.uus.mA,1,'The Captured Cell must stay Active; move the previously unmoved Underground Cell');
  assert.equal(g.board.uus.mI,0);
});

test('F6: human Activism cannot repeat a space while omitting an eligible space',()=>{
  const g=position();g.board.hel.rI=6;g.board.tam.rI=1;g.rng=rngFor(3);
  const intent={type:'human',action:'limited',command:'Activism',rows:[{option:'activate',sites:['hel']}]};
  let p;
  try {p=preview(g,intent);} catch(error) {
    // A descriptive validation rejection is also a valid repair, but a crash is not.
    assert.match(error.message,/activat|even|distribut|eligible.*space/i);
    return;
  }
  assert(p.after.board.hel.rA<=1||p.after.board.tam.rA>=1,
    'Helsinki received three activations while Tampere received none');
});

test('F7: Event #10 still raises Vassalage if its Capability cannot be placed',()=>{
  const g=position({phase:2,current:10});
  validateGame(g);
  const p=preview(g,{type:'human',action:'event',side:'light'});
  assert.equal(p.after.tracks.sV,4,'No Senate Cells can receive a Jaeger, but the other Event effect remains possible');
});

test('F8: a malformed imported Command draft is rejected or repaired before use',()=>{
  const c=newCampaign('Malformed draft',position());
  c.draft={intent:{type:'human',action:'limited',command:'Rally',rows:null}};
  let restored;
  try {restored=decode(encodeCampaign(c));} catch {return;}
  const intent=restored.campaigns[0].draft.intent;
  assert(!intent||intent.rows===undefined||Array.isArray(intent.rows),'rows:null survives decode and crashes the Turn renderer');
});

test('F9: a staged Unresolved Issue stays Unresolved when the editor rerenders',()=>{
  const g=position();g.issues=['r',null,null];g.tracks.rIssue=1;
  const html=editorHtml(g,{issues:[null,null,null]},'edit');
  const select=html.match(/<select data-bind="edit\.issues\.0"[^>]*>(.*?)<\/select>/s)?.[1];
  assert(select?.includes('<option value="" selected>Unresolved</option>'),
    'The renderer falls back to the old resolved value when the staged value is null');
});
