import {BORDERS, EVENTS, FACTIONS, LABEL, MOOD, NAME, NEAR, SPACE_IDS, TOWNS, borderName, eventName, pop, spaceName, town} from './data.js';
import {capacity, cells, clone, control, countActive, personality, pools} from './model.js';
import {battleStrengthDetails, legalRail, politicalCubeChoices, rallySize, terrorOptions} from './actions.js';
import {legalCommands, legalSpecials, recycle, redsAgitation} from './human.js';

export const escape = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const items = entries=>entries.map(item=>Array.isArray(item)?item:[item,item]);
export const btn = (action,title,{value='',kind='',disabled=false,pressed=null}={})=>
  '<button type="button" class="button '+escape(kind)+'" data-action="'+escape(action)+'" data-value="'+escape(value)+'"'+(pressed===null?'':' aria-pressed="'+pressed+'"')+(disabled?' disabled':'')+'>'+escape(title)+'</button>';
const selected = (x,y)=>String(x)===String(y)?' selected':'';
export const field = (label,body)=>'<label class="field"><span>'+escape(label)+'</span>'+body+'</label>';
export function select(label,path,value,options,{empty=null,refresh=false,number=false}={}) {
  return field(label,'<select data-bind="'+escape(path)+'"'+(refresh?' data-refresh':'')+(number?' data-number':'')+'>'+
    (empty!==null?'<option value=""'+selected('',value)+'>'+escape(empty)+'</option>':'')+
    items(options).map(([key,name])=>'<option value="'+escape(key)+'"'+selected(key,value)+'>'+escape(name)+'</option>').join('')+'</select>');
}
export function numeric(label,path,value,{min=0,max=30}={}) {
  return field(label,'<input type="number" inputmode="numeric" min="'+min+'" max="'+max+'" step="1" data-bind="'+escape(path)+'" value="'+escape(value)+'">');
}
export function lineInput(label,path,value,{placeholder='',max=100}={}) {
  return field(label,'<input type="text" maxlength="'+max+'" data-bind="'+escape(path)+'" placeholder="'+escape(placeholder)+'" value="'+escape(value)+'">');
}
export function check(label,path,value,{refresh=false}={}) {
  return '<label class="check"><input type="checkbox" data-bind="'+escape(path)+'"'+(value?' checked':'')+(refresh?' data-refresh':'')+'><span>'+escape(label)+'</span></label>';
}
export function checks(label,path,values,options) {
  return '<fieldset class="checks"><legend>'+escape(label)+'</legend><div class="check-grid">'+items(options).map(([key,name])=>
    '<label class="check"><input type="checkbox" data-list="'+escape(path)+'" value="'+escape(key)+'"'+(values.includes(key)?' checked':'')+'><span>'+escape(name)+'</span></label>').join('')+'</div></fieldset>';
}
export const group = content=>'<div class="fields">'+content+'</div>';
export const spaceOptions = (ids=SPACE_IDS)=>ids.map(id=>[id,spaceName(id)]);
export const sides = list=>list.map(f=>[f,NAME[f]]);
export const cubeOptions = [['r','Red cube'],['s','White cube']];
export const sideOptions=[['light','Unshaded'],['dark','Shaded']];
export const eventOptions = g=>Object.keys(EVENTS).map(Number).filter(id=>id!==24&&id!==g.current&&id!==g.upcoming&&!g.seen.includes(id)).map(id=>[id,eventName(id)]);
export function ensure(obj,key,value) {
  if(obj[key]===undefined) obj[key]=typeof value==='function'?value():value;
  return obj[key];
}
export function makeRow(g,cmd,f) {
  if(cmd==='Rally') return {id:f==='m'?'hel':f==='s'?'vaa':'tam',option:'cells',offset:0};
  if(cmd==='Politics') return {side:pools(g).rC?'r':'s'};
  if(cmd==='Negotiate') {
    const id=SPACE_IDS.find(k=>g.board[k].mI&&(g.board[k].rA||g.board[k].sA))??'hel';
    return {id,side:g.board[id].rA?'r':'s'};
  }
  if(cmd==='Activism') return {id:'hel',option:'activate',sites:SPACE_IDS.filter(id=>g.board[id][f+'I']),side:f==='s'?'r':'s',direction:'inactive',count:1,shift:true};
  if(cmd==='Terror') {
    const id=SPACE_IDS.find(id=>terrorOptions(g,id,f).length)??'political';
    return {id,side:g.tracks.rC?'r':'s',targets:''};
  }
  if(cmd==='Message') {
    const from=SPACE_IDS.find(id=>cells(g.board[id],f))??'hel';
    return {from,path:[NEAR[from][0],'',''],activeFirst:false,person:false,token:0,capture:''};
  }
  const from=SPACE_IDS.find(id=>cells(g.board[id],f))??'hel';
  return {from,to:cmd==='Attack'?from:NEAR[from][0],count:1,caps:[],russian:0,activeFirst:false,defenders:'s',boost:0,retreat:'',casualty:'active',attrition:'inactive'};
}
export function estimateCommandSummary(g,f,intent,{limited=false}={}) {
  const cmd=intent.command, rows=Array.isArray(intent.rows)?intent.rows:[], spec=intent.special??{};
  let recycleInvalid=false;
  if(intent.recycle?.length) {
    const trial=clone(g);
    try { recycle(trial,f,intent.recycle); g=trial; }
    catch { recycleInvalid=true; }
  }
  const p=pools(g), activismSites=new Set();
  let cost=0, earned=0, discount=cmd==='Rally'&&f==='m'?Math.max(0,g.tracks.pol-5):0;
  for(const row of rows) {
    if(cmd==='Rally') {
      const c=1+((row.option??'cells')==='cells'?Math.max(0,Number(row.offset)||0):0);
      cost+=Math.max(0,c-discount);
      discount=Math.max(0,discount-c);
    } else if(cmd==='Politics') cost+=1+Math.floor(g.tracks.pol/2);
    else if(cmd==='Negotiate'||cmd==='Terror'||cmd==='Message') cost+=1;
    else if(cmd==='Activism') {
      if(row.option==='activate'||!activismSites.has(row.id)) cost++;
      if(row.option==='agitate'&&g.board[row.id]) cost+=redsAgitation(g,row).cost;
      if(row.option!=='activate') activismSites.add(row.id);
    } else if(cmd==='March') cost+=Math.ceil(Math.max(1,Number(row.count)||1)/3);
    else if(cmd==='Attack') cost+=(row.from===row.to?1:Math.ceil(Math.max(1,Number(row.count)||1)/3))+Math.max(0,Number(row.boost)||0);
  }
  if(!limited&&spec.name) {
    if(spec.name==='Foreign Relations'&&spec.option==='lower') cost+=Math.max(1,Number(spec.boost)||0);
    if(spec.name==='Political Event') earned+=(spec.sites??[]).length;
    if(spec.name==='Publish') {
      earned+=(spec.sites??[]).reduce((sum,id)=>sum+Number(town(id))+2*Math.max(0,Number(spec.amounts?.[id])||0),0);
    }
  }
  const legalSpaces=SPACE_IDS.filter(id=>{
    const b=g.board[id];
    if(cmd==='Rally') return p[f]>0||(f!=='s'&&p[f==='r'?'admin':'network']>0&&cells(b,f)>=2&&capacity(b)>0)||(f==='m'&&b.network&&b.mA>0);
    if(cmd==='Negotiate') return b.mI>0&&(b.rA>0||b.sA>0);
    if(cmd==='Terror') return terrorOptions(g,id,f).length>0;
    if(cmd==='Activism') return cells(b,f)>0||(f==='r'&&b.admin&&control(b)==='r');
    if(cmd==='March'||cmd==='Message') return cells(b,f)>0;
    if(cmd==='Attack') return cells(b,f)>0;
    return false;
  });
  const availPieces=[NAME[f]+' Cells: '+p[f]+(intent.recycle?.length&&!recycleInvalid?' after returns':'')];
  if(f==='r') availPieces.push('Admins: '+p.admin,'Russian Troops on map: '+SPACE_IDS.reduce((n,id)=>n+g.board[id].u,0),'Red Terror: '+p.rTerror);
  if(f==='s') availPieces.push('White Terror: '+p.sTerror,'Prepared: '+p.prep);
  if(f==='m') availPieces.push('Networks: '+p.network,'Personality: '+(personality(g)?spaceName(personality(g)):'Available'),'Cubes: Red '+p.rC+' / White '+p.sC);
  const maxSpaces=limited||cmd==='Politics'?1:cmd==='Rally'&&f!=='m'?Math.max(2,g.tracks.pol):SPACE_IDS.length+Number(cmd==='Activism');
  return {cost,earned,availableResources:g.tracks[f],legalSpaces,availPieces,maxSpaces,recycleInvalid};
}
export function commandSummaryHtml(g,f,intent,limited) {
  const summary=estimateCommandSummary(g,f,intent,{limited});
  const command=intent.command;
  const movement=['Attack','March','Message'].includes(command);
  const spaces=summary.legalSpaces.map(spaceName).join(', ')||'None';
  const candidateText=summary.legalSpaces.length===SPACE_IDS.length?'All '+SPACE_IDS.length+' spaces':spaces;
  return '<div class="summary-line"><span>Estimated cost <strong>'+summary.cost+'</strong>'+(summary.earned?' · Estimated gain '+summary.earned:'')+
    ' · Resources <strong>'+summary.availableResources+'</strong></span><span>Selections '+intent.rows.length+'/'+summary.maxSpaces+'</span></div>'+
    '<p class="quiet">'+escape(summary.availPieces.join(' · '))+'</p>'+
    (summary.recycleInvalid?'<p class="quiet">Check the pieces selected to return to Available.</p>':'')+
    (command==='Politics'?'':'<p class="quiet">'+(movement?'Origins with friendly Cells':'Candidate spaces')+' · '+escape(candidateText)+'</p>');
}
export function rowHelperText(g,f,cmd,row) {
  if(cmd==='Rally'&&g.board[row.id]) {
    const b=g.board[row.id], opt=row.option??'cells';
    if(opt==='cells') {
      const {n,modifier}=rallySize(b,f,Number(row.offset)||0);
      return spaceName(row.id)+' ('+MOOD[b.support+2]+(b.rTerror+b.sTerror?', '+(b.rTerror+b.sTerror)+' Terror':'')+') · Places '+n+' Cell(s) · Max offset '+modifier+' · Row cost '+(1+(Number(row.offset)||0));
    }
    if(opt==='disc') return spaceName(row.id)+' · Has '+cells(b,f)+' friendly Cell(s) (need 2+) · Stacking room '+capacity(b);
    if(opt==='hide') return spaceName(row.id)+' · Active Moderates: '+b.mA+' · Can hide up to '+(pop(row.id)+b.network);
  }
  if(cmd==='Attack'&&g.board[row.from]&&g.board[row.to]) {
    const src=g.board[row.from], count=Math.min(Math.max(1,Number(row.count)||1),Math.max(1,cells(src,f)));
    const moving=row.from!==row.to;
    const target=g.board[row.to];
    const defenders=f==='s'?['r','u']:row.defenders==='both'?['s','g']:[row.defenders==='g'?'g':'s'];
    const movingCaps=row.caps??[];
    const caps=moving?[...target.caps[f],...movingCaps]:movingCaps.length?movingCaps:src.caps[f];
    const attackCount=count+(moving?Number(row.localCount)||0:0);
    const russians=(Number(row.russian)||0)+(moving?Number(row.localRussian)||0:0);
    const {strength,breakdown}=battleStrengthDetails(g,{f,id:row.to,defenders,attackCount,russians,caps,boost:Number(row.boost)||0,bot:false});
    const rowCost=(row.from===row.to?1:Math.ceil(count/3))+(Number(row.boost)||0);
    const railHint=moving&&!legalRail(g,row.from,row.to)?' · No usable rail link':moving&&!movingCaps.includes('train')?' · Select a Train to move':'';
    return 'Origin '+spaceName(row.from)+': '+src[f+'A']+' active, '+src[f+'I']+' inactive'+(f==='r'?', '+src.u+' Russian':'')+
      ' · Estimated Strength '+strength+' ('+breakdown+') · Cost '+rowCost+railHint;
  }
  if(cmd==='March'&&g.board[row.from]) {
    const src=g.board[row.from], count=Math.max(1,Number(row.count)||1);
    return 'Origin '+spaceName(row.from)+': '+src[f+'A']+' active, '+src[f+'I']+' inactive'+(f==='r'?', '+src.u+' Russian':'')+' · Row cost '+Math.ceil(count/3);
  }
  if(cmd==='Activism') {
    if(row.option==='activate') {
      const elig=SPACE_IDS.filter(id=>g.board[id][f+'I']>0);
      return 'Active '+NAME[f]+' on map: '+countActive(g,f)+' · Eligible Inactive spaces ('+elig.length+'): '+(elig.map(spaceName).join(', ')||'none');
    }
    if(g.board[row.id]) {
      const b=g.board[row.id];
      if(row.option==='flip') return spaceName(row.id)+' · Max flips here: '+(b[f+'A']+Math.floor(b[f+'I']/2))+' · Enemy: '+b[(row.side??'s')+'A']+' active, '+b[(row.side??'s')+'I']+' inactive';
      if(row.option==='calm') return spaceName(row.id)+' · Active friendly Cells: '+b[f+'A'];
      if(row.option==='agitate') {
        return spaceName(row.id)+' · Admin: '+b.admin+' · Control: '+(NAME[control(b)]??'None')+' · Extra Agitate cost '+redsAgitation(g,row).cost;
      }
    }
  }
  if(cmd==='Message'&&g.board[row.from]) {
    const src=g.board[row.from], steps=(row.path??[]).filter(Boolean);
    const maxThreat=steps.reduce((m,id)=>Math.max(m,g.board[id]?Math.max(g.board[id].rA,g.board[id].sA):0),0);
    return 'Origin '+spaceName(row.from)+': '+src.mA+' active, '+src.mI+' underground'+(steps.length?' · Route max Capture threat: '+maxThreat:'');
  }
  if(cmd==='Negotiate'&&g.board[row.id]) {
    const b=g.board[row.id];
    return spaceName(row.id)+' · Underground Moderates: '+b.mI+' · Active Reds: '+b.rA+' · Active Senate: '+b.sA;
  }
  if(cmd==='Terror'&&row.id&&row.id!=='political'&&g.board[row.id]) {
    const b=g.board[row.id];
    return spaceName(row.id)+' · Active friendly: '+b[f+'A']+' · Removal cap: '+(g.tracks.pol>=6?2:1)+' · Terror markers here: '+(b.rTerror+b.sTerror)+'/2';
  }
  return '';
}
function commandRow(g,f,cmd,row,base) {
  const space=select('Space',base+'.id',row.id,spaceOptions(),{refresh:true});
  const helper=rowHelperText(g,f,cmd,row);
  const helperHtml='<p class="quiet row-hint" data-row-hint="'+escape(base)+'"'+(helper?'':' hidden')+'>'+escape(helper)+'</p>';
  if(cmd==='Rally') {
    const options=[['cells','Place Cells'],...(f==='r'?[['disc','Build Administration']]:f==='m'?[['disc','Build Network'],['hide','Hide Cells at a Network']]:[])];
    const maxOffset=g.board[row.id]?rallySize(g.board[row.id],f).modifier:0;
    return space+select('Rally option',base+'.option',row.option,options,{refresh:true})+
      (row.option==='cells'?numeric('Resources to offset',base+'.offset',row.offset,{max:maxOffset}):'')+helperHtml;
  }
  if(cmd==='Politics') return select('Political cube',base+'.side',row.side,cubeOptions)+helperHtml;
  if(cmd==='Negotiate') return space+select('Deactivate',base+'.side',row.side,sides(['r','s']))+helperHtml;
  if(cmd==='Activism') {
    const options=[['activate','Roll to Activate friendly Cells'],['flip','Flip enemy Cells'],['calm','Remove one Active friendly Cell'],...(f==='r'?[['agitate','Agitate at an Administration']]:[])];
    let detail='';
    if(row.option==='activate') detail=checks('Spaces to Activate',base+'.sites',row.sites??SPACE_IDS.filter(id=>g.board[id][f+'I']),spaceOptions(SPACE_IDS.filter(id=>g.board[id][f+'I'])))+
      numeric('Maximum Cells to Activate (0 uses the roll)',base+'.activateCount',row.activateCount??0,{max:6});
    if(row.option==='flip') detail=space+select('Enemy faction',base+'.side',row.side,sides(FACTIONS.filter(x=>x!==f)))+
      select('Flip status to',base+'.direction',row.direction,[['active','Active'],['inactive','Inactive / Underground']])+numeric('Cells',base+'.count',row.count,{min:1,max:20});
    if(row.option==='calm') detail=space;
    if(row.option==='agitate') detail=space+check('Shift one step toward Opposition',base+'.shift',row.shift);
    return select('Activism option',base+'.option',row.option,options,{refresh:true})+detail+helperHtml;
  }
  if(cmd==='Terror') {
    const opts=row.id==='political'?[]:terrorOptions(g,row.id,f);
    const choice=row.id==='political'?select('Remove',base+'.side',row.side,cubeOptions):select('Casualties',base+'.targets',row.targets,
      opts.map(x=>[x.removed.join(','),x.removed.map(key=>LABEL[key]).join(' + ')]),{empty:'First legal target'});
    return select('Space or display',base+'.id',row.id,[...spaceOptions(),['political','Political Display']],{refresh:true})+choice+helperHtml;
  }
  if(cmd==='Message') {
    const path=row.path??[];
    let route=select('From',base+'.from',row.from,spaceOptions(),{refresh:true});
    for(let i=0;i<3;i++) {
      const previous=i===0?row.from:path[i-1];
      if(!previous) break;
      route+=select('Step '+(i+1),base+'.path.'+i,path[i],spaceOptions(NEAR[previous]??[]),{empty:i===0?'Choose adjacent space':'Stop here',refresh:true});
    }
    return route+select('News to carry or collect',base+'.token',row.token,[[0,'None selected'],...g.news.map(n=>[n.id,'News '+n.id+' · '+spaceName(n.space)])],{number:true})+
      check('Prefer an Active Cell',base+'.activeFirst',row.activeFirst)+check('Carry the Personality',base+'.person',row.person)+helperHtml;
  }
  const source=g.board[row.from], target=g.board[row.to];
  const attack=cmd==='Attack', trainAttack=attack&&target&&row.from!==row.to;
  const destinations=attack?[row.from,...(NEAR[row.from]??[])]:NEAR[row.from]??[];
  const unique=[...new Set(source?.caps[f]??[])];
  const destOpts=destinations.map(id=>[id,spaceName(id)+(id!==row.from&&legalRail(g,row.from,id)?' (Rail)':'')]);
  let html=select('Origin',base+'.from',row.from,spaceOptions(),{refresh:true})+
    select(attack?'Target':'Destination',base+'.to',row.to,destOpts,{empty:'Choose a space',refresh:true})+
    numeric(trainAttack?'Cells moving by Train':'Friendly Cells',base+'.count',row.count,{min:1,max:20})+
    (f==='r'?numeric(trainAttack?'Russian Troops moving by Train':'Russian Troops',base+'.russian',row.russian,{max:6}):'')+
    check('Take Active Cells first',base+'.activeFirst',row.activeFirst);
  if(unique.length) {
    html+=group(unique.map(x=>{
      const name=x==='officer'?f==='r'?'Commanders':'Jaeger':x==='train'?'Trains':'Cannons';
      return numeric(attack&&!trainAttack?name:name+' to move',base+'.capCounts.'+x,
        (row.caps??[]).filter(cap=>cap===x).length,{max:source.caps[f].filter(cap=>cap===x).length});
    }).join(''));
    if(attack&&!trainAttack) html+='<p class="quiet">Leave Capability counts at zero to use up to the two strongest in the space.</p>';
  }
  if(trainAttack&&cells(target,f)>0) html+=numeric('Friendly Cells already at target',base+'.localCount',row.localCount??0,{max:cells(target,f)})+
    check('Take Active Cells first at target',base+'.localActiveFirst',row.localActiveFirst);
  if(trainAttack&&f==='r'&&target.u) html+=numeric('Russian Troops already at target',base+'.localRussian',row.localRussian??0,{max:target.u});
  if(attack) html+=(f==='r'?select('Defenders',base+'.defenders',row.defenders,[['s','Senate'],['g','Germany'],['both','Senate and Germany']]):'')+
    numeric('Resources to boost strength',base+'.boost',row.boost)+
    select('Casualty order',base+'.casualty',row.casualty,[['active','Active defending Cells first'],['inactive','Inactive defending Cells first']])+
    select('Take friendly attrition from',base+'.attrition',row.attrition??'inactive',[['inactive','Inactive attacking Cells first'],['active','Active attacking Cells first']])+
    select('Resolve a hit',base+'.retreat',row.retreat,[['','Engage'],...spaceOptions(NEAR[row.to]??[]).map(([id,name])=>[id,'Retreat to '+name])]);
  return html+helperHtml;
}
function specialFields(g,f,s,base) {
  const selected=s.name;
  if(selected==='Political Event'||selected==='Publish') {
    const legal=SPACE_IDS.filter(id=>selected==='Publish'?pop(id)>0&&(cells(g.board[id],'m')||g.board[id].network):g.board[id][f+'A']&&control(g.board[id])===f);
    return checks('Spaces',base+'.sites',s.sites??[],spaceOptions(legal))+
      (selected==='Publish'?(s.sites??[]).map(id=>numeric('Activate in '+spaceName(id),base+'.amounts.'+id,s.amounts?.[id]??0,{max:2})).join(''):'');
  }
  if(selected==='Foreign Relations') return select('Direction',base+'.option',s.option,[['raise','Increase Vassalage'],['lower','Roll to decrease Vassalage']],{refresh:true})+
    (s.option==='lower'?numeric('Resources to spend',base+'.boost',s.boost,{min:1}):'');
  if(selected==='Prepare') return select('Prepare option',base+'.option',s.option,[['marker','Place Prepared'],...(g.phase===2?[['sabotage','Sabotage border'],['repair','Remove Sabotage']]:[])],{refresh:true})+
    (s.option==='marker'?select('Space',base+'.id',s.id,spaceOptions(),{empty:'Choose space'}):
    select('Border',base+'.border',s.border,(s.option==='repair'?g.sabotage:BORDERS).map(x=>[x,borderName(x)]),{empty:'Choose border'}));
  if(selected==='Coordinate') return '<p class="quiet">Place Coordinate on the German cylinder for the next German Action Phase.</p>';
  if(selected==='Crackdown') return select('Space',base+'.id',s.id,spaceOptions(),{empty:'Choose space'});
  if(selected==='Dialogue') return select('Space',base+'.id',s.id,spaceOptions(),{empty:'Choose space'})+
    select('Dialogue option',base+'.option',s.option,[['shift','Shift toward Neutral'],['replace','Replace an Inactive Cell']],{refresh:true})+
    (s.option==='replace'?select('Enemy faction',base+'.side',s.side,sides(['r','s'])):'');
  if(selected==='Personality') {
    const choices=politicalCubeChoices(g);
    const option=select('Personality option',base+'.option',s.option,[['place','Place in a Town'],...(g.phase===2?[['earn','Use News to gain Resources'],['lower','Use News to lower Polarization']]:[])],{refresh:true});
    const space=select('Space',base+'.id',s.id,spaceOptions(s.option==='place'?TOWNS:SPACE_IDS),{empty:'Choose space'});
    if(s.option==='place') return option+space;
    const news=select('Held News',base+'.token',s.token,g.news.filter(x=>x.owner==='m').map(x=>[x.id,'News '+x.id+' · '+spaceName(x.space)]),{empty:'Choose News',number:true});
    const cube=choices.length?select('Place cube',base+'.side',s.side,cubeOptions.filter(([side])=>choices.includes(side))):
      '<p class="quiet">Use News for the selected reward. The Political Display is unavailable.</p>';
    return option+space+news+cube;
  }
  return '';
}
const specialDefaults={Prepare:'marker',Personality:'place',Dialogue:'shift','Foreign Relations':'raise'};
export function resetSpecial(intent) {
  const name=intent.special?.name??'';
  intent.special={name,timing:intent.rows?.length??1,option:specialDefaults[name]??'',id:'',boost:3,border:'',sites:[],amounts:{},side:'r',token:0};
}
export function commandFields(g,f,intent,base,{limited=false}={}) {
  ensure(intent,'command',legalCommands(g,f)[0]);
  ensure(intent,'manual',false);
  ensure(intent,'rows',()=>[makeRow(g,intent.command,f)]);
  ensure(intent,'reduce',true);
  ensure(intent,'recycle',[]);
  if(!intent.special) resetSpecial(intent);
  const cmd=intent.command, rows=intent.rows, special=intent.special;
  const summaryBar='<div class="form-summary" id="command-summary">'+commandSummaryHtml(g,f,intent,limited)+'</div>';
  const baseRows=select('Command',base+'.command',cmd,legalCommands(g,f),{refresh:true})+
    check('Resolve with the physical faction aid',base+'.manual',intent.manual,{refresh:true});
  if(intent.manual) return baseRows+'<p class="quiet">Follow the faction aid, then enter the affected spaces and tracks in the app.</p>';
  const rowsHtml=rows.map((row,i)=>'<div class="step-box"><div class="line"><strong>'+escape(cmd)+' '+(rows.length>1?i+1:'')+'</strong>'+
    (rows.length>1?btn('remove-row','Remove',{value:base+'|'+i,kind:'subtle small'}):'')+'</div>'+
    group(commandRow(g,f,cmd,row,base+'.rows.'+i))+'</div>').join('');
  const extras=(!limited&&cmd!=='Politics'?btn('add-row','Add '+(cmd==='March'||cmd==='Message'?'movement':'selection'),{value:base,kind:'subtle'}):'')+
    (cmd==='Negotiate'?check('Reduce Polarization',base+'.reduce',intent.reduce):'');
  let sa='';
  if(!limited) sa='<details class="inline" data-detail-key="'+escape(base+'-sa')+'"'+(special.name?' open':'')+'><summary>Special Activity'+(special.name?' · '+escape(special.name):'')+'</summary>'+
    group(select('Activity',base+'.special.name',special.name,legalSpecials(g,f,cmd),{empty:'None',refresh:true})+
    (special.name?select('Timing',base+'.special.timing',special.timing,Array.from({length:rows.length+1},(_,i)=>[i,i===0?'Before Command':i===rows.length?'After Command':'After selection '+i]),{number:true}):'')+specialFields(g,f,special,base+'.special'))+'</details>';
  const recycling='<details class="inline" data-detail-key="'+escape(base+'-recycle')+'"'+(intent.recycle.length?' open':'')+'><summary>Return friendly pieces to Available</summary>'+
    '<p class="quiet">Use only when making pieces Available during this action (§1.4.2).</p>'+
    intent.recycle.map((row,i)=>group(select('Space',base+'.recycle.'+i+'.id',row.id,spaceOptions())+
      select('Piece',base+'.recycle.'+i+'.key',row.key,[f+'A',f+'I',...(f==='r'?['admin']:f==='m'?['network','person']:[])].map(x=>[x,LABEL[x]]))+
      numeric('Count',base+'.recycle.'+i+'.count',row.count,{min:1,max:20})+btn('remove-recycle','Remove',{value:base+'|'+i,kind:'subtle small'}))).join('')+
    btn('add-recycle','Add return',{value:base,kind:'subtle small'})+'</details>';
  return baseRows+summaryBar+rowsHtml+extras+sa+recycling;
}
