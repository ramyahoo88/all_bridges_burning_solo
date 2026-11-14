// Independent second-audit positions. No production modules are patched.
import {newGame,validateGame} from '../../src/model.js';
import {position} from '../../test/fixtures.mjs';
import {roll} from '../../src/random.js';
import {preview} from '../../src/engine.js';
import {addCampaign,commitCampaign,duplicateCampaign,emptyCollection,newCampaign} from '../../src/storage.js';

export function nextDie(g,value) {
  g.rng=Array.from({length:1000},(_,rng)=>rng).find(rng=>roll({rng},[])===value);
  if(g.rng===undefined) throw Error('No suitable deterministic stream found.');
  return g;
}
export function attritionPosition(human=true) {
  const g=position({humans:human?['r']:['s'],phase:2});
  Object.assign(g.board.hel,{rI:3,u:2,g:3});
  Object.assign(g.tracks,{gOut:3,r:human?20:0});
  return validateGame(nextDie(g,3));
}
export const attritionIntent={type:'human',action:'limited',command:'Attack',rows:[
  {from:'hel',to:'hel',count:3,russian:2,boost:6,defenders:'g'}
]};
export function attackPriorityPosition(f) {
  const g=position({humans:[f==='s'?'r':'s'],phase:2});
  const origin=f==='s'?'tam':'ham';
  Object.assign(g.board[origin],{rI:3,sI:3});
  g.board[origin].caps[f]=['cannon'];
  Object.assign(g.board.hel,{rI:3,sI:3});
  return validateGame(g);
}
export function marchPriorityPosition() {
  const g=position({humans:['s'],phase:2});
  Object.assign(g.board.ham,{rI:4,g:2});
  Object.assign(g.board.uus,{rI:4,support:1});
  g.tracks.gOut=4;
  return validateGame(g);
}
export function trainPosition(f='s') {
  const g=position({humans:[f==='s'?'r':'s'],phase:2});
  const foe=f==='s'?'r':'s';
  g.board.uus[f+'I']=4;
  g.board.uus.caps[f]=['train'];
  Object.assign(g.board.hel,{[f+'I']:1,[foe+'I']:3,[foe+'Prep']:1});
  g.board.hel.caps[f]=[f==='s'?'officer':'cannon'];
  g.board.hel.caps[foe]=['officer','cannon'];
  return validateGame(nextDie(g,f==='s'?5:1));
}
export function multipleGroupsPosition() {
  const g=position({humans:['r'],phase:2});
  g.board.uus.sI=11;
  g.board.uus.caps.s=['train','officer'];
  g.sabotage=['hel/uus'];
  return validateGame(g);
}
export function newsPosition(human=true) {
  const g=position({humans:human?['m']:['r'],phase:2});
  Object.assign(g.board.hel,{mI:2,person:true});
  Object.assign(g.tracks,{m:10,pol:5,rIssue:2,sIssue:1});
  g.issues=['r','s','r'];
  g.news=[{id:1,space:'hel',owner:'m'}];
  return validateGame(g);
}
export function collectionWithHistory(count) {
  const source=newCampaign('Boundary test',newGame({seed:1}));
  // Thirty normal, reversible board corrections through the public engine API.
  for(let i=0;i<30;i++) {
    const plan=preview(source.game,{type:'correct',edit:{tracks:{r:5+i%2}}});
    const {after,title,log,diff}=plan;
    commitCampaign(source,after,title,{title,log,diff});
  }
  const collection=emptyCollection();
  addCampaign(collection,source);
  for(let i=1;i<count;i++) duplicateCampaign(collection,source.id);
  return collection;
}
