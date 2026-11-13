import {EVENTS, NAME, eventName} from './data.js';
import {adjustResource, pools, score} from './model.js';
import {roll} from './random.js';

export const TURN_LABEL = {pass:'Pass',limited:'Limited Command',full:'Command (may add Special Activity)',event:'Event'};
export const actor = g=>g.eligible.find(f=>!g.actions.some(a=>a.f===f))??null;
export const left = g=>g.eligible.filter(f=>!g.actions.some(a=>a.f===f)).length;
export const opening = g=>g.actions.find(x=>x.action!=='pass')?.action;
export function options(g) {
  if(!actor(g)) return [];
  const initial=opening(g);
  const occupied=g.actions.filter(x=>x.action!=='pass').map(x=>x.action);
  const possible=initial==='limited'?['full','limited']:initial==='full'?['event','limited']:initial==='event'?['full','limited']:['limited','full','event'];
  return ['pass',...possible.filter(action=>action!=='event'||g.current!==24).filter(action=>
    action==='limited'&&initial==='limited'?occupied.filter(x=>x==='limited').length<2:!occupied.includes(action))];
}
export function record(g,f,action,log,{reserved=false,news=false}={}) {
  if(f!==actor(g)||!options(g).includes(action)) throw Error('That action is unavailable on the Sequence of Play.');
  g.actions.push({f,action});
  if(action==='pass') {
    adjustResource(g,f,1);
    if(reserved) g.reserved={f,card:g.upcoming};
  }
  if(g.reserved?.f===f&&g.reserved.card===g.current) g.reserved=null;
  if(news) return;
  finishTurn(g,log);
}
export function finishTurn(g,log) {
  if(g.phase===1&&score(g).cellTrack>=27&&g.upcoming!==24) {
    if(g.upcoming!==null) discard(g,g.upcoming);
    if(g.reserved?.card===g.upcoming) g.reserved=null;
    g.upcoming=24;
    log.push('§2.4 · 27 or more Reds and Senate Cells. Red Revolt! replaces the upcoming card.');
  }
  if(!actor(g)) g.stage=g.german==='after'?'german':'advance';
}
function discard(g,id) { if(!g.seen.includes(id)) g.seen.push(id); }
export function reorder(g) {
  const row=opening(g);
  const byLetter = x=>x.action==='limited'?(row==='full'||(row==='limited'&&x===g.actions.find(a=>a.action==='limited'))?3:2):x.action==='event'?(row==='event'?3:2):0;
  const passes=g.actions.filter(x=>x.action==='pass').map(x=>x.f);
  const rest=g.actions.filter(x=>!['pass','full'].includes(x.action)).sort((a,b)=>byLetter(a)-byLetter(b)).map(x=>x.f);
  g.eligible=[...passes,...(g.ineligible?[g.ineligible]:[]),...rest];
  g.ineligible=g.actions.find(x=>x.action==='full')?.f??null;
  g.actions=[];
  g.german=null;
}
function validPhysical(g,id) {
  if(!EVENTS[id]||id===24||g.seen.includes(id)||id===g.current||id===g.upcoming) throw Error('Select a different Event card that has not been used.');
  return id;
}
function reveal(g,id) {
  if(g.mode==='digital') return g.deck.shift()??null;
  return validPhysical(g,id);
}
function showUpcoming(g,log) {
  if(EVENTS[g.upcoming]?.prop) {
    [g.current,g.upcoming]=[g.upcoming,g.current];
    g.round++;
    g.roundStep='victory';
    g.stage='propaganda';
    log.push('§2.3 · Set the Propaganda card in front of the displaced Event. Keep eligibility unchanged.');
  } else {
    g.stage='enter';
  }
}
export function startCards(g,log,intent) {
  if(g.mode==='digital') {
    g.current=reveal(g);
    g.upcoming=reveal(g);
  } else {
    g.current=validPhysical(g,Number(intent.current));
    g.upcoming=reveal(g,Number(intent.upcoming));
    if([g.current,g.upcoming].some(id=>EVENTS[id].prop||EVENTS[id].year!==1917)) throw Error('The first two cards must be 1917 Events.');
  }
  showUpcoming(g,log);
  g.cardNumber=1;
  log.push('Set '+eventName(g.current)+' in the current slot.');
  if(g.upcoming) log.push('Upcoming · '+eventName(g.upcoming)+'.');
}
export function advanceCard(g,log) {
  reorder(g);
  if(g.current!==null) discard(g,g.current);
  if(g.reserved?.card===g.current) g.reserved=null;
  g.current=g.upcoming;
  g.upcoming=null;
  g.cardNumber++;
  g.stage='reveal';
  log.push('Move '+eventName(g.current)+' to the current slot.');
  log.push('Eligibility · '+g.eligible.map(f=>NAME[f]).join(' → ')+(g.ineligible?'; ineligible '+NAME[g.ineligible]:''));
  if(g.mode==='digital') revealUpcoming(g,log);
}
export function revealUpcoming(g,log,card) {
  g.upcoming=reveal(g,Number(card));
  showUpcoming(g,log);
  if(g.upcoming) log.push('Upcoming · '+eventName(g.upcoming)+'.');
}
export function enterCard(g,log) {
  if(g.current===24) {
    g.stage='revolt';
    return;
  }
  if(g.phase===2&&EVENTS[g.current]?.german&&(pools(g).g>0||Object.values(g.board).some(b=>b.g))) {
    g.german=roll(g,log,'German timing (§3.4)')<=3?'before':'after';
    log.push('Germany acts '+g.german+' the factions.');
  }
  g.stage=g.german==='before'?'german':'turn';
}
export function endGermany(g) {
  if(g.german==='before') g.stage='turn';
  else g.stage='advance';
  g.german='done';
}
export function endPropaganda(g,log) {
  if(g.current!==null) discard(g,g.current);
  if(g.round===2&&g.phase===1&&g.upcoming!==24) {
    if(g.upcoming!==null) discard(g,g.upcoming);
    if(g.reserved?.card===g.upcoming) g.reserved=null;
    g.upcoming=24;
    log.push('§6.5.2 · Replace the displaced Event with Red Revolt!.');
  }
  g.current=g.upcoming;
  g.upcoming=null;
  g.stage='reveal';
  if(g.mode==='digital') revealUpcoming(g,log);
}
export function beginRevolt(g) {
  const index=g.eligible.indexOf('r');
  if(index<0) {
    g.ineligible=null;
    g.eligible.unshift('r');
  }
  g.actions=[{f:'r',action:'event'}];
}
export function endRevolt(g) {
  g.phase=2;
  g.stage=actor(g)?'turn':'advance';
}
