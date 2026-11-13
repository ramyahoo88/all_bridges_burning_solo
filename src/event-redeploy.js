import {SPACE_IDS, TOWNS, pop, spaceName} from './data.js';
import {cells, cleanSpace, control, forces, newsAt} from './model.js';
import {chooseSpaceRanked} from './random.js';

const neededForControl=b=>forces(b,'r')+forces(b,'m')+1;
const capGap=(count,n)=>count>=3?Math.abs(2-n):0;
function* allocations(donor,targets,needed,room,index=0,left=donor.count,stock=donor.caps,moves=[]) {
  if(index===targets.length) {
    if(moves.length&&(left||!stock)) {
      yield {moves,gap:capGap(left,stock)-capGap(donor.count,donor.caps)};
    }
    return;
  }
  for(let amount=0;amount<=Math.min(needed[index],left-donor.keep);amount++) {
    const maxCaps=amount?Math.min(room[index],stock):0;
    for(let caps=0;caps<=maxCaps;caps++) {
      const next=amount?[...moves,{index,from:donor.id,to:targets[index],amount,caps}]:moves;
      yield* allocations(donor,targets,needed,room,index+1,left-amount,stock-caps,next);
    }
  }
}
function makePlan(g,ids,targets,counts,need,keep) {
  const donors=ids.map(id=>({id,count:counts[id],caps:g.board[id].caps.s.length,keep:keep[id]}));
  const targetCaps=targets.map(id=>g.board[id].caps.s.length);
  const initialRoom=targetCaps.map(caps=>Math.max(0,2-caps));
  const spare=[...donors.map(donor=>donor.count-donor.keep),0];
  for(let i=spare.length-2;i>=0;i--) spare[i]+=spare[i+1];
  const memo=new Map();
  // The roll limits all transfers to six Cells. Reuse subproblems with the same remaining demand.
  function solve(start,needed,room) {
    const total=needed.reduce((sum,n)=>sum+n,0);
    if(total===0) {
      const gap=targets.reduce((sum,id,i)=>sum+capGap(need[id],targetCaps[i]+initialRoom[i]-room[i])-capGap(counts[id],targetCaps[i]),0);
      return {gap,choices:[]};
    }
    if(total>spare[start]) return {gap:Infinity,choices:[]};
    const key=[start,...needed,...room].join(',');
    if(memo.has(key)) return memo.get(key);
    let best=Infinity, choices=[];
    for(let i=start;i<donors.length&&total<=spare[i];i++) {
      for(const {moves,gap} of allocations(donors[i],targets,needed,room)) {
        const nextNeeded=[...needed], nextRoom=[...room];
        for(const move of moves) {
          nextNeeded[move.index]-=move.amount;
          nextRoom[move.index]-=move.caps;
        }
        const tail=solve(i+1,nextNeeded,nextRoom), totalGap=gap+tail.gap;
        if(totalGap===Infinity||totalGap>best) continue;
        if(totalGap<best) choices=[];
        best=totalGap;
        choices.push({moves,tail});
      }
    }
    const result={gap:best,choices};
    memo.set(key,result);
    return result;
  }
  return solve(0,targets.map(id=>need[id]-counts[id]),initialRoom);
}
function plans(g,limit) {
  const counts=Object.fromEntries(SPACE_IDS.map(id=>[id,cells(g.board[id],'s')]));
  const need=Object.fromEntries(SPACE_IDS.map(id=>[id,neededForControl(g.board[id])]));
  const gains=TOWNS.filter(id=>counts[id]>0&&counts[id]<need[id]);
  const keep=Object.fromEntries(SPACE_IDS.map(id=>{
    const b=g.board[id];
    const townMinimum=TOWNS.includes(id)&&control(b)==='s'?need[id]:0;
    return [id,Math.max(townMinimum,b.sPrep,Math.min(counts[id],newsAt(g,id,'s').length))];
  }));
  const possible=[];
  for(let mask=1;mask<(1<<gains.length);mask++) {
    const targets=gains.filter((_,i)=>mask&(1<<i));
    const moved=targets.reduce((n,id)=>n+need[id]-counts[id],0);
    if(moved>limit) continue;
    const donors=SPACE_IDS.filter(id=>!targets.includes(id)&&counts[id]>keep[id]);
    if(donors.reduce((n,id)=>n+counts[id]-keep[id],0)<moved) continue;
    const allocation=makePlan(g,donors,targets,counts,need,keep);
    if(allocation.gap===Infinity) continue;
    const population=targets.reduce((n,id)=>n+pop(id),0);
    const support=targets.reduce((n,id)=>n+g.board[id].support,0);
    possible.push({allocation,targets,ranks:[-population,support,moved,allocation.gap]});
  }
  return possible;
}

export function canRedeploy(g) {
  return plans(g,3).length>0;
}
export function redeploy(g,limit,log) {
  const plan=chooseSpaceRanked(g,plans(g,limit),p=>p.ranks,log,
    '#42 · Maximize additional Senate Town Population, then least Support',
    p=>p.targets.map(spaceName).join(' and '),p=>p.targets[0]);
  if(!plan) return false;
  for(let group=plan.allocation;group.choices.length;) {
    const choice=chooseSpaceRanked(g,group.choices,()=>[],log,
      '#42 · Preserve controlled Towns and balance Capabilities',c=>spaceName(c.moves[0].from),c=>c.moves[0].from);
    for(const {from,to,amount,caps} of choice.moves) {
      const source=g.board[from], dest=g.board[to], inactive=Math.min(amount,source.sI);
      if(caps) dest.caps.s.push(...source.caps.s.splice(-caps));
      source.sI-=inactive;
      source.sA-=amount-inactive;
      dest.sI+=inactive;
      dest.sA+=amount-inactive;
      cleanSpace(g,from);
      log.push('Redeploy '+amount+' Senate Cell'+(amount===1?'':'s')+(caps?' and '+caps+' Capabilities':'')+' · '+spaceName(from)+' → '+spaceName(to)+'.');
    }
    group=choice.tail;
  }
  return true;
}
