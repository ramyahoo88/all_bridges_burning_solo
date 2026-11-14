import {NAME, NEAR, SPACE_IDS, TOWNS, ISSUE_LABELS, pop, spaceName, town} from './data.js';
import {addNews, adjustResource, capacity, cells, clamp, cleanSpace, control, human, personality, pools, score, sumSpace, victory} from './model.js';
import {cubeColor, engage, putCube, rallyPlace, replaceWithDisc} from './actions.js';
import {chooseSpaceRanked, pick, pickSpace, roll} from './random.js';
import {beginRevolt, endGermany, endPropaganda, endRevolt} from './sequence.js';
import {capDestinations, placeCapability} from './events.js';
import {botRally, nearest, placeRanked} from './bot-rally.js';

const AGITATORS=['s','r','m'];
const setPol=(g,n)=>g.tracks.pol=clamp(n,0,10);
const campaignEnd=g=>g.round===4;
const clearTerror=b=>{b.rTerror=b.sTerror=0;};
export function clearIssue(g,index) {
  const side=g.issues[index];
  if(!side) return false;
  g.tracks[side+'Issue']--;
  g.issues[index]=null;
  return true;
}
export function putIssue(g,side,index=g.issues.indexOf(null)) {
  if(!['r','s'].includes(side)||g.issues[index]!==null) throw Error('Select an unresolved Issue and a marker color.');
  g.issues[index]=side;
  g.tracks[side+'Issue']++;
  g.tracks.rC=g.tracks.sC=0;
}
function leadership(g,log) {
  if(personality(g)) return false;
  adjustResource(g,'m',-3);
  log.push('§6.2.2 · Personality absent. Moderates lose 3 Resources.');
  const choices=TOWNS.filter(id=>cells(g.board[id],'m')>0);
  if(!choices.length) return false;
  if(human(g,'m')&&choices.length>1) {
    g.interrupt={kind:'politics',sub:'leadership',choices,title:'Moderates · Personal Leadership'};
    return true;
  }
  const id=human(g,'m')?choices[0]:pickSpace(g,choices,log);
  g.board[id].person=true;
  log.push('Place the Personality in '+spaceName(id)+'.');
  return false;
}
export function startPolitics(g,log) {
  if(g.issues.every(Boolean)) return leadership(g,log);
  const {rC,sC}=g.tracks;
  const die=roll(g,log,'§6.2 Politics');
  if(die>rC+sC) {
    log.push('No Issue resolves.');
    return false;
  }
  const open=g.issues.map((side,i)=>side?null:i).filter(i=>i!==null);
  let side=rC>sC?'r':sC>rC?'s':null;
  if(!side&&!human(g,'m')) side=pick(g,['r','s'].filter(f=>!human(g,f)).length?['r','s'].filter(f=>!human(g,f)):['r','s']);
  if(human(g,'m')&&(!side||open.length>1)) {
    g.interrupt={kind:'politics',sub:'issue',side,choices:open,title:'Moderates · Resolve an Issue'};
    return true;
  }
  putIssue(g,side,open[0]);
  log.push('Resolve '+ISSUE_LABELS[open[0]]+' for '+NAME[side]+'.');
  return leadership(g,log);
}
export function resolvePolitics(g,log,intent) {
  const step=g.interrupt;
  g.interrupt=null;
  if(step.sub==='issue') {
    const index=Number(intent.issue), side=step.side??intent.side;
    if(!step.choices.includes(index)) throw Error('Select an unresolved Issue.');
    putIssue(g,side,index);
    log.push('Resolve '+ISSUE_LABELS[index]+' for '+NAME[side]+'.');
    if(leadership(g,log)) return;
  } else {
    if(!step.choices.includes(intent.space)) throw Error('Select a Town with a Moderates Cell.');
    g.board[intent.space].person=true;
    log.push('Place the Personality in '+spaceName(intent.space)+'.');
  }
  g.roundStep='resources';
}
export function agitationSpaces(g,f) {
  return SPACE_IDS.filter(id=>{
    const b=g.board[id], c=control(b);
    if(f==='m') return !c&&pop(id)>0&&(cells(b,'m')||b.network);
    return c===f&&(b[f+'A']||f==='r'&&b.admin);
  });
}
function botAgitate(g,f,log) {
  const used=new Set(), candidates=agitationSpaces(g,f);
  const last=campaignEnd(g), t=g.tracks;
  const pickSpace=(predicate,rank,label)=>placeRanked(g,candidates.filter(id=>!used.has(id)&&predicate(g.board[id],id)),rank,log,label);
  const use=id=>used.add(id);
  const actPol=(needed,label)=>{
    while(needed()>0) {
      const id=pickSpace(()=>true,()=>[],label);
      if(!id) break;
      const b=g.board[id];
      if(f!=='m') clearTerror(b);
      setPol(g,t.pol-1);
      use(id);
    }
  };
  if(f==='s') {
    const needed=t.sV+t.pol-5;
    if(last&&score(g).senate>=4&&needed>0&&needed<=candidates.length&&needed<=t.pol) {
      const id=pickSpace(()=>true,()=>[],'Senate Agitation: reach combined threshold 5');
      clearTerror(g.board[id]);
      setPol(g,t.pol-needed);
      use(id);
    }
    for(const id of candidates.filter(id=>!used.has(id))) {
      const b=g.board[id];
      if(b.support>=2) continue;
      clearTerror(b);
      b.support=2;
      log.push('Senate Agitation · increase Support in '+spaceName(id)+'.');
    }
    return;
  }
  if(f==='r') {
    if(pools(g).admin) {
      const canBuild=(b,id)=>!b.admin&&pop(id)>0&&capacity(b)>0&&cells(b,'r')>=(cells(b,'s')?3:2);
      const rank=id=>[Number(cells(g.board[id],'s')>0)];
      const id=pickSpace((b,id)=>canBuild(b,id)&&b.support>-2,rank,'Reds Agitation: build Administration outside Active Opposition')??
        pickSpace(canBuild,rank,'Reds Agitation: build Administration');
      if(id&&replaceWithDisc(g,id,f)) use(id);
    }
    const oppositionOrder=candidates.filter(id=>!used.has(id)&&pop(id)>0).sort((a,b)=>Number(town(b))-Number(town(a))||pop(b)-pop(a));
    for(const id of oppositionOrder) {
      const b=g.board[id], target=b.admin?-2:-1;
      if(b.support<=target) continue;
      clearTerror(b);
      b.support=target;
      use(id);
      log.push('Reds Agitation · maximize Opposition in '+spaceName(id)+'.');
    }
    const needed=t.rV+t.pol-5;
    if(last&&score(g).opp>=12&&needed<=t.pol&&needed<=candidates.length-used.size) {
      actPol(()=>t.rV+t.pol-5,'Reds Agitation: reach combined threshold 5');
    }
    return;
  }
  if(last&&t.m>=15&&t.pol-score(g).politics<=candidates.length) {
    actPol(()=>t.pol-score(g).politics,'Moderates Agitation: lower Polarization toward Issues + Networks + 1');
  }
  for(let opposition=score(g).opp;opposition>=10;opposition=score(g).opp) {
    const id=pickSpace((b,id)=>b.support<0&&pop(id)>0,id=>[-pop(id)*-g.board[id].support],'Moderates Agitation: reduce Reds Opposition');
    if(!id) break;
    const b=g.board[id], steps=Math.ceil((opposition-9)/pop(id));
    b.support=Math.min(0,b.support+steps);
    use(id);
  }
  if(!last&&!g.issues.every(Boolean)) for(const id of candidates.filter(id=>!used.has(id))) {
    if(!putCube(g,cubeColor(g,log))) break;
    use(id);
    log.push('Moderates Agitation · political cube from '+spaceName(id)+'.');
  }
  for(;;) {
    const id=pickSpace(b=>b.support!==0,id=>[-Number(human(g,g.board[id].support>0?'s':'r'))],null);
    if(!id) break;
    g.board[id].support=0;
    use(id);
    log.push('Moderates Agitation · shift '+spaceName(id)+' to Neutral.');
  }
}
export function humanAgitate(g,log,plans,f) {
  if(!Array.isArray(plans)) throw Error('Choose Agitation actions.');
  const used=new Set();
  let cost=0, admin=false, senatePol=0;
  for(const plan of plans) {
    const {id,kind}=plan;
    if(!agitationSpaces(g,f).includes(id)||used.has(id)) throw Error('Select a qualifying space once.');
    used.add(id);
    const b=g.board[id], steps=Number(plan.steps??1);
    if(!Number.isInteger(steps)||steps<1||steps>10) throw Error('Choose a valid number of shifts.');
    if(kind==='disc') {
      if(f==='s'||f==='r'&&admin||!replaceWithDisc(g,id,f)) throw Error('A disc cannot be placed in '+spaceName(id)+'.');
      if(f==='r') admin=true;
      cost++;
      continue;
    }
    if(kind==='cube') {
      if(f!=='m'||!putCube(g,plan.side)) throw Error('There is no available political cube or unresolved Issue.');
      cost++;
      continue;
    }
    if(f!=='m') {
      cost+=b.rTerror+b.sTerror;
      clearTerror(b);
    }
    if(kind==='polarization') {
      if(steps>g.tracks.pol||(f==='s'?senatePol+steps>agitationSpaces(g,f).length:steps!==1)) throw Error('Polarization cannot fall by that amount.');
      if(f==='s') senatePol+=steps;
      g.tracks.pol-=steps;
    } else if(kind==='shift') {
      const direction=f==='m'?Math.sign(-b.support):plan.direction==='opposition'?-1:plan.direction==='support'?1:f==='r'?-1:1;
      const target=b.support+direction*steps;
      const lower=f==='r'&&!b.admin?-1:-2;
      if(!direction||target>2||target<lower||f==='m'&&steps>Math.abs(b.support)) throw Error('That Support or Opposition shift is unavailable.');
      b.support=target;
    } else throw Error('Choose a valid Agitation action.');
    cost+=steps;
  }
  if(cost&&f!=='m') cost+=g.tracks[f==='s'?'rIssue':'sIssue'];
  if(g.tracks[f]<cost) throw Error(NAME[f]+' needs '+cost+' Resources for these choices.');
  adjustResource(g,f,-cost);
  log.push(NAME[f]+' Agitation · '+(plans.length?plans.length+' space(s), '+cost+' Resources.':'no action.'));
}
export function syncPowers(g,log) {
  const t=g.tracks;
  const russianOnMap=sumSpace(g,b=>b.u);
  const germanInPlay=sumSpace(g,b=>b.g)+pools(g).g;
  for(const [p,delta] of [['g',t.sV-germanInPlay],['u',t.rV-russianOnMap]]) {
    if(delta>0) {
      const count=Math.min(delta,t[p+'Out']);
      if(!count) continue;
      const id=p==='u'?placeRanked(g,TOWNS.filter(id=>cells(g.board[id],'r')||g.board[id].admin),()=>[],log,'Place Russian Troops with Reds pieces in a Town'):null;
      if(p==='u'&&!id) continue;
      if(id) g.board[id].u+=count;
      t[p+'Out']-=count;
      log.push(NAME[p]+' · '+count+(p==='g'?' to Available.':' to '+spaceName(id)+'.'));
    } else for(let i=0;i<-delta;i++) {
      const options=SPACE_IDS.flatMap(id=>Array(g.board[id][p]).fill(id));
      const id=pick(g,options);
      if(id) g.board[id][p]--;
      else if(p!=='g'||!pools(g).g) break;
      t[p+'Out']++;
      log.push(NAME[p]+' · return one Troop to Out of Play'+(id?' from '+spaceName(id):' from Available')+'.');
    }
  }
}
export function propaganda(g,log) {
  const step=g.roundStep??'victory';
  const t=g.tracks;
  if(step==='victory') {
    g.result=victory(g,false);
    if(g.result) g.stage='ended';
    else g.roundStep='politics';
    log.push(g.result?'§6.1 · Victory threshold reached.':'§6.1 · Continue the Propaganda Round.');
    return 'Propaganda · Victory check';
  }
  if(step==='politics') {
    if(!startPolitics(g,log)) g.roundStep='resources';
    return 'Propaganda · Politics';
  }
  if(step==='resources') {
    adjustResource(g,'s',sumSpace(g,b=>Math.max(0,b.support)));
    adjustResource(g,'r',score(g).redPop);
    adjustResource(g,'m',Math.floor(Math.min(5,t.pol)/2)+Math.max(0,t.pol-5));
    g.roundStep='turmoil';
    log.push('§6.3 · Update Resources from Support, Reds Control, and Polarization.');
    return 'Propaganda · Resources';
  }
  if(step==='turmoil') {
    t.rV=Math.max(0,t.rV-1);
    g.roundStep='agitate-0';
    return 'Propaganda · Russian Turmoil';
  }
  if(step.startsWith('agitate-')) {
    const n=Number(step.at(-1)), f=AGITATORS[n];
    if(human(g,f)&&agitationSpaces(g,f).length) {
      g.interrupt={kind:'agitate',f,title:NAME[f]+' · Agitation'};
    } else {
      if(!human(g,f)) botAgitate(g,f,log);
      g.roundStep=n===2?'endcheck':'agitate-'+(n+1);
    }
    return 'Propaganda · '+NAME[f]+' Agitation';
  }
  if(step==='endcheck') {
    if(campaignEnd(g)) {
      g.result=victory(g,true);
      g.stage='ended';
    } else g.roundStep=g.phase===2?'pow-r':'reset';
    return campaignEnd(g)?'Final scoring':'Propaganda · Prepare for Reset';
  }
  if(step==='pow-r'||step==='pow-s') {
    const f=step.at(-1);
    if(!prisonerStep(g,f,log)) g.roundStep=f==='r'?'pow-s':'pow-end';
    return 'Propaganda · '+NAME[f]+' prisoners';
  }
  if(step==='pow-end') {
    setPol(g,t.pol+Math.floor((t.rPow+t.sPow)/2));
    g.roundStep='reset';
    return 'Propaganda · Remaining prisoners';
  }
  if(step!=='reset') throw Error('Unknown Propaganda phase.');
  if(g.phase===2) syncPowers(g,log);
  for(const id of SPACE_IDS) clearTerror(g.board[id]);
  g.sabotage=[];
  g.news=[];
  if(g.round===1) t.sOut=Math.max(0,t.sOut-10);
  g.roundStep=null;
  endPropaganda(g,log);
  return 'Propaganda · Reset and resume';
}
export function resolveAgitate(g,log,intent) {
  const {f}=g.interrupt;
  humanAgitate(g,log,intent.plans??[],f);
  g.interrupt=null;
  g.roundStep=f==='m'?'endcheck':f==='s'?'agitate-1':'agitate-2';
}
export function resolvePrisoners(g,log,intent) {
  const {f,max,event}=g.interrupt, foe=f==='r'?'s':'r';
  const n=Number(intent.count);
  if(!Number.isInteger(n)||n<0||n>Math.min(max,g.tracks[foe+'Pow'])) throw Error('Enter an available prisoner count.');
  g.tracks[foe+'Pow']-=n;
  g.interrupt=null;
  if(!event) g.roundStep=f==='r'?'pow-s':'pow-end';
  log.push(NAME[f]+' returns '+n+' '+NAME[foe]+' prisoners to Available.');
}
export function prisonerStep(g,f,log,event=null) {
  const foe=f==='r'?'s':'r', key=foe+'Pow';
  if(!g.tracks[key]) return false;
  if(human(g,f)) {
    g.interrupt={kind:'prisoners',f,max:g.tracks[key],title:(event?'#28 Hennala · ':'')+NAME[f]+' · Release prisoners'};
    if(event) g.interrupt.event=event;
    return true;
  }
  const n=g.tracks.pol>=6?g.tracks[key]:0;
  g.tracks[key]-=n;
  log.push(NAME[f]+' releases '+n+' '+NAME[foe]+' prisoners at Polarization '+g.tracks.pol+'.');
  return false;
}
export function germanAction(g,log) {
  if(g.tracks.coordinate) {
    g.interrupt={kind:'manual',scope:'german',f:'s',title:'Germany · Senate Coordinates',instruction:'Use the German Actions flowchart and the Senate choices. Record the result and remove Coordinate before continuing.'};
    return 'Germany · Coordinate';
  }
  const existing=SPACE_IDS.filter(id=>g.board[id].g>0);
  const available=pools(g).g;
  if(available) {
    const landing=existing.length===0;
    const to=landing?['var','uus','kar'][Math.floor((roll(g,log,'German landing site')-1)/2)]:pickSpace(g,existing,log);
    g.board[to].g+=available;
    if(landing) addNews(g,to);
    log.push('German '+(landing?'landing':'reinforcement')+' · '+available+' Troops to '+spaceName(to)+'.');
  } else {
    const enemies=SPACE_IDS.filter(id=>cells(g.board[id],'r')||g.board[id].u);
    const targets=existing.filter(id=>enemies.includes(id));
    if(targets.length) {
      const id=placeRanked(g,targets,()=>[],log,'Germany: Attack Reds or Russians in the same space');
      engage(g,log,{f:'g',id,defenders:['r','u'],attackCount:0});
    } else if(enemies.length) {
      const moves=existing.flatMap(from=>{
        const currentDist=nearest(from,enemies);
        return NEAR[from].filter(to=>nearest(to,enemies)<currentDist).map(to=>({from,to}));
      });
      const move=chooseSpaceRanked(g,moves,()=>[],log,'Germany: March toward Reds or Russians',x=>spaceName(x.from)+' → '+spaceName(x.to),x=>x.to);
      if(move) {
        g.board[move.to].g+=g.board[move.from].g;
        g.board[move.from].g=0;
      }
    }
  }
  endGermany(g);
  return 'Germany · Resolve Action Phase';
}
function finishPivotal(g,log) {
  syncPowers(g,log);
  endRevolt(g);
  g.revoltStep=null;
  g.interrupt=null;
  log.push('§2.4.1 · Enter Phase II. Continue with remaining eligible factions on this card.');
}
export function revolt(g,log) {
  if(!g.revoltStep) {
    beginRevolt(g);
    g.revoltStep='reds';
    if(human(g,'r')) {
      g.interrupt={kind:'revolt',f:'r',title:'Red Revolt! · Reds choose'};
      return 'Red Revolt! · Set Reds eligibility';
    }
    const target=placeRanked(g,TOWNS.filter(id=>cells(g.board[id],'r')&&cells(g.board[id],'s')),id=>[Number(id!=='hel')],log,'Red Revolt! · Remove Senate, with Helsinki first');
    if(target) {
      resolveRevolt(g,log,{choice:'remove',space:target});
      return 'Red Revolt! · Remove Senate in '+spaceName(target);
    }
    const rally=TOWNS.filter(id=>cells(g.board[id],'r')||g.board[id].admin);
    if(!rally.includes('hel')||!botRally(g,'r',48,1,log,{spaces:['hel'],free:true})) {
      const others=rally.filter(id=>id!=='hel');
      if(!botRally(g,'r',48,1,log,{spaces:others,free:true})) log.push('Red Revolt! · No eligible free Reds Rally changes the board.');
    }
    g.revoltStep='caps';
    return 'Red Revolt! · Check free Reds Rally';
  }
  if(g.revoltStep==='caps') {
    for(const f of ['r','s']) {
      while(g.held[f].length) {
        const cap=[...g.held[f]].sort((a,b)=>['officer','train','cannon'].indexOf(a)-['officer','train','cannon'].indexOf(b))[0];
        const choices=capDestinations(g,f,cap,true);
        if(human(g,f)&&choices.length>1) {
          g.interrupt={kind:'capabilities',f,cap,choices,title:NAME[f]+' · Place '+cap};
          return 'Red Revolt! · Capability choices';
        }
        g.held[f].splice(g.held[f].indexOf(cap),1);
        placeCapability(g,log,f,cap,{revolt:true,destination:human(g,f)?choices[0]:null});
      }
    }
    finishPivotal(g,log);
    return 'Red Revolt! · Powers and Phase II';
  }
  throw Error('Finish the pending Reds decision first.');
}
export function resolveRevolt(g,log,intent) {
  const b=g.board[intent.space];
  if(intent.choice!=='skip'&&(!b||!town(intent.space))) throw Error('Choose a Town.');
  if(intent.choice==='remove') {
    if(!cells(b,'r')) throw Error('That Town needs a Reds Cell.');
    b.sA=b.sI=b.sPrep=0;
    cleanSpace(g,intent.space);
    log.push('Remove Senate Cells and Prepared from '+spaceName(intent.space)+'.');
  } else if(intent.choice==='rally') {
    if(!cells(b,'r')&&!b.admin) throw Error('That Town needs Reds pieces.');
    if(intent.disc) {
      if(!replaceWithDisc(g,intent.space,'r')) throw Error('That Administration placement is unavailable.');
    } else rallyPlace(g,intent.space,'r',{free:true});
    log.push('Free Limited Rally in '+spaceName(intent.space)+'.');
  } else if(intent.choice!=='skip') throw Error('Choose a Reds option.');
  g.interrupt=null;
  g.revoltStep='caps';
}
export function resolveCapability(g,log,intent) {
  const {f,cap,choices}=g.interrupt;
  if(!choices.includes(intent.space)) throw Error('Select an eligible Capability location.');
  g.held[f].splice(g.held[f].indexOf(cap),1);
  placeCapability(g,log,f,cap,{revolt:true,destination:intent.space});
  g.interrupt=null;
}
