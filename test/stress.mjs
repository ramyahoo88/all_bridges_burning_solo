import assert from 'node:assert/strict';
import {actor, options} from '../src/sequence.js';
import {eventChoiceSpaces} from '../src/bot-events.js';
import {newGame, human, validateGame} from '../src/model.js';
import {eventSides} from '../src/events.js';
import {preview} from '../src/engine.js';
import {newCampaign,encodeCampaign,decode} from '../src/storage.js';

const configs=[['r'],['s'],['m'],['r','s'],['r','m'],['s','m']];
const cases=Number(process.argv[2]??36);
const stats={campaigns:0,steps:0,phaseII:0,finalRound:0,manualEvents:0,manualRevolts:0,eventChoices:0,checkpoints:0};
const rows=[];
function next(g,seed,stats) {
  const p=g.interrupt;
  if(p) {
    const result={type:'resolve'};
    if(p.kind==='manual') {
      if(p.scope==='event') {
        stats.manualEvents++;
        // The physical choices are intentionally not simulated here.
        result.skip=!human(g,p.f);
      }
      if(p.scope==='revolt') stats.manualRevolts++;
    }
    if(p.kind==='politics') {
      result.issue=p.choices[0];result.side=p.side??'r';result.space=p.choices[0];
    }
    if(p.kind==='prisoners') result.count=seed%2?p.max:0;
    if(p.kind==='event-choice') {
      result.space=eventChoiceSpaces(g)[0];
      stats.eventChoices++;
    }
    if(p.kind==='revolt') result.choice='skip';
    if(p.kind==='capabilities') result.space=p.choices[0];
    return result;
  }
  if(g.stage!=='turn') return {type:g.stage==='setup'?'start':g.stage};
  const f=actor(g);
  if(!human(g,f)) return {type:'bot'};
  const actions=options(g);
  if(actions.includes('limited')&&g.tracks[f]>=3&&g.board.tam[f+'I']<3) {
    return {type:'human',action:'limited',command:'Rally',rows:[{id:'tam',option:'cells',offset:0}]};
  }
  if(seed%4===0&&actions.includes('event')) return {type:'human',action:'event',side:eventSides(g.current)[0]};
  return {type:'human',action:'pass'};
}
for(const humans of configs) {
  const local={steps:0,phaseII:0,finalRound:0};
  for(let seed=0;seed<cases;seed++) {
    let g=newGame({humans,seed:seed+700,mode:'digital'});
    let ended=false, sawPhaseII=false;
    for(let i=0;i<480;i++) {
      if(g.stage==='ended') {ended=true;break;}
      const intent=next(g,seed,stats);
      const original=JSON.stringify(g);
      let plan;
      try {plan=preview(g,intent);}
      catch(error) {
        if(intent.type!=='human'||intent.action==='pass') throw new Error(JSON.stringify({humans,seed,i,intent,g}),{cause:error});
        plan=preview(g,{type:'human',action:'pass'});
      }
      assert.equal(JSON.stringify(g),original);
      if(i%23===0) {
        const snapshot=newCampaign('Stress',plan.after);
        assert.deepEqual(decode(encodeCampaign(snapshot)).campaigns[0].game,plan.after);
        stats.checkpoints++;
      }
      g=plan.after;
      validateGame(g);
      local.steps++;
      if(g.phase===2) sawPhaseII=true;
    }
    assert(ended,'Campaign did not terminate for '+humans+' seed '+seed);
    local.phaseII+=Number(sawPhaseII);
    local.finalRound+=Number(g.round===4);
    stats.campaigns++;
  }
  stats.steps+=local.steps;
  stats.phaseII+=local.phaseII;
  stats.finalRound+=local.finalRound;
  rows.push({humans:humans.join('+'),campaigns:cases,...local});
}
console.log(JSON.stringify({stats,rows},null,2));
