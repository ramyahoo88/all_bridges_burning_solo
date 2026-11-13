import {test} from 'node:test';
import assert from 'node:assert/strict';
import { EVENTS, FACTIONS, SPACE_IDS, edge} from '../src/data.js';
import { addNews, clone, control, createDeck, newGame, pools, score, victory} from '../src/model.js';
import { roll} from '../src/random.js';
import {actor, advanceCard, beginRevolt, options, record, reorder} from '../src/sequence.js';
import {battleStrength, engage, legalRail, rallySize, terrorAt, terrorOptions, travel} from '../src/actions.js';
import {botDraw, botTurn, executeBotCard} from '../src/bots.js';
import {botCondition} from '../src/bot-operations.js';
import { humanAgitate, propaganda, syncPowers} from '../src/rounds.js';
import {preview} from '../src/engine.js';
import {applyHumanCommand} from '../src/human.js';
import {begin, position} from './fixtures.mjs';

const firstRoll=value=>{
  for(let seed=0;seed<1000;seed++) if(roll({rng:seed},[])===value) return seed;
  throw Error('No test seed found.');
};

// Expectations were transcribed from the cited rules and examples before checking the engine.
test('Setup and §8.1.2: official inventory, fixed placement rolls, and human/bot resource setup',()=>{
  const g=newGame({seed:4,humans:['r']});
  assert.deepEqual(g.eligible,['r','s','m']);
  assert.equal(g.board.vii.sI,1);
  assert.equal(g.board.tur.mI,1);
  assert.equal(g.board.hel.u,1);
  assert.equal(g.board.vii.u,1);
  assert.equal(g.board.poh.u,1);
  assert.equal(control(g.board.vii),null);
  assert.equal(g.tracks.sOut,10);
  assert.equal(g.tracks.gOut,6);
  assert.deepEqual([g.tracks.r,g.tracks.s,g.tracks.m],[5,0,0]);
  assert.deepEqual([score(g).cellTrack,score(g).senate,score(g).opp,score(g).politics],[13,1,3,1]);
  assert.deepEqual([pools(g).r,pools(g).s,pools(g).m,pools(g).u,pools(g).g],[11,6,4,0,0]);
});
test('Setup: each year supplies 18 unique Events, each block has Propaganda in positions 6–10',()=>{
  for(let seed=0;seed<24;seed++) {
    const deck=createDeck(seed);
    assert.equal(deck.length,40);
    assert.equal(new Set(deck).size,40);
    for(let i=0;i<4;i++) {
      const block=deck.slice(i*10,i*10+10).map(id=>EVENTS[id]);
      assert(block.slice(0,5).every(c=>!c.prop));
      assert.equal(block.filter(c=>c.prop).length,1);
      assert(block.filter(c=>!c.prop).every(c=>c.year===(i<2?1917:1918)));
    }
  }
});
test('§1.7: a strict majority includes opposing disc and Cell but excludes both powers',()=>{
  const g=position();
  const b=g.board.hel;
  Object.assign(b,{rA:2,rI:1,sA:2,mI:1,g:6,u:6});
  assert.equal(control(b),null);
  b.admin=1;
  assert.equal(control(b),'r');
  b.network=1;
  assert.equal(control(b),null);
  assert.equal(score(g).opp,1);
});
test('§2.2.5 Example 1: opening Limited, then two Passes',()=>{
  const g=position();
  record(g,'r','limited',[]);
  assert.deepEqual(options(g),['pass','full','limited']);
  record(g,'s','pass',[]);
  record(g,'m','pass',[]);
  assert.equal(g.stage,'advance');
  reorder(g);
  assert.deepEqual(g.eligible,['s','m','r']);
  assert.equal(g.ineligible,null);
  assert.equal(g.tracks.s,0);
  assert.equal(g.tracks.m,1);
});
test('§2.2.5 Example 2: full box, Event c, Limited d, then return prior ineligible before c/d',()=>{
  const g=position();
  record(g,'r','full',[]);
  record(g,'s','event',[]);
  record(g,'m','limited',[]);
  reorder(g);
  assert.deepEqual(g.eligible,['s','m']);
  assert.equal(g.ineligible,'r');
  record(g,'s','limited',[]);
  record(g,'m','pass',[]);
  reorder(g);
  assert.deepEqual(g.eligible,['m','r','s']);
});
test('§2.2.3: a Pass before the opener does not choose a row; the third faction can act',()=>{
  const g=position();
  record(g,'r','pass',[]);
  assert(options(g).includes('event'));
  record(g,'s','limited',[]);
  assert.deepEqual(options(g),['pass','full','limited']);
  record(g,'m','full',[]);
  assert.equal(g.actions.length,3);
});
test('§2.3 and Playbook p.26: lookahead Propaganda interrupts and preserves the reserved card/order',()=>{
  const g=position();
  g.mode='digital';
  g.upcoming=8;
  g.reserved={card:8,f:'m'};
  g.deck=[22,2];
  for(const f of FACTIONS) record(g,f,'pass',[]);
  advanceCard(g,[]);
  assert.equal(g.current,22);
  assert.equal(g.upcoming,8);
  assert.equal(g.round,1);
  assert.deepEqual(g.reserved,{card:8,f:'m'});
  assert.deepEqual(g.eligible,['r','s','m']);
});
test('§2.4: 26 Cells do not trigger; at 27 replace the next Event and stay in Phase I until Revolt',()=>{
  const g=position();
  g.board.hel.rI=13;
  g.board.ham.sI=13;
  g.reserved={f:'s',card:4};
  record(g,'r','limited',[]);
  assert.equal(g.upcoming,4);
  g.board.hel.rI++;
  record(g,'s','pass',[]);
  assert.equal(g.upcoming,24);
  assert.equal(g.phase,1);
  assert(g.seen.includes(4));
  assert.equal(g.reserved,null);
});
test('§2.4.1 Playbook p.14–15: ineligible Reds take the Event box before the remaining factions',()=>{
  const g=position({current:24});
  g.eligible=['s','m'];
  g.ineligible='r';
  beginRevolt(g);
  assert.equal(g.ineligible,null);
  assert.deepEqual(g.actions,[{f:'r',action:'event'}]);
  assert.equal(actor(g),'s');
  assert.deepEqual(options(g),['pass','full','limited']);
});
test('§3.2.1 worked Rally example: two White Terror and Passive Opposition',()=>{
  const b={support:-1,rTerror:0,sTerror:2};
  assert.deepEqual([rallySize(b,'r').n,rallySize(b,'r',1).n,rallySize(b,'r',true).n],[0,1,2]);
});
test('§3.3.1 worked example: two Neutral Rallies at Polarization 7 cost zero total',()=>{
  const g=position({humans:['m']});
  g.tracks.pol=7;
  g.tracks.m=0;
  applyHumanCommand(g,'m',[],{command:'Rally',rows:[{id:'hel',offset:0},{id:'vii',offset:0}]});
  assert.equal(g.tracks.m,0);
  assert.equal(g.board.hel.mI,1);
  assert.equal(g.board.vii.mI,1);
  assert.throws(()=>applyHumanCommand(g,'m',[],{command:'Rally',rows:[{id:'hel'},{id:'vii'},{id:'tam'}]}),/needs/);
});
test('§3.3.4: Political Display command uses track cost and is blocked at Polarization six',()=>{
  const g=position({humans:['m']});
  g.board.hel.mI=1;
  g.tracks.pol=3;
  applyHumanCommand(g,'m',[],{command:'Politics',rows:[{side:'s'}]});
  assert.deepEqual([g.tracks.m,g.tracks.sC],[3,1]);
  g.tracks.pol=6;
  assert.throws(()=>applyHumanCommand(g,'m',[],{command:'Politics',rows:[{side:'s'}]}),/Polarization/);
});
test('§3.1.2: a free Rally offsets hostile markers and charges no Resources',()=>{
  const g=position();
  g.tracks.r=0;
  Object.assign(g.board.hel,{sTerror:1,support:2});
  applyHumanCommand(g,'r',[],{command:'Rally',rows:[{id:'hel'}]},{free:true,limited:true});
  assert.equal(g.board.hel.rI,1);
  assert.equal(g.tracks.r,0);
});
test('§1.4.2 and §8.2.3: empty pool does not let the bot recycle; human may choose to',()=>{
  const g=position({humans:['s']});
  g.board.hel.rI=20;
  g.board.hel.support=-2;
  assert.equal(executeBotCard(g,'r',48,1,[]).n,0);
  g.humans=['r'];
  g.tracks.r=2;
  applyHumanCommand(g,'r',[],{command:'Rally',recycle:[{id:'hel',key:'rI',count:1}],rows:[{id:'tam'}]});
  assert.equal(g.board.hel.rI,19);
  assert.equal(g.board.tam.rI,1);
});
test('§3.2.3: both Terror spaces use the initial Polarization; second marker creates News in Phase II',()=>{
  const g=position({phase:2});
  g.tracks.pol=5;
  Object.assign(g.board.hel,{rA:1,sI:2,rTerror:1});
  Object.assign(g.board.tam,{rA:1,sI:2});
  applyHumanCommand(g,'r',[],{command:'Terror',rows:[{id:'hel'},{id:'tam'}]});
  assert.deepEqual([g.board.hel.sI,g.board.tam.sI,g.tracks.pol],[1,1,7]);
  assert.deepEqual(g.news,[{id:1,space:'hel',owner:null}]);
});
test('§3.2.3: Terror protects the last Cell with Prepared; it does not remove Russian Troops',()=>{
  const g=position();
  Object.assign(g.board.hel,{rA:1,sI:1,sPrep:1,u:2});
  assert.equal(terrorOptions(g,'hel','r').length,0);
  g.board.hel.sI=2;
  const choices=terrorOptions(g,'hel','r',{polarization:6});
  assert(choices.every(c=>c.removed.length===1&&c.removed[0]==='sI'));
});
test('§3.2.3 and §8.1.2: Moderates ransom paid to a human; no Reds bot Resource cylinder',()=>{
  for(const human of [true,false]) {
    const g=position({humans:[human?'r':'s']});
    g.tracks.m=4;
    Object.assign(g.board.hel,{rA:1,mI:1,person:true});
    terrorAt(g,'hel','r',terrorOptions(g,'hel','r')[0]);
    assert.equal(g.tracks.m,1);
    assert.equal(g.tracks.r,human?7:0);
  }
});
test('§3.2.4 and Playbook p.18: roll 3 yields Available/POW/Available, one attrition, News, and Terror',()=>{
  const g=position({phase:2,humans:['s']});
  Object.assign(g.board.ham,{sI:4,rA:1,rI:3,admin:1});
  const strength=battleStrength(g,{f:'s',id:'ham',defenders:['r','u'],attackCount:4,boost:4,bot:false});
  assert.equal(strength,5);
  engage(g,[],{f:'s',id:'ham',defenders:['r','u'],attackCount:4,boost:4,die:3,bot:false});
  assert.deepEqual([g.board.ham.sA,g.board.ham.sI,g.board.ham.rA,g.board.ham.rI,g.board.ham.admin,g.tracks.rPow,g.tracks.pol,g.board.ham.sTerror],[1,2,0,1,1,1,4,1]);
  assert.equal(g.news[0].space,'ham');
});
test('§3.2.4: natural six always misses; no non-attacking Cells are Activated',()=>{
  const g=position({phase:2,humans:['s']});
  Object.assign(g.board.hel,{sI:3,sA:2,rI:5});
  engage(g,[],{f:'s',id:'hel',defenders:['r','u'],attackCount:2,activeFirst:true,boost:20,die:6,bot:false});
  assert.deepEqual([g.board.hel.sA,g.board.hel.sI,g.board.hel.rI,g.tracks.rPow],[2,3,5,0]);
});
test('§3.2.4 Retreat: relocated defenders keep their News and cause no Cell attrition',()=>{
  const g=position({phase:2,humans:['s']});
  Object.assign(g.board.ham,{sI:4,rA:1,rI:2,rPrep:1});
  g.board.ham.caps.r=['officer'];
  addNews(g,'ham','r');
  engage(g,[],{f:'s',id:'ham',defenders:['r','u'],attackCount:4,boost:5,die:3,retreat:'tam'});
  assert.deepEqual([g.board.ham.sA,g.board.ham.sI,g.board.ham.rPrep,g.board.tam.rA,g.board.tam.rI],[1,3,0,1,2]);
  assert.deepEqual(g.board.tam.caps.r,['officer']);
  assert.deepEqual(g.news,[{id:1,space:'tam',owner:'r'}]);
  assert.deepEqual([g.tracks.rPow,g.tracks.pol,g.board.ham.sTerror],[0,3,0]);
});
test('§3.2.4 Retreat: German Troops removed still cause attrition',()=>{
  const g=position({phase:2});
  Object.assign(g.board.ham,{rI:4,sI:3,g:1});
  engage(g,[],{f:'r',id:'ham',defenders:['s','g'],attackCount:4,boost:6,die:4,retreat:'tam'});
  assert.deepEqual([g.board.ham.rA,g.board.ham.rI,g.board.ham.g,g.board.tam.sI],[1,2,0,3]);
});
test('§3.2.4: stationary Attack uses the two strongest Capabilities when none are specified',()=>{
  const g=position({phase:2,humans:['s']});
  Object.assign(g.board.ham,{sI:3,rI:4});
  g.board.ham.caps.s=['officer','cannon','train'];
  g.rng=firstRoll(5);
  const log=[];
  applyHumanCommand(g,'s',log,{command:'Attack',rows:[{from:'ham',to:'ham',count:3,caps:[]}]});
  assert(log.some(line=>line.includes('Strength 5; hits')));
  assert.equal(g.board.ham.rI,0);
});
test('§3.2.4: Train Attack includes selected local Cells, Troops and existing Capabilities',()=>{
  const g=position({phase:2});
  Object.assign(g.board.ham,{rI:1,u:1});
  g.board.ham.caps.r=['train'];
  Object.assign(g.board.tam,{rI:2,u:1,g:1});
  g.board.tam.caps.r=['cannon'];
  g.rng=firstRoll(5);
  const log=[];
  applyHumanCommand(g,'r',log,{command:'Attack',rows:[
    {from:'ham',to:'tam',count:1,russian:1,caps:['train'],localCount:2,localRussian:1,defenders:'g'}
  ]});
  assert(log.some(line=>line.includes('Strength 5; hits')));
  assert.deepEqual([g.tracks.r,g.board.tam.rA,g.board.tam.rI,g.board.tam.u,g.board.tam.g],[4,1,1,2,0]);
});
test('§8.1.3 and Playbook p.28: Senate starts at seven, Prepared is −2 and Train +1',()=>{
  const g=position({phase:2});
  g.board.tam.rI=3;
  g.board.tam.rPrep=1;
  g.board.tam.sI=5;
  g.board.tam.caps.s=['train'];
  assert.equal(battleStrength(g,{f:'s',id:'tam',defenders:['r','u'],attackCount:5,bot:true}),6);
});
test('§8.4.5 Playbook p.27–28: remove Sabotage before Train Attack, move five and leave one',()=>{
  const g=position({phase:2,humans:['r']});
  Object.assign(g.board.tam,{rI:3,rPrep:1,admin:1,support:-2});
  g.board.ham.sI=6;
  g.board.ham.caps.s=['train'];
  g.sabotage=[edge('tam','ham')];
  g.rng=firstRoll(6);
  const log=[];
  const result=executeBotCard(g,'s',58,99,log);
  assert.equal(result.special,'Prepare');
  assert.equal(result.n,1);
  assert.equal(g.board.ham.sI,1);
  assert.equal(g.board.tam.sI+g.board.tam.sA,5);
  assert.deepEqual(g.board.tam.caps.s,['train']);
  assert.equal(g.sabotage.length,0);
  assert(log.some(x=>x.includes('Strength 6')));
});
test('§8.4.5: without legal pre-Command Prepare a Senate Attack may be Limited when that box is available',()=>{
  const g=position({phase:2});
  Object.assign(g.board.hel,{sI:3,rI:3});
  assert.equal(executeBotCard(clone(g),'s',58,99,[],{allowLimited:false}).n,0);
  const result=executeBotCard(g,'s',58,99,[],{allowLimited:true});
  assert.equal(result.n,1);
  assert.equal(result.onlyLimited,true);
});
test('§3.2.5: ordinary movement uses borders; only Trains need the railway and repair',()=>{
  const g=position({phase:2});
  g.board.ham.rI=4;
  g.board.ham.caps.r=['train'];
  g.sabotage=[edge('tam','ham')];
  assert.equal(legalRail(g,'ham','tam'),false);
  assert.throws(()=>travel(clone(g),'r','ham','tam',{count:3,caps:['train']}),/unsabotaged/);
  applyHumanCommand(g,'r',[],{command:'March',rows:[{from:'ham',to:'tam',count:4}]});
  assert.equal(g.board.tam.rI,4);
  assert.equal(g.tracks.r,3);
});
test('§3.2.5 and §3.3.2: March moves held News when its last carrier leaves and keeps loose News in place',()=>{
  const g=position({phase:2});
  g.board.ham.rI=2;
  addNews(g,'ham','r');
  addNews(g,'ham');
  travel(g,'r','ham','tam',{count:1});
  assert.equal(g.news[0].space,'ham');
  travel(g,'r','ham','tam',{count:1});
  assert.deepEqual(g.news,[{id:1,space:'tam',owner:'r'},{id:2,space:'ham',owner:null}]);
});
test('§3.2.2: Reds can flip and Agitate in the same space, with one selection cost',()=>{
  const g=position({phase:2});
  Object.assign(g.board.hel,{rA:1,admin:1,sA:1,sTerror:1,rTerror:1});
  g.tracks.sIssue=1;
  const intent={command:'Activism',rows:[{id:'hel',option:'flip',side:'s'},{id:'hel',option:'agitate'}]};
  assert.throws(()=>applyHumanCommand(clone(g),'r',[],intent,{limited:true}),/one row/);
  const free=clone(g);
  applyHumanCommand(g,'r',[],intent);
  applyHumanCommand(free,'r',[],intent,{free:true});
  assert.deepEqual([g.tracks.r,g.board.hel.sI,g.board.hel.support,g.board.hel.sTerror,g.board.hel.rTerror],[1,1,-1,0,0]);
  assert.deepEqual(free,g);
});
test('§3.2.2: a no-effect Reds Agitation cannot be previewed or charged',()=>{
  const g=position({phase:2});
  Object.assign(g.board.hel,{rA:1,admin:1,support:-2});
  const before=clone(g);
  assert.throws(()=>preview(g,{type:'human',action:'limited',command:'Activism',rows:[{id:'hel',option:'agitate'}]}),/remove Terror or shift/);
  assert.deepEqual(g,before);
});
test('§3.3.2 Capture example: same roll as enemy strength Captures the carrier en route',()=>{
  const g=position({phase:2,humans:['m']});
  Object.assign(g.board.tam,{mA:1});
  g.board.ham.sA=3;
  g.news=[{id:1,space:'tam',owner:'m'}];
  g.rng=firstRoll(3);
  applyHumanCommand(g,'m',[],{command:'Message',rows:[{from:'tam',path:['ham','poh'],token:1}]},{limited:true});
  assert.equal(g.board.ham.mA,1);
  assert.equal(g.board.poh.mI,0);
  assert.equal(g.news[0].space,'ham');
  assert.equal(g.tracks.m,4);
});
test('§4.3.3 Publish example: Helsinki plus Tampere yields eight and Activates three',()=>{
  const g=position({humans:['m']});
  Object.assign(g.board.hel,{mI:2,network:1,person:true});
  Object.assign(g.board.tam,{mI:1,network:1});
  applyHumanCommand(g,'m',[],{command:'Politics',rows:[{side:'r'}],
    special:{name:'Publish',timing:0,sites:['hel','tam'],amounts:{hel:2,tam:1}}});
  assert.deepEqual([g.tracks.m,g.board.hel.mA,g.board.tam.mA],[11,2,1]);
});
test('§4.1: a Special Activity between two Commands can fund the second payment',()=>{
  const g=position({humans:['s'],phase:2});
  g.tracks.s=1;
  g.board.vaa.sA=1;
  g.board.poh.sA=1;
  applyHumanCommand(g,'s',[],{command:'Rally',rows:[{id:'hel'},{id:'vii'}],
    special:{name:'Political Event',timing:1,sites:['vaa','poh']}});
  assert.equal(g.tracks.s,1);
  assert.equal(g.board.hel.sI+g.board.vii.sI,2);
});
test('§8.1.4 Playbook p.22: Senate Passes for upcoming #17 Train with no capability roll',()=>{
  const g=position({current:2,upcoming:17});
  g.eligible=['s','r','m'];
  g.held.s=['officer','cannon','officer'];
  const rng=g.rng;
  assert.match(botTurn(g,[]),/Pass/);
  assert.deepEqual(g.reserved,{f:'s',card:17});
  assert.equal(g.rng,rng);
});
test('§8.1.4: matching current Event can be blocked by an opening Limited Command',()=>{
  const g=position({current:2,upcoming:3});
  g.eligible=['r','m','s'];
  record(g,'r','limited',[]);
  const plan=preview(g,{type:'bot'});
  assert(!plan.after.interrupt);
  assert.notEqual(plan.after.actions[1].action,'event');
  assert.equal(plan.after.tracks.m,0);
});
test('§8.1.4/8.1.5: ineffective #18 Politics is skipped at an empty display',()=>{
  const g=position({current:18,upcoming:3});
  g.eligible=['m','s','r'];
  const p=preview(g,{type:'bot'});
  assert(p.log.some(s=>s.includes('cannot change')));
  assert.equal(p.after.actions[0].action,'limited');
  assert.equal(p.after.interrupt,null);
});
test('§8.1.4: an unfinished guided bot Event survives a rejected preview and can be marked ineffective',()=>{
  const g=position({current:31,upcoming:3,humans:['m'],phase:2});
  g.eligible=['s','m','r'];
  g.actions=[{f:'s',action:'full'},{f:'m',action:'limited'}];
  const opened=preview(g,{type:'bot'}).after;
  assert.equal(opened.interrupt.scope,'event');
  assert.deepEqual(opened.actions,g.actions);
  assert.throws(()=>preview(opened,{type:'advance'}),/pending/);
  const resumed=preview(opened,{type:'resolve',skip:true});
  assert.equal(resumed.after.actions.length,3);
  assert.equal(resumed.after.interrupt,null);
});
test('§8.2.1–3: reject cards without legal targets; one Command with no SA does not redraw',()=>{
  const g=position();
  g.tracks.sOut=19;
  g.board.vaa.sI=0;
  g.board.hel.rI=1;g.board.hel.rPrep=1;
  g.board.tam.rI=1;g.board.tam.rPrep=1;
  g.board.vii.rI=1;g.board.vii.rPrep=1;
  g.tracks.sV=0;
  const log=[];
  const result=botDraw(g,'s',99,log,{cards:[59,54,56]});
  assert.equal(result.id,54);
  assert.equal(result.n,1);
  assert.equal(result.special,null);
  assert(!log.some(s=>s.startsWith('#56')));
});
test('§8.4.1 #54 corrected priority: Mikkelin over other 0-Population spaces',()=>{
  const g=position();
  for(const id of SPACE_IDS) if(!['mik','oul','kuo'].includes(id)) g.board[id].rI=1;
  g.rng=firstRoll(3);
  const log=[];
  assert.equal(executeBotCard(g,'s',54,1,log).n,1);
  assert.equal(g.board.mik.sI,1);
  assert.equal(g.board.oul.sI,0);
});
test('§8.5.1 #60 and InsideGMT Part 3: protect Personality with two existing Cells',()=>{
  const g=position();
  Object.assign(g.board.tur,{mI:2,person:true});
  g.board.tam.mI=1;
  const result=executeBotCard(g,'m',60,1,[]);
  assert.equal(result.n,1);
  assert.equal(g.board.tur.mI,3);
});
test('§8.4.6: March gate is closed for a 3-Cell Senate group with an enemy',()=>{
  const g=position({phase:2});
  Object.assign(g.board.ham,{sI:3,rI:1});
  assert.equal(botCondition(g,59,[]).ok,false);
  g.board.ham.rI=0;
  assert.equal(botCondition(g,59,[]).ok,true);
});
test('#59 discards an impossible March without rolling Foreign Relations or applying speculative repair',()=>{
  const g=position({phase:2});
  g.tracks.sV=3;
  g.rng=firstRoll(1);
  g.board.ham.sI=1;
  const before=clone(g), log=[];
  assert.equal(botDraw(g,'s',99,log,{cards:[59]}),null);
  assert.deepEqual(g,before);
  assert.deepEqual(log,['#59 March (§8.4.6) · No legal target for the Command']);
  g.board.ham.caps.s=['train'];
  g.sabotage=['ham/tam'];
  const withRepair=clone(g);
  assert.equal(executeBotCard(g,'s',59,99,[]).n,0);
  assert.deepEqual(g,withRepair);
});
test('#59 uses the Limited box when Prepare is unavailable and March is legal',()=>{
  const g=position({phase:2});
  g.board.ham.sI=4;
  g.tracks.sV=4;
  assert.equal(executeBotCard(clone(g),'s',59,99,[],{allowLimited:false}).n,0);
  assert.deepEqual(executeBotCard(g,'s',59,99,[],{allowLimited:true}),{n:1,special:null,onlyLimited:true});
  assert.equal(g.tracks.sV,4);
});
test('#56 Phase II: roll must exceed Active Senate before Activating',()=>{
  const g=position({phase:2});
  for(const id of ['hel','tam','tur']) g.board[id].sA=1;
  g.board.ham.sI=4;
  g.rng=firstRoll(3);
  const log=[];
  assert.equal(botDraw(g,'s',1,log,{cards:[56]}),null);
  assert.equal(g.board.ham.sI,4);
  assert(log.some(line=>line.includes('rolled 3')));
  g.rng=firstRoll(4);
  assert.equal(executeBotCard(g,'s',56,1,[]).n,1);
  assert.equal(g.board.ham.sA,4);
});
test('#56 final Campaign: a Limited Command can calm but cannot remove a newly Activated Cell',()=>{
  const g=position({phase:2});
  g.round=3;
  g.tracks.pol=4;
  for(const id of ['hel','tam','tur']) g.board[id].sI=1;
  Object.assign(g.board.ham,{sA:1,sI:1});
  g.rng=firstRoll(1);
  assert.equal(executeBotCard(g,'s',56,1,[]).n,1);
  assert.deepEqual([g.board.ham.sA,g.board.ham.sI,g.tracks.pol],[0,1,3]);
  g.board.ham.sA=1;
  g.tracks.pol=4;
  g.rng=firstRoll(2);
  assert.equal(executeBotCard(g,'s',56,1,[]).n,1);
  assert.equal(g.tracks.pol,4);
  assert.equal(SPACE_IDS.reduce((sum,id)=>sum+g.board[id].sA,0),3);
});
test('#56 final Campaign: full Activism can calm existing Active Cells before a legal activation',()=>{
  const g=position({phase:2});
  g.round=3;
  g.tracks.pol=4;
  for(const id of ['hel','tam','tur']) g.board[id].sI=1;
  Object.assign(g.board.ham,{sA:1,sI:1});
  g.rng=firstRoll(4);
  assert.equal(executeBotCard(g,'s',56,99,[]).n,2);
  assert.equal(g.tracks.pol,3);
  assert.equal(SPACE_IDS.reduce((sum,id)=>sum+g.board[id].sA,0),4);
});
test('#50 final Campaign: calming has priority over exposing enemies and can precede Agitation',()=>{
  const g=position({phase:2,humans:['s']});
  g.round=3;
  g.tracks.pol=4;
  Object.assign(g.board.hel,{rA:2,sA:1,admin:1,support:-1});
  for(const id of ['tam','tur','vii','vaa','ham']) g.board[id].support=-2;
  assert.equal(executeBotCard(g,'r',50,99,[]).n,2);
  assert.deepEqual([g.tracks.pol,g.board.hel.rA,g.board.hel.sA,g.board.hel.support],[3,1,1,-2]);
});
test('§8.6: equal priorities have a reproducible random selection and both candidates occur across seeds',()=>{
  const targets=new Set();
  for(let seed=0;seed<35;seed++) {
    const g=position({seed,humans:['s']});
    g.board.hel.rI=1;
    g.board.tam.rI=1;
    const a=preview(g,{type:'bot'});
    const b=preview(g,{type:'bot'});
    assert.deepEqual(a,b);
    if(a.diff.spaces.length) for(const x of a.diff.spaces) targets.add(x.id);
  }
  assert(targets.size>1);
});
test('§6.3: zero-Population support earns Senate Resources; Polarization 7 earns four Moderates Resources',()=>{
  const g=position({humans:['s','m']});
  g.stage='propaganda'; g.round=1; g.roundStep='resources';g.tracks.pol=7;
  g.board.mik.support=2;g.board.vaa.support=2;g.board.hel.support=2;
  propaganda(g,[]);
  assert.deepEqual([g.tracks.r,g.tracks.s,g.tracks.m],[0,11,9]);
});
test('§6.2.1 worked cost: two White issues charge Reds only for the first selected Agitation action',()=>{
  const g=position();
  g.tracks.r=9;
  g.tracks.sIssue=2;
  g.issues=['s','s',null];
  Object.assign(g.board.hel,{rA:1,admin:1,support:0});
  Object.assign(g.board.tam,{rA:1,support:0});
  humanAgitate(g,[],[{id:'hel',kind:'shift',steps:2},{id:'tam',kind:'shift',steps:1}],'r');
  assert.equal(g.tracks.r,4);
  assert.deepEqual([g.board.hel.support,g.board.tam.support],[-2,-1]);
});
test('§6.5 reset: only first round Conscription; Old News removes markers and leaves Cell facing',()=>{
  const g=position({phase:2,current:22,upcoming:2});
  g.stage='propaganda';g.round=1;g.roundStep='reset';g.tracks.sOut=10;
  g.board.hel.sA=1;g.board.hel.sTerror=1;
  g.news=[{id:1,space:'hel',owner:null}];g.sabotage=[edge('ham','tam')];
  propaganda(g,[]);
  assert.equal(g.tracks.sOut,0);
  assert.equal(g.board.hel.sA,1);
  assert.equal(g.board.hel.sTerror,0);
  assert.equal(g.news.length+g.sabotage.length,0);
});
test('§8.7 and §7.2: solo player cannot end early, bot Moderates qualify at the issue threshold',()=>{
  const g=position({humans:['r']});
  g.tracks.pol=3;g.tracks.rV=0;
  for(const id of ['hel','tam','vaa','vii','tur','ham']) g.board[id].support=-2;
  assert.equal(victory(g),null);
  g.tracks.m=15;
  g.issues=['r','s',null];g.tracks.rIssue=1;g.tracks.sIssue=1;
  assert.equal(victory(g).winner,'m');
  assert.equal(victory(g).soloWin,false);
});
test('§7.3: highest power Vassalage wins when all margins are nonpositive, ties yield no winner',()=>{
  const g=position();
  g.tracks.rV=4;g.tracks.sV=3;
  assert.equal(victory(g,true).winner,'u');
  g.tracks.sV=4;
  assert.equal(victory(g,true).winner,null);
});
test('A full vertical slice has deterministic previews and no mutation until Apply',()=>{
  const g=begin();
  const before=JSON.stringify(g);
  const input={type:'human',action:'pass'};
  const p=preview(g,input);
  assert.equal(JSON.stringify(g),before);
  assert.equal(p.after.tracks.r,6);
  const bot=preview(p.after,{type:'bot'});
  assert.deepEqual(bot,preview(p.after,{type:'bot'}));
  assert.equal(bot.after.actions.length,2);
  assert(bot.diff.spaces.some(x=>x.id==='hel'));
  assert.equal(p.after.board.hel.sI,1);
});

test('§8.1.4: declining a tagged Event resumes at Command without rerolling the Capability check',()=>{
  const g=position({current:20,upcoming:14,humans:['m']});
  g.held.r=['officer','cannon'];
  g.rng=firstRoll(5);
  roll(g,[]);
  g.interrupt={kind:'manual',scope:'event',f:'r',card:20,side:'light',title:'Tokoi',aid:true,
    instruction:'Check the physical card.',source:'symbol'};
  const resumed=preview(g,{type:'resolve',skip:true});
  assert(resumed.log.every(line=>!line.includes('Capability check')));
  assert.equal(resumed.after.actions[0].f,'r');
});
test('InsideGMT Part 1: #8 uses most Moderates Cells then Towns and keeps the existing Network limit',()=>{
  const g=position({current:8,upcoming:3,humans:['r']});
  g.eligible=['m','r','s'];
  g.board.tur.mI=2;
  g.board.ham.mI=2;
  const result=preview(g,{type:'bot'});
  assert.equal(result.after.board.tur.network,1);
  assert.equal(result.after.board.ham.network,0);
  assert.equal(result.after.tracks.m,3);
  assert.equal(result.after.actions[0].action,'event');
});
test('InsideGMT Part 2: #9 selects highest Population legal Opposition shift and respects the Senate condition',()=>{
  const g=position({current:9,upcoming:3,humans:['m']});
  g.board.hel.support=-2;
  const p=preview(g,{type:'bot'});
  assert.equal(p.after.board.hel.support,-2);
  assert.equal(p.diff.spaces.length,1);
  assert.equal(p.after.board[p.diff.spaces[0].id].support,-1);
  const senate=position({current:9,upcoming:3,humans:['r']});
  senate.eligible=['s','r','m'];
  const q=preview(senate,{type:'bot'});
  assert.equal(q.after.board.hel.support,1);
});
test('InsideGMT Part 2 image: #19 Moderates switch Event sides at five political cubes',()=>{
  const g=position({current:19,upcoming:3,humans:['r']});
  g.eligible=['m','s','r'];
  g.tracks.rC=3;
  g.tracks.sC=2;
  const high=preview(g,{type:'bot'});
  assert(high.log.some(line=>line.includes('five or six cubes')));
  assert.equal(high.after.actions[0].action,'event');
  g.tracks.rC=2;
  g.rng=firstRoll(1);
  const low=preview(g,{type:'bot'});
  assert(low.log.some(line=>line.includes('Political Struggle')));
  assert.equal(low.after.tracks.rC+low.after.tracks.sC,5);
});
test('§2.3 setup cannot start with 1918 or Propaganda in the physical window',()=>{
  const g=newGame();
  assert.throws(()=>preview(g,{type:'start',current:25,upcoming:3}),/1917/);
  assert.throws(()=>preview(g,{type:'start',current:3,upcoming:22}),/1917/);
});
test('Physical Event #3 raises Russian Vassalage by one without changing Troops immediately',()=>{
  const g=begin();
  const next=preview(g,{type:'human',action:'event',side:'light',direction:'raise'}).after;
  assert.equal(next.tracks.rV,4);
  assert.equal(next.board.hel.u,1);
  assert.equal(next.tracks.uOut,3);
  assert.equal(next.actions[0].action,'event');
});

test('§3.3.2: a News decision survives the last faction’s Limited Command before card advance',()=>{
  const g=position({phase:2});
  g.eligible=['s','r'];
  g.ineligible='m';
  g.actions=[{f:'s',action:'full'}];
  g.board.tam.rI=1;
  g.news=[{id:1,space:'tam',owner:'r'}];
  const p=preview(g,{type:'human',action:'limited',command:'Rally',rows:[{id:'tam'}]});
  assert.equal(p.after.interrupt.kind,'news');
  assert.equal(actor(p.after),null);
  assert.equal(p.after.stage,'turn');
  const extra=preview(p.after,{type:'resolve',use:true,token:1,command:'Rally',rows:[{id:'hel'}]});
  assert.equal(extra.after.stage,'advance');
  assert.equal(extra.after.board.hel.rI,1);
  assert.equal(extra.after.tracks.r,3);
  assert.equal(extra.after.actions.length,2);
});
test('§1.2.3–4: the map allows a non-rail Häme–Kuopio border and each printed Town has a separate space',()=>{
  const g=position({phase:2});
  g.board.ham.rI=1;
  assert.equal(legalRail(g,'ham','kuo'),false);
  travel(g,'r','ham','kuo',{count:1});
  assert.equal(g.board.kuo.rI,1);
});

test('guided bot Command preserves the opening board and applies the recorded box once',()=>{
  const g=preview(begin(),{type:'human',action:'pass'}).after;
  const p=preview(g,{type:'bot',guideCommand:true});
  assert.equal(p.after.interrupt.scope,'bot-command');
  assert.equal(p.after.interrupt.action,'limited');
  assert.deepEqual(p.after.board,g.board);
  assert.deepEqual(p.after.actions,g.actions);
  const update=preview(p.after,{type:'resolve',recordAction:'limited',edit:{spaces:{hel:{sI:2}}}});
  assert.equal(update.after.board.hel.sI,2);
  assert.equal(update.after.actions.length,2);
  assert.equal(update.after.interrupt,null);
});

test('§3.4 German flowchart: rolls 3 and 4 place Germany on opposite sides of the faction turns',()=>{
  for(const [die,timing,stage] of [[3,'before','german'],[4,'after','turn']]) {
    const g=position({phase:2,current:26,upcoming:33});
    g.stage='enter';
    g.tracks.gOut=3;
    g.rng=firstRoll(die);
    const p=preview(g,{type:'enter'}).after;
    assert.equal(p.german,timing);
    assert.equal(p.stage,stage);
  }
  const early=position({phase:1,current:26,upcoming:33});
  early.stage='enter';
  const rng=early.rng;
  const phaseI=preview(early,{type:'enter'}).after;
  assert.equal(phaseI.german,null);
  assert.equal(phaseI.rng,rng);
});
test('German Actions aid and Playbook p.15: first Landing deploys all Available Troops and one News',()=>{
  const g=position({phase:2,current:26,upcoming:33});
  g.stage='german';
  g.german='before';
  g.tracks.gOut=3;
  g.rng=firstRoll(1);
  const p=preview(g,{type:'german'}).after;
  assert.equal(p.board.var.g,3);
  assert.equal(pools(p).g,0);
  assert.deepEqual(p.news,[{id:1,space:'var',owner:null}]);
  assert.equal(p.stage,'turn');
});
test('§6.5.2: Propaganda 2 inserts Red Revolt and keeps previous eligibility',()=>{
  const g=position({current:23,upcoming:7});
  g.stage='propaganda';
  g.roundStep='reset';
  g.round=2;
  g.eligible=['m','s'];
  g.ineligible='r';
  const p=preview(g,{type:'propaganda'}).after;
  assert.equal(p.current,24);
  assert.equal(p.stage,'reveal');
  assert(p.seen.includes(7));
  assert.deepEqual(p.eligible,['m','s']);
  assert.equal(p.ineligible,'r');
});
test('§2.4.1: the Pivotal Event accepts a free human Reds Rally, then adjusts Powers and enters Phase II',()=>{
  const g=position({current:24,upcoming:25});
  g.stage='revolt';
  g.board.hel.rI=1;
  g.tracks.r=0;
  g.tracks.rV=2;
  g.tracks.sV=2;
  let p=preview(g,{type:'revolt'}).after;
  p=preview(p,{type:'resolve',choice:'rally',space:'hel'}).after;
  assert.equal(p.board.hel.rI,2);
  assert.equal(p.tracks.r,0);
  p=preview(p,{type:'revolt'}).after;
  assert.equal(p.phase,2);
  assert.equal(p.board.hel.u,2);
  assert.equal(pools(p).g,2);
  assert.equal(actor(p),'s');
});

test('Playbook pp.20–21: Powers reset counts on-map Russians after Attack losses',()=>{
  const g=position({phase:2});
  g.tracks.uOut=3;
  g.tracks.rV=1;
  g.board.hel.u=1;
  g.board.poh.u=1;
  syncPowers(g,[]);
  assert.equal(g.board.hel.u+g.board.poh.u,1);
  assert.equal(g.tracks.uOut,4);
  assert.equal(pools(g).u,1);
});

test('§2.4.1: a legacy guided Reds Pivotal step resumes before Capabilities and remaining turns',()=>{
  const g=position({current:24,upcoming:25,humans:['s']});
  g.stage='revolt';
  g.board.hel.rI=1;
  g.board.hel.sI=1;
  beginRevolt(g);
  g.revoltStep='reds';
  g.interrupt={kind:'manual',scope:'revolt',f:'r',title:'Red Revolt!',aid:true,instruction:'Record the physical result.'};
  const result=preview(g,{type:'resolve',edit:{spaces:{hel:{sI:0}}}}).after;
  assert.equal(result.revoltStep,'caps');
  assert.equal(result.board.hel.sI,0);
  assert.equal(preview(result,{type:'revolt'}).after.phase,2);
});
