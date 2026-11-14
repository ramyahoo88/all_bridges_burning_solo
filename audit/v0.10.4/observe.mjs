import {cells,validateGame} from '../../src/model.js';
import {preview} from '../../src/engine.js';
import {engage} from '../../src/actions.js';
import {executeBotCard} from '../../src/bots.js';
import {botPersonality} from '../../src/bot-rally.js';
import {decode,encode} from '../../src/storage.js';
import {position} from '../../test/fixtures.mjs';
import {attritionPosition,attritionIntent,attackPriorityPosition,marchPriorityPosition,
  trainPosition,multipleGroupsPosition,collectionWithHistory,newsPosition} from './cases.mjs';

const findings=[];
const a=preview(attritionPosition(true),attritionIntent);
findings.push({id:'F1',expected:{reds:1,russians:1},observed:{reds:cells(a.after.board.hel,'r'),russians:a.after.board.hel.u},log:a.log});
for(const f of ['s','r']) {
  const g=attackPriorityPosition(f),log=[],card=f==='s'?58:52;
  executeBotCard(g,f,card,1,log);
  findings.push({id:'F2',card,expectedOrigin:f==='s'?'tam':'ham',log});
}
{
  const g=marchPriorityPosition(),log=[];
  executeBotCard(g,'r',53,1,log);
  findings.push({id:'F2',card:53,expectedOrigin:'ham',log});
}
for(const f of ['s','r']) {
  const g=trainPosition(f),log=[],foe=f==='s'?'r':'s';
  executeBotCard(g,f,f==='s'?58:52,1,log);
  findings.push({id:'F3',faction:f,expectedDefenderCells:f==='s'?0:2,observedDefenderCells:cells(g.board.hel,foe),log});
}
{
  const g=multipleGroupsPosition(),log=[];
  const result=executeBotCard(g,'s',59,99,log);
  findings.push({id:'F4',expectedDestinations:2,observedDestinations:result.n,originCells:cells(g.board.uus,'s'),log});
}
{
  const collection=collectionWithHistory(156),raw=encode(collection);
  let result='accepted';
  try {decode(raw);} catch(error) {result=error.message;}
  findings.push({id:'F5',campaigns:collection.campaigns.length,characters:raw.length,bytes:new TextEncoder().encode(raw).length,result});
}
const questions=[];
for(const condition of ['all-issues-resolved','all-cubes-used']) {
  const g=newsPosition(false),log=[];
  if(condition==='all-cubes-used') {
    g.issues=[null,null,null];
    Object.assign(g.tracks,{rIssue:0,sIssue:0,rC:3,sC:3});
  }
  validateGame(g);
  questions.push({id:'Q1',condition,performed:botPersonality(g,log),newsRemaining:g.news.length,polarization:g.tracks.pol,log});
}
{
  const g=position({humans:['r'],phase:2}),log=[];
  Object.assign(g.board.hel,{sI:3,rI:3,sTerror:1,rTerror:1});
  engage(g,log,{f:'s',id:'hel',defenders:['r','u'],attackCount:3,die:3,bot:true});
  validateGame(g);
  questions.push({id:'Q2',polarizationBefore:3,polarizationAfter:g.tracks.pol,terrorBefore:2,
    terrorAfter:g.board.hel.rTerror+g.board.hel.sTerror,news:g.news.length,log});
}
console.log(JSON.stringify({auditedCommit:'b331ebab928d734d99cd086a30c4e944808eb066',findings,questions},null,2));
