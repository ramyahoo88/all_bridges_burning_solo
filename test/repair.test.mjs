import {test} from 'node:test';
import assert from 'node:assert/strict';
import {engage} from '../src/actions.js';
import {executeBotCard} from '../src/bots.js';
import {botPersonality} from '../src/bot-rally.js';
import {preview} from '../src/engine.js';
import {applyHumanCommand} from '../src/human.js';
import {cells,clone,validateGame} from '../src/model.js';
import {addCampaign,decode,duplicateCampaign,emptyCollection,encode,encodeBackupParts,encodeCampaign,importCopies,MAX_CAMPAIGNS,newCampaign} from '../src/storage.js';
import {collectionWithHistory,newsPosition,nextDie,trainPosition} from '../audit/v0.10.4/cases.mjs';
import {position,senateMarchPosition} from './fixtures.mjs';

test('full #59 marches original Cells onward and leaves earlier arrivals and their Train in place',()=>{
  const g=validateGame(senateMarchPosition());
  const original=clone(g);
  const plan=preview(g,{type:'bot'});
  assert.deepEqual(g,original);
  assert.deepEqual(preview(g,{type:'bot'}),plan);
  assert.equal(plan.title,'Senate · March + Prepare');
  assert.equal(plan.after.board.mik.sI,1);
  assert.deepEqual([plan.after.board.hel.sA,plan.after.board.hel.sI],[3,0]);
  assert.deepEqual([plan.after.board.uus.sA,plan.after.board.uus.sI],[1,3]);
  assert.deepEqual(plan.after.board.uus.caps.s,['train']);
  assert.deepEqual(plan.after.board.hel.caps.s,[]);
  assert.deepEqual(plan.after.sabotage,[]);
});

test('full #59 can converge two groups into a single destination',()=>{
  const plan=preview(validateGame(senateMarchPosition({converging:true})),{type:'bot'});
  assert.equal(plan.title,'Senate · March + Prepare');
  assert.deepEqual([plan.after.board.mik.sI,plan.after.board.kar.sI,plan.after.board.uus.sI],[1,1,6]);
  assert.deepEqual(plan.after.board.uus.caps.s,['train']);
});

test('the #59 position can open the tabletop form without applying the automatic move',()=>{
  const g=validateGame(senateMarchPosition());
  const plan=preview(g,{type:'bot',guideCommand:true});
  assert.equal(plan.after.interrupt.scope,'bot-command');
  assert.match(plan.after.interrupt.title,/#59 March/);
  assert.deepEqual(plan.after.board,g.board);
  assert.deepEqual(plan.after.sabotage,g.sabotage);
});

test('the Reds bot can designate Russian Troops already at the Train Attack destination',()=>{
  const g=trainPosition('r');
  g.board.hel.u=2;
  g.board.hel.caps.r=[];
  validateGame(nextDie(g,3));
  const log=[];
  assert.equal(executeBotCard(g,'r',52,1,log).n,1);
  assert(log.some(line=>line.includes('Strength 4; hits')&&line.includes('2 attacking Russian Troops +4')));
  assert.equal(cells(g.board.hel,'s'),0);
  validateGame(g);
});

test('German attrition stops after removing the participating Cell and Russian Troop',()=>{
  const g=position({phase:2});
  g.tracks.gOut=3;
  Object.assign(g.board.hel,{rI:3,u:2,g:3});
  validateGame(g);
  engage(g,[],{f:'r',id:'hel',defenders:['g'],attackCount:1,russians:1,boost:7,die:3});
  assert.deepEqual([g.board.hel.rI,g.board.hel.rA,g.board.hel.u,g.board.hel.g],[2,0,1,0]);
  validateGame(g);
});

for(const display of ['all Issues resolved','all cubes used']) {
  test('human and bot Personality can use News with '+display,()=>{
    for(const human of [true,false]) {
      const g=newsPosition(human);
      if(display==='all cubes used') {
        g.issues=[null,null,null];
        Object.assign(g.tracks,{rIssue:0,sIssue:0,rC:3,sC:3});
      }
      validateGame(nextDie(g,4));
      const log=[];
      if(human) applyHumanCommand(g,'m',log,{command:'Rally',rows:[{id:'tam',option:'cells'}],
        special:{name:'Personality',timing:1,option:'lower',id:'hel',token:1}});
      else assert.equal(botPersonality(g,log),true);
      assert.deepEqual(g.news,[]);
      assert.deepEqual([g.tracks.rC,g.tracks.sC],display==='all cubes used'?[3,3]:[0,0]);
      if(human||display==='all Issues resolved') assert.equal(g.tracks.pol,3);
      else assert.equal(g.tracks.m,14);
      validateGame(g);
    }
  });
}

for(const reason of ['stacking limit','empty Terror supply']) {
  test('taking a prisoner still adds News at the '+reason,()=>{
    const g=position({humans:['r'],phase:2});
    Object.assign(g.board.hel,{sI:3,rI:2});
    if(reason==='stacking limit') Object.assign(g.board.hel,{rTerror:1,sTerror:1});
    else {
      g.board.tur.sTerror=2;
      g.board.vaa.sTerror=2;
      g.board.tam.sTerror=1;
    }
    validateGame(g);
    const originalTerror=g.board.hel.sTerror;
    engage(g,[],{f:'s',id:'hel',defenders:['r','u'],attackCount:3,die:3,bot:true});
    assert.equal(g.tracks.rPow,1);
    assert.equal(g.tracks.pol,3);
    assert.equal(g.board.hel.sTerror,originalTerror);
    assert.deepEqual(g.news,[{id:1,space:'hel',owner:null}]);
    validateGame(g);
  });
}

test('same-ID imports preserve newer progress when there is no room for a copy',()=>{
  const collection=emptyCollection();
  const original=addCampaign(collection,newCampaign('Earlier backup',position()));
  const earlier=decode(encodeCampaign(original));
  for(let i=1;i<MAX_CAMPAIGNS;i++) duplicateCampaign(collection,original.id);
  original.game.tracks.r=12;
  original.draft.boardFilter='recent changes';
  const before=encode(collection);
  assert.throws(()=>importCopies(collection,earlier),/250 campaigns/);
  assert.equal(encode(collection),before);
});

test('the large workspace splits by UTF-8 size and restores every campaign, draft and history entry',()=>{
  const collection=collectionWithHistory(160);
  collection.campaigns[0].name='Häme · Tampere';
  collection.campaigns[0].draft.boardFilter='Häme';
  const parts=encodeBackupParts(collection);
  assert.equal(parts.length,2);
  let restored=emptyCollection();
  for(const part of parts) {
    assert.equal(part.bytes,Buffer.byteLength(part.raw));
    assert(part.bytes<=16_000_000);
    const decoded=decode(part.raw);
    assert.equal(decoded.campaigns.length,part.campaigns);
    restored=importCopies(restored,decoded);
  }
  const original=collection.campaigns.map(({id,...entry})=>entry);
  assert.deepEqual(restored.campaigns.map(({id,...entry})=>entry),original);
  assert.equal(restored.campaigns[0].undo.length,30);
  assert.equal(new Set(restored.campaigns.map(c=>c.id)).size,160);
});
