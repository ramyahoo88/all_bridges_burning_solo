import {BORDERS, CAP_NAME, FACTIONS, ISSUE_LABELS, LABEL, MOOD, NAME, SPACE_IDS, SPACES, TYPES, borderName, pop, spaceName, town} from './data.js';
import {cells, control, newsAt, pools, score, tracksResources} from './model.js';
import {EDIT_TRACKS} from './editor.js';
import {btn, check, checks, escape, group, numeric, select, sides, spaceOptions} from './ui-fields.js';

const factionClass = f=>f??'none';
const controlName=f=>f?NAME[f]+' Control':'Uncontrolled';
const numberFormat=n=>n.toLocaleString('en-US');
export function scoreStrip(g) {
  const p=score(g), t=g.tracks;
  const items=[['Polarization',t.pol,''],['Opposition + Admins',p.opp,'r'],['Senate Town Pop.',p.senate,'s'],
    ['Issues + Networks + 1',p.politics,'m'],['Reds + Senate Cells',p.cellTrack,''],['Russian Vassalage',t.rV,'r'],['German Vassalage',t.sV,'s']];
  return '<div class="score-strip">'+items.map(([label,value,f])=>'<div class="score '+factionClass(f)+'"><strong>'+escape(value)+'</strong><span>'+escape(label)+'</span></div>').join('')+'</div>';
}
const statusText=(f,b)=>cells(b,f)?b[f+'A']+' active · '+b[f+'I']+(f==='m'?' underground':' inactive'):'—';
export function boardCards(g,subset=SPACE_IDS) {
  return '<div class="board-grid">'+subset.map(id=>{
    const b=g.board[id], owner=control(b);
    const marks=[];
    for(const k of ['admin','network','g','u','rPrep','sPrep','rTerror','sTerror']) if(b[k]) marks.push(b[k]+' '+LABEL[k]);
    if(b.person) marks.push('Personality');
    for(const side of ['r','s']) for(const cap of b.caps[side]) marks.push(NAME[side]+' '+(cap==='officer'?side==='r'?'Commander':'Jaeger':CAP_NAME[cap]));
    for(const news of newsAt(g,id)) marks.push('News '+news.id+' · '+(NAME[news.owner]??'unheld'));
    return '<article class="space-card"><div class="line"><div><h3>'+escape(spaceName(id))+'</h3><p class="quiet">'+(town(id)?'Town':'Province')+' · Population '+pop(id)+'</p></div>'+
      btn('quick-correct','Correct',{value:id,kind:'subtle small'})+'</div><p class="space-mood"><span class="flag '+factionClass(owner)+'">'+escape(controlName(owner))+'</span><span>'+escape(MOOD[b.support+2])+'</span></p>'+
      '<div class="piece-list">'+FACTIONS.map(f=>'<div><span class="dot '+f+'"></span>'+escape(NAME[f])+' <strong>'+escape(statusText(f,b))+'</strong></div>').join('')+'</div>'+
      (marks.length?'<p class="quiet markers">'+escape(marks.join(' · '))+'</p>':'')+'</article>';
  }).join('')+'</div>';
}
function changeRows(rows) {
  return '<div class="changes">'+rows.map(([name,before,after])=>'<div class="change"><span>'+escape(name)+'</span><span class="before">'+escape(before)+'</span><span class="arrow" aria-hidden="true">→</span><strong>'+escape(after)+'</strong></div>').join('')+'</div>';
}
export function reportHtml(report,{applied=false}={}) {
  const d=report.diff;
  return (d.spaces.length?'<div class="diff-spaces">'+d.spaces.map(({id,rows,control,position})=>'<article class="diff-space"><div class="line"><div><h4>'+escape(spaceName(id))+'</h4><span class="quiet">'+
    (control[0]===control[1]?escape(control[1]):escape(control[0]+' → '+control[1]))+'</span></div>'+
    (applied&&SPACES[id]?btn('quick-correct','Correct',{value:id,kind:'subtle small'}):'')+'</div>'+changeRows(rows.filter(x=>x[0]!=='Control'))+(position?.length?'<details class="inline"><summary>Full space position</summary>'+changeRows(position)+'</details>':'')+'</article>').join('')+'</div>':'')+
    (d.tracks.length?'<details class="inline" '+(d.tracks.length<8?'open':'')+'><summary>Tracks and Available ('+d.tracks.length+')</summary>'+changeRows(d.tracks)+'</details>':'')+
    (!d.spaces.length&&!d.tracks.length?'<p class="quiet">No pieces or tracks change in this step.</p>':'')+
    (report.log.length?'<details class="inline why" '+(report.log.length<8?'open':'')+'><summary>'+ (applied?'Action record':'Decision and sequence')+'</summary><ul>'+report.log.map(line=>'<li>'+escape(line)+'</li>').join('')+'</ul></details>':'');
}
export function editSpace(g,edit,id) {
  if(!SPACES[id]) return;
  edit.spaces??={};
  edit.spaces[id]??={};
}
const capEdit=(path,list)=>TYPES.map(key=>{
  const label=key==='officer'?(path.endsWith('.r')?'Commander':'Jaeger'):CAP_NAME[key];
  return numeric(label,path+'.'+key,list.filter(x=>x===key).length,{max:4});
}).join('');
export function editorHtml(g,edit,base,{defaultSpace=null}={}) {
  const view=ensureEdit(edit,defaultSpace,g);
  const active=view.focus;
  const delta=active?edit.spaces[active]:null;
  const fieldSet=delta?{...g.board[active],...delta,caps:{...g.board[active].caps,...delta.caps}}:null;
  const options=spaceOptions();
  const shownKeys=['rA','rI','sA','sI','mA','mI','admin','network','g','u','rPrep','sPrep','rTerror','sTerror'];
  const path=base+'.spaces.'+active;
  return '<p class="quiet">Enter the final counts from the tabletop for each affected space. To record a move, enter both origin and destination. Control, scores, and Available counts recalculate when you preview.</p>'+
    '<div class="space-tabs">'+Object.keys(edit.spaces).map(id=>btn('focus-edit',spaceName(id),{value:base+'|'+id,kind:id===active?'selected small':'subtle small'})).join('')+'</div>'+
    group(select('Add or open a space',base+'.focus',active??'',options,{empty:'Choose space',refresh:true}))+
    (fieldSet?'<div class="edit-space"><div class="line"><h3>'+escape(spaceName(active))+'</h3>'+btn('reset-edit-space','Reset space',{value:base+'|'+active,kind:'subtle small'})+'</div>'+
      '<div class="counter-grid">'+shownKeys.map(key=>numeric(LABEL[key],path+'.'+key,fieldSet[key],{max:key.endsWith('Prep')?1:key.endsWith('Terror')?2:20})).join('')+'</div>'+
      group(select('Support or Opposition',path+'.support',fieldSet.support,MOOD.map((name,i)=>[i-2,name]),{number:true})+check('Personality',path+'.person',fieldSet.person))+
      '<details class="inline"><summary>Capabilities in '+escape(spaceName(active))+'</summary>'+
      ['r','s'].map(f=>'<p class="quiet">'+NAME[f]+'</p>'+group(capEdit(path+'.caps.'+f,fieldSet.caps[f]))).join('')+'</details></div>':'')+
    '<details class="inline"'+(edit.tracks?' open':'')+'><summary>Tracks and force boxes</summary><div class="counter-grid">'+EDIT_TRACKS.filter(key=>!['coordinate'].includes(key)&&(!FACTIONS.includes(key)||tracksResources(g,key))).map(key=>{
      const max=({pol:10,rV:6,sV:6,rC:3,sC:3,rOut:20,sOut:20,mOut:6,gOut:6,uOut:6,rPow:20,sPow:20})[key]??30;
      return numeric(FACTIONS.includes(key)?LABEL[key]+' Resources':LABEL[key],base+'.tracks.'+key,edit.tracks?.[key]??g.tracks[key],{max});
    }).join('')+'</div>'+check('Coordinate marker',base+'.tracks.coordinate',edit.tracks?.coordinate??g.tracks.coordinate)+'</details>'+
    '<details class="inline"><summary>News, Sabotage, Issues, and Capabilities box</summary>'+
    group([1,2].map(n=>{
      const token=edit.news?.find(x=>x.id===n)??(!edit.news?g.news.find(x=>x.id===n):null);
      return select('News '+n+' location',base+'.newsSlot.'+n+'.space',token?.space??'',spaceOptions(),{empty:'Available',refresh:true})+
        (token?select('News '+n+' holder',base+'.newsSlot.'+n+'.owner',token.owner??'',sides(FACTIONS),{empty:'Unheld'}):'');
    }).join(''))+
    checks('Sabotaged borders',base+'.sabotage',edit.sabotage??g.sabotage,BORDERS.map(key=>[key,borderName(key)]))+
    group(ISSUE_LABELS.map((name,i)=>select(name,base+'.issues.'+i,edit.issues?.[i]??g.issues[i]??'',
      [['','Unresolved'],['r','Red Resolved'],['s','White Resolved']])).join(''))+
    ['r','s'].map(f=>'<p class="quiet">'+NAME[f]+' Capabilities box</p>'+group(capEdit(base+'.held.'+f,edit.held?.[f]??g.held[f]))).join('')+'</details>';
}
function ensureEdit(edit,defaultSpace,g) {
  edit.spaces??={};
  if(defaultSpace&&!edit.focus) edit.focus=defaultSpace;
  if(edit.focus) editSpace(g,edit,edit.focus);
  return edit;
}
export function availableTable(g) {
  const p=pools(g);
  return '<div class="available">'+[['r','Reds Cells'],['s','Senate Cells'],['m','Moderates Cells'],['admin','Administrations'],['network','Networks'],['prep','Prepared'],['u','Russian Troops'],['g','German Troops'],['news','News'],['sabotage','Sabotage']].map(([key,label])=>
    '<span>'+escape(label)+' <strong>'+numberFormat(p[key])+'</strong></span>').join('')+'</div>';
}
