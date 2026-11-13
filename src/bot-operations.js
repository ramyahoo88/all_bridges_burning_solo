import {NAME, NEAR, SPACE_IDS, TOWNS, distance, pop, spaceName, town} from './data.js';
import {capacity, cells, cleanSpace, control, countActive, flip, forces, human, newsAt, personality, pools, score} from './model.js';
import {engage, legalRail, terrorAt, terrorOptions, travel} from './actions.js';
import {chooseRanked, chooseSpaceRanked, pick, roll} from './random.js';
import {nearest, placeRanked} from './bot-rally.js';

export const orphanAdmin = g=>SPACE_IDS.some(id=>g.board[id].admin&&!cells(g.board[id],'r'));
const meetsAttackCondition=(g,f,localMin,remoteMin)=>{
  const target=b=>f==='r'?cells(b,'s')>=3||b.caps.s.length:cells(b,'r')||b.u;
  return SPACE_IDS.some(id=>{
    const b=g.board[id];
    return cells(b,f)>=localMin&&target(b)||cells(b,f)>=remoteMin&&b.caps[f].includes('train')&&NEAR[id].some(to=>target(g.board[to]));
  });
};
export function botCondition(g,id,log) {
  const t=g.tracks, p=pools(g), phase=g.phase, pts=score(g);
  if(id===48) return {ok:Boolean(p.r||p.admin||SPACE_IDS.some(k=>g.board[k].admin&&g.board[k].support===-2))};
  if(id===49||id===56&&phase===1) {
    const f=id===49?'r':'s';
    if(phase!==1||f==='r'&&orphanAdmin(g)) return {ok:false};
    const die=roll(g,log,'#'+id+' Activism condition');
    return {ok:die>countActive(g,f),die};
  }
  if(id===50||id===53) return {ok:phase===2&&!orphanAdmin(g)};
  if(id===51) return {ok:SPACE_IDS.some(k=>g.board[k].rA&&(cells(g.board[k],'s')||cells(g.board[k],'m')))};
  if(id===52) return {ok:phase===2&&meetsAttackCondition(g,'r',3,4)};
  if(id===54||id===55) return {ok:phase===(id===54?1:2)&&p.s>0};
  if(id===56) return {ok:phase===2&&pts.senate>=4};
  if(id===57) return {ok:SPACE_IDS.some(k=>{
    const b=g.board[k], opts=terrorOptions(g,k,'s');
    return opts.some(o=>phase===1&&o.removed.some(key=>['rA','rI','admin'].includes(key))||
      town(k)&&control(b)!=='s'&&control(o.simulation)==='s');
  })};
  if(id===58) return {ok:phase===2&&meetsAttackCondition(g,'s',3,4)};
  if(id===59) return {ok:phase===2&&!meetsAttackCondition(g,'s',3,4)};
  if(id===60) return {ok:p.m>0||p.network>0};
  if(id===61) return {ok:t.pol>=6||t.m>=15};
  if(id===62) return {ok:phase===1&&(countCellsM(g)>=5||Boolean(personality(g)))};
  if(id===63) return {ok:phase===2&&(countCellsM(g)>=5||g.news.some(n=>!n.owner||n.owner==='m'))};
  if(id===64) return {ok:t.pol<=5&&countCellsM(g)>=3};
  return {ok:false};
}
const countCellsM=g=>SPACE_IDS.reduce((n,id)=>n+cells(g.board[id],'m'),0);
export function botActivism(g,f,id,limited,log,die) {
  const t=g.tracks, selected=new Set();
  const settle=()=>{
    const scoreNow=score(g);
    if(t.pol>7||t.pol+t[f+'V']<=5||(f==='r'?scoreNow.opp<12:scoreNow.senate<4)) return;
    const eligible=SPACE_IDS.filter(key=>{
      const b=g.board[key];
      if(!b[f+'A']||selected.has(key)) return false;
      const after=control({...b,[f+'A']:b[f+'A']-1});
      return f==='r'?(b.support>=0||control(b)==='s'||after!=='s'):(!town(key)||control(b)!=='s'||after==='s');
    });
    while(eligible.length&&t.pol>0&&t.pol+t[f+'V']>5&&(!limited||!selected.size)) {
      const key=placeRanked(g,eligible,()=>[],log,'Activism: reduce Polarization toward combined threshold 5');
      eligible.splice(eligible.indexOf(key),1);
      g.board[key][f+'A']--;
      t.pol--;
      cleanSpace(g,key);
      selected.add(key);
    }
  };
  const opponent=f==='r'?'s':'r';
  const expose=()=>{
    if(limited||selected.size) return;
    for(const key of SPACE_IDS) {
      const b=g.board[key], choices=[opponent,'m'].filter(side=>b[side+(side==='m'?'I':'A')]);
      const attempts=b[f+'A']+Math.floor(b[f+'I']/2);
      if(!attempts||!choices.length) continue;
      for(let i=0;i<attempts;i++) {
        const targets=choices.filter(side=>b[side+(side==='m'?'I':'A')]);
        const side=chooseRanked(g,targets,side=>[-Number(human(g,side)),-Number(side===opponent&&b[side+'A']===1)],null);
        if(!side) break;
        flip(b,side,side==='m');
        selected.add(key);
      }
      if(selected.has(key)) log.push('Activism: flip enemy Cells in '+spaceName(key)+'.');
    }
  };
  const rallyActivists=(value,oppLast)=>{
    if(value<=0||limited&&selected.size) return;
    let done=0, visited=new Set();
    while(done<value) {
      const all=SPACE_IDS.filter(key=>g.board[key][f+'I']);
      if(!all.length) break;
      let sites=all.filter(key=>!visited.has(key));
      if(!sites.length) {
        visited=new Set();
        sites=all;
      }
      const key=placeRanked(g,sites,key=>[id===50?0:-Number(cells(g.board[key],f)===1),Number(oppLast(g.board[key]))],null);
      flip(g.board[key],f,true);
      visited.add(key);
      done++;
      log.push('Activism: activate one '+NAME[f]+' Cell in '+spaceName(key)+'.');
    }
    if(done) selected.add('activation');
  };
  const activationRoll=number=>{
    if(limited&&selected.size||!SPACE_IDS.some(key=>g.board[key][f+'I'])) return 0;
    const value=roll(g,log,'#'+number+' Activism activation');
    return value>countActive(g,f)?value:0;
  };
  if(id===49||id===56) {
    expose();
    const value=die??activationRoll(id);
    const lastCampaign=id===56&&g.round===3;
    if(lastCampaign&&!limited&&!selected.size) settle();
    rallyActivists(value,b=>f==='r'?b.support===-2:b.support===2);
    if(lastCampaign&&limited&&!selected.size) settle();
    return selected.size;
  }
  if(g.round===3) settle();
  expose();
  let agitated=false, agitatedInSelectedSpace=false;
  if(!limited||!selected.size) {
    const sites=SPACE_IDS.filter(key=>{
      const b=g.board[key];
      return b.admin&&control(b)==='r'&&(b.support>-2||b.rTerror+b.sTerror>0);
    });
    const key=placeRanked(g,sites,key=>[-Number(town(key)),g.board[key].support*-1],log,'Activism: Agitate where an Administration has Reds Control');
    if(key) {
      const b=g.board[key];
      b.rTerror=b.sTerror=0;
      b.support=Math.max(-2,b.support-1);
      agitated=true;
      agitatedInSelectedSpace=selected.has(key);
      selected.add(key);
    }
  }
  if(!agitated) rallyActivists(activationRoll(id),b=>b.support<0);
  if(!selected.size) settle();
  return selected.size+Number(agitatedInSelectedSpace);
}
export function botTerror(g,f,limit,log,{event=false}={}) {
  const pol=g.tracks.pol, used=new Set(), other=f==='r'?'s':'r';
  let added=0;
  for(let i=0;i<limit;i++) {
    const options=SPACE_IDS.filter(id=>!used.has(id)).flatMap(id=>terrorOptions(g,id,f,{polarization:pol,inactive:event,cap:event?1:null}).map(choice=>{
      const b=g.board[id], c=choice.simulation;
      const gain=control(c)===f&&control(b)!==f;
      const politicalTarget=b.network||b.person||newsAt(g,id).some(n=>n.owner);
      const playerDisc=choice.removed.some(k=>k==='network'&&human(g,'m')||k==='admin'&&human(g,'r'));
      const prize=choice.removed.some(k=>k==='network'||k==='admin')||b.person&&!cells(c,'m')||
        newsAt(g,id,'m').length&&!cells(c,'m');
      const active=choice.removed.includes(other+'A');
      return {id,choice,rank:[gain?0:active?1:politicalTarget?2:3,gain?-pop(id):0,gain?-Number(town(id)):0,
        -Number(gain&&f==='s'?playerDisc:politicalTarget&&prize),-choice.removed.filter(k=>[other+'A','mI'].includes(k)).length,-choice.removed.length]};
    }));
    if(!event&&!used.has('political')&&g.tracks.rC+g.tracks.sC) options.push({id:'political',rank:[3,0,0,0,0,0]});
    const selected=chooseSpaceRanked(g,options,option=>option.rank,log,'Terror: prioritize control, Active opponents, then political targets',
      option=>option.id==='political'?'Political Display':spaceName(option.id),option=>option.id);
    if(!selected) break;
    if(selected.id==='political') {
      const side=pick(g,['r','s'].filter(k=>g.tracks[k+'C']));
      g.tracks[side+'C']--;
    } else {
      added+=terrorAt(g,selected.id,f,selected.choice,{free:event,holdPol:true});
      log.push('Terror in '+spaceName(selected.id)+' removes '+selected.choice.removed.map(key=>{
        if(key==='admin'||key==='network') return key==='admin'?'an Administration':'a Network';
        return NAME[key[0]]+' '+(key[1]==='A'?'Active':'Inactive')+' Cell';
      }).join(', ')+'.');
    }
    used.add(selected.id);
  }
  g.tracks.pol=Math.min(10,pol+added);
  return used.size;
}
export function botNegotiate(g,limit,log) {
  const all=g.tracks.m>=15;
  const used=new Set();
  while(used.size<limit&&(all||used.size<2&&g.tracks.pol>5)) {
    const id=placeRanked(g,SPACE_IDS.filter(id=>!used.has(id)&&g.board[id].mI&&(g.board[id].rA||g.board[id].sA)&&(all||town(id)||g.board[id].network||g.board[id].person)),id=>[-Number(Boolean(g.board[id].person||g.board[id].network)),-Number(town(id))],log,'Negotiate: Personality or Network, then Towns');
    if(!id) break;
    const b=g.board[id];
    const side=pick(g,['r','s'].filter(f=>b[f+'A']));
    flip(b,'m',true);
    flip(b,side,false);
    g.tracks.pol=Math.max(0,g.tracks.pol-1);
    used.add(id);
  }
  return used.size;
}
function paths(origin,max=3) {
  const all=[];
  function add(path) {
    if(path.length>1) all.push(path);
    if(path.length<=max) for(const id of NEAR[path.at(-1)]) {
      if(path.includes(id)&&id!==origin) continue;
      if(id===origin&&path.length!==2) continue;
      if(path.length>2&&path.at(-1)===origin) continue;
      add([...path,id]);
    }
  }
  add([origin]);
  return all;
}
const MESSAGE_PATHS=Object.fromEntries(SPACE_IDS.map(id=>[id,paths(id)]));
export function botMessage(g,number,limit,log) {
  let used=0;
  const movedInto={};
  const phase2=number===63;
  const home=personality(g);
  const eligibleOrigin=id=>{
    const b=g.board[id], n=cells(b,'m');
    const protect=b.person?3:b.network?2:n===3&&pools(g).network&&capacity(b)>0?3:0;
    return n>protect&&n>(movedInto[id]??0);
  };
  const placeRank=(list,rank,label)=>chooseSpaceRanked(g,list,rank,log,label,x=>spaceName(x.from)+' → '+spaceName(x.to),x=>x.to);
  const eligibleRoutes=()=>SPACE_IDS.filter(eligibleOrigin).flatMap(from=>{
    const b=g.board[from];
    return MESSAGE_PATHS[from].map(path=>{
      const to=path.at(-1);
      const d=g.board[to];
      return {from,to,path,lone:Number(cells(b,'m')===1&&!b.network&&!b.person),active:Number(b.mA>0),
        drop:control(b)?false:Boolean(control({...b,[b.mA?'mA':'mI']:b[b.mA?'mA':'mI']-1})),
        clears:Boolean(control(d)&&!control({...d,mI:d.mI+1}))};
    }).filter(x=>x.from!==x.to||x.active);
  });
  function perform(route,newsId=null) {
    const b=g.board[route.from];
    const wasActive=b.mA>0;
    b[wasActive?'mA':'mI']--;
    const attached=newsId??(cells(b,'m')===0?newsAt(g,route.from,'m')[0]?.id:null);
    const n=g.news.find(token=>token.id===attached);
    let to=route.to, captured=false;
    if(n) {
      const start=route.path.indexOf(n.space);
      const options=route.path.slice(1).map((id,index)=>({id,index,threat:Math.max(g.board[id].rA,g.board[id].sA)}));
      const target=chooseSpaceRanked(g,options,x=>[-x.threat,Math.abs(x.index+1-start)],null,x=>spaceName(x.id),x=>x.id);
      if(target?.threat&&roll(g,log,'Message Capture in '+spaceName(target.id))<=target.threat) {
        to=target.id;
        captured=true;
      }
      n.space=to;
      n.owner='m';
    }
    g.board[to][captured?'mA':'mI']++;
    movedInto[to]=(movedInto[to]??0)+1;
    used++;
    cleanSpace(g,route.from);
    if(to!==route.to) log.push('Capture stops the Cell in '+spaceName(to)+'.');
  }
  const move=(label,filter,rank=()=>[],newsId=null)=>{
    if(used>=limit) return false;
    const route=placeRank(eligibleRoutes().filter(filter),x=>[...rank(x),-x.lone,-x.active,x.path.length],label);
    if(!route) return false;
    perform(route,newsId);
    return true;
  };
  if(phase2&&home) {
    const news=pick(g,g.news.filter(n=>!n.owner||n.owner==='m'));
    if(news) move('Bring News closer to the Personality',x=>x.path.includes(news.space)&&(!news.owner||x.from===news.space)&&distance(x.to,home)<distance(news.space,home),x=>[distance(x.to,home)],news.id);
  }
  const fill=(site,desired,label)=>{
    while(cells(g.board[site],'m')<desired&&move(label,x=>x.from!==site&&x.to===site)) {}
  };
  if(home) fill(home,3,'Build up to three Cells with the Personality');
  for(const id of SPACE_IDS.filter(id=>g.board[id].network)) fill(id,2,'Build up to two Cells at a Network');
  if(TOWNS.filter(id=>cells(g.board[id],'m')).length===1) move('Establish Cells in a second Town',x=>town(x.to)&&!cells(g.board[x.to],'m')&&(!town(x.from)||cells(g.board[x.from],'m')>1));
  if(pools(g).network) {
    const target=placeRanked(g,TOWNS.filter(id=>!g.board[id].network&&capacity(g.board[id])>0&&cells(g.board[id],'m')<3&&eligibleRoutes().some(x=>x.to===id&&x.from!==id)),id=>[-cells(g.board[id],'m')],null);
    if(target) fill(target,3,'Concentrate three Cells in a Town for a Network');
  }
  for(let i=0;i<(phase2?limit:1);i++) {
    if(!move('Remove Control in a populated space',x=>x.from!==x.to&&x.clears&&pop(x.to)>0&&(!x.drop||!pop(x.from)))) break;
  }
  return used;
}
function group(g,f,from,to,count,caps) {
  const b=g.board[from], d=g.board[to];
  const inactive=Math.min(b[f+'I'],count),active=count-inactive;
  const russian=f==='r'?Math.min(b.u,count):0;
  const origin={...b,[f+'I']:b[f+'I']-inactive,[f+'A']:b[f+'A']-active};
  const dest={...d,[f+'I']:d[f+'I']+inactive,[f+'A']:d[f+'A']+active};
  return {from,to,count,caps,russian,origin,dest,inactive};
}
const moveCaps=(g,f,from,to)=>{
  const list=g.board[from].caps[f];
  return list.filter(cap=>cap!=='train'||legalRail(g,from,to)).sort((a,b)=>['train','officer','cannon'].indexOf(a)-['train','officer','cannon'].indexOf(b)).slice(0,2);
};
function marchCandidates(g,f,from,targets,senatePop) {
  const b=g.board[from];
  const count=cells(b,f);
  if(f==='r'&&(town(from)||b.admin||!(b.g>=2||b.support>0&&!b.rA))||count<(f==='r'?2:4)) return [];
  return NEAR[from].flatMap(to=>{
    const c=group(g,f,from,to,f==='r'?count-1:Math.min(5,count-1),moveCaps(g,f,from,to));
    if(f==='r') {
      if(pop(from)&&control(b)==='r'&&control(c.origin)!=='r') return [];
      const gain=pop(to)&&control(g.board[to])!=='r'&&control(c.dest)==='r';
      const breaks=senatePop>=4&&town(to)&&control(g.board[to])==='s'&&control(c.dest)!=='s';
      if(!gain&&!breaks) return [];
      c.rank=[gain?0:1,-pop(to),gain?-g.board[to].support:0,b.g>=2?0:1];
      return [c];
    }
    if(town(from)&&(control(b)==='s'&&control(c.origin)!=='s'||control(b)!=='r'&&control(c.origin)==='r')) return [];
    const claim=town(to)&&control(g.board[to])!=='s'&&control(c.dest)==='s';
    const toward=targets.filter(id=>distance(to,id)<distance(from,id));
    if(!claim&&!toward.length) return [];
    c.rank=[claim?0:1,-Number(b.caps.s.length>0),-count,claim?-pop(to):-Math.max(...toward.map(pop)),nearest(to,targets)];
    return [c];
  });
}
export function eventMarch(g,f,from,to) {
  if(g.phase!==2||!NEAR[from].includes(to)) return null;
  const b=g.board[from], count=cells(b,f);
  if(f==='r'&&(town(from)||count<2)||f==='s'&&!count) return null;
  const caps=moveCaps(g,f,from,to);
  if(f==='s') return group(g,f,from,to,count,b.caps.s.filter(cap=>cap!=='train'||legalRail(g,from,to)));
  const floor=pop(from)>0&&control(b)==='r'?forces(b,'s')+forces(b,'m')+1-b.admin:1;
  const moving=count-Math.max(1,floor);
  return moving>0?group(g,f,from,to,moving,caps):null;
}
export function botMarch(g,f,limit,log) {
  const fromUsed=new Set(), toUsed=new Set();
  while(fromUsed.size<SPACE_IDS.length) {
    const targets=TOWNS.filter(id=>control(g.board[id])!=='s');
    const senatePop=score(g).senate;
    const candidates=SPACE_IDS.filter(id=>!fromUsed.has(id)&&!toUsed.has(id)).flatMap(from=>marchCandidates(g,f,from,targets,senatePop))
      .filter(x=>toUsed.size<limit||toUsed.has(x.to));
    const move=chooseSpaceRanked(g,candidates,x=>x.rank,log,'March: apply #'+(f==='r'?53:59)+' movement and destination priorities',x=>spaceName(x.from)+' → '+spaceName(x.to)+' ('+x.count+' Cells)',x=>x.to);
    if(!move) break;
    travel(g,f,move.from,move.to,move);
    fromUsed.add(move.from);
    toUsed.add(move.to);
    if(limit===1) break;
  }
  return toUsed.size;
}
function attackCandidates(g,f,from) {
  const b=g.board[from], count=cells(b,f);
  const enemy=f==='r'?'s':'r';
  const targets=TOWNS.filter(id=>control(g.board[id])!=='s');
  const defenders=id=>{
    const d=g.board[id];
    if(f==='s') return cells(d,'r')||d.admin||d.u?['r','u']:[];
    const result=[];
    if(cells(d,'s')) result.push('s');
    if(d.g) result.push('g');
    return result;
  };
  return [from,...NEAR[from]].flatMap(to=>{
    const move=from!==to, d=g.board[to], opp=defenders(to);
    if(!opp.length) return [];
    if(f==='s'&&count<3||f==='r'&&count<3&&!b.caps.r.length) return [];
    if(move&&(!b.caps[f].includes('train')||!legalRail(g,from,to)||count<4)) return [];
    const c=move?group(g,f,from,to,f==='r'?3:Math.min(5,count-1),moveCaps(g,f,from,to)):
      {from,to,count,caps:b.caps[f],russian:f==='r'?b.u:0};
    if(move&&f==='r'&&pop(from)>0&&control(b)==='r'&&control(c.origin)!=='r') return [];
    if(move&&f==='s'&&town(from)&&(control(b)==='s'&&control(c.origin)!=='s'||control(b)!=='r'&&control(c.origin)==='r')) return [];
    if(f==='r'&&!d.caps.s.length&&!(town(to)&&cells(d,enemy))&&!(pop(to)>0&&cells(d,enemy))) return [];
    if(f==='s'&&!(town(to)&&(!move||cells(d,enemy)))&&!(move&&targets.some(id=>distance(to,id)<distance(from,id)))) return [];
    c.defenders=opp;
    c.rank=f==='r'?[d.caps.s.length?0:town(to)?1:2,-Number(d.caps.s.includes('train')),-Number(c.caps.includes('train')),-pop(to),-Number(b.caps.r.length>0)]:
      [town(to)?0:1,-Number(c.caps.includes('train')),-pop(to),-Number(b.caps.s.length>0),-count];
    return [c];
  });
}
export function botAttack(g,f,limit,log,{boost=0,local=false}={}) {
  const used=new Set();
  let count=0;
  while(count<limit) {
    const candidates=SPACE_IDS.filter(id=>!used.has(id)).flatMap(id=>attackCandidates(g,f,id)).filter(c=>!used.has(c.to)&&(!local||c.from===c.to));
    const selected=chooseSpaceRanked(g,candidates,x=>x.rank,log,'Attack: #'+(f==='r'?52:58)+' group and target priorities',x=>spaceName(x.from)+(x.to!==x.from?' → '+spaceName(x.to):''),x=>x.to);
    if(!selected) break;
    const {from,to,defenders,russian,caps}=selected;
    if(from!==to) travel(g,f,from,to,selected);
    engage(g,log,{f,id:to,defenders,attackCount:selected.count,russians:russian,caps,boost,bot:true,attackerInactive:selected.inactive??null});
    used.add(from);
    used.add(to);
    count++;
  }
  return count;
}
