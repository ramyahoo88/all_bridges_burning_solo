import {BORDERS, NAME, NEAR, SPACE_IDS, TOWNS, distance, pop, spaceName, town} from './data.js';
import {adjustResource, capacity, cells, clamp, cleanSpace, control, human, newsAt, personality, pools} from './model.js';
import {battleStrength, cubeColor, engage, placeCells, putCube, rallyPlace, removeCells, travel} from './actions.js';
import {chooseSpaceRanked, pick, roll} from './random.js';
import {botAttack, botTerror, eventMarch} from './bot-operations.js';
import {botRally, crackdown, crackdownSpaces, nearest, placeRanked, publish} from './bot-rally.js';
import {autoEvent} from './events.js';
import {clearIssue, prisonerStep, startPolitics} from './rounds.js';
import {canRedeploy, redeploy} from './event-redeploy.js';
import {opening, options} from './sequence.js';

const oneStep=(g,log,choices,direction,rank,label)=>{
  const id=placeRanked(g,choices.filter(id=>g.board[id].support*direction<2),rank,log,label);
  if(id) g.board[id].support+=direction;
  return Boolean(id);
};
const shiftPriority=(g,f,log)=>oneStep(g,log,SPACE_IDS.filter(id=>f==='r'||pop(id)>0),f==='r'?-1:1,
  id=>[-pop(id)],'Prefer the highest Population for '+(f==='r'?'Opposition':'Support'));
const placedChange=(b,f,n)=>({...b,[f+'I']:b[f+'I']+n});
const countPopulation=(places,board,f)=>places.reduce((n,id)=>n+(control(board[id])===f?pop(id):0),0);
const issuesResolved=g=>g.issues.some(Boolean);
const manifestSpaces=g=>SPACE_IDS.filter(id=>g.board[id].support<2);
const hasReds=b=>cells(b,'r')>0||b.admin>0;
const oppositionSites=g=>SPACE_IDS.filter(id=>pop(id)>0&&cells(g.board[id],'s')&&[-1,0].includes(g.board[id].support));
const canProtectIssue=(g,f,id)=>f==='m'&&[39,45].includes(id)&&issuesResolved(g);
const allowedSenateFate=g=>g.round>=3||g.tracks.sV>=4;

export function passForEvent(g,f,id) {
  if(id===37&&f==='r') return oppositionSites(g).length>0;
  if(id===42&&f==='s') return canRedeploy(g);
  if(id===45&&f==='s') return allowedSenateFate(g)&&g.tracks.sV+g.tracks.rV>0;
  if(f==='m'&&[39,45].includes(id)) return canProtectIssue(g,f,id);
  return true;
}
export const shouldBlockEvent=(g,f,id)=>canProtectIssue(g,f,id)&&!opening(g)&&options(g).includes('limited');

function election(g,f,log) {
  const enemies=(f==='r'?['s']:['r']).concat('m');
  const available=pools(g), isShift=SPACE_IDS.some(id=>(f==='r'||pop(id)>0)&&g.board[id].support*(f==='r'?-1:1)<2);
  const choices=TOWNS.flatMap(id=>enemies.filter(side=>available[side]>0).map(side=>({id,side})));
  if(!isShift&&!choices.length) return false;
  const enemy=f==='r'?'s':'r';
  const choice=chooseSpaceRanked(g,choices,({id,side})=>{
    const b=g.board[id], before=control(b), after=control(placedChange(b,side,1));
    return [Number(before===f&&after!==f),-Number(before===enemy&&after!==enemy)*pop(id),Number(after===enemy&&before!==enemy)];
  },log,'#6 · Place an Available enemy Cell while preserving friendly Control',x=>NAME[x.side]+' in '+spaceName(x.id),x=>x.id);
  if(choice) placeCells(g,choice.id,choice.side,1);
  shiftPriority(g,f,log);
  return true;
}
function manifest(g,log) {
  const available=pools(g), spaces=manifestSpaces(g);
  if(available.rC+available.sC===0) return false;
  const id=available.m&&placeRanked(g,spaces,site=>{
    const b=g.board[site];
    return [b.person||b.network?0:cells(b,'m')?1:pop(site)>0?2:3,-cells(b,'m')];
  },log,'#7 · Place the Moderates Cell by Network, Personality, or other Moderates');
  if(id) placeCells(g,id,'m',1);
  if(available.r&&spaces.length) {
    if(human(g,'r')) {
      g.interrupt={kind:'event-choice',event:7,f:'r',title:'#7 We Demand · Reds choose a Cell placement'};
      return true;
    }
    botRally(g,'r',48,1,log,{spaces,placement:1});
  }
  const cube=placePoliticalCube(g,log);
  return Boolean(id||available.r&&spaces.length||cube);
}
function placePoliticalCube(g,log) {
  if(g.issues.every(Boolean)||!putCube(g,cubeColor(g,log))) return false;
  log.push('Place one cube using the Non-player Moderates Politics card.');
  return true;
}
export function eventChoiceSpaces(g) {
  const p=g.interrupt;
  if(p.event===7) return pools(g).r?manifestSpaces(g):[];
  return crackdownSpaces(g);
}
export function finishEventChoice(g,log,intent) {
  const {event}=g.interrupt, spaces=eventChoiceSpaces(g);
  if(spaces.length&&!spaces.includes(intent.space)) throw Error('Choose an eligible space.');
  if(event===7) {
    if(spaces.length) {
      placeCells(g,intent.space,'r',1);
      log.push('Human Reds place one Cell in '+spaceName(intent.space)+'.');
    }
    placePoliticalCube(g,log);
  } else if(spaces.length) crackdown(g,log,intent.space);
  g.interrupt=null;
}
function lenin(g,log) {
  let die=roll(g,log,'#11 · Choose Vassalage effect');
  while(die===5&&!human(g,'s')) {
    log.push('#11 · Senate is a bot; reroll the 5.');
    die=roll(g,log,'#11 · Choose Vassalage effect');
  }
  if(die===6) return false;
  const key=die<=2?'rV':'sV', was=g.tracks[key];
  g.tracks[key]=clamp(was+(die===3||die===4?-1:1),0,6);
  if(was!==g.tracks[key]) log.push('#11 · '+(key==='rV'?'Russian':'German')+' Vassalage '+was+' → '+g.tracks[key]+'.');
  return was!==g.tracks[key];
}
function joblessness(g,f,log) {
  const count=pools(g)[f];
  if(!count) return false;
  const legal=TOWNS.filter(id=>g.board[id].support!==(f==='r'?2:-2)&&control(g.board[id])!==f);
  const gains=legal.map(id=>({id,n:control(placedChange(g.board[id],f,1))===f?1:2}))
    .filter(({id,n})=>n<=count&&control(placedChange(g.board[id],f,n))===f);
  const target=chooseSpaceRanked(g,gains,({id,n})=>[-pop(id),n],log,'#13 · Maximize Town Population, then prefer one Active Cell',
    ({id})=>spaceName(id),({id})=>id);
  if(!target) return false;
  placeCells(g,target.id,f,target.n,target.n===1);
  adjustResource(g,'m',-3);
  return true;
}
function removable(g,id,side,tokoiActor=null) {
  const b=g.board[id], count=cells(b,side);
  if(count!==1) return count>0;
  if(side==='m'?b.person&&!tokoiActor:b[side+'Prep']||b.caps[side].length) return false;
  if(!newsAt(g,id,side).length) return true;
  return side==='m'&&tokoiActor!==null&&cells(b,tokoiActor)>0;
}
function tokoi(g,f,log) {
  const enemy=f==='r'?'s':'r', choices=[];
  for(const id of TOWNS) {
    const b=g.board[id];
    if(b[enemy+'Prep']) choices.push({id,key:enemy+'Prep',rank:[1,0,0]});
    for(const side of [enemy,'m']) {
      if(!removable(g,id,side,f)) continue;
      const key=side+(side==='m'?(b.mI?'I':'A'):(b[side+'A']?'A':'I'));
      const gain=control(b)!==f&&control({...b,[key]:b[key]-1})===f;
      if(gain||side===enemy&&cells(b,side)===1) choices.push({id,key,rank:[gain?0:1,-pop(id)*Number(gain),-Number(key===enemy+'A'||key==='mI')]});
    }
  }
  const c=chooseSpaceRanked(g,choices,x=>x.rank,log,'#20 · Gain Control or remove the last opposing Cell or Prepared',
    x=>spaceName(x.id),x=>x.id);
  if(!c) return false;
  g.board[c.id][c.key]--;
  cleanSpace(g,c.id,{reason:'event-ransom',actor:f});
  return true;
}
function workersHalls(g,log) {
  const donorSites=SPACE_IDS.filter(id=>{
    const b=g.board[id];
    return b.admin&&b.support===-2&&(control(b)!=='r'||control({...b,admin:b.admin-1})==='r');
  });
  const available=pools(g).admin;
  if(!available&&!donorSites.length) return false;
  const id=placeRanked(g,SPACE_IDS.filter(id=>!town(id)&&cells(g.board[id],'r')&&!g.board[id].admin&&capacity(g.board[id])>0),
    id=>[-g.board[id].support],log,'#21 · Province with Reds Cells and least Opposition');
  if(!id) return false;
  if(!available) {
    const donor=placeRanked(g,donorSites,()=>[],log,'#21 · Relocate an Administration from Active Opposition');
    g.board[donor].admin--;
  }
  g.board[id].admin++;
  return true;
}
function disarm(g,f,log) {
  if(f==='s') {
    const available=pools(g).s;
    if(!available) return false;
    const id=placeRanked(g,SPACE_IDS.filter(id=>{
      const b=g.board[id];
      return b.u&&hasReds(b)&&cells(b,'s');
    }),id=>{
      const b=g.board[id];
      return [-Number(control(b)!=='s'&&control(placedChange(b,'s',Math.min(b.u,available)))==='s'),-b.u];
    },log,'#25 · Replace Russian Troops where Reds and Senate coexist');
    if(!id) return false;
    const b=g.board[id], troops=b.u;
    const replaced=placeCells(g,id,'s',troops);
    // Once the aid's replacement gate is met, §1.4.2 removes any troops without a replacement.
    b.u=0;
    if(replaced<troops) log.push('#25 · Return '+(troops-replaced)+' additional Russian Troop(s) to Available (§1.4.2).');
    return true;
  }
  if(!human(g,'s')) return false;
  const legal=SPACE_IDS.filter(id=>g.board[id].u&&removable(g,id,'s'));
  const choices=legal.flatMap((id,i)=>[
    {id,sites:[id]},
    ...legal.slice(i).filter(other=>other!==id||cells(g.board[id],'s')>1&&removableAfterOne(g,id)).map(other=>({id,sites:[id,other]}))
  ]);
  const before=countPopulation(TOWNS,g.board,'s');
  for(const choice of choices) {
    const board={...g.board};
    for(const id of choice.sites) {
      const b=board[id], key=b.sA?'sA':'sI';
      board[id]={...b,[key]:b[key]-1};
    }
    choice.loss=before-countPopulation(TOWNS,board,'s');
  }
  const selected=chooseSpaceRanked(g,choices.filter(x=>x.loss>0),x=>[-x.loss,-x.sites.length],log,
    '#25 · Remove human Senate Town Population Control',x=>x.sites.map(spaceName).join(' and '),x=>x.id);
  if(!selected) return false;
  for(const id of selected.sites) {
    removeCells(g,id,'s',1);
    cleanSpace(g,id,{reason:'event',actor:f});
  }
  return true;
}
function removableAfterOne(g,id) {
  const b=g.board[id];
  return cells(b,'s')>2||!b.sPrep&&!b.caps.s.length&&!newsAt(g,id,'s').length;
}
function majorOffensive(g,f,log) {
  if(g.phase!==2) return false;
  if(f==='s') return botAttack(g,f,1,log,{boost:2,local:true})>0;
  const candidates=SPACE_IDS.filter(id=>pop(id)>0&&(g.board[id].caps.s.length||cells(g.board[id],'s')>=3));
  const byTarget=candidates.flatMap(to=>{
    const moves=NEAR[to].map(from=>eventMarch(g,'r',from,to)).filter(Boolean);
    if(cells(g.board[to],'r')) moves.push({to,from:to,count:0});
    return moves;
  });
  const plan=chooseSpaceRanked(g,byTarget,x=>[-Number(g.board[x.to].caps.s.length>0),-cells(g.board[x.to],'s'),-x.count],log,
    '#27 · Reach a populated space with a Senate Capability or largest Senate group',
    x=>x.count?spaceName(x.from)+' → '+spaceName(x.to):spaceName(x.to),x=>x.to);
  if(!plan) return false;
  const id=plan.to;
  if(plan.count) travel(g,'r',plan.from,id,plan);
  const b=g.board[id];
  engage(g,log,{f:'r',id,defenders:['s'],attackCount:cells(b,'r'),russians:b.u,boost:2});
  return true;
}

export function hennala(g,log,from='r') {
  if(g.phase===2) {
    for(const f of from==='r'?['r','s']:from==='s'?['s']:[]) {
      if(prisonerStep(g,f,log,28)) return true;
    }
    const n=Math.floor((g.tracks.rPow+g.tracks.sPow)/2);
    g.tracks.pol=clamp(g.tracks.pol+n,0,10);
    log.push('#28 · Remaining prisoners add '+n+' Polarization before the Resources effect.');
  }
  const rollValue=roll(g,log,'#28 · Add Resources to Moderates');
  adjustResource(g,'m',rollValue);
  return true;
}
function warNames(g,f,log) {
  if(f==='m') {
    if(g.tracks.pol<6) return false;
    botRally(g,'m',60,1,log,{free:true});
    g.tracks.pol--;
    return true;
  }
  const available=pools(g).s;
  if(g.phase!==2||!available) return false;
  const targets=SPACE_IDS.filter(id=>pop(id)>0&&control(g.board[id])!=='s');
  const pairs=targets.flatMap(to=>NEAR[to].map(from=>({from,to})));
  const p=chooseSpaceRanked(g,pairs,x=>[-pop(x.to),-Number(town(x.to)),-g.board[x.from].support],log,
    '#29 · Highest Population without Senate Control, then Town and most Support at the Rally origin',
    x=>spaceName(x.from)+' → '+spaceName(x.to),x=>x.to);
  if(!p) return false;
  const recruited=rallyPlace(g,p.from,'s',{free:true});
  log.push('#29 · Free Rally places '+recruited+' Senate Cells in '+spaceName(p.from)+'.');
  const move=eventMarch(g,'s',p.from,p.to);
  travel(g,'s',move.from,move.to,move);
  log.push('#29 · Free March moves '+move.count+' Senate Cells to '+spaceName(move.to)+'.');
  return true;
}
function arrest(g,f,log,side) {
  if(f==='m'&&side==='dark') return botRally(g,'m',60,1,log,{free:true})>0;
  if(f==='m') return false;
  if(human(g,'m')) {
    const id=personality(g);
    if(id) {
      g.board[id].person=false;
      adjustResource(g,'m',-3);
      log.push('#34 · Remove the human Moderates Personality in '+spaceName(id)+' and reduce Resources.');
      return true;
    }
    if(human(g,'s')&&crackdownSpaces(g).length) {
      g.interrupt={kind:'event-choice',event:34,f:'s',title:'#34 Political Arrests · Senate chooses a Crackdown space'};
      return true;
    }
    return crackdown(g,log);
  }
  return human(g,'r')&&crackdown(g,log);
}
function homeFront(g,f,log) {
  if(f==='m') return botRally(g,'m',60,2,log,{free:true})>0;
  return oneStep(g,log,SPACE_IDS.filter(id=>pop(id)>0),-1,id=>{
    const b=g.board[id];
    return [Number(b.support>0),-pop(id),Number(b.support<=0&&b.admin>0)];
  },'#35 · Create Opposition first, then remove Support');
}
function prisonerReconciliation(g,log) {
  if(g.tracks.m>=15||![6,7].includes(g.tracks.pol)||g.tracks.rPow+g.tracks.sPow===0) return false;
  for(let i=0;i<2;i++) {
    const sides=['r','s'].filter(f=>g.tracks[f+'Pow']);
    const nonPlayer=sides.filter(f=>!human(g,f));
    const f=pick(g,nonPlayer.length?nonPlayer:sides);
    if(!f) break;
    g.tracks[f+'Pow']--;
    g.tracks.pol--;
    adjustResource(g,'m',1);
    log.push('#36 · Return one '+NAME[f]+' prisoner to Available.');
  }
  return true;
}
function vato(g,f,log) {
  if(f==='r') {
    if(oneStep(g,log,oppositionSites(g),-1,id=>[-pop(id)],'#37 · Increase Opposition in a populated Senate space')) return true;
    if(!human(g,'s')) return false;
    return oneStep(g,log,SPACE_IDS.filter(id=>pop(id)>0&&cells(g.board[id],'s')&&g.board[id].support>0),-1,
      id=>[-pop(id),distance('hel',id)],'#37 · Reduce human Senate Support, then closest to Helsinki');
  }
  if(g.board.hel.support===0&&cells(g.board.hel,'s')) return oneStep(g,log,['hel'],1,()=>[],'#37 · Shift neutral Helsinki toward Support');
  return oneStep(g,log,SPACE_IDS.filter(id=>pop(id)>0&&cells(g.board[id],'s')&&g.board[id].support<0),1,id=>[-pop(id)],
    '#37 · Reduce most Opposition in a populated Senate space');
}
function removeIssue(g,log) {
  const i=pick(g,g.issues.map((side,index)=>side?index:null).filter(index=>index!==null));
  if(i===undefined) return false;
  clearIssue(g,i);
  log.push('Remove the Resolved Issue marker from slot '+(i+1)+'.');
  return true;
}
function parliament(g,f,log) {
  if(f!=='m') return human(g,'m')&&removeIssue(g,log);
  if(g.reserved?.card===39&&g.reserved.f==='m'&&issuesResolved(g)) return false;
  const id=pools(g).network&&placeRanked(g,SPACE_IDS.filter(id=>!g.board[id].network&&capacity(g.board[id])>0),id=>{
    const b=g.board[id];
    return [-Number(pop(id)>0&&control(b)&&!control({...b,network:b.network+1}))*pop(id),-pop(id)];
  },log,'#39 · Place a Network, prioritizing Uncontrolled Population');
  if(!id) return false;
  g.board[id].network++;
  return true;
}
function fate(g,log) {
  if(!allowedSenateFate(g)) return false;
  const power=g.tracks.sV>0?'s':'r';
  return autoEvent(g,'s',45,'light',log,{power});
}
function tampere(g,f,log) {
  if(g.phase!==2) return false;
  const enemy=f==='r'?'s':'r', choices=[];
  for(const id of ['tam','ham']) {
    const b=g.board[id], friendly=cells(b,f), foes=cells(b,enemy);
    if(!friendly||!foes&&!(f==='s'&&b.admin)) continue;
    const russian=f==='r'?b.u:0;
    const strength=battleStrength(g,{f,id,defenders:[enemy],attackCount:friendly,russians:russian});
    const cap=Math.ceil(friendly/2), possible=Math.min(cap,5,strength);
    const marker=f==='r'?b.caps.s.length>0&&possible>=foes:b.admin>0&&possible>foes;
    if(possible>=2&&foes>=2||marker) choices.push({id,cap,friendly,russian,possible,marker,foes});
  }
  const c=chooseSpaceRanked(g,choices,x=>[-Number(x.marker),-Math.min(x.possible,x.foes),-pop(x.id)],log,
    '#40 · Attack only with a qualifying casualty or marker outcome',x=>spaceName(x.id),x=>x.id);
  if(!c) return false;
  log.push('#40 · Casualties capped at '+c.cap+' by the Event.');
  engage(g,log,{f,id:c.id,defenders:[enemy],attackCount:c.friendly,russians:c.russian,casualtyLimit:c.cap});
  return true;
}
function lahti(g,log) {
  const b=g.board.uus, attack=g.phase===2&&cells(b,'s')>=3&&cells(b,'r')>0;
  if(!attack&&b.g<3) return false;
  if(pools(g).sabotage) {
    const trains=SPACE_IDS.filter(id=>g.board[id].caps.s.includes('train'));
    const edge=placeRankedSabotage(g,trains,log);
    if(edge) g.sabotage.push(edge);
  }
  if(attack) engage(g,log,{f:'r',id:'uus',defenders:['s'],attackCount:cells(b,'r'),russians:b.u,boost:2});
  else {
    b.g--;
    log.push('#41 · Remove one of at least three German Troops in Uusimaa.');
  }
  return true;
}
function placeRankedSabotage(g,trains,log) {
  const choices=BORDERS.filter(edge=>!g.sabotage.includes(edge)).map(edge=>{
    const ends=edge.split('/');
    const measures=ends.map(id=>trains.length?nearest(id,trains):distance(id,'uus'));
    const i=Number(measures[1]<measures[0]);
    return {edge,id:ends[i],measure:measures[i]};
  });
  return chooseSpaceRanked(g,choices,x=>[x.measure],log,'#41 · Place Sabotage closest to a Senate Train, or Uusimaa',
    x=>x.edge.split('/').map(spaceName).join(' / '),x=>x.id)?.edge;
}
function parade(g,f,log) {
  if(f==='s') {
    if(g.tracks.sV<3||g.tracks.sV===3&&roll(g,log,'#44 · German Vassalage 3 needs 5 or 6')<5) return false;
    log.push('#44 · German Vassalage qualifies for the parade.');
    return autoEvent(g,f,44,'light',log);
  }
  const b=g.board.hel;
  if(b.support>-2&&hasReds(b)) {
    b.support--;
    log.push('#44 · Shift Helsinki toward Opposition.');
    return true;
  }
  log.push('#44 · Check the free Helsinki Rally.');
  return botRally(g,'r',48,1,log,{spaces:['hel'],free:true})>0;
}

export function botEvent(g,f,card,side,log,{drawLimited}) {
  if([4,8,12,43].includes(card)&&f!=='m'&&side==='light') {
    if(!botTerror(g,f,1,log,{event:true})) return false;
    if(card===12) adjustResource(g,'m',-3);
    return true;
  }
  if((card===5&&side==='dark'||card===9&&side==='light')&&f!=='m') return shiftPriority(g,f,log);
  if(card===6&&f!=='m') return election(g,f,log);
  if(card===7&&f==='m'&&side==='dark') return manifest(g,log);
  if(card===10&&f==='m'&&side==='dark') {
    if(pools(g).m<2) return false;
    const spaces=manifestSpaces(g);
    if(!spaces.length) return false;
    log.push('#10 · At least two Moderates Cells are Available. Use the Rally placement priorities.');
    return botRally(g,f,60,Math.min(spaces.length,2),log,{spaces,placement:spaces.length===1?2:1})>0;
  }
  if(card===11&&f==='r') return lenin(g,log);
  if(card===12&&f==='m'&&side==='dark') return publish(g,log,4)||Boolean(drawLimited(g,f,log));
  if(card===13&&f!=='m'&&side==='light') return joblessness(g,f,log);
  if(card===13&&f==='m'&&side==='dark') {
    const command=drawLimited(g,f,log), cube=placePoliticalCube(g,log);
    return Boolean(command||cube);
  }
  if(card===18&&f==='s'&&side==='light') {
    if(g.phase!==1) return false;
    if(oneStep(g,log,['mik'],1,()=>[],'#18 · Increase Mikkelin Support')) return true;
    return placeCells(g,'mik','s',2)>0;
  }
  if(card===18&&f==='m'&&side==='dark') {
    if(g.tracks.rC+g.tracks.sC===0&&(!g.issues.every(Boolean)||personality(g)||g.tracks.m===0&&!TOWNS.some(id=>cells(g.board[id],'m')))) return false;
    startPolitics(g,log);
    return true;
  }
  if(card===19&&f==='m') {
    if(g.tracks.rC+g.tracks.sC>=5) {
      const cube=pick(g,['r','s'].flatMap(f=>Array(g.tracks[f+'C']).fill(f)));
      g.tracks[cube+'C']--;
      log.push('#19 · With five or six cubes, remove one '+NAME[cube]+' cube before Politics.');
      startPolitics(g,log);
      return true;
    }
    if(g.issues.every(Boolean)||pools(g).rC+pools(g).sC===0) return false;
    if(roll(g,log,'#19 Political Struggle')<=4) putCube(g,cubeColor(g,log,'equal'));
    return true;
  }
  if(card===20&&f!=='m'&&side==='light') return tokoi(g,f,log);
  if(card===21&&f==='r'&&side==='dark') return workersHalls(g,log);
  if(card===25&&f!=='m') return disarm(g,f,log);
  if(card===27&&f!=='m') return majorOffensive(g,f,log);
  if(card===28&&f==='m') return g.tracks.m>=10&&g.tracks.m<=14&&hennala(g,log);
  if(card===29&&(f==='m'||f==='s')) return warNames(g,f,log);
  if(card===32&&f==='m'&&side==='dark') {
    if(g.tracks.pol<6) return false;
    log.push('#32 · Polarization is at least 6. Place an Available Cell before reducing it.');
    botRally(g,f,60,1,log,{placement:1});
    g.tracks.pol-=Math.ceil(roll(g,log,'#32 · Halve the Polarization reduction roll, rounded up')/2);
    return true;
  }
  if(card===34&&side) return arrest(g,f,log,side);
  if(card===35&&side==='dark'&&(f==='m'||f==='r')) return homeFront(g,f,log);
  if(card===36&&f==='m'&&side==='dark') return prisonerReconciliation(g,log);
  if(card===37&&f!=='m') return vato(g,f,log);
  if(card===38&&f==='s'&&side==='light') return human(g,'r')&&crackdown(g,log);
  if(card===38&&f==='m'&&side==='dark'&&g.tracks.m<15&&g.tracks.pol<5) return false;
  if(card===39) return parliament(g,f,log);
  if(card===40&&f!=='m') return tampere(g,f,log);
  if(card===41&&f==='r'&&side==='dark') return lahti(g,log);
  if(card===42&&f==='s'&&side==='light') {
    if(!canRedeploy(g)) return false;
    const limit=roll(g,log,'#42 · Maximum number of Cells to redeploy');
    if(!redeploy(g,limit,log)) log.push('#42 · This roll cannot add Town Population without losing Control elsewhere.');
    return true;
  }
  if(card===44&&f!=='m') return parade(g,f,log);
  if(card===45&&f==='s') return fate(g,log);
  if(card===45&&f==='m'&&side==='dark') return removeIssue(g,log);
  return side?autoEvent(g,f,card,side,log):null;
}
