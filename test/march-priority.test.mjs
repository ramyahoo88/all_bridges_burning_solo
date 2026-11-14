import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executeBotCard} from '../src/bots.js';
import {validateGame} from '../src/model.js';
import {position} from './fixtures.mjs';

function competingGroups(f,uusimaa,karelia) {
  const g=position({phase:2,humans:['m']});
  Object.assign(g.board.uus,{[f+'I']:uusimaa,support:1});
  Object.assign(g.board.kar,{[f+'I']:karelia,support:1});
  g.rng=6;
  return g;
}

for(const {f,card} of [{f:'r',card:53},{f:'s',card:59}]) {
  test('Limited #'+card+' prioritizes Helsinki over Viipuri across equally ranked groups',()=>{
    const g=validateGame(competingGroups(f,4,4));
    const rng=g.rng;
    assert.equal(executeBotCard(g,f,card,1,[]).n,1);
    assert.equal(g.board.hel[f+'I'],3);
    assert.equal(g.board.vii[f+'I'],0);
    assert.equal(g.rng,rng,'Unequal destinations do not require a tie roll.');
    validateGame(g);
  });
}

test('Limited #59 compares moving groups of five Cells before considering destinations',()=>{
  const g=validateGame(competingGroups('s',6,7));
  assert.equal(executeBotCard(g,'s',59,1,[]).n,1);
  assert.equal(g.board.hel.sI,5);
  assert.equal(g.board.kar.sI,7);
  validateGame(g);
});

test('Limited #59 still selects the larger moving group before the better destination',()=>{
  const g=validateGame(competingGroups('s',4,5));
  assert.equal(executeBotCard(g,'s',59,1,[]).n,1);
  assert.equal(g.board.hel.sI,0);
  assert.equal(g.board.vii.sI,4);
  validateGame(g);
});
