import {BOT_CARD, EVENTS, NAME, eventName, spaceName} from './data.js';
import {clone} from './model.js';
import {pick, roll, shuffle} from './random.js';
import {actor, finishTurn, left, options, record} from './sequence.js';
import {botAttack, botActivism, botCondition, botMarch, botMessage, botNegotiate, botTerror} from './bot-operations.js';
import {botPersonality, botRally, crackdown, dialogue, foreign, prepare, publish} from './bot-rally.js';
import {cubeColor, putCube} from './actions.js';
import {autoEvent, eventSides, eventTag, manualEvent, preferredCapability} from './events.js';
import {botEvent, passForEvent, shouldBlockEvent} from './bot-events.js';

const CARD_IDS = Object.keys(BOT_CARD).map(Number);
function senateManeuver(g,card,limit,log,allowLimited) {
  const limited=limit===1;
  const candidate=limited?g:clone(g), steps=[];
  const special=!limited&&prepare(candidate,'s',steps,{repairOnly:true})?'Prepare':null;
  if(!limited&&!special) {
    if(allowLimited===false) return {n:0,reason:'Needs Prepare and the Limited Command box is occupied'};
    steps.push('Prepare is unavailable. Use the available Limited Command.');
  }
  const command=card===58?botAttack:botMarch;
  const n=command(candidate,'s',special?limit:1,steps);
  if(!n) return {n:0,reason:'No legal target for the Command'};
  if(!limited) Object.assign(g,candidate);
  log.push(...steps);
  return {n,special,onlyLimited:!special};
}
export function executeBotCard(g,f,card,limit,log,context={}) {
  const condition=context.condition??botCondition(g,card,log);
  if(!condition.ok) return {n:0,reason:'Condition not met'};
  if(card===58||card===59) return senateManeuver(g,card,limit,log,context.allowLimited);
  const limited=limit===1;
  let n=0;
  if([48,54,55,60].includes(card)) {
    limit=Math.min(limit,card===60?2+Math.max(0,g.tracks.pol-5):3);
    n=botRally(g,f,card,limit,log,context);
  }
  if([49,50,56].includes(card)) n=botActivism(g,f,card,limited,log,condition.die);
  if([51,57].includes(card)) n=botTerror(g,f,Math.min(2,limit),log);
  if(card===52) n=botAttack(g,f,limit,log);
  if(card===53) n=botMarch(g,f,limit,log);
  if(card===61) n=botNegotiate(g,limit,log);
  if([62,63].includes(card)) n=botMessage(g,card,Math.min(3,limit),log);
  if(card===64&&putCube(g,cubeColor(g,log))) {
    log.push('Politics · Place an available political cube.');
    n=1;
  }
  if(!n) return {n:0,reason:'No legal target for the Command'};
  if(limited) return {n,special:null,onlyLimited:true};
  const activities={
    48:[['Prepare',()=>prepare(g,f,log)]],
    49:[['Foreign Relations',()=>foreign(g,f,log)],['Prepare',()=>prepare(g,f,log)]],
    50:[['Prepare',()=>prepare(g,f,log)]],
    51:[['Foreign Relations',()=>foreign(g,f,log)],['Prepare',()=>prepare(g,f,log)]],
    52:[['Prepare',()=>prepare(g,f,log)]],53:[['Prepare',()=>prepare(g,f,log)]],
    54:[['Foreign Relations',()=>foreign(g,f,log)],['Prepare',()=>prepare(g,f,log)]],
    55:[['Crackdown',()=>crackdown(g,log)],['Foreign Relations',()=>foreign(g,f,log)]],
    56:[['Foreign Relations',()=>foreign(g,f,log)],['Crackdown',()=>crackdown(g,log)],['Prepare',()=>prepare(g,f,log)]],
    57:[['Foreign Relations',()=>foreign(g,f,log)],['Crackdown',()=>crackdown(g,log)],['Prepare',()=>prepare(g,f,log)]],
    60:[['Personality',()=>botPersonality(g,log)]],61:[['Dialogue',()=>dialogue(g,log)]],
    62:[['Dialogue',()=>dialogue(g,log)],['Publish',()=>publish(g,log)]],
    63:[['Publish',()=>publish(g,log,4)],['Dialogue',()=>dialogue(g,log)]],
    64:[['Publish',()=>publish(g,log,4)],['Personality',()=>botPersonality(g,log)],['Dialogue',()=>dialogue(g,log)]]
  };
  const special=activities[card]?.find(([,run])=>run())?.[0]??null;
  return {n,special,onlyLimited:false};
}
export function botDraw(g,f,limit,log,context={}) {
  const cards=context.cards??shuffle(g,CARD_IDS.filter(id=>BOT_CARD[id][0]===f));
  for(const id of cards) {
    const info=BOT_CARD[id], tentative=clone(g), local=[];
    const condition=context.condition??botCondition(tentative,id,local);
    const conditionLog=local.length, conditionRng=tentative.rng;
    const output=executeBotCard(tentative,f,id,limit,local,{...context,condition});
    g.rng=tentative.rng;
    log.push('#'+id+' '+info[1]+' (§'+info[2]+') · '+(output.n?'execute':output.reason));
    if(!output.n) {
      log.push(...local.filter(line=>line.includes('rolled')));
      continue;
    }
    if(context.guideCommand) {
      g.rng=conditionRng;
      log.push(...local.slice(0,conditionLog));
    } else {
      Object.assign(g,tentative);
      log.push(...local);
    }
    return {...output,id,command:info[1]};
  }
  return null;
}
function botPass(g,f,log,why,reserved=false) {
  log.push(why);
  record(g,f,'pass',log,{reserved});
  return NAME[f]+' · Pass';
}
function tryEvent(g,f,side,log,why,context={},capability=false) {
  log.push(why);
  const tentative=clone(g), local=[];
  const drawLimited=(game,faction,record)=>{
    record.push('Draw from the Moderates mini-deck for a free Limited Command.');
    return botDraw(game,faction,1,record);
  };
  const done=capability?autoEvent(tentative,f,g.current,side,local):botEvent(tentative,f,g.current,side,local,{drawLimited});
  g.rng=tentative.rng;
  log.push(...local);
  if(done===false) {
    log.push('§8.1.4–5 · Event cannot change the position as directed by the bot’s instructions.');
    return false;
  }
  if(done===null) {
    g.interrupt=manualEvent(g,f,side,context);
    return NAME[f]+' · Check Event '+eventName(g.current);
  }
  Object.assign(g,tentative);
  if(side&&eventSides(g.current).length>1) log.push('Event side · '+(side==='dark'?'Shaded':'Unshaded')+'.');
  if(g.interrupt) {
    if(g.interrupt.event==null) g.interrupt.event=g.current;
    g.interrupt.playedBy=f;
    return NAME[f]+' · Begin Event '+eventName(g.current);
  }
  record(g,f,'event',log);
  return NAME[f]+' · Event '+eventName(g.current);
}
function capabilityCount(g,f) {
  return g.held[f].length+Object.values(g.board).reduce((n,b)=>n+b.caps[f].length,0);
}
function takeCommand(g,f,log,{full,limited,guideCommand}) {
  const plan=botDraw(g,f,full?99:1,log,{allowLimited:limited,guideCommand});
  if(!plan) return null;
  const action=full&&(plan.special||plan.n>1||!limited)?'full':'limited';
  if(guideCommand) {
    const title=NAME[f]+' · #'+plan.id+' '+plan.command;
    g.interrupt={kind:'manual',scope:'bot-command',f,action,choices:[...(full?['full']:[]),...(limited?['limited']:[]),'pass'],title,aid:false,
      instruction:'Use the boxed bot card and faction aid for this Command. Keep any condition roll shown in the action record. Resolve ties and effects at the table, then record the resulting board and eligibility box. If the card has no legal Command, use the published redraw procedure before recording.'};
    return title+' · Open tabletop entry';
  }
  const news=action==='limited'&&f!=='m'&&g.news.some(n=>n.owner===f);
  record(g,f,action,log,{news});
  if(news) g.interrupt={kind:'news',f,bot:true,title:NAME[f]+' · News follow-up'};
  return NAME[f]+' · '+plan.command+(plan.special?' + '+plan.special:'');
}
export function botTurn(g,log,{resumeAfter=null,guideCommand=false}={}) {
  const f=actor(g), possible=options(g), card=g.current, next=g.upcoming;
  const mayEvent=possible.includes('event');
  const currentTag=eventTag(card,f);
  const taggedSide=card===19&&f==='m'?(g.tracks.rC+g.tracks.sC>=5?'light':'dark'):
    card===34&&f==='m'?'dark':card===45&&f==='s'?'light':currentTag?.side??null;
  const resume={reserved:1,capability:3,symbol:4,fallback:6}[resumeAfter]??0;
  let triedCurrent=Boolean(resume);
  const protectIssue=resume<1&&shouldBlockEvent(g,f,card);
  if(protectIssue) {
    log.push('Boxed Event instructions · Open with a Limited Command to protect the Resolved Issue and close the Event box.');
    const result=takeCommand(g,f,log,{full:false,limited:true,guideCommand});
    if(result) return result;
    log.push('No Moderates card can close the Event box. Keep the Resolved Issue in place.');
  }
  if(!protectIssue&&mayEvent&&resume<1&&g.reserved?.f===f&&g.reserved.card===card) {
    const cap=preferredCapability(g,f,card);
    const result=tryEvent(g,f,cap??taggedSide,log,'§8.1.4(1) · NP to Play marker on this Event.',
      {reason:'Reserved on the previous Event',source:'reserved',guideCommand},Boolean(cap));
    if(result) return result;
    triedCurrent=true;
  }
  if(resume<2&&(!g.reserved||g.reserved.card!==next)&&EVENTS[next]?.pass.includes(f)) {
    if(passForEvent(g,f,next)) return botPass(g,f,log,'§8.1.4(2) · The upcoming Pass symbol and its boxed instructions apply.',true);
    log.push('Skip the upcoming Pass symbol. The boxed Event condition is unmet.');
  }
  if(resume<3&&f!=='m') {
    const here=mayEvent&&!triedCurrent?preferredCapability(g,f,card):null;
    const soon=(!g.reserved||g.reserved.card!==next)&&!g.actions.some(x=>x.action==='pass')?preferredCapability(g,f,next):null;
    if(here||soon) {
      const train=f==='s'&&[15,17].includes(here?card:next);
      const threshold=2*capabilityCount(g,f)+(f==='r'?2:0);
      if(train||roll(g,log,'Capability check, must exceed '+threshold)>threshold) {
        if(here) {
          const result=tryEvent(g,f,here,log,'§8.1.4(3) · Take the current Capability.',{reason:'Capability priority',source:'capability',guideCommand},true);
          if(result) return result;
          triedCurrent=true;
        } else return botPass(g,f,log,'§8.1.4(3) · Pass for the upcoming '+(train?'Senate Train':'Capability')+'.',true);
      }
    }
  }
  if(!protectIssue&&mayEvent&&resume<4&&!triedCurrent&&(currentTag||card===45&&f==='s')) {
    const result=tryEvent(g,f,taggedSide,log,'§8.1.4(4) · Check the boxed priority for the current Event.',{reason:'Matching Event symbol',source:'symbol',guideCommand});
    if(result) return result;
    triedCurrent=true;
  }
  const full=left(g)===1&&possible.includes('full');
  const limited=possible.includes('limited');
  if(!protectIssue&&(full||limited)) {
    const result=takeCommand(g,f,log,{full,limited,guideCommand});
    if(result) return result;
  }
  if(!protectIssue&&resume<6&&!triedCurrent&&mayEvent&&!limited&&!full) {
    const result=tryEvent(g,f,taggedSide,log,'§8.1.4(6) · Event is the remaining non-Pass box.',{fallback:true,reason:'Only Event or Pass remains',source:'fallback',guideCommand});
    if(result) return result;
  }
  return botPass(g,f,log,'§8.1.4(7) · No executable action under the current priorities and available boxes.');
}
export function botNews(g,log) {
  const {f}=g.interrupt;
  const token=pick(g,g.news.filter(n=>n.owner===f));
  if(token) {
    g.news=g.news.filter(n=>n.id!==token.id);
    log.push('Spend News #'+token.id+' from '+spaceName(token.space)+' and draw from a fresh mini-deck.');
  }
  const plan=botDraw(g,f,1,log);
  g.interrupt=null;
  finishTurn(g,log);
  return NAME[f]+' · News'+(plan?' → '+plan.command:'');
}
