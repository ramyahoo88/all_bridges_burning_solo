import {CAP_STOCK, EVENTS, NAME, SPACE_IDS, distance, eventName, spaceName, town} from './data.js';
import {adjustResource, capacity, cells, clamp, human, pools} from './model.js';
import {cubeColor, placeCells, putCube} from './actions.js';
import {chooseSpaceRanked, roll} from './random.js';

// Original short prompts point back to the physical card. No GMT artwork or card text is bundled.
const PROMPTS={
  1:['Award Senate a Jaeger.','Choose up to two non-Senate Cells and flip them.'],
  2:['Roll and choose friendly Cells to flip.','Add 3 Moderates Resources.'],
  3:['Choose a direction and change Russian Vassalage one step.','Roll and choose friendly Cells to flip.'],
  4:['Choose one eligible space and resolve the card’s modified free Terror.','Place one Moderates Cell from Available.'],
  5:['Choose the placement option and a qualifying space.','Shift one space one step in the chosen direction.'],
  6:['Place an enemy Cell in a Town, then make the support/opposition shift.'],
  7:['Add 3 Senate Resources.','Place a Moderates Cell, then a Reds Cell, then adjust the Political Display.'],
  8:['Resolve the card’s modified free Terror.','Add 3 Resources and place a Moderates Network.'],
  9:['Shift one space one step in the chosen direction.','Reduce Polarization, add Resources, and place a political cube.'],
  10:['Raise German Vassalage and award Senate a Jaeger.','Choose Moderates or Reds Cells and a qualifying location.'],
  11:['Choose a power and a direction for the Vassalage shift.'],
  12:['Resolve modified free Terror, then reduce Moderates Resources.','Moderates choose a Special Activity or free Limited Command.'],
  13:['Choose a legal placement; reduce Moderates Resources.','Resolve a free Limited Command, then place a political cube.'],
  14:['Award one Cannon Capability.'],
  15:['Award one Train Capability.'],
  16:['Award Senate a Jaeger.','Award Reds a Commander.'],
  17:['Award one Train Capability to the executing faction.'],
  18:['Place Cells in 0-Population Provinces, or shift a qualifying Province.','Run the Politics Phase.'],
  19:['Remove a political cube, then run the Politics Phase.','Roll for a political cube.'],
  20:['Remove a Prepared marker or eligible Town Cell. Check Personality consequences.','Flip one Active Cell.'],
  21:['Choose two Cells and flip them.','Place an available Administration in a Province with friendly pieces.'],
  25:['Select a space for Russian-to-Senate replacements. Leave Vassalage unchanged.','Remove eligible Senate Cells where Russian Troops are present.'],
  26:['Award Senate a Jaeger.','Choose Reds or Moderates for a free one-space Rally.'],
  27:['Resolve one free Senate Attack with the card’s strength bonus.','Resolve a free Reds March, then the specified Attack.'],
  28:['Resolve prisoners first, then choose the Resources effect before rolling.'],
  29:['Resolve free Senate Rally followed by free March.','Resolve one free Moderates Rally and lower Polarization.'],
  30:['Remove eligible Moderates Cells and check Personality consequences.','Choose Moderates Resources or a political cube.'],
  31:['Decide whether Senate uses Coordinate.','Resolve a free non-Attack Limited Command in Uusimaa.'],
  32:['Remove a Moderates Cell and check Personality consequences.','Place one Moderates Cell, then roll to reduce Polarization.'],
  33:['Choose Senate Coordinate or a free Rally in Helsinki.','Resolve an eligible free non-Attack Limited Command near Helsinki.'],
  34:['Choose Personality removal or Senate Crackdown.','Moderates take one free Rally.'],
  35:['Senate may Rally free in up to two qualifying spaces.','Choose two free Moderates Rally spaces or one Opposition shift for Reds.'],
  36:['Remove two eligible Cells. Record prison destinations and Polarization.','Return up to two prisoners; apply the track changes for each.'],
  37:['Shift one space with a Senate piece.'],
  38:['Choose Moderates Cell removals or Senate Crackdown.','Roll and reduce Polarization by half, rounded up.'],
  39:['Remove one Resolved Issue marker.','Place one available Moderates Network.'],
  40:['Resolve the special free Attack in Tampere or Häme using the card’s casualty instruction.'],
  41:['Resolve a German Attack in Uusimaa if possible.','Place Sabotage, then choose the applicable Uusimaa option.'],
  42:['Roll, then redeploy eligible Senate Cells and any Capabilities.','Resolve a free non-Attack Limited Command in Viipuri or Karelia.'],
  43:['Resolve the card’s modified free Terror.','Reduce Polarization and add 3 Resources to the acting faction.'],
  44:['Reduce German Vassalage and add Senate Resources.','Choose Opposition shift or free Reds Rally in Helsinki.'],
  45:['Choose a Vassalage track and lower it by up to two.','Remove one Resolved Issue marker.']
};
export const eventPrompt=(id,side)=>PROMPTS[id]?.[side==='dark'?1:0]??'Follow the matching side of the physical card.';
export const eventSides=id=>PROMPTS[id]?.length===2?['light','dark']:['light'];
const symbolOn=(s,f)=>s.includes(f);
export function eventTag(id,f) {
  const c=EVENTS[id];
  if(!c) return null;
  const light=symbolOn(c.light,f), dark=symbolOn(c.dark,f);
  if(!light&&!dark) return null;
  return {side:light&&dark?null:dark?'dark':'light',instructions:light&&c.light.includes('!')||dark&&c.dark.includes('!')};
}
const capsByCard={
  1:[['s','officer'],null],10:[['s','officer'],null],14:[['*','cannon']],15:[['*','train']],
  16:[['s','officer'],['r','officer']],17:[['*','train']],26:[['s','officer'],null]
};
export function capAvailable(g,cap) {
  return CAP_STOCK[cap]-['r','s'].reduce((sum,f)=>sum+g.held[f].filter(x=>x===cap).length+
    SPACE_IDS.reduce((n,id)=>n+g.board[id].caps[f].filter(x=>x===cap).length,0),0);
}
export function capDestinations(g,f,cap,revolt=false) {
  const locations=SPACE_IDS.filter(id=>cells(g.board[id],f)>0);
  if(cap==='officer'&&f==='s') {
    if(locations.includes('vaa')) return ['vaa'];
    if(human(g,f)) {
      const closest=Math.min(...locations.map(id=>distance('vaa',id)));
      return locations.filter(id=>distance('vaa',id)===closest);
    }
  }
  if(revolt&&human(g,'s')&&f==='s') {
    const reachable=new Set(['vaa']);
    let added;
    do {
      added=false;
      for(const id of locations) if(!reachable.has(id)&&[...reachable].some(x=>distance(x,id)===1)) {
        reachable.add(id);
        added=true;
      }
    } while(added);
    return locations.filter(id=>reachable.has(id));
  }
  return locations;
}
export function placeCapability(g,log,f,cap,{destination=null,revolt=false}={}) {
  const places=capDestinations(g,f,cap,revolt);
  if(!places.length) return false;
  if(destination&&!places.includes(destination)) throw Error('That Capability location is unavailable.');
  const foe=f==='r'?'s':'r';
  const max=Math.max(...SPACE_IDS.map(id=>cells(g.board[id],foe)));
  const targets=SPACE_IDS.filter(id=>cells(g.board[id],foe)===max&&max>0);
  const site=destination??chooseSpaceRanked(g,places,id=>{
    const b=g.board[id], existing=b.caps[f];
    const capped=Number(existing.length>=2);
    const proximity=Math.min(99,...targets.map(to=>distance(id,to)));
    if(cap==='officer'&&f==='s') return [capped,-cells(b,f)];
    if(cap==='train') return [capped,-Number(f==='s'&&existing.includes('officer')),Number(existing.includes('train')),-cells(b,f),proximity];
    return [capped,-Number(f==='s'&&existing.length>0),existing.length,proximity];
  },log,'Place '+NAME[f]+' '+cap,spaceName);
  g.board[site].caps[f].push(cap);
  if(destination) log.push('Place '+NAME[f]+' '+cap+' in '+spaceName(site)+'.');
  return true;
}
export function capabilityChoice(g,f,id,side) {
  const c=capsByCard[id]?.[side==='dark'?1:0];
  if(!c) return null;
  const [owner,cap]=c;
  return {owner:owner==='*'?f:owner,cap};
}
export function preferredCapability(g,f,id) {
  return eventSides(id).find(side=>{
    const c=capabilityChoice(g,f,id,side);
    return c?.owner===f&&capAvailable(g,c.cap)>0&&(g.phase===1||capDestinations(g,f,c.cap).length>0);
  });
}
export function autoEvent(g,f,id,side,log,choice={}) {
  const c=capabilityChoice(g,f,id,side);
  if(c) {
    const owner=c.owner==='m'?choice.beneficiary:c.owner;
    if(!['s','r'].includes(owner)) return null;
    const canPlace=capAvailable(g,c.cap)>0&&(g.phase===1||capDestinations(g,owner,c.cap).length>0);
    if(canPlace&&g.phase===2&&human(g,owner)&&!choice.destination&&capDestinations(g,owner,c.cap).length>1) return null;
    let placed=false;
    if(canPlace) {
      if(g.phase===1) {
        g.held[owner].push(c.cap);
        placed=true;
      } else placed=placeCapability(g,log,owner,c.cap,choice);
    }
    let shifted=false;
    if(id===10) {
      const was=g.tracks.sV;
      g.tracks.sV=clamp(was+1,0,6);
      shifted=g.tracks.sV!==was;
      if(shifted) log.push('#10 · German Vassalage '+was+' → '+g.tracks.sV+'.');
    }
    return placed||shifted;
  }
  if(id===3&&side==='light'||id===11&&side==='light'||id===45&&side==='light') {
    const power=id===3?'r':choice.power??(f==='s'?'s':'r');
    const n=id===45?Number(choice.amount??2):choice.direction==='raise'?1:-1;
    if(!['r','s'].includes(power)||!Number.isInteger(n)||id===45&&(n<0||n>2)) throw Error('Choose a valid Vassalage shift.');
    const key=power+'V', previous=g.tracks[key];
    g.tracks[key]=clamp(previous+(id===45?-n:n),0,6);
    return previous!==g.tracks[key];
  }
  if(id===4&&side==='dark'&&human(g,f)) {
    if(!choice.destination) return null;
    if(!g.board[choice.destination]) throw Error('Choose a space on the board.');
    return placeCells(g,choice.destination,'m',1)>0;
  }
  if((id===5&&side==='dark'||id===9&&side==='light'||id===37&&side==='light')&&human(g,f)) {
    const b=g.board[choice.destination];
    if(!b) return null;
    if(id===37&&!cells(b,'s')) throw Error('VATO needs a Senate piece.');
    const previous=b.support;
    b.support=clamp(previous+(choice.direction==='support'?1:-1),-2,2);
    return previous!==b.support;
  }
  if(id===8&&side==='dark'&&human(g,f)) {
    const b=g.board[choice.destination];
    if(pools(g).network>0&&SPACE_IDS.some(id=>capacity(g.board[id])>0)&&!b) return null;
    const previous=g.tracks[f];
    adjustResource(g,f,3);
    if(!b||pools(g).network===0) return previous!==g.tracks[f];
    if(capacity(b)<=0) throw Error('Choose a space with room for a Network.');
    b.network++;
    return true;
  }
  if(id===9&&side==='dark'&&human(g,f)) {
    const previous=g.tracks[f], pol=g.tracks.pol;
    if(!g.issues.every(Boolean)&&pools(g).rC+pools(g).sC>0&&!putCube(g,choice.cube)) throw Error('Choose an available political cube.');
    adjustResource(g,f,3);
    g.tracks.pol=Math.max(0,g.tracks.pol-1);
    return previous!==g.tracks[f]||pol!==g.tracks.pol||Boolean(choice.cube);
  }
  if(id===30&&side==='dark') {
    const previous=g.tracks.m;
    const canCube=!g.issues.every(Boolean)&&(pools(g).rC||pools(g).sC);
    if(choice.reward==='cube'||!human(g,f)&&previous===30&&canCube) {
      if(!putCube(g,choice.cube??cubeColor(g,log,'equal'))) throw Error('Choose an available political cube.');
      return true;
    }
    adjustResource(g,'m',3);
    return previous!==g.tracks.m;
  }
  if(id===2&&side==='dark') {
    const was=g.tracks.m;
    adjustResource(g,'m',3);
    return was!==g.tracks.m;
  }
  if(id===43&&side==='dark') {
    const was=g.tracks[f], pol=g.tracks.pol;
    g.tracks.pol=Math.max(0,pol-1);
    adjustResource(g,f,3);
    return was!==g.tracks[f]||pol!==g.tracks.pol;
  }
  if(id===8&&side==='dark'&&f==='m'&&!human(g,f)) {
    const was=g.tracks.m;
    adjustResource(g,'m',3);
    const target=pools(g).network&&chooseSpaceRanked(g,SPACE_IDS.filter(id=>!g.board[id].network&&capacity(g.board[id])>0),
      id=>[-cells(g.board[id],'m'),-Number(town(id))],log,'#8: place a Network with the most Moderates Cells, then prefer a Town',spaceName);
    if(target) g.board[target].network++;
    return Boolean(target)||was!==g.tracks.m;
  }
  if(id===7&&side==='light') {
    const was=g.tracks.s;
    adjustResource(g,'s',3);
    return was!==g.tracks.s;
  }
  if(id===9&&side==='dark'&&f==='m'&&!human(g,f)) {
    const was=g.tracks.m, pol=g.tracks.pol;
    adjustResource(g,f,3);
    g.tracks.pol=Math.max(0,pol-1);
    return putCube(g,cubeColor(g,log,'equal'))||was!==g.tracks.m||pol!==g.tracks.pol;
  }
  if(id===18&&side==='dark'&&g.tracks.rC+g.tracks.sC===0&&!g.issues.every(Boolean)) return false;
  if(id===38&&side==='dark') {
    if(!g.tracks.pol) return false;
    g.tracks.pol=Math.max(0,g.tracks.pol-Math.ceil(roll(g,log,'#38 Tanner Abroad')/2));
    return true;
  }
  if(id===44&&side==='light') {
    const v=g.tracks.sV,r=g.tracks.s;
    g.tracks.sV=Math.max(0,v-1);
    adjustResource(g,'s',3);
    return v!==g.tracks.sV||r!==g.tracks.s;
  }
  return null;
}
export function manualEvent(g,f,side,context={}) {
  const tag=eventTag(g.current,f);
  const id=g.current;
  const aid=!human(g,f)&&Boolean(tag?.instructions);
  return {kind:'manual',scope:'event',f,side,card:id,reason:context.reason??'',source:context.source??null,guideCommand:Boolean(context.guideCommand),fallback:Boolean(context.fallback),title:eventName(id),aid,
    instruction:context.instruction??(side?eventPrompt(id,side):aid?'Use the physical Event and the matching Solitaire Play Aid entry. Check for an actual effect before selecting this Event.':'Use the physical Event and the general priorities in §8.1.7. Check for an actual effect before selecting this Event.')};
}
