import { NAME, eventName} from './data.js';
import {boardDiff, clone, human, validateGame} from './model.js';
import {actor, advanceCard, endGermany, enterCard, finishTurn, options, record, revealUpcoming, startCards} from './sequence.js';
import {botNews, botTurn} from './bots.js';
import {finishEventChoice, hennala} from './bot-events.js';
import {autoEvent, eventSides, manualEvent} from './events.js';
import {applyHumanCommand, legalCommands} from './human.js';
import {applyEdits} from './editor.js';
import {germanAction, propaganda, resolveAgitate, resolveCapability, resolvePolitics, resolvePrisoners, resolveRevolt, revolt} from './rounds.js';

const requireStage=(g,stage)=>{
  if(g.stage!==stage||g.interrupt) throw Error('Finish the current procedure first.');
};
function resolveManual(g,log,intent) {
  const p=g.interrupt;
  if(intent.skip&&p.scope!=='event') throw Error('Record the tabletop result, even if no pieces changed.');
  if(p.scope==='event'&&intent.skip) {
    g.interrupt=null;
    if(human(g,p.f)) return 'Return to '+NAME[p.f]+' choices';
    return botTurn(g,log,{resumeAfter:p.source??(p.fallback?'fallback':'symbol'),guideCommand:p.guideCommand});
  }
  const side=intent.side??p.side;
  if(p.scope==='event'&&!eventSides(p.card).includes(side)) throw Error('Choose the side of the Event that was used.');
  applyEdits(g,intent.edit);
  g.interrupt=null;
  if(p.scope==='event') {
    log.push('Tabletop · '+eventName(p.card)+' ('+(side==='dark'?'shaded':'unshaded')+').');
    if(intent.note) log.push(String(intent.note).slice(0,380));
    record(g,p.f,'event',log);
  } else if(p.scope==='command') {
    finishFactionCommand(g,p.f,p.action,log,false);
    log.push('Tabletop · '+p.title+'.');
  } else if(p.scope==='bot-command') {
    const action=intent.recordAction??p.action;
    if(!p.choices.includes(action)) throw Error('Choose an available eligibility box.');
    finishFactionCommand(g,p.f,action,log,true);
    log.push('Tabletop · '+p.title+' resolved.');
  } else if(p.scope==='news') finishTurn(g,log);
  else if(p.scope==='german') {
    g.tracks.coordinate=false;
    endGermany(g);
  } else if(p.scope==='revolt') g.revoltStep='caps';
  else throw Error('Unknown guided procedure.');
  return p.title+' · Recorded';
}
function finishFactionCommand(g,f,action,log,forceNews=false) {
  const tokens=g.news.filter(n=>n.owner===f);
  const bonus=action==='limited'&&f!=='m'&&tokens.length>0;
  record(g,f,action,log,{news:bonus});
  if(bonus) g.interrupt={kind:'news',f,bot:forceNews,title:NAME[f]+' · News follow-up'};
}
function pending(g,log,intent) {
  const p=g.interrupt;
  if(intent.type!=='resolve') throw Error('Resume the pending decision before taking another action.');
  if(p.kind==='manual') return resolveManual(g,log,intent);
  if(p.kind==='news') {
    if(p.bot) return botNews(g,log);
    g.interrupt=null;
    if(intent.use) {
      const news=g.news.find(n=>n.id===Number(intent.token)&&n.owner===p.f);
      if(!news) throw Error('Choose a News marker this faction holds.');
      g.news=g.news.filter(n=>n.id!==news.id);
      if(intent.manual) {
        g.interrupt={kind:'manual',scope:'news',f:p.f,title:p.title,instruction:'Resolve one additional non-free Limited Command. Enter any Resources and board changes. Keep the first Limited Command box.'};
        return p.title+' · Spend News #'+news.id;
      }
      applyHumanCommand(g,p.f,log,intent,{limited:true});
    }
    finishTurn(g,log);
    return p.title+(intent.use?' · Extra Limited Command':' · Keep News');
  }
  if(p.kind==='event-choice') finishEventChoice(g,log,intent);
  else if(p.kind==='politics') resolvePolitics(g,log,intent);
  else if(p.kind==='agitate') resolveAgitate(g,log,intent);
  else if(p.kind==='prisoners') {
    resolvePrisoners(g,log,intent);
    if(p.event===28) hennala(g,log,p.f==='r'?'s':'end');
  }
  else if(p.kind==='revolt') resolveRevolt(g,log,intent);
  else if(p.kind==='capabilities') resolveCapability(g,log,intent);
  else throw Error('Unknown pending choice.');
  if(p.event) {
    if(g.interrupt) {
      g.interrupt.event=p.event;
      g.interrupt.playedBy=p.playedBy;
    } else record(g,p.playedBy,'event',log);
  }
  return p.title;
}
function humanTurn(g,log,intent) {
  const f=actor(g), {action}=intent;
  if(!human(g,f)||!options(g).includes(action)) throw Error('Choose an available action for the current human faction.');
  if(action==='pass') {
    record(g,f,'pass',log);
    log.push(NAME[f]+' stays eligible for the next card and gains one Resource, up to 30.');
    return NAME[f]+' · Pass';
  }
  if(action==='event') {
    if(!eventSides(g.current).includes(intent.side)) throw Error('Choose the unshaded or shaded Event.');
    const result=autoEvent(g,f,g.current,intent.side,log,intent);
    if(result===null) {
      g.interrupt=manualEvent(g,f,intent.side,{reason:'Human Event'});
      return NAME[f]+' · Open Event '+eventName(g.current);
    }
    record(g,f,'event',log);
    return NAME[f]+' · Event '+eventName(g.current);
  }
  if(!legalCommands(g,f).includes(intent.command)) throw Error('Choose a Command for this faction and phase.');
  if(intent.manual) {
    g.interrupt={kind:'manual',scope:'command',f,action,title:NAME[f]+' · '+intent.command,
      instruction:'Resolve the chosen '+(action==='limited'?'Limited Command':'Command and any accompanying Special Activity')+' using the faction aid. Enter every changed space, marker and Resource. The app records the selected eligibility box when you apply the result.'};
    return g.interrupt.title+' · Open tabletop entry';
  }
  applyHumanCommand(g,f,log,intent,{limited:action==='limited'});
  finishFactionCommand(g,f,action,log);
  return NAME[f]+' · '+intent.command+(intent.special?.name?' + '+intent.special.name:'');
}
export function preview(current,intent) {
  if(!intent||typeof intent.type!=='string') throw Error('Choose an action.');
  const g=clone(current), log=[];
  let title;
  if(intent.type==='correct') {
    applyEdits(g,intent.edit);
    title='Board correction';
    log.push('Record the physical position. Eligibility and the random stream are preserved.');
  } else if(g.interrupt) title=pending(g,log,intent);
  else if(intent.type==='start') {
    requireStage(g,'setup');
    startCards(g,log,intent);
    title='Confirm opening setup';
  } else if(intent.type==='reveal') {
    requireStage(g,'reveal');
    revealUpcoming(g,log,intent.card);
    title='Reveal upcoming card';
  } else if(intent.type==='enter') {
    requireStage(g,'enter');
    enterCard(g,log);
    title='Start '+eventName(g.current);
  } else if(intent.type==='advance') {
    requireStage(g,'advance');
    advanceCard(g,log);
    title='Advance card and eligibility';
  } else if(intent.type==='german') {
    requireStage(g,'german');
    title=germanAction(g,log);
  } else if(intent.type==='revolt') {
    requireStage(g,'revolt');
    title=revolt(g,log);
  } else if(intent.type==='propaganda') {
    requireStage(g,'propaganda');
    title=propaganda(g,log,intent);
  } else if(intent.type==='bot') {
    requireStage(g,'turn');
    if(!actor(g)||human(g,actor(g))) throw Error('It is not a bot turn.');
    title=botTurn(g,log,{guideCommand:Boolean(intent.guideCommand)});
  } else if(intent.type==='human') {
    requireStage(g,'turn');
    title=humanTurn(g,log,intent);
  } else throw Error('That procedure is unavailable.');
  validateGame(g);
  return {after:g,title,log,diff:boardDiff(current,g)};
}
