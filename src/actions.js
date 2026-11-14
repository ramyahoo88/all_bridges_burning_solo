import { FACTIONS, NEAR, RAIL, edge, spaceName} from './data.js';
import {addNews, capacity, cells, clamp, cleanSpace, clone, countTerror, flip, human, newsAt, pay, pools} from './model.js';
import {chooseSpaceRanked, pick, roll} from './random.js';

export const enemy = f=>FACTIONS.filter(other=>other!==f);
export function createMoveState() {
  return {fromUsed:new Set(),toUsed:new Set(),movedInto:{}};
}
export const unmovedCount = (b,movedInto,id,key)=>Math.max(0,b[key]-(movedInto[id]?.[key]??0));
export const unmovedCells = (b,movedInto,id,f='m')=>unmovedCount(b,movedInto,id,f+'A')+unmovedCount(b,movedInto,id,f+'I');
export function recordMovedInto(movedInto,id,key,count=1) {
  if(count<=0) return;
  const arrivals=movedInto[id]??={};
  arrivals[key]=(arrivals[key]??0)+count;
}
export function recordGroupMove(tracker,from,to,{allowSharedDest=false}={}) {
  if(tracker.fromUsed.has(from)||tracker.toUsed.has(from)||(!allowSharedDest&&(tracker.fromUsed.has(to)||tracker.toUsed.has(to)))) {
    throw Error('Enter each movement group once and use each destination once. Record mixed or converging groups in the tabletop editor.');
  }
  tracker.fromUsed.add(from);
  tracker.toUsed.add(to);
}
export function rallySize(b,f,offset=false) {
  const bonus=f==='r'?-b.support:f==='s'?b.support:0;
  const modifier=f==='m'?Math.abs(b.support):Math.max(0,-bonus)+b[f==='r'?'sTerror':'rTerror'];
  const positive=f==='m'?0:Math.max(0,bonus);
  return {n:Math.max(0,1+positive-modifier+(offset===true?modifier:offset)),modifier};
}
export function placeCells(g,id,f,n,active=false) {
  const amount=Math.min(n,pools(g)[f]);
  if(amount>0) g.board[id][f+(active?'A':'I')]+=amount;
  return amount;
}
export function removeCells(g,id,f,n,activeFirst=true) {
  const b=g.board[id];
  const first=f+(activeFirst?'A':'I'), second=f+(activeFirst?'I':'A');
  const a=Math.min(b[first],n);
  const c=Math.min(b[second],n-a);
  b[first]-=a;
  b[second]-=c;
  return a+c;
}
export function replaceWithDisc(g,id,f,relocate=null) {
  const b=g.board[id], key=f==='r'?'admin':'network';
  if(cells(b,f)<2||capacity(b)<=0||(!human(g,f)&&b[key])) return false;
  if(!pools(g)[key]) {
    if(f!=='r'||!relocate||relocate===id||g.board[relocate].admin<1) return false;
    g.board[relocate].admin--;
  }
  removeCells(g,id,f,2,f==='m');
  b[key]++;
  cleanSpace(g,id);
  return true;
}
export function rallyPlace(g,id,f,{free=false,offset=0}={}) {
  const b=g.board[id];
  const {n,modifier}=rallySize(b,f,free||!human(g,f)?true:offset);
  if(n===0||pools(g)[f]===0) return 0;
  pay(g,f,1+Math.min(offset,modifier),free);
  return placeCells(g,id,f,n);
}
export function terrorOptions(g,id,f,{inactive=false,cap=null,polarization=g.tracks.pol}={}) {
  const b=g.board[id];
  if(inactive?!cells(b,f):!b[f+'A']) return [];
  const limit=cap??(polarization>=6?2:1), out=[];
  for(const targets of [[...enemy(f).slice(0,1)],[...enemy(f).slice(1)],enemy(f),[...enemy(f)].reverse()]) {
    for(const preference of [true,false]) {
      const simulation=clone(b), removed=[];
      for(const side of targets) {
        const preferActive=side==='m'?!preference:preference;
        const first=side+(preferActive?'A':'I');
        const second=side+(preferActive?'I':'A');
        for(const key of [first,second]) while(simulation[key]>0&&removed.length<limit&&
          !(cells(simulation,side)===1&&(simulation[side+'Prep']||simulation.caps[side]?.length))) {
          simulation[key]--;
          removed.push(key);
        }
        const disc=side==='r'?'admin':side==='m'?'network':null;
        if(cap===null&&disc&&!cells(simulation,side)) while(simulation[disc]>0&&removed.length<limit) {
          simulation[disc]--;
          removed.push(disc);
        }
      }
      if(removed.length&& !out.some(item=>JSON.stringify(item.removed)===JSON.stringify(removed))) out.push({removed,simulation});
    }
  }
  return out;
}
export function terrorAt(g,id,f,choice,{free=false,holdPol=false}={}) {
  pay(g,f,1,free);
  const b=g.board[id], added=countTerror(b)<2&&pools(g)[f+'Terror']>0;
  for(const key of choice.removed) b[key]--;
  cleanSpace(g,id,{reason:'terror',actor:f});
  if(added) {
    b[f+'Terror']++;
    if(g.phase===2&&countTerror(b)===2) addNews(g,id);
    if(!holdPol) g.tracks.pol=clamp(g.tracks.pol+1,0,10);
  }
  return Number(added);
}
export function cubeColor(g,log,policy='non-player') {
  const p=pools(g), choices=['r','s'].filter(f=>p[f+'C']>0);
  if(choices.length<2) return choices[0];
  if(policy==='equal') return pick(g,choices);
  const value=roll(g,log,'Political cube');
  if(value<5) return value<3?'r':'s';
  return pick(g,choices.filter(f=>!human(g,f)).length?choices.filter(f=>!human(g,f)):choices);
}
export function putCube(g,side) {
  if(!['r','s'].includes(side)||pools(g)[side+'C']<=0||g.issues.every(Boolean)) return false;
  g.tracks[side+'C']++;
  return true;
}
export function legalRail(g,from,to) {
  return RAIL.includes(edge(from,to))&&!g.sabotage.includes(edge(from,to));
}
function carryNews(g,f,from,to) {
  const remaining=cells(g.board[from],f);
  for(const token of newsAt(g,from,f).slice(remaining)) token.space=to;
}
export function travel(g,f,from,to,opts,tracker=null) {
  const b=g.board[from], d=g.board[to], count=opts.count;
  if(!NEAR[from]?.includes(to)||!Number.isInteger(count)||count<1||count>cells(b,f)) throw Error('Select an adjacent destination and an available group.');
  if(tracker) recordGroupMove(tracker,from,to,{allowSharedDest:Boolean(opts.allowSharedDest)});
  const inactive=opts.activeFirst?Math.max(0,count-b[f+'A']):Math.min(count,b[f+'I']);
  const active=count-inactive;
  b[f+'I']-=inactive;
  d[f+'I']+=inactive;
  b[f+'A']-=active;
  d[f+'A']+=active;
  const russian=f==='r'?Math.min(opts.russian??0,b.u,count):0;
  b.u-=russian;
  d.u+=russian;
  for(const cap of opts.caps??[]) {
    if(cap==='train'&&!legalRail(g,from,to)) throw Error('A Train needs an unsabotaged railway across that border.');
    const index=b.caps[f].indexOf(cap);
    if(index<0) throw Error('The selected Capability is unavailable.');
    b.caps[f].splice(index,1);
    d.caps[f].push(cap);
  }
  carryNews(g,f,from,to);
  cleanSpace(g,from);
}
export function resolveMessageMove(g,log,step,movedInto={}) {
  const {from,path,wasActive,token=null,carryPerson=false,captureSpace=null,bot=false}=step;
  const source=g.board[from];
  source[wasActive?'mA':'mI']--;
  let to=path.at(-1), captured=false;
  if(token||carryPerson) {
    const start=token?path.indexOf(token.space):0;
    const options=path.slice(1).map((id,index)=>({id,index,dist:Math.abs(index+1-start),threat:Math.max(g.board[id].rA,g.board[id].sA)}));
    let target;
    if(bot) {
      target=chooseSpaceRanked(g,options,x=>[-x.threat,x.dist],null,x=>spaceName(x.id),x=>x.id);
    } else {
      const sorted=[...options].sort((a,b)=>b.threat-a.threat||a.dist-b.dist);
      target=sorted.find(x=>x.id===captureSpace&&x.threat===sorted[0].threat&&x.dist===sorted[0].dist)??sorted[0];
    }
    if(target?.threat&&roll(g,log,'Message Capture in '+spaceName(target.id))<=target.threat) {
      to=target.id;
      captured=true;
    }
    if(token) {
      token.space=to;
      token.owner='m';
    }
    if(carryPerson) {
      source.person=false;
      g.board[to].person=true;
    }
  }
  const status=captured?'mA':'mI';
  g.board[to][status]++;
  recordMovedInto(movedInto,to,status,1);
  cleanSpace(g,from);
  return {to,captured,status};
}
function capStrength(caps) {
  const officer=caps.includes('officer-s');
  return caps.map(cap=>cap==='officer-s'?2:cap==='officer-r'?1:officer?2:1).sort((a,b)=>b-a).slice(0,2).reduce((sum,n)=>sum+n,0);
}
const capSide = (list,f)=>list.map(cap=>cap==='officer'?'officer-'+f:cap);
export function battleStrength(g,{f,id,defenders,attackCount,russians=0,caps=null,boost=0,bot=!human(g,f)}) {
  const b=g.board[id];
  const russianWeight=g.tracks.rV>=2?2:1;
  const offense=f==='g'?b.g*2:bot?(f==='s'?7:5):Number(attackCount>=3);
  let strength=offense+boost+russians*russianWeight;
  if(f!=='g') strength+=capStrength(capSide(caps??b.caps[f],f));
  for(const target of defenders) {
    if(target==='g') strength-=b.g*2;
    if(target==='u') strength-=b.u*russianWeight;
    if(target==='r'||target==='s') strength-=b[target+'Prep']*2+capStrength(capSide(b.caps[target],target));
  }
  return f==='g'?Math.max(2,strength):strength;
}
export function engage(g,log,{f,id,defenders,attackCount,russians=0,caps=null,boost=0,retreat=null,die=null,bot=!human(g,f),activeFirst=false,casualty='active',attrition='inactive',attackerInactive=null,casualtyLimit=Infinity}) {
  const b=g.board[id];
  const strength=battleStrength(g,{f,id,defenders,attackCount,russians,caps,boost,bot});
  const attackingInactive=f==='g'?0:attackerInactive!==null?attackerInactive:activeFirst?Math.max(0,attackCount-b[f+'A']):Math.min(attackCount,b[f+'I']);
  let attackI=attackingInactive, attackA=attackCount-attackI;
  if(f!=='g'&&attackI>0) {
    flip(b,f,true,1);
    attackI--;
    attackA++;
  }
  const result=die??roll(g,log,'Attack in '+spaceName(id));
  log.push(spaceName(id)+' · Strength '+strength+'; '+(result===6?'6 always fails':result<=strength?'hits':'misses'));
  if(result===6||result>strength) return;
  const cf=defenders.find(side=>side==='r'||side==='s');
  const tf=defenders.find(side=>side==='g'||side==='u');
  let wantCell=true, casualties=0,troopsLost=0,prison=0;
  for(let remaining=Math.min(result,casualtyLimit);remaining>0;remaining--) {
    const hasCell=cf&&cells(b,cf)>0, hasTroop=tf&&b[tf]>0;
    if(hasCell&&(wantCell||!hasTroop)) {
      const active=(bot||f==='g'||casualty!=='inactive')?b[cf+'A']>0:b[cf+'I']===0;
      b[cf+(active?'A':'I')]--;
      if(retreat) {
        const target=g.board[retreat];
        target[cf+(active?'A':'I')]++;
        if(!cells(b,cf)) target.caps[cf].push(...b.caps[cf].filter(cap=>cap!=='train'||legalRail(g,id,retreat)));
      } else {
        if(casualties%2===1) {
          g.tracks[cf+'Pow']++;
          prison++;
        }
        casualties++;
      }
      wantCell=false;
    } else if(hasTroop) {
      b[tf]--;
      if(tf==='g') troopsLost++;
      wantCell=true;
    } else if(cf==='r'&&b.admin) b.admin--;
    else break;
  }
  if(retreat&&cf) carryNews(g,cf,id,retreat);
  const attackerLoss=(count)=>{
    const first=attrition==='active'?Math.min(attackA,count):Math.max(0,count-attackI);
    const other=Math.min(attackI,count-first);
    b[f+'A']-=first;
    b[f+'I']-=other;
    attackA-=first;
    attackI-=other;
  };
  if(f!=='g') {
    attackerLoss(Math.min(troopsLost,attackCount));
    if(f==='r') b.u-=Math.min(b.u,russians,Math.max(0,troopsLost-attackCount));
    attackerLoss(Math.min(Math.floor(casualties/3),attackA+attackI));
  }
  if(prison) {
    const side=f==='g'?'s':f;
    if(countTerror(b)<2&&pools(g)[side+'Terror']>0) b[side+'Terror']++;
    g.tracks.pol=clamp(g.tracks.pol+1,0,10);
    addNews(g,id);
  }
  cleanSpace(g,id);
}
