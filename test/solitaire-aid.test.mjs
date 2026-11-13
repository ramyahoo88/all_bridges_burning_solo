import {test} from 'node:test';
import assert from 'node:assert/strict';
import {SPACE_IDS} from '../src/data.js';
import {addNews, clone, control, pools, score} from '../src/model.js';
import {preview} from '../src/engine.js';
import {prepare} from '../src/bot-rally.js';
import {placeCapability} from '../src/events.js';
import {roll, spaceFromRoll} from '../src/random.js';
import {decode, encodeCampaign, newCampaign} from '../src/storage.js';
import {position} from './fixtures.mjs';

const turn=(card,f,humans=['m'],phase=2,upcoming=3)=>{
  const g=position({current:card,upcoming,phase,humans});
  g.eligible=[f,...g.eligible.filter(other=>other!==f)];
  return g;
};
const bot=g=>preview(g,{type:'bot'});
const resolve=(g,choice)=>preview(g,{type:'resolve',...choice}).after;
const seedFor=(...dice)=>{
  for(let seed=0;seed<10_000;seed++) {
    const random={rng:seed};
    if(dice.every(die=>roll(random,[])===die)) return seed;
  }
  throw Error('No seed for the stated rolls.');
};

test('§8.6, boxed front: trace from the rolled space, including wraparound and Political Display',()=>{
  assert.equal(spaceFromRoll(26,['hel','poh']),'poh');
  assert.equal(spaceFromRoll(46,['vaa','kuo']),'vaa');
  assert.equal(spaceFromRoll(54,['hel','political']),'political');
  assert.equal(spaceFromRoll(66,['ham','tam']),'tam');
  assert.equal(spaceFromRoll(16,['hel','tur']),'tur');
});

test('#4, #8, #12, #43 and §3.2.3: exactly one enemy Cell, Inactive attacker permitted, even at high Polarization',()=>{
  for(const card of [4,8,12,43]) {
    const g=turn(card,'r');
    g.tracks.pol=7;
    g.tracks.rC=2;
    g.board.hel.rI=1;
    g.board.hel.sA=1;
    g.board.hel.sI=1;
    g.board.hel.sPrep=1;
    g.board.tam.sA=2;
    const p=bot(g);
    assert.deepEqual([p.after.actions[0].action,p.after.board.hel.sA,p.after.board.hel.sI],['event',0,1],String(card));
    assert.equal(p.after.board.hel.rI,1);
    assert.equal(p.after.board.hel.rTerror,1);
    assert.equal(p.after.board.hel.sPrep,1);
    assert.equal(p.after.tracks.pol,8);
    assert.equal(p.after.tracks.rC,2);
    assert.equal(p.after.tracks.m,card===12?2:5);
  }
});

test('#5, #6, #9: largest Population receives the shift; the Election also places an enemy Cell',()=>{
  for(const card of [5,6,9]) {
    const g=turn(card,'s',['r'],1);
    const p=bot(g);
    assert.equal(p.after.board.hel.support,1);
    assert.equal(p.after.actions[0].action,'event');
    assert.equal(SPACE_IDS.reduce((n,id)=>n+p.after.board[id].rI+p.after.board[id].mI,0),Number(card===6));
  }
});

test('#7 and §5.1: place the Moderates Cell first and wait for a human Reds placement before the cube',()=>{
  const g=turn(7,'m',['r'],1);
  Object.assign(g.board.tam,{mI:1,network:1});
  g.board.hel.support=2;
  g.rng=seedFor(3);
  const p=bot(g);
  assert.deepEqual(bot(g),p);
  assert.equal(g.board.tam.mI,1);
  assert.equal(p.after.board.tam.mI,2);
  assert.equal(p.after.tracks.sC,0);
  assert.equal(p.after.actions.length,0);
  assert.equal(p.after.interrupt.f,'r');
  const saved=decode(encodeCampaign(newCampaign('Pending Manifesto',p.after))).campaigns[0].game;
  assert.throws(()=>resolve(saved,{space:'hel'}),/Support|choose/i);
  const after=resolve(saved,{space:'ham'});
  assert.equal(after.board.ham.rI,1);
  assert.equal(after.tracks.sC,1);
  assert.deepEqual(after.actions,[{f:'m',action:'event'}]);
});

test('#10: require two Available Moderates Cells and respect Active Support',()=>{
  const g=turn(10,'m',['r'],1);
  g.board.hel.support=2;
  g.board.vaa.mI=4;
  const p=bot(g);
  assert.equal(p.after.actions[0].action,'event');
  assert.equal(pools(p.after).m,0);
  assert.equal(p.after.board.hel.mI,0);
  g.board.vaa.mI++;
  assert.notEqual(bot(g).after.actions[0].action,'event');
});
test('#10: spread two Cells by Rally priority, or use the sole legal space twice',()=>{
  const g=turn(10,'m',['r'],1);
  Object.assign(g.board.tam,{mI:2,network:1});
  const spread=bot(g).after;
  assert.equal(spread.board.tam.mI,3);
  assert.equal(pools(spread).m,2);
  for(const id of SPACE_IDS.filter(id=>id!=='tam')) g.board[id].support=2;
  const sameSpace=bot(g).after;
  assert.equal(sameSpace.board.tam.mI,4);
  assert.equal(pools(sameSpace).m,2);
});

test('#11: reroll 5 against bot Senate, but apply German +1 against a human Senate',()=>{
  const bothBots=turn(11,'r',['m'],1);
  bothBots.rng=seedFor(5,3);
  const first=bot(bothBots);
  assert.equal(first.after.tracks.sV,2);
  assert.equal(first.after.tracks.rV,3);
  assert(first.log.some(line=>line.includes('reroll')));
  const senate=turn(11,'r',['s'],1);
  senate.rng=seedFor(5,3);
  assert.equal(bot(senate).after.tracks.sV,4);
  senate.rng=seedFor(6);
  assert.notEqual(bot(senate).after.actions[0].action,'event');
});

test('#12: Publish at a four-Resource yield; below four, use a free Limited Command',()=>{
  const g=turn(12,'m',['s'],1);
  g.tracks.m=0;
  Object.assign(g.board.hel,{person:true,mI:2});
  g.board.tam.mI=1;
  const p=bot(g);
  assert.equal(p.after.tracks.m,4);
  assert.equal(p.after.board.hel.mA,1);
  assert.equal(p.after.actions[0].action,'event');
  g.board.tam.mI=0;
  const low=bot(g);
  assert.equal(low.after.tracks.m,0);
  assert(low.log.some(line=>line.includes('free Limited Command')));
});

test('#13: use a single Active Cell if it gains Town control, otherwise use two when necessary',()=>{
  const g=turn(13,'r',['m'],1);
  Object.assign(g.board.hel,{rI:1,sI:1});
  const p=bot(g);
  assert.equal(p.after.board.hel.rA,1);
  assert.equal(p.after.board.hel.rI,1);
  assert.equal(p.after.tracks.m,2);
  g.board.hel.sI=2;
  g.board.hel.support=1;
  for(const id of ['tam','tur','vii','vaa']) g.board[id].support=2;
  const q=bot(g);
  assert.equal(q.after.board.hel.rA,0);
  assert.equal(q.after.board.hel.rI,3);
});
test('#13: Town Population outranks the preference for one Active Cell',()=>{
  const g=turn(13,'r',['m'],1);
  g.board.hel.sI=1;
  const p=bot(g).after;
  assert.equal(p.board.hel.rI,2);
  assert.equal(p.board.tam.rA,0);
  assert.equal(score(p).redPop,2);
});

test('#18: Senate chooses Mikkelin, including recruitment only when already Active Support and only in Phase I',()=>{
  const g=turn(18,'s',['r'],1);
  const a=bot(g).after;
  assert.equal(a.board.mik.support,1);
  assert.equal(a.board.mik.sI,0);
  g.board.mik.support=2;
  const b=bot(g).after;
  assert.equal(b.board.mik.sI,2);
  g.phase=2;
  assert.notEqual(bot(g).after.actions[0].action,'event');
});

test('#20: a legal removal that gains Control outranks a last opposing Cell or Prepared elsewhere',()=>{
  const g=turn(20,'r');
  Object.assign(g.board.hel,{rI:2,sI:2,sPrep:1});
  Object.assign(g.board.tam,{rI:1,sI:1,sPrep:1});
  const p=bot(g).after;
  assert.equal(control(p.board.hel),'r');
  assert.equal(p.board.hel.sI,1);
  assert.equal(p.board.tam.sPrep,1);
  g.board.hel.rI=0;
  g.board.tam.sPrep=0;
  const q=bot(g).after;
  assert.equal(q.board.tam.sI,0);
  assert.equal(q.board.hel.sPrep,1);
});

test('#21: an Administration may come from Active Opposition when Available is empty',()=>{
  const g=turn(21,'r');
  for(const id of ['hel','tam','tur']) g.board[id].admin=1;
  Object.assign(g.board.hel,{rI:1,support:-2});
  g.board.tam.support=-2;
  Object.assign(g.board.uus,{rI:1,support:1});
  Object.assign(g.board.kar,{rI:1,support:-1});
  const p=bot(g).after;
  assert.equal(p.board.hel.admin,0);
  assert.equal(p.board.uus.admin,1);
  assert.equal(p.board.uus.rI,1);
  assert.equal(p.board.kar.admin,0);
  assert.equal(p.board.tam.admin,1);
  assert.equal(control(p.board.hel),'r');
  g.board.hel.rI=0;
  assert.notEqual(bot(g).after.actions[0].action,'event');
});

test('#24 and §2.4.1: bot removes Senate and Prepared in Helsinki first, then capabilities and Phase II',()=>{
  const g=turn(24,'s',['s'],1);
  g.stage='revolt';
  g.held.r=['train'];
  Object.assign(g.board.hel,{rI:1,sI:2,sPrep:1});
  Object.assign(g.board.tam,{rI:3,sI:1});
  const a=preview(g,{type:'revolt'}).after;
  assert.equal(a.interrupt,null);
  assert.equal(a.revoltStep,'caps');
  assert.equal(a.board.hel.sI,0);
  assert.equal(a.board.hel.sPrep,0);
  assert.equal(a.board.tam.sI,1);
  assert.equal(a.phase,1);
  const b=preview(a,{type:'revolt'}).after;
  assert.equal(b.phase,2);
  assert.deepEqual(b.board.tam.caps.r,['train']);
});

test('#25: Senate requires a Russian Troop with both factions; Reds must remove human Senate Town Control',()=>{
  const g=turn(25,'s',['r']);
  Object.assign(g.board.vii,{sI:1,rI:1,u:2});
  Object.assign(g.board.hel,{sI:1,u:1});
  const p=bot(g).after;
  assert.deepEqual([p.board.vii.u,p.board.vii.sI,p.board.hel.u,p.tracks.rV],[0,3,1,3]);
  const red=turn(25,'r',['s']);
  Object.assign(red.board.hel,{sA:1,sI:2,rI:1,u:1,sPrep:1});
  const q=bot(red).after;
  assert.equal(q.board.hel.sA,0);
  assert.equal(q.board.hel.sI,1);
  assert.equal(q.board.hel.sPrep,1);
  assert.equal(control(q.board.hel),null);
  red.humans=['m'];
  assert.notEqual(bot(red).after.actions[0].action,'event');
});

test('#27: reach a qualifying Capability target, preserve populated origin Control, then roll the Attack',()=>{
  const g=turn(27,'r',['s']);
  Object.assign(g.board.uus,{rI:4,rA:1,mI:1,u:1});
  Object.assign(g.board.hel,{sI:2,caps:{r:[],s:['train']}});
  g.board.ham.sI=3;
  g.rng=seedFor(2);
  const p=bot(g);
  assert.equal(p.after.actions[0].action,'event');
  assert.equal(control(p.after.board.uus),'r');
  assert.equal(p.after.board.uus.rA,1);
  assert.equal(p.after.board.uus.rI,1);
  assert.equal(p.after.board.hel.sI,0);
  assert.equal(p.after.tracks.sPow,1);
  assert(p.log.some(line=>line.includes('Attack in Helsinki')));
});

test('#28 and §6.5.1: resume a human prisoner decision before tallying Polarization and rolling Resources',()=>{
  const g=turn(28,'m',['r']);
  Object.assign(g.tracks,{m:12,pol:5,rPow:2,sPow:3});
  g.rng=seedFor(4);
  const p=bot(g);
  assert.equal(p.after.interrupt.kind,'prisoners');
  assert.equal(p.after.interrupt.f,'r');
  assert.equal(p.after.rng,g.rng);
  assert.equal(p.after.actions.length,0);
  const saved=decode(encodeCampaign(newCampaign('Pending Hennala',p.after))).campaigns[0].game;
  const q=resolve(saved,{count:1});
  assert.deepEqual([q.tracks.rPow,q.tracks.sPow,q.tracks.pol,q.tracks.m],[2,2,7,16]);
  assert.deepEqual(q.actions,[{f:'m',action:'event'}]);
  assert.equal(q.roundStep,undefined);
  assert.throws(()=>resolve(q,{count:1}),/unavailable/);
});

test('#29: Senate Rallies at the origin with the most Support before the March',()=>{
  const g=turn(29,'s',['r']);
  g.board.uus.support=2;
  g.board.hel.rI=1;
  g.board.kar.sI=2;
  const p=bot(g);
  assert.equal(p.after.actions[0].action,'event');
  assert.equal(control(p.after.board.hel),'s');
  assert.equal(p.after.board.kar.sI,2);
  assert(p.log.findIndex(line=>line.includes('Rally'))<p.log.findIndex(line=>line.includes('March')));
});

test('#32: gate on Polarization six and round the reduction up; place one Cell',()=>{
  const g=turn(32,'m',['r']);
  g.tracks.pol=6;
  g.board.hel.mI=1;
  g.board.hel.person=true;
  g.rng=seedFor(5);
  const p=bot(g).after;
  assert.equal(p.board.hel.mI,2);
  assert.equal(p.tracks.pol,3);
  g.tracks.pol=5;
  assert.notEqual(bot(g).after.actions[0].action,'event');
});

test('#34 and #38: Crackdown may remove human Reds Opposition, with no effect outside Senate Control',()=>{
  for(const card of [34,38]) {
    const g=turn(card,'s',['r']);
    Object.assign(g.board.ham,{sA:2,rI:1,support:-1});
    Object.assign(g.board.hel,{sA:1,rI:2,support:-2});
    const p=bot(g).after;
    assert.equal(p.board.ham.support,0);
    assert.equal(p.board.ham.sTerror,1);
    assert.equal(p.board.hel.support,-2);
    assert.equal(p.actions[0].action,'event');
  }
});

test('#35: making Opposition outranks reducing Support; favor a space without an Administration within equal gain',()=>{
  const g=turn(35,'r');
  Object.assign(g.board.hel,{support:2});
  for(const id of SPACE_IDS.filter(id=>id!=='hel')) g.board[id].support=-2;
  g.board.tam.support=0; g.board.tam.admin=1;
  g.board.tur.support=0;
  const p=bot(g).after;
  assert.equal(p.board.tur.support,-1);
  assert.equal(p.board.tam.support,0);
  assert.equal(p.board.hel.support,2);
});

test('#36: release non-player prisoners first at Polarization 6 or 7 and Resources below 15',()=>{
  const g=turn(36,'m',['r']);
  Object.assign(g.tracks,{rPow:2,sPow:2,pol:7,m:14});
  const p=bot(g).after;
  assert.deepEqual([p.tracks.rPow,p.tracks.sPow,p.tracks.pol,p.tracks.m],[2,0,5,16]);
  g.tracks.pol=8;
  assert.notEqual(bot(g).after.actions[0].action,'event');
});

test('#37: Pass for increasing Opposition only, and the target must contain a Senate piece',()=>{
  const g=turn(3,'r',['s'],2,37);
  g.board.hel.support=1;
  g.board.hel.sI=1;
  assert.equal(bot(g).after.reserved,null);
  g.board.hel.support=0;
  assert.deepEqual(bot(g).after.reserved,{f:'r',card:37});
  g.current=37; g.upcoming=3;
  const p=bot(g).after;
  assert.equal(p.board.hel.support,-1);
  assert.equal(p.board.tam.support,0);
});

test('#39 and #45: Moderates reserve a threatened Issue then open with Limited to close the Event box',()=>{
  for(const card of [39,45]) {
    const g=turn(3,'m',['r'],2,card);
    g.issues[0]='r'; g.tracks.rIssue=1;
    g.board.hel.mI=1;
    assert.deepEqual(bot(g).after.reserved,{f:'m',card});
    g.current=card; g.upcoming=3; g.reserved={f:'m',card};
    const p=bot(g).after;
    assert.equal(p.issues[0],'r');
    assert.deepEqual(p.actions,[{f:'m',action:'limited'}]);
    assert.equal(p.reserved,null);
    g.issues[0]=null; g.tracks.rIssue=0; g.current=3; g.upcoming=card; g.reserved=null;
    assert.equal(bot(g).after.reserved,null);
  }
});
test('#39 and #45: Moderates protect the Issue and Pass when their Limited cards are all ineffective',()=>{
  for(const card of [39,45]) {
    const g=turn(card,'m',['r'],2,3);
    g.issues[0]='r';
    g.tracks.rIssue=1;
    g.tracks.mOut=6;
    g.reserved={f:'m',card};
    const plan=bot(g);
    assert.deepEqual(plan.after.actions,[{f:'m',action:'pass'}]);
    assert.equal(plan.after.issues[0],'r');
    assert(plan.log.some(line=>line.includes('No Moderates card can close')));
  }
});

test('#40: use the special casualty cap while keeping the §3.2.4 failure and Engagement rules',()=>{
  const g=turn(40,'s',['r']);
  Object.assign(g.board.tam,{sI:3,rA:1,rI:3,admin:1});
  g.rng=seedFor(4);
  const p=bot(g).after;
  assert.equal(p.actions[0].action,'event');
  assert.deepEqual([p.board.tam.rA,p.board.tam.rI,p.board.tam.admin,p.tracks.rPow],[0,2,1,1]);
  g.rng=seedFor(6);
  const q=bot(g).after;
  assert.equal(q.board.tam.rI,3);
  assert.equal(q.actions[0].action,'event');
});
test('#40: one defender qualifies only if the Event can remove the specified marker',()=>{
  const g=turn(40,'s',['r']);
  Object.assign(g.board.tam,{sI:4,rI:1});
  g.rng=seedFor(2);
  assert.notEqual(bot(g).after.actions[0].action,'event');
  g.board.tam.admin=1;
  const plan=bot(g).after;
  assert.equal(plan.actions[0].action,'event');
  assert.equal(plan.board.tam.admin,0);
});

test('#41: the three-German fallback places Sabotage and removes one Troop without changing Vassalage',()=>{
  const g=turn(41,'r',['s']);
  g.board.uus.g=3; g.tracks.gOut=3;
  const p=bot(g).after;
  assert.equal(p.actions[0].action,'event');
  assert.equal(p.sabotage.length,1);
  assert.equal(p.board.uus.g,2);
  assert.equal(p.tracks.sV,3);
});

test('#42: check a hypothetical 3 without RNG, then maximize Town Population on the real roll',()=>{
  const g=turn(3,'s',['r'],2,42);
  Object.assign(g.board.hel,{sI:1,rI:2});
  Object.assign(g.board.tam,{sI:1,rI:2,support:-1});
  g.board.ham.sI=4;
  const pass=bot(g).after;
  assert.deepEqual(pass.reserved,{f:'s',card:42});
  assert.equal(pass.rng,g.rng);
  g.current=42; g.upcoming=3; g.rng=seedFor(3);
  const p=bot(g).after;
  assert.equal(p.actions[0].action,'event');
  assert.equal(control(p.board.hel),'s');
  assert.equal(control(p.board.tam),'r');
  assert.equal(score(p).senate,2);
  g.rng=seedFor(1);
  assert.equal(score(bot(g).after).senate,0);
});

test('#44: Senate only plays with qualifying Vassalage or roll; Reds Rally at Active Opposition',()=>{
  const s=turn(44,'s',['r']);
  s.tracks.sV=3;
  s.rng=seedFor(4);
  assert.notEqual(bot(s).after.actions[0].action,'event');
  s.rng=seedFor(5);
  assert.equal(bot(s).after.tracks.sV,2);
  const r=turn(44,'r',['s']);
  Object.assign(r.board.hel,{rI:1,support:-2});
  assert.equal(bot(r).after.board.hel.rI,4);
});

test('#45: Senate Passes at four Vassalage or in the last campaign, preserving its German priority',()=>{
  const g=turn(3,'s',['r'],2,45);
  g.tracks.sV=3;
  assert.equal(bot(g).after.reserved,null);
  g.tracks.sV=4;
  assert.deepEqual(bot(g).after.reserved,{f:'s',card:45});
  g.tracks.sV=3; g.round=3;
  assert.deepEqual(bot(g).after.reserved,{f:'s',card:45});
  g.current=45; g.upcoming=3;
  assert.equal(bot(g).after.tracks.sV,1);
});

test('Boxed front, §6.4.2: Senate avoids a partial reduction, Reds skip a partial endgame reduction',()=>{
  const senate=turn(47,'s',['r']);
  senate.stage='propaganda'; senate.round=4; senate.roundStep='agitate-0';
  Object.assign(senate.tracks,{pol:6,sV:3});
  for(const id of ['hel','tam','vii']) senate.board[id].sI=1;
  senate.board.hel.sA=1;
  const p=preview(senate,{type:'propaganda'}).after;
  assert.equal(p.tracks.pol,6);
  assert.equal(p.board.hel.support,2);
  const reds=turn(47,'r',['s']);
  reds.stage='propaganda'; reds.round=4; reds.roundStep='agitate-1';
  Object.assign(reds.tracks,{pol:6,rV:3});
  for(const id of ['hel','tam','tur','vii','vaa','ham']) reds.board[id].support=-2;
  reds.board.hel.admin=1; reds.board.hel.rI=1;
  const before=clone(reds);
  const q=preview(reds,{type:'propaganda'}).after;
  assert.equal(q.tracks.pol,6);
  assert.deepEqual(reds,before);
});
test('Boxed front, §6.4.2: Moderates skip unreachable reductions and shift a chosen space to Neutral',()=>{
  const g=turn(47,'m',['r']);
  g.stage='propaganda'; g.round=4; g.roundStep='agitate-2';
  Object.assign(g.tracks,{pol:4,m:15});
  Object.assign(g.board.hel,{mI:1,support:-2});
  for(const id of ['tam','tur','vii']) g.board[id].support=-2;
  const p=preview(g,{type:'propaganda'}).after;
  assert.deepEqual([p.tracks.pol,p.board.hel.support,score(p).opp],[4,0,6]);
  g.tracks.pol=2;
  const reachable=preview(g,{type:'propaganda'}).after;
  assert.deepEqual([reachable.tracks.pol,reachable.board.hel.support,score(reachable).opp],[1,-2,10]);
});

test('Boxed front, §8.1.9: distribute Trains by group and put Senate Train with Jaeger first',()=>{
  const g=position({humans:['m'],phase:2});
  Object.assign(g.board.vaa,{sI:1,caps:{r:[],s:['officer']}});
  g.board.ham.sI=5;
  assert(placeCapability(g,[],'s','train'));
  assert.deepEqual(g.board.vaa.caps.s,['officer','train']);
  assert(placeCapability(g,[],'s','train'));
  assert.deepEqual(g.board.ham.caps.s,['train']);
  assert(placeCapability(g,[],'s','cannon'));
  assert.deepEqual(g.board.ham.caps.s,['train','cannon']);
});

test('#34 and §5.1: human Senate chooses its free Crackdown during a Reds Event',()=>{
  const g=turn(34,'r',['m','s']);
  Object.assign(g.board.hel,{sA:2,support:-1});
  Object.assign(g.board.ham,{sA:1,support:-1});
  const p=bot(g).after;
  assert.equal(p.interrupt.f,'s');
  assert.equal(p.actions.length,0);
  const q=resolve(p,{space:'ham'});
  assert.equal(q.board.ham.support,0);
  assert.equal(q.board.hel.support,-1);
  assert.deepEqual(q.actions,[{f:'r',action:'event'}]);
  assert.equal(q.tracks.s,g.tracks.s);
});

test('#42 cannot capture a Town by taking the last controlling Cell from another Town',()=>{
  const g=turn(3,'s',['r'],2,42);
  Object.assign(g.board.hel,{sI:1,rI:1});
  g.board.tam.sI=1;
  assert.equal(bot(g).after.reserved,null);
});

test('#42 spends a donor’s spare Cells only once while taking two Towns',()=>{
  const g=turn(42,'s',['r']);
  Object.assign(g.board.hel,{sI:1,rI:2});
  Object.assign(g.board.tam,{sI:1,rI:2});
  g.board.ham.sI=2;
  g.board.mik.sI=2;
  g.rng=seedFor(4);
  const p=bot(g).after;
  assert.deepEqual([p.board.ham.sI,p.board.mik.sI,p.board.hel.sI,p.board.tam.sI],[0,0,3,3]);
  assert.equal(score(p).senate,3);
});
test('#42 leaves Prepared and News protected and avoids stacking extra Capabilities',()=>{
  const g=turn(42,'s',['r']);
  Object.assign(g.board.hel,{sI:1,rI:2});
  g.board.hel.caps.s=['officer','train'];
  Object.assign(g.board.ham,{sI:2,sPrep:1});
  g.board.ham.caps.s=['officer','cannon'];
  g.board.mik.sI=2;
  addNews(g,'mik','s');
  g.rng=seedFor(2);
  const p=bot(g).after;
  assert.equal(p.actions[0].action,'event');
  assert.equal(control(p.board.hel),'s');
  assert.equal(p.board.ham.sPrep,1);
  assert.deepEqual(p.news,g.news);
  assert.deepEqual([p.board.ham.sI,p.board.mik.sI],[1,1]);
  assert.deepEqual(p.board.hel.caps.s,g.board.hel.caps.s);
  assert.deepEqual(p.board.ham.caps.s,g.board.ham.caps.s);
});
test('#42 allocates limited Capability room across donors and ranks equal Town gains by balance',()=>{
  const g=turn(42,'s',['r']);
  Object.assign(g.board.tam,{sI:2,rI:2});
  g.board.tam.caps.s=['officer','train','cannon'];
  Object.assign(g.board.tur,{sI:2,rI:2});
  g.board.tur.caps.s=['officer'];
  g.board.ham.sI=1;
  g.board.ham.caps.s=['cannon'];
  g.rng=seedFor(1);
  const p=bot(g).after;
  assert.equal(p.actions[0].action,'event');
  assert.equal(control(p.board.tur),'s');
  assert.equal(control(p.board.tam),null);
  assert.deepEqual(p.board.tur.caps.s,['officer','cannon']);
  assert.equal(p.board.ham.sI,0);
});
test('#42 cannot empty a donor into an already full group',()=>{
  const g=turn(3,'s',['r'],2,42);
  Object.assign(g.board.hel,{sI:2,rI:2});
  g.board.hel.caps.s=['officer','train'];
  g.board.ham.sI=1;
  g.board.ham.caps.s=['cannon'];
  assert.equal(bot(g).after.reserved,null);
});
test('#42 splits one donor across Towns when their Capability room is limited',()=>{
  const g=turn(42,'s',['r']);
  for(const id of ['hel','tam']) {
    Object.assign(g.board[id],{sI:2,rI:2});
    g.board[id].caps.s=['officer'];
  }
  g.board.ham.sI=2;
  g.board.ham.caps.s=['train','cannon'];
  g.rng=seedFor(2);
  const p=bot(g).after;
  assert.equal(score(p).senate,3);
  assert.deepEqual([p.board.hel.caps.s.length,p.board.tam.caps.s.length,p.board.ham.sI],[2,2,0]);
  assert.deepEqual([p.board.hel.caps.s[1],p.board.tam.caps.s[1]].sort(),['cannon','train']);
});
test('§8.6: equally close Sabotage repairs use their nearer spaces for map ties',()=>{
  const g=turn(3,'s',['r']);
  g.spaceRolls='map';
  g.board.ham.sI=2;
  g.board.ham.caps.s=['train'];
  g.board.uus.sI=1;
  g.board.poh.sI=1;
  g.sabotage=['hel/uus','oul/poh'];
  g.rng=seedFor(2,6);
  const log=[];
  assert.equal(prepare(g,'s',log,{repairOnly:true}),true);
  assert.deepEqual(g.sabotage,['hel/uus']);
  assert(log.some(line=>line.includes('Random Spaces Map · 26')));
});

test('#41: the Senate Attack branch keeps German Troops outside its selected defending faction',()=>{
  const g=turn(41,'r',['s']);
  Object.assign(g.board.uus,{rI:3,sI:3,g:3});
  g.tracks.gOut=3;
  g.sabotage=['ham/tam','hel/uus','kar/vii','poh/vaa'];
  g.rng=seedFor(3);
  const p=bot(g).after;
  assert.deepEqual([p.board.uus.sI,p.board.uus.g,p.tracks.sPow],[0,3,1]);
  assert.equal(p.sabotage.length,4);
});

test('#45: a last-campaign Senate still has a legal shift at German Vassalage zero',()=>{
  const g=turn(3,'s',['r'],2,45);
  Object.assign(g.tracks,{sV:0,rV:3});
  g.round=3;
  assert.deepEqual(bot(g).after.reserved,{f:'s',card:45});
  g.current=45; g.upcoming=3;
  assert.equal(bot(g).after.tracks.rV,1);
});
