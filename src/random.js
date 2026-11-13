import {spaceName} from './data.js';

// A uint32 stream belongs to the game snapshot. Preview code uses a private clone.
export function randomWord(state) {
  state.rng=(state.rng+0x6D2B79F5)>>>0;
  let x=state.rng;
  x=Math.imul(x^(x>>>15),x|1);
  x^=x+Math.imul(x^(x>>>7),x|61);
  return (x^(x>>>14))>>>0;
}
export function randomIndex(state,length) {
  if(length<2) return 0;
  const ceiling=0x100000000-0x100000000%length;
  let word=randomWord(state);
  while(word>=ceiling) word=randomWord(state);
  return word%length;
}
export function roll(state,log,label) {
  const die=randomIndex(state,6)+1;
  if(label) log.push(label+' · rolled '+die);
  return die;
}
export function pick(state,items) {return items[randomIndex(state,items.length)];}
export function shuffle(state,items) {
  const result=[...items];
  for(let i=result.length-1;i>0;i--) {
    const j=randomIndex(state,i+1);
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
const RANDOM_SPACES=[
  ['political',11,33,55],['hel',12,34,56],['uus',13,35,61],['mik',14,36,62],
  ['vii',15,41,63],['kar',16,42,64],['kuo',21,43,65],['tam',22,44,66],
  ['ham',23,45],['oul',24,46],['vaa',25,51],['poh',26,52],['var',31,53],['tur',32,54]
];
export function spaceFromRoll(value,eligible) {
  const start=RANDOM_SPACES.findIndex(([, ...rolls])=>rolls.includes(value));
  if(start<0) throw Error('The Random Spaces Map needs two d6 digits.');
  for(let i=0;i<RANDOM_SPACES.length;i++) {
    const [id]=RANDOM_SPACES[(start+i)%RANDOM_SPACES.length];
    if(eligible.includes(id)) return id;
  }
}
export function pickSpace(state,items,log) {
  if(items.length<2||state.spaceRolls!=='map') return pick(state,items);
  const value=10*roll(state,log)+roll(state,log);
  const id=spaceFromRoll(value,items);
  if(log) log.push('§8.6 Random Spaces Map · '+value+' → '+(id==='political'?'Political Display':spaceName(id)));
  return id;
}
export function chooseSpaceRanked(state,items,ranking,log,label,describe=spaceName,site=item=>item) {
  return chooseRanked(state,items,ranking,log,label,describe,ties=>{
    if(state.spaceRolls!=='map') return pick(state,ties);
    const id=pickSpace(state,[...new Set(ties.map(site))],log);
    return pick(state,ties.filter(item=>site(item)===id));
  });
}
export function chooseRanked(state,items,ranking,log,label,describe=String,breakTie=ties=>pick(state,ties)) {
  if(!items.length) return undefined;
  const ordered=items.map(item=>({item,rank:ranking(item)})).sort((a,b)=>compareRank(a.rank,b.rank));
  const ties=ordered.filter(entry=>compareRank(entry.rank,ordered[0].rank)===0).map(entry=>entry.item);
  const item=breakTie(ties);
  if(label&&log) {
    const names=[...new Set(ties.map(describe))];
    const note=ties.length<2?'':names.length===1?' (random choice in this space)':
      ' (random tie among '+names.slice(0,5).join(', ')+(names.length>5?' and '+(names.length-5)+' others':'')+')';
    log.push(label+' · '+describe(item)+note);
  }
  return item;
}
function compareRank(a,b) {
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return a[i]-b[i];
  return 0;
}
