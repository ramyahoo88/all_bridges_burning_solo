import {BORDERS, CAP_NAME, CAP_STOCK, EVENTS, FACTIONS, LABEL, MARK, MOOD, NAME, PROPAGANDA, SALT, SPACES, SPACE_IDS, TYPES, borderName, capabilityName, pop, spaceName, town} from './data.js';
import {roll, shuffle} from './random.js';

export const clone = value=>structuredClone(value);
export const clamp = (value,min,max)=>Math.max(min,Math.min(max,value));
export const cells = (space,f)=>space[f+'A']+space[f+'I'];
export const capCount = (space,f)=>space.caps[f].length;
export const forces = (space,f)=>cells(space,f)+(f==='r'?space.admin:f==='m'?space.network:0);
export const control = space=>{
  const r=forces(space,'r'), s=forces(space,'s'), m=forces(space,'m');
  return r>s+m?'r':s>r+m?'s':null;
};
export const human = (game,f)=>game.humans.includes(f);
export const tracksResources = (game,f)=>f==='m'||human(game,f);
export const sumSpace = (game,fn)=>SPACE_IDS.reduce((sum,id)=>sum+fn(game.board[id],id),0);
export const countCells = (game,f)=>sumSpace(game,space=>cells(space,f));
export const countActive = (game,f)=>sumSpace(game,space=>space[f+'A']);
export const countTerror = (space)=>space.rTerror+space.sTerror;
export const availableTerror = (game,f)=>5-sumSpace(game,space=>space[f+'Terror']);
export const pools = (game)=>{
  const t=game.tracks;
  return {
    r:20-countCells(game,'r')-t.rPow-t.rOut,s:20-countCells(game,'s')-t.sPow-t.sOut,
    m:6-countCells(game,'m')-t.mOut,admin:3-sumSpace(game,space=>space.admin),
    network:2-sumSpace(game,space=>space.network),g:6-sumSpace(game,space=>space.g)-t.gOut,
    u:6-sumSpace(game,space=>space.u)-t.uOut,prep:3-sumSpace(game,space=>space.rPrep+space.sPrep),
    news:2-game.news.length,person:1-sumSpace(game,space=>Number(space.person)),
    rTerror:availableTerror(game,'r'),sTerror:availableTerror(game,'s'),sabotage:4-game.sabotage.length,
    rC:3-t.rC,sC:3-t.sC
  };
};
export const capacity = space=>2-space.admin-space.network;
export const personality = game=>SPACE_IDS.find(id=>game.board[id].person);
export const newsAt = (game,id,owner)=>game.news.filter(n=>n.space===id&&(owner===undefined||n.owner===owner));
export function blankSpace() {
  return {...Object.fromEntries(MARK.map(key=>[key,0])),support:0,person:false,caps:{r:[],s:[]}};
}
export function newGame({humans=['r'],seed=1,mode='physical',checkpoint=true}={}) {
  if(!Array.isArray(humans)||humans.length<1||humans.length>2||new Set(humans).size!==humans.length||humans.some(f=>!FACTIONS.includes(f))) throw Error('Choose one or two human factions.');
  if(!Number.isInteger(seed)||seed<0||seed>0xffffffff) throw Error('Enter a seed from 0 to 4294967295.');
  if(!['physical','digital'].includes(mode)) throw Error('Unknown Event deck mode.');
  const g={
    seed,rng:(seed^SALT.setup)>>>0,humans:[...humans],mode,checkpoint,spaceRolls:'map',
    board:Object.fromEntries(SPACE_IDS.map(id=>[id,blankSpace()])),
    tracks:{r:humans.includes('r')?5:0,s:humans.includes('s')?5:0,m:humans.includes('m')?5:0,
      pol:3,rV:3,sV:3,rC:0,sC:0,rIssue:0,sIssue:0,rPow:0,sPow:0,rOut:0,sOut:10,mOut:0,uOut:3,gOut:6,coordinate:false},
    phase:1,round:0,news:[],sabotage:[],held:{r:[],s:[]},issues:[null,null,null],
    eligible:[],ineligible:null,actions:[],current:null,upcoming:null,deck:[],seen:[],reserved:null,
    stage:'setup',german:null,interrupt:null,result:null,setupLog:[],cardNumber:0
  };
  Object.assign(g.board.hel,{rI:1,sI:1,mI:1,u:1});
  for(const id of ['uus','tam','ham']) Object.assign(g.board[id],{rI:2,support:-1});
  g.board.tur.rI=1;
  Object.assign(g.board.vii,{rI:1,u:1});
  Object.assign(g.board.vaa,{sI:1,support:2});
  Object.assign(g.board.poh,{sI:1,u:1,support:1});
  const white=roll(g,g.setupLog,'Setup Senate placement')<=3?'tur':'vii';
  const blue=['tur','tam','vii'][Math.floor((roll(g,g.setupLog,'Setup Moderates placement')-1)/2)];
  g.board[white].sI++;
  g.board[blue].mI++;
  g.eligible=shuffle(g,FACTIONS);
  g.setupLog.push('Place the extra Senate Cell in '+spaceName(white)+' and the extra Moderates Cell in '+spaceName(blue)+'.');
  g.setupLog.push('Starting order · '+g.eligible.map(f=>NAME[f]).join(' → '));
  if(mode==='digital') g.deck=createDeck(seed);
  return g;
}
export function createDeck(seed) {
  const stream={rng:(seed^SALT.deck)>>>0};
  const years=[shuffle(stream,Array.from({length:21},(_,i)=>i+1)),shuffle(stream,Array.from({length:21},(_,i)=>i+25))];
  return PROPAGANDA.flatMap((id,index)=>{
    const cards=years[Math.floor(index/2)];
    const offset=index%2*9;
    return [...cards.slice(offset,offset+5),...shuffle(stream,[...cards.slice(offset+5,offset+9),id])];
  });
}
export function adjustResource(g,f,amount) {
  if(tracksResources(g,f)) g.tracks[f]=clamp(g.tracks[f]+amount,0,30);
}
export function pay(g,f,cost,free=false) {
  if(free||!human(g,f)) return;
  if(g.tracks[f]<cost) throw Error(NAME[f]+' needs '+cost+' Resources. Available: '+g.tracks[f]+'.');
  adjustResource(g,f,-cost);
}
export function flip(space,f,toActive,count=1) {
  const from=f+(toActive?'I':'A'), to=f+(toActive?'A':'I');
  const used=Math.min(space[from],count);
  space[from]-=used;
  space[to]+=used;
  return used;
}
export function addNews(g,id,owner=null) {
  if(g.news.length>=2) return false;
  const token=[1,2].find(i=>!g.news.some(n=>n.id===i));
  g.news.push({id:token,space:id,owner});
  return true;
}
export function cleanSpace(g,id,{reason='',actor=null}={}) {
  const b=g.board[id];
  for(const f of ['r','s']) if(!cells(b,f)) {
    b[f+'Prep']=0;
    b.caps[f]=[];
  }
  if(!cells(b,'m')) {
    if(b.person&&['terror','event-ransom'].includes(reason)) {
      const paid=Math.min(g.tracks.m,3);
      adjustResource(g,'m',-paid);
      if(actor&&actor!=='m') adjustResource(g,actor,paid);
    }
    b.person=false;
  }
  g.news=g.news.filter(n=>{
    if(n.space!==id||!n.owner||cells(b,n.owner)) return true;
    if((reason==='terror'||reason.startsWith('event'))&&n.owner==='m'&&['r','s'].includes(actor)&&cells(b,actor)) {
      n.owner=actor;
      return true;
    }
    return false;
  });
}
export function score(g) {
  const t=g.tracks;
  const opp=sumSpace(g,(b,id)=>Math.max(0,-b.support)*pop(id)+b.admin);
  const senate=sumSpace(g,(b,id)=>town(id)&&control(b)==='s'?pop(id):0);
  const redPop=sumSpace(g,(b,id)=>control(b)==='r'?pop(id):0);
  const politics=t.rIssue+t.sIssue+sumSpace(g,b=>b.network)+1;
  const redsFree=t.rV+t.pol<=5, senateFree=t.sV+t.pol<=5;
  return {
    opp,senate,redPop,politics,cellTrack:countCells(g,'r')+countCells(g,'s'),
    margins:{r:redsFree?opp-11:0,s:senateFree?senate-3:0,m:Math.min(t.m-14,politics-t.pol)},
    qualify:{r:redsFree&&opp>11,s:senateFree&&senate>3,m:t.m>14&&politics>=t.pol}
  };
}
export function victory(g,final=false) {
  const points=score(g);
  const solo=g.humans.length===1;
  const ranks=[...FACTIONS].sort((a,b)=>points.margins[b]-points.margins[a]||
    Number(human(g,a))-Number(human(g,b))||['m','s','r'].indexOf(a)-['m','s','r'].indexOf(b));
  const qualified=ranks.filter(f=>points.qualify[f]&&(!solo||!human(g,f)));
  if(!final&&!qualified.length) return null;
  const t=g.tracks;
  let winner=final?ranks[0]:qualified[0];
  if(final&&points.margins[winner]<=0) winner=t.rV===t.sV?null:t.rV>t.sV?'u':'g';
  return {winner,final,margins:points.margins,order:ranks,soloWin:solo&&g.humans.includes(winner)};
}
export function validateGame(g) {
  if(!g||typeof g!=='object') throw Error('Missing campaign state.');
  if(!Number.isInteger(g.rng)||g.rng<0||g.rng>0xffffffff||!Number.isInteger(g.seed)||g.seed<0||g.seed>0xffffffff) throw Error('Invalid random stream.');
  if(!Array.isArray(g.humans)||g.humans.length<1||g.humans.length>2||new Set(g.humans).size!==g.humans.length||g.humans.some(f=>!FACTIONS.includes(f))) throw Error('Invalid human factions.');
  if(!['physical','digital'].includes(g.mode)||![1,2].includes(g.phase)) throw Error('Invalid campaign phase or deck mode.');
  if(g.spaceRolls!==undefined&&g.spaceRolls!=='map') throw Error('Invalid random-space procedure.');
  if(!g.board||!g.tracks||!g.held||!Array.isArray(g.news)||!Array.isArray(g.sabotage)) throw Error('Invalid board or tracks.');
  if(g.issues===undefined) g.issues=[...Array(g.tracks.rIssue).fill('r'),...Array(g.tracks.sIssue).fill('s'),...Array(3-g.tracks.rIssue-g.tracks.sIssue).fill(null)];
  if(!Array.isArray(g.issues)||g.issues.length!==3||g.issues.some(side=>![null,'r','s'].includes(side))||['r','s'].some(side=>g.issues.filter(x=>x===side).length!==g.tracks[side+'Issue'])) throw Error('Resolved Issue markers do not match the Political Display.');
  const t=g.tracks;
  for(const f of FACTIONS) assertInt(t[f],0,30,NAME[f]+' Resources');
  for(const key of ['pol','rV','sV','rC','sC','rIssue','sIssue','rOut','sOut','mOut','gOut','uOut','rPow','sPow']) {
    const max=({pol:10,rV:6,sV:6,rC:3,sC:3,rIssue:3,sIssue:3,gOut:6,uOut:6,mOut:6})[key]??20;
    assertInt(t[key],0,max,LABEL[key]);
  }
  if(typeof t.coordinate!=='boolean'||t.rIssue+t.sIssue>3) throw Error('Invalid Political Display or Coordinate marker.');
  for(const f of ['r','s']) {
    if(!Array.isArray(g.held[f])||g.held[f].length>8||g.held[f].some(cap=>!TYPES.includes(cap))) throw Error('Invalid Capabilities box.');
  }
  for(const id of SPACE_IDS) {
    const b=g.board[id];
    if(!b||!b.caps) throw Error('Missing board space '+spaceName(id)+'.');
    for(const key of MARK) assertInt(b[key],0,key.endsWith('Prep')?1:20,LABEL[key]+' in '+spaceName(id));
    assertInt(b.support,-2,2,'Support / Opposition in '+spaceName(id));
    if(typeof b.person!=='boolean'||b.person&&!cells(b,'m')||capacity(b)<0||countTerror(b)>2) throw Error('Check stacking or the Personality in '+spaceName(id)+'.');
    for(const f of ['r','s']) {
      if(!Array.isArray(b.caps[f])||b.caps[f].length>8||b.caps[f].some(cap=>!TYPES.includes(cap))||!cells(b,f)&&(b.caps[f].length||b[f+'Prep'])) throw Error('A '+NAME[f]+' Capability or Prepared marker needs a friendly Cell in '+spaceName(id)+'.');
    }
  }
  for(const cap of TYPES) {
    const used=['r','s'].reduce((sum,f)=>sum+g.held[f].filter(key=>key===cap).length+sumSpace(g,b=>b.caps[f].filter(key=>key===cap).length),0);
    if(used>CAP_STOCK[cap]) throw Error('Too many '+CAP_NAME[cap]+' markers on the board and in the Capabilities box.');
  }
  for(const [key,count] of Object.entries(pools(g))) if(count<0) throw Error('Too many '+(LABEL[key]??key)+' pieces or markers on the board and in boxes.');
  if(new Set(g.sabotage).size!==g.sabotage.length||g.sabotage.some(e=>!BORDERS.includes(e))) throw Error('Invalid Sabotage border.');
  if(new Set(g.news.map(n=>n.id)).size!==g.news.length||g.news.some(n=>![1,2].includes(n.id)||!SPACES[n.space]||n.owner!==null&&(!FACTIONS.includes(n.owner)||!cells(g.board[n.space],n.owner)))) throw Error('Each held News marker needs a friendly Cell.');
  if(!Array.isArray(g.eligible)||new Set(g.eligible).size!==g.eligible.length||g.eligible.some(f=>!FACTIONS.includes(f))||g.ineligible!==null&&!FACTIONS.includes(g.ineligible)||g.eligible.includes(g.ineligible)) throw Error('Invalid eligibility order.');
  if(!Array.isArray(g.actions)||g.actions.length>3||new Set(g.actions.map(x=>x.f)).size!==g.actions.length||g.actions.some(x=>!FACTIONS.includes(x.f)||!['pass','limited','full','event'].includes(x.action))) throw Error('Invalid recorded action.');
  if(!['setup','reveal','enter','turn','advance','german','revolt','propaganda','ended'].includes(g.stage)) throw Error('Invalid turn stage.');
  for(const card of [g.current,g.upcoming]) if(card!==null&&!EVENTS[card]) throw Error('Invalid Event card.');
  if((g.current===null&&g.stage!=='setup')||(g.stage==='turn'&&(!g.interrupt||g.interrupt.kind!=='news'&&g.interrupt.scope!=='news')&&!g.eligible.some(f=>!g.actions.some(a=>a.f===f)))) throw Error('Invalid current turn.');
  if(g.reserved!==null&&(!g.reserved||!FACTIONS.includes(g.reserved.f)||!EVENTS[g.reserved.card]||human(g,g.reserved.f))) throw Error('Invalid NP to Play reservation.');
  if(![null,undefined,'victory','politics','resources','turmoil','agitate-0','agitate-1','agitate-2','endcheck','pow-r','pow-s','pow-end','reset'].includes(g.roundStep)) throw Error('Invalid Propaganda phase.');
  if(![null,undefined,'reds','caps'].includes(g.revoltStep)||![null,'before','after','done'].includes(g.german)) throw Error('Invalid Pivotal or German stage.');
  if(!Array.isArray(g.setupLog)||g.setupLog.some(x=>typeof x!=='string')) throw Error('Invalid setup record.');
  if(g.changedSpaces!==undefined&&(!Array.isArray(g.changedSpaces)||g.changedSpaces.some(id=>!SPACES[id]))) throw Error('Invalid changed-space record.');
  if(!Array.isArray(g.deck)||!Array.isArray(g.seen)||g.deck.length>40||g.seen.length>47||[...g.deck,...g.seen].some(card=>!EVENTS[card])) throw Error('Invalid deck or played cards.');
  const p=g.interrupt;
  if(p!==null) {
    if(!p||typeof p.title!=='string'||!['manual','news','politics','agitate','prisoners','revolt','capabilities','event-choice'].includes(p.kind)) throw Error('Invalid pending resolution.');
    if(p.kind!=='politics'&&!FACTIONS.includes(p.f)) throw Error('Invalid faction for a pending decision.');
    if(p.kind==='manual'&&(!['event','command','bot-command','news','revolt','german'].includes(p.scope)||typeof p.instruction!=='string'||p.scope==='event'&&!EVENTS[p.card])) throw Error('Invalid tabletop instructions.');
    if(['politics','capabilities'].includes(p.kind)&&(!Array.isArray(p.choices)||!p.choices.length)) throw Error('Missing pending choices.');
    if(p.kind==='politics'&&(!['issue','leadership'].includes(p.sub)||p.choices.some(x=>p.sub==='issue'?![0,1,2].includes(x):!SPACES[x]))) throw Error('Invalid Politics choices.');
    if(p.kind==='capabilities'&&(!TYPES.includes(p.cap)||p.choices.some(id=>!SPACES[id]))) throw Error('Invalid Capability choices.');
    if(p.kind==='prisoners') assertInt(p.max,1,20,'Available prisoners');
    if(p.kind==='event-choice'||p.event!==undefined) {
      const byKind={'event-choice':[7,34],prisoners:[28]};
      if(!byKind[p.kind]?.includes(p.event)||p.event!==g.current||g.stage!=='turn'||!human(g,p.f)||p.playedBy!==g.eligible.find(f=>!g.actions.some(a=>a.f===f))) throw Error('Invalid Event continuation.');
      const validFaction=p.event===7?p.f==='r'&&p.playedBy==='m':p.event===34?p.f==='s'&&p.playedBy==='r':['r','s'].includes(p.f)&&p.playedBy==='m';
      if(!validFaction) throw Error('Invalid Event choice faction.');
    }
  }
  assertInt(g.round,0,4,'Propaganda rounds');
  assertInt(g.cardNumber,0,60,'Card sequence number');
  return g;
}
function assertInt(value,min,max,label) {
  if(!Number.isInteger(value)||value<min||value>max) throw Error('Check '+label+' ('+min+' to '+max+').');
}
function describeValue(key,value) {
  if(key==='support') return MOOD[value+2];
  if(typeof value==='boolean') return value?'On':'Off';
  return String(value);
}
const sides = f=>NAME[f]??'Uncontrolled';
const capText = (list,f)=>list.map(key=>capabilityName(key,f)).join(', ')||'—';
const newsText = list=>list.map(n=>'#'+n.id+' '+(n.owner?NAME[n.owner]:'unheld')).join(', ')||'—';
export function boardDiff(before,after) {
  const spaces=[];
  for(const id of SPACE_IDS) {
    const a=before.board[id],b=after.board[id],rows=[];
    for(const k of [...MARK,'person','support']) if(a[k]!==b[k]) rows.push([LABEL[k],describeValue(k,a[k]),describeValue(k,b[k])]);
    for(const f of ['r','s']) {
      const beforeCaps=capText(a.caps[f],f), afterCaps=capText(b.caps[f],f);
      if(beforeCaps!==afterCaps) rows.push([NAME[f]+' Capabilities',beforeCaps,afterCaps]);
    }
    const old=newsText(newsAt(before,id)), now=newsText(newsAt(after,id));
    if(old!==now) rows.push(['News',old,now]);
    if(control(a)!==control(b)) rows.push(['Control',sides(control(a)),sides(control(b))]);
    if(rows.length) {
      const position=[...MARK,'person','support'].filter(k=>k==='support'||a[k]||b[k]).map(k=>[LABEL[k],describeValue(k,a[k]),describeValue(k,b[k])]);
      for(const f of ['r','s']) if(a.caps[f].length||b.caps[f].length) position.push([NAME[f]+' Capabilities',capText(a.caps[f],f),capText(b.caps[f],f)]);
      if(old!=='—'||now!=='—') position.push(['News',old,now]);
      position.push(['Control',sides(control(a)),sides(control(b))]);
      spaces.push({id,rows,position,control:[sides(control(a)),sides(control(b))]});
    }
  }
  const tracks=[];
  for(const k of Object.keys(before.tracks)) if(before.tracks[k]!==after.tracks[k]) tracks.push([FACTIONS.includes(k)?NAME[k]+' Resources':LABEL[k],describeValue(k,before.tracks[k]),describeValue(k,after.tracks[k])]);
  if(before.phase!==after.phase) tracks.push(['Phase',String(before.phase),String(after.phase)]);
  if(before.round!==after.round) tracks.push(['Propaganda round',String(before.round),String(after.round)]);
  ISSUE_LABELS_DIFF(before,after,tracks);
  for(const key of new Set([...before.sabotage,...after.sabotage])) if(before.sabotage.includes(key)!==after.sabotage.includes(key)) tracks.push(['Sabotage · '+borderName(key),before.sabotage.includes(key)?'Present':'Clear',after.sabotage.includes(key)?'Present':'Clear']);
  const as=score(before),bs=score(after);
  for(const [key,label] of [['opp','Opposition + Administrations'],['senate','Senate Town Population'],['politics','Issues + Networks + 1'],['cellTrack','Reds + Senate Cells']]) if(as[key]!==bs[key]) tracks.push([label,String(as[key]),String(bs[key])]);
  const ap=pools(before),bp=pools(after);
  const poolLabels={r:'Reds Cells',s:'Senate Cells',m:'Moderates Cells',prep:'Prepared markers',news:'News markers',sabotage:'Sabotage markers',person:'Personality'};
  for(const key of Object.keys(ap)) if(ap[key]!==bp[key]) tracks.push(['Available · '+(poolLabels[key]??LABEL[key]??key),String(ap[key]),String(bp[key])]);
  for(const f of ['r','s']) {
    const beforeCaps=capText(before.held[f],f), afterCaps=capText(after.held[f],f);
    if(beforeCaps!==afterCaps) tracks.push([NAME[f]+' Capabilities box',beforeCaps,afterCaps]);
  }
  return {spaces,tracks};
}
function ISSUE_LABELS_DIFF(before,after,tracks) {
  const names=['Eight-hour working day','Land reform','Social security'];
  before.issues.forEach((side,i)=>{
    if(side!==after.issues[i]) tracks.push([names[i],NAME[side]??'Unresolved',NAME[after.issues[i]]??'Unresolved']);
  });
}
