import {BORDERS, COMMANDS, NEAR, SPECIALS, SPACE_IDS, pop, spaceName, town} from './data.js';
import { adjustResource, cells, cleanSpace, control, flip, newsAt, personality, pay, pools} from './model.js';
import {engage, enemy, legalRail, placeCells, putCube, rallySize, replaceWithDisc, terrorAt, terrorOptions, travel} from './actions.js';
import { roll} from './random.js';

const requireThat=(check,message)=>{if(!check) throw Error(message);};
const integer=(value,min,max,label)=>{
  const n=Number(value);
  requireThat(Number.isInteger(n)&&n>=min&&n<=max,'Choose '+label+' from '+min+' to '+max+'.');
  return n;
};
const list=(value=[])=>Array.isArray(value)?value:[];
export function legalCommands(g,f) {
  return COMMANDS[f].filter(cmd=>g.phase===2||!['Attack','March'].includes(cmd));
}
export function legalSpecials(g,f,cmd) {
  return SPECIALS[f].filter(sa=>{
    if(sa==='Coordinate') return g.phase===2;
    if(sa==='Crackdown') return g.phase===2&&!['Attack','March'].includes(cmd);
    if(sa==='Personality') return ['Rally','Politics'].includes(cmd);
    if(sa==='Publish') return ['Message','Politics'].includes(cmd);
    if(sa==='Dialogue') return cmd!=='Rally';
    return true;
  });
}
export function recycle(g,f,plans) {
  for(const plan of list(plans)) {
    const b=g.board[plan.id];
    const key=plan.key;
    const allowed=[f+'A',f+'I',...(f==='r'?['admin']:f==='m'?['network','person']:[])];
    requireThat(b&&allowed.includes(key),'Recycle a friendly on-map piece.');
    const amount=integer(plan.count,1,Number(b[key]),'available friendly pieces to recycle');
    if(key==='person') b.person=false;
    else b[key]-=amount;
    cleanSpace(g,plan.id);
  }
}
function resolveSpecial(g,f,log,spec) {
  const name=spec.name, id=spec.id, b=g.board[id], t=g.tracks;
  if(name==='Political Event') {
    const ids=list(spec.sites);
    requireThat(ids.length>=1&&ids.length<=4&&new Set(ids).size===ids.length&&ids.every(k=>g.board[k]?.[f+'A']&&control(g.board[k])===f),'Select up to four controlled spaces with an Active friendly Cell.');
    adjustResource(g,f,ids.length);
    return;
  }
  if(name==='Foreign Relations') {
    const key=f+'V';
    if(spec.option==='raise') {
      requireThat(t[key]<6,'Vassalage is already at its maximum.');
      t[key]++;
    } else {
      requireThat(t[key]>0,'Vassalage is already zero.');
      const cost=integer(spec.boost,1,30,'Foreign Relations Resources');
      pay(g,f,cost);
      if(roll(g,log,'Foreign Relations')<=cost*2) t[key]--;
    }
    return;
  }
  if(name==='Prepare') {
    if(spec.option==='marker') {
      requireThat(b&&cells(b,f)&&!b[f+'Prep']&&pools(g).prep,'Choose a friendly Cell and an available Prepared marker.');
      b[f+'Prep']=1;
    } else {
      const key=spec.border;
      requireThat(g.phase===2&&BORDERS.includes(key)&&key.split('/').some(k=>cells(g.board[k],f)),'Choose a Phase II border with a friendly Cell on either side.');
      if(spec.option==='repair') {
        requireThat(g.sabotage.includes(key),'That border has no Sabotage.');
        g.sabotage=g.sabotage.filter(x=>x!==key);
      } else {
        requireThat(spec.option==='sabotage'&&!g.sabotage.includes(key)&&pools(g).sabotage,'That Sabotage marker cannot be placed.');
        g.sabotage.push(key);
      }
    }
    return;
  }
  if(name==='Coordinate') {
    requireThat(!t.coordinate,'Coordinate is already waiting for Germany’s next action.');
    t.coordinate=true;
    return;
  }
  if(name==='Crackdown') {
    requireThat(b?.sA&&control(b)==='s','Choose a Senate-controlled space with an Active Senate Cell.');
    if(b.support<0) b.support++;
    if(b.sTerror+b.rTerror<2&&pools(g).sTerror) {
      b.sTerror++;
      t.pol=Math.min(10,t.pol+1);
    }
    return;
  }
  if(name==='Personality') {
    if(spec.option==='place') {
      requireThat(town(id)&&cells(b,'m')&&!personality(g),'Place an available Personality in a Town with a Moderates Cell.');
      b.person=true;
    } else {
      const token=g.news.find(n=>n.id===Number(spec.token));
      requireThat(g.phase===2&&token?.space===id&&token.owner==='m'&&b?.person&&b.mI,'Select held News with the Personality and an Underground Moderates Cell.');
      requireThat(putCube(g,spec.side),'Choose an available cube for the Political Display.');
      g.news=g.news.filter(n=>n.id!==token.id);
      const value=roll(g,log,'Personality uses News');
      if(spec.option==='lower') t.pol=Math.max(0,t.pol-Math.ceil(value/2));
      else adjustResource(g,'m',value);
    }
    return;
  }
  if(name==='Dialogue') {
    requireThat(b?.mI,'Select a space with an Underground Moderates Cell.');
    if(spec.option==='shift') {
      requireThat(b.support!==0,'That space is already Neutral.');
      b.support-=Math.sign(b.support);
    } else {
      const side=spec.side;
      requireThat(['r','s'].includes(side)&&b[side+'I']&&pools(g).m&&
        (cells(b,side)>1||!b[side+'Prep']&&!b.caps[side].length&&!newsAt(g,id,side).length),'Select an Inactive enemy Cell that can be replaced without removing a marker or transferring News.');
      b[side+'I']--;
      b.mI++;
    }
    flip(b,'m',true);
    return;
  }
  if(name==='Publish') {
    const sites=list(spec.sites);
    requireThat(sites.length>=1&&sites.length<=2&&new Set(sites).size===sites.length,'Choose one or two Publish spaces.');
    for(const site of sites) {
      const b=g.board[site];
      requireThat(b&&pop(site)>0&&(cells(b,'m')||b.network),'Publish needs Population and a Moderates piece.');
      const n=integer(spec.amounts?.[site]??0,0,Math.min(b.mI,Number(b.person)+Number(b.network>0)),'Cells to Activate for Publish');
      flip(b,'m',true,n);
      adjustResource(g,f,Number(town(site))+2*n);
    }
  }
}
function orderRows(g,cmd,rows,f,limited) {
  requireThat(rows.length>0&&rows.length<=SPACE_IDS.length+Number(cmd==='Activism'),'Choose at least one action and stay within the space limit.');
  const rowKey=row=>cmd==='March'||cmd==='Attack'?row.to:row.id;
  const primary=cmd==='Activism'?rows.filter(row=>!['activate','agitate'].includes(row.option)):rows;
  const ids=primary.map(rowKey).filter(Boolean);
  if(!['Message','March','Attack'].includes(cmd)) requireThat(new Set(ids).size===ids.length,'Select each space only once.');
  if(limited) requireThat(rows.length===1,'A Limited Command takes one row.');
  if(cmd==='Rally'&&f!=='m') requireThat(rows.length<=Math.max(2,g.tracks.pol),'Rally space limit is the greater of 2 and Polarization.');
  if(cmd==='Rally') requireThat(f!=='r'||rows.filter(row=>row.option==='disc').length<=1,'Reds may place only one Administration in a Rally.');
  if(cmd==='Politics') requireThat(rows.length===1,'Politics places one cube.');
}
export function applyHumanCommand(g,f,log,intent,{limited=false,free=false}={}) {
  const cmd=intent.command, spec=intent.special??{}, rows=list(intent.rows);
  requireThat(legalCommands(g,f).includes(cmd),'Choose a Command available to this faction and phase.');
  requireThat(!spec.name||!limited&&legalSpecials(g,f,cmd).includes(spec.name),'That Special Activity cannot accompany this Command.');
  orderRows(g,cmd,rows,f,limited);
  recycle(g,f,intent.recycle);
  const activateRows=rows.filter(row=>row.option==='activate').length;
  const agitateRows=rows.filter(row=>row.option==='agitate').length;
  if(cmd==='Activism') requireThat(activateRows+agitateRows<=1&&
    !(rows.some(row=>row.option==='calm')&&rows.some(row=>row.option==='flip')),
    'Use at most one activation roll or Reds Agitation. Choose either calming friendly Cells or flipping enemy Cells.');
  if(cmd==='Activism'&&rows.some(row=>['activate','agitate'].includes(row.option))&&!['activate','agitate'].includes(rows.at(-1).option)) throw Error('Resolve Activism’s activation roll or Reds Agitation after its other selections.');
  if(['March','Attack'].includes(cmd)) {
    const seen=new Set();
    for(const row of rows) {
      const from=row.from??row.to;
      requireThat(!seen.has(from)&&!seen.has(row.to),'Enter each movement group once and use each destination once. Record mixed or converging groups in the tabletop editor.');
      seen.add(from);
      seen.add(row.to);
    }
  }
  let discount=cmd==='Rally'&&f==='m'?Math.max(0,g.tracks.pol-5):0, addedTerror=0;
  let i=0;
  const fixedPol=g.tracks.pol;
  const movedInto={};
  const activismSites=new Set();
  let negotiated=0;
  const timing=spec.name?integer(spec.timing??rows.length,0,rows.length,'Special Activity timing'):-1;
  for(const row of rows) {
    if(i===timing) resolveSpecial(g,f,log,spec);
    i++;
    const b=g.board[row.id];
    if(cmd==='Rally') {
      requireThat(b,'Choose a Rally space.');
      const option=row.option??'cells';
      if(option==='disc') requireThat(f!=='s'&&replaceWithDisc(g,row.id,f),'That disc placement is unavailable.');
      else if(option==='hide') requireThat(f==='m'&&b.network&&flip(b,f,false,pop(row.id)+b.network),'There are no Cells to hide there.');
      else {
        const {modifier}=rallySize(b,f);
        const offset=free?modifier:integer(row.offset??0,0,modifier,'Rally offset');
        const size=rallySize(b,f,offset).n;
        requireThat(size>0&&placeCells(g,row.id,f,size),'No available Cells can Rally there. Check offset or recycle a friendly Cell.');
      }
      const cost=1+(option==='cells'&&!free?Number(row.offset??0):0);
      pay(g,f,Math.max(0,cost-discount),free);
      discount=Math.max(0,discount-cost);
      log.push('Rally in '+spaceName(row.id)+'.');
    }
    if(cmd==='Politics') {
      requireThat(g.tracks.pol<=5&&SPACE_IDS.some(id=>cells(g.board[id],'m')||g.board[id].network),'Politics needs Moderates presence and Polarization of 5 or less.');
      pay(g,f,1+Math.floor(g.tracks.pol/2),free);
      requireThat(putCube(g,row.side),'Select an available political cube.');
    }
    if(cmd==='Negotiate') {
      requireThat(b?.mI&&['r','s'].includes(row.side)&&b[row.side+'A'],'Select an Underground Moderates Cell and an Active enemy Cell.');
      pay(g,f,1,free);
      flip(b,'m',true);
      flip(b,row.side,false);
      negotiated++;

      log.push('Negotiate in '+spaceName(row.id)+'.');
    }
    if(cmd==='Terror') {
      if(row.id==='political') {
        requireThat(['r','s'].includes(row.side)&&g.tracks[row.side+'C']>0,'Select an existing political cube.');
        pay(g,f,1,free);
        g.tracks[row.side+'C']--;
      } else {
        requireThat(b,'Choose a Terror space.');
        const choices=terrorOptions(g,row.id,f,{polarization:fixedPol});
        const selected=choices.find(x=>x.removed.join(',')===row.targets)||(!row.targets?choices[0]:null);
        requireThat(selected,'Select a legal Terror target.');
        addedTerror+=terrorAt(g,row.id,f,selected,{free,holdPol:true});
      }
    }
    if(cmd==='Activism') {
      if(row.option==='activate') {
        pay(g,f,1,free);
        const value=roll(g,log,'Activism');
        const choices=list(row.sites);
        requireThat(new Set(choices).size===choices.length&&choices.every(id=>g.board[id]?.[f+'I']),'Choose spaces with Inactive friendly Cells.');
        let n=0, progress=true;
        while(n<value&&progress) {
          progress=false;
          for(const id of choices) {
            if(n===value) break;
            if(flip(g.board[id],f,true)) {
              n++;
              progress=true;
            }
          }
        }
        log.push('Activate '+n+' friendly Cell(s) across the selected spaces.');
      } else {
        requireThat(b,'Choose an Activism space.');
        const agitate=row.option==='agitate';
        if(!activismSites.has(row.id)||agitate&&free) pay(g,f,1,free&&!agitate);
        activismSites.add(row.id);
        if(row.option==='calm') {
          requireThat(b[f+'A']>0,'Select a space with an Active friendly Cell.');
          b[f+'A']--;
          g.tracks.pol=Math.max(0,g.tracks.pol-1);
          cleanSpace(g,row.id);
        } else if(agitate) {
          requireThat(f==='r'&&b.admin&&control(b)==='r','Agitate in Reds Control with an Administration.');
          const shift=b.support>-2&&row.shift!==false;
          const removeTerror=b.rTerror+b.sTerror>0;
          requireThat(shift||removeTerror,'Agitation must remove Terror or shift Opposition.');
          pay(g,f,Number(removeTerror)+Number(shift)+g.tracks.sIssue);
          b.rTerror=b.sTerror=0;
          if(shift) b.support--;
        } else {
          const key=row.side;
          requireThat(enemy(f).includes(key),'Choose the enemy faction to flip.');
          const toActive=row.direction==='active';
          const count=integer(row.count??1,1,b[f+'A']+Math.floor(b[f+'I']/2),'enemy Cells to flip');
          requireThat(b[key+(toActive?'I':'A')]>=count,'There are too few eligible enemy Cells.');
          flip(b,key,toActive,count);
        }
      }
    }
    if(cmd==='March') {
      const count=integer(row.count,1,cells(g.board[row.from]??{},f),'marching Cells');
      pay(g,f,Math.ceil(count/3),free);
      const russian=integer(row.russian??0,0,f==='r'?Math.min(count,g.board[row.from].u):0,'moving Russian Troops');
      travel(g,f,row.from,row.to,{count,activeFirst:row.activeFirst,caps:list(row.caps),russian});
      log.push('March '+count+' from '+spaceName(row.from)+' to '+spaceName(row.to)+'.');
    }
    if(cmd==='Attack') humanAttack(g,f,log,row,free);
    if(cmd==='Message') {
      pay(g,f,1,free);
      humanMessage(g,log,row,movedInto);
    }
  }
  if(cmd==='Terror') g.tracks.pol=Math.min(10,g.tracks.pol+addedTerror);
  if(cmd==='Negotiate'&&intent.reduce!==false) g.tracks.pol=Math.max(0,g.tracks.pol-negotiated);
  if(i===timing) resolveSpecial(g,f,log,spec);
  if(negotiated) log.push(negotiated+' enemy Cell(s) Deactivated.');
  if(spec.name) log.push('Special Activity · '+spec.name+' after '+timing+' Command row(s).');
}
function humanAttack(g,f,log,row,free) {
  const {from,to}=row;
  const source=g.board[from], b=g.board[to];
  requireThat(source&&b,'Choose Attack origin and target.');
  const count=integer(row.count,1,cells(source,f),'attacking Cells');
  const boost=integer(row.boost??0,0,30,'Attack boost');
  const caps=list(row.caps);
  let attackCount=count;
  let inactive=row.activeFirst?Math.max(0,count-source[f+'A']):Math.min(count,source[f+'I']);
  const russian=integer(row.russian??0,0,f==='r'?source.u:0,'attacking Russian Troops');
  let russians=russian;
  const defenders=f==='s'?['r','u']:row.defenders==='both'?['s','g']:[row.defenders==='g'?'g':'s'];
  requireThat(defenders.some(side=>side==='g'||side==='u'?b[side]:cells(b,side)||side==='r'&&b.admin),'Choose a target with removable defenders.');
  if(from!==to) {
    requireThat(caps.includes('train')&&legalRail(g,from,to),'An adjacent Attack requires a Train on an unsabotaged railway.');
    requireThat(russian<=count,'A moving group may take at most one Russian Troop per Reds Cell.');
    const localCount=integer(row.localCount??0,0,cells(b,f),'attacking Cells already at the target');
    attackCount+=localCount;
    inactive+=row.localActiveFirst?Math.max(0,localCount-b[f+'A']):Math.min(localCount,b[f+'I']);
    russians+=integer(row.localRussian??0,0,f==='r'?b.u:0,'attacking Russian Troops already at the target');
    travel(g,f,from,to,{count,caps,russian,activeFirst:row.activeFirst});
  } else for(const cap of new Set(caps)) {
    requireThat(source.caps[f].filter(x=>x===cap).length>=caps.filter(x=>x===cap).length,'That Attack Capability is unavailable.');
  }
  pay(g,f,(from===to?1:Math.ceil(count/3))+boost,free);
  const retreat=row.retreat||null;
  requireThat(!retreat||NEAR[to]?.includes(retreat),'Choose an adjacent Retreat space.');
  engage(g,log,{f,id:to,defenders,attackCount,russians,caps:from===to&&caps.length?caps:null,
    boost,retreat,bot:false,casualty:row.casualty,attrition:row.attrition,attackerInactive:inactive});
}
function humanMessage(g,log,row,movedInto) {
  const path=[row.from,...list(row.path).filter(Boolean)], source=g.board[path[0]];
  requireThat(source&&path.length>=2&&path.length<=4&&path.slice(1).every((id,i)=>NEAR[path[i]].includes(id)),'Choose a connected Message path of one to three steps.');
  requireThat(cells(source,'m')>(movedInto[row.from]??0),'Select a Moderates Cell that has not moved.');
  const key=row.activeFirst&&source.mA||!source.mI?'mA':'mI';
  requireThat(source[key]>(movedInto[row.from+key]??0),'That Cell status has no unmoved Cell at the origin.');
  const carryPerson=Boolean(row.person||source.person&&cells(source,'m')===1);
  const named=row.token?g.news.find(n=>n.id===Number(row.token)):null;
  const token=named??(cells(source,'m')===1&&!carryPerson?newsAt(g,row.from,'m')[0]:null);
  requireThat(!row.token||named,'Select an existing News marker.');
  requireThat(!carryPerson||source.person,'The Personality is not at the origin.');
  requireThat(!(carryPerson&&token),'A Cell can carry the Personality or one News marker.');
  requireThat(!token||path.includes(token.space)&&(token.owner===null||token.owner==='m'&&token.space===row.from),'The News marker must be on the route, with no other holder.');
  source[key]--;
  let to=path.at(-1), captured=false;
  if(token||carryPerson) {
    const pickUp=token?path.indexOf(token.space):0;
    const choices=path.slice(1).map((id,i)=>({id,dist:Math.abs(i+1-pickUp),threat:Math.max(g.board[id].rA,g.board[id].sA)})).sort((a,b)=>b.threat-a.threat||a.dist-b.dist);
    const target=choices.find(x=>x.id===row.capture&&x.threat===choices[0].threat&&x.dist===choices[0].dist)??choices[0];
    if(target.threat&&roll(g,log,'Message Capture in '+spaceName(target.id))<=target.threat) {
      to=target.id;
      captured=true;
    }
    if(token) {
      token.space=to;
      token.owner='m';
    }
    if(carryPerson) {
      source.person=false;
      g.board[to].person=true;
    }
  }
  const status=captured?'mA':'mI';
  g.board[to][status]++;
  movedInto[to]=(movedInto[to]??0)+1;
  movedInto[to+status]=(movedInto[to+status]??0)+1;
  cleanSpace(g,row.from);
  log.push('Message · '+spaceName(row.from)+' → '+spaceName(to)+(captured?' · Captured and Active.':'.'));
}
