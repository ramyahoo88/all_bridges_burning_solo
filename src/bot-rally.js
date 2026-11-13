import {BORDERS, NAME, SPACE_IDS, TOWNS, borderName, distance, pop, spaceName, town} from './data.js';
import {adjustResource, capacity, cells, control, countTerror, flip, human, newsAt, personality, pools, score} from './model.js';
import {cubeColor, enemy, placeCells, putCube, rallyPlace, rallySize, replaceWithDisc} from './actions.js';
import {chooseSpaceRanked, roll} from './random.js';

export const placeRanked=(g,ids,rank,log,label)=>chooseSpaceRanked(g,ids,rank,log,label);
const willControl=(g,id,f,placement)=>{
  const b=g.board[id], n=Math.min(pools(g)[f],placement??rallySize(b,f,true).n);
  return control(b)!==f&&control({...b,[f+'I']:b[f+'I']+n})===f;
};
export const nearest=(id,targets)=>Math.min(99,...targets.map(to=>distance(id,to)));
export function botRally(g,f,id,limit,log,context={}) {
  const used=new Set();
  const valid=key=>!used.has(key)&&(!context.spaces||context.spaces.includes(key));
  const recruit=(label,filter,rank=()=>[],n=1)=>{
    for(let i=0;i<n&&used.size<limit&&pools(g)[f];i++) {
      const key=placeRanked(g,SPACE_IDS.filter(key=>valid(key)&&filter(g.board[key],key)),rank,log,label);
      if(key===undefined) return;
      if(context.placement) placeCells(g,key,f,context.placement);
      else rallyPlace(g,key,f,{free:context.free});
      used.add(key);
    }
  };
  const build=(disc,label,filter,n,donors=[])=>{
    if(context.placement) return;
    for(let i=0;i<n&&used.size<limit;i++) {
      const eligible=SPACE_IDS.filter(key=>valid(key)&&!g.board[key][disc]&&capacity(g.board[key])>0&&filter(g.board[key],key)&&
        (pools(g)[disc]>0||donors.some(from=>from!==key&&g.board[from].admin>0)));
      const key=placeRanked(g,eligible,()=>[],log,label);
      if(!key) return;
      const donor=pools(g)[disc]>0?null:placeRanked(g,donors.filter(from=>from!==key&&g.board[from].admin),()=>[],log,'Relocate Administration from');
      if(!replaceWithDisc(g,key,f,donor)) return;
      used.add(key);
    }
  };
  if(id===48) {
    recruit('Protect unguarded Administrations',b=>b.admin&&!cells(b,f),()=>[],limit);
    const donors=SPACE_IDS.filter(key=>{
      const b=g.board[key];
      return b.admin&&b.support===-2&&(control(b)!=='r'||control({...b,admin:b.admin-1})==='r');
    });
    build('admin','Build an Administration away from Active Opposition',(b,key)=>pop(key)>0&&b.support>-2&&cells(b,'r')>=(cells(b,'s')?3:2),1,donors);
    recruit('Establish Reds Control in populated space',(b,key)=>pop(key)>0&&willControl(g,key,f,context.placement),key=>[-Number(g.board[key].admin>0&&g.board[key].support>-2)]);
    recruit('Reinforce a Reds space',b=>cells(b,f)>0);
    recruit('Fill remaining Rally capacity in populated spaces',(b,key)=>pop(key)>0,()=>[],limit);
  }
  if(id===54) {
    if(used.size<limit&&pools(g).s&&roll(g,log,'#54 reinforcement priority')<=2) recruit('Reinforce where Senate and opponents are present',b=>cells(b,'s')&&enemy('s').some(side=>cells(b,side)>0||(side==='r'?b.admin:b.network)));
    recruit('Establish Senate Control in populated space',(b,key)=>pop(key)>0&&willControl(g,key,f),key=>[-Number(g.board[key].support>0)]);
    recruit('Establish Senate Control in a 0-Population space',(b,key)=>!pop(key)&&willControl(g,key,f),key=>[Number(key!=='mik')]);
    recruit('Reinforce Support below three Senate Cells',b=>b.support>0&&cells(b,f)<3,()=>[],limit);
    recruit('Reinforce existing Senate Cells',b=>cells(b,f)>0,()=>[],limit);
    recruit('Fill remaining Rally capacity',()=>true,()=>[],limit);
  }
  if(id===55) {
    const reds=SPACE_IDS.filter(key=>cells(g.board[key],'r')||g.board[key].admin);
    recruit('Establish Senate Control in populated space',(b,key)=>pop(key)>0&&willControl(g,key,f),key=>[-Number(town(key))]);
    recruit('Reinforce Senate Capabilities',b=>b.caps.s.length>0,key=>[nearest(key,reds)],limit);
    recruit('Reinforce up to two largest Senate groups',b=>cells(b,'s')>0,key=>[-cells(g.board[key],'s'),nearest(key,reds)],2);
    recruit('Fill remaining Rally capacity in populated spaces',(b,key)=>pop(key)>0,()=>[],limit);
  }
  if(id===60) {
    build('network','Build a Network with at least three Moderates Cells',b=>cells(b,f)>=3,limit);
    recruit('Protect Personality or Networks',b=>(b.person||b.network)&&cells(b,f)>0&&cells(b,f)<3,key=>[-Number(g.board[key].person)],limit);
    if(TOWNS.filter(key=>cells(g.board[key],f)).length===1) recruit('Establish Moderates Cells in a second Town',(b,key)=>town(key)&&!cells(b,f));
    if(used.size<limit&&pools(g).m&&SPACE_IDS.some(key=>valid(key)&&pop(key)>0)) {
      const reverse=roll(g,log,'#60 Control tie-breaker order')<=2;
      recruit('Recruit in a populated space',(b,key)=>pop(key)>0,key=>{
        const b=g.board[key], placed=context.placement??1;
        const a=-Number(Boolean(control(b))&&!control({...b,mI:b.mI+placed})), c=-Number(!control(b)&&!cells(b,f));
        return reverse?[c,a]:[a,c];
      });
    }
    if(g.phase===2) recruit('Recruit at unheld News',(b,key)=>newsAt(g,key,null).length>0);
    recruit('Reinforce existing Moderates Cells',b=>cells(b,f)>0);
    if(used.size<limit&&!context.placement) {
      const id=placeRanked(g,SPACE_IDS.filter(key=>valid(key)&&g.board[key].network&&g.board[key].mA),key=>[-Math.min(g.board[key].mA,pop(key)+g.board[key].network)],log,'Hide as many Moderates Cells as possible');
      if(id) {
        const b=g.board[id];
        flip(b,f,false,pop(id)+b.network);
        used.add(id);
      }
    }
    recruit('Fill remaining Rally capacity in populated spaces',(b,key)=>pop(key)>0,()=>[],limit);
  }
  if(context.placement) recruit('Place a Cell in any remaining legal space',()=>true,()=>[],limit);
  return used.size;
}

export function prepare(g,f,log,{repairOnly=false}={}) {
  const p=pools(g), trainSide=f==='r'?'s':f;
  const trains=SPACE_IDS.filter(id=>g.board[id].caps[trainSide].includes('train'));
  if(g.phase===2&&trains.length) {
    const anchor=key=>{
      const [first,second]=key.split('/');
      return nearest(first,trains)<=nearest(second,trains)?first:second;
    };
    const measure=key=>nearest(anchor(key),trains);
    const ownBorder=key=>key.split('/').some(id=>cells(g.board[id],f)>0);
    if(f==='s') {
      const key=chooseSpaceRanked(g,g.sabotage.filter(ownBorder),key=>[measure(key)],log,'Prepare: repair closest to Senate Train',borderName,anchor);
      if(key) {
        g.sabotage=g.sabotage.filter(other=>other!==key);
        return true;
      }
    } else if(human(g,'s')&&p.sabotage&&g.sabotage.length<SPACE_IDS.reduce((sum,id)=>sum+g.board[id].caps.s.filter(cap=>cap==='train').length,0)) {
      const key=chooseSpaceRanked(g,BORDERS.filter(key=>ownBorder(key)&&!g.sabotage.includes(key)),key=>[measure(key),-Number(key.split('/').some(town))],log,'Prepare: sabotage closest to the human Senate Train',borderName,anchor);
      if(key) {
        g.sabotage.push(key);
        return true;
      }
    }
  }
  if(repairOnly||!p.prep) return false;
  const id=placeRanked(g,TOWNS.filter(id=>cells(g.board[id],f)&&!g.board[id][f+'Prep']),id=>[distance('hel',id)],log,'Prepare: friendly Town closest to Helsinki');
  if(!id) return false;
  g.board[id][f+'Prep']=1;
  return true;
}
export function foreign(g,f,log) {
  const t=g.tracks;
  if(f==='r'&&g.phase===1&&t.rV===2&&roll(g,log,'Reds Foreign Relations')<=2) {
    t.rV++;
    log.push('Foreign Relations · Russian Vassalage rises to 3.');
    return true;
  }
  if(f==='s'&&(t.sV>=4||t.sV===3&&roll(g,log,'Senate Foreign Relations')<=2)) {
    t.sV--;
    log.push('Foreign Relations · German Vassalage falls to '+t.sV+'.');
    return true;
  }
  return false;
}
export function crackdownSpaces(g) {
  if(g.phase!==2) return [];
  return SPACE_IDS.filter(id=>{
    const b=g.board[id];
    return b.sA&&control(b)==='s'&&b.support<0;
  });
}
export function crackdown(g,log,destination=null) {
  if(g.phase!==2) return false;
  const choices=crackdownSpaces(g);
  if(destination&&!choices.includes(destination)) return false;
  const id=destination??placeRanked(g,choices,id=>[-pop(id)],log,'Crackdown: remove most Opposition in Senate Control');
  if(!id) return false;
  const b=g.board[id];
  b.support++;
  if(countTerror(b)<2&&pools(g).sTerror>0) {
    b.sTerror++;
    g.tracks.pol=Math.min(10,g.tracks.pol+1);
  }
  return true;
}
export function botPersonality(g,log) {
  const site=personality(g);
  if(g.phase===2&&site&&g.board[site].mI) {
    const news=newsAt(g,site,'m')[0];
    const cube=news?cubeColor(g,log,'equal'):null;
    if(news&&cube&&putCube(g,cube)) {
      g.news=g.news.filter(n=>n.id!==news.id);
      const result=roll(g,log,'Personality uses News');
      if(score(g).politics>=3) g.tracks.pol=Math.max(0,g.tracks.pol-Math.ceil(result/2));
      else adjustResource(g,'m',result);
      return true;
    }
  }
  if(site) return false;
  const id=placeRanked(g,TOWNS.filter(id=>cells(g.board[id],'m')>=2),()=>[],log,'Personality: Town with at least two Moderates Cells');
  if(!id) return false;
  g.board[id].person=true;
  return true;
}
export function publish(g,log,min=0) {
  if(g.tracks.m===30) return false;
  const choices=SPACE_IDS.filter(id=>{
    const b=g.board[id];
    return pop(id)>0&&(cells(b,'m')||b.network);
  });
  const yieldOf=id=>{
    const b=g.board[id];
    return Number(town(id))+2*Math.min(b.mI,Number(b.person)+Number(b.network>0));
  };
  const max=choices.map(yieldOf).sort((a,b)=>b-a).slice(0,2).reduce((sum,n)=>sum+n,0);
  if(!max||max<min) return false;
  const selected=[];
  for(let i=0;i<2;i++) {
    const id=placeRanked(g,choices.filter(id=>!selected.includes(id)&&yieldOf(id)>0),id=>[-yieldOf(id)],null);
    if(id) selected.push(id);
  }
  const earned=selected.reduce((n,id)=>n+yieldOf(id),0);
  for(const id of selected) {
    const b=g.board[id];
    flip(b,'m',true,Number(b.person)+Number(b.network>0));
  }
  adjustResource(g,'m',earned);
  log.push('Publish · '+selected.map(spaceName).join(', ')+' yields '+earned+' Resources before the track cap.');
  return true;
}
export function dialogue(g,log) {
  const s=score(g), available=pools(g).m;
  const targets=[];
  for(const id of SPACE_IDS) {
    const b=g.board[id];
    if(!b.mI) continue;
    if(b.support!==0) targets.push({id,side:null,urgent:b.support<0&&s.opp>=10?pop(id):0,kind:Math.abs(b.support)===2?2:3});
    if(available) for(const side of ['r','s']) {
      if(!b[side+'I']||cells(b,side)===1&&(b.caps[side].length||b[side+'Prep']||newsAt(g,id,side).length)) continue;
      const urgent=side==='s'&&s.senate>=4&&town(id)&&control(b)==='s'&&control({...b,sI:b.sI-1,mI:b.mI+1})!=='s'?pop(id):0;
      targets.push({id,side,urgent,kind:1});
    }
  }
  const choices=targets.filter(x=>x.urgent||x.kind<3);
  const target=chooseSpaceRanked(g,choices,x=>{
    const b=g.board[x.id];
    return [-x.urgent,x.urgent?-Number(x.side?human(g,x.side):human(g,'r')):x.kind,-Number(Boolean(b.network||b.person)),-Number(x.kind===1&&town(x.id))];
  },log,'Dialogue',x=>spaceName(x.id)+(x.side?' · replace '+NAME[x.side]:' · move toward Neutral'),x=>x.id);
  if(!target) return false;
  const b=g.board[target.id];
  flip(b,'m',true);
  if(target.side) {
    b[target.side+'I']--;
    b.mI++;
  } else b.support-=Math.sign(b.support);
  return true;
}
