import {BORDERS, EVENTS, FACTIONS, LABEL, NAME, NEAR, SPACE_IDS, TOWNS, borderName, eventName, spaceName} from './data.js';
import {cells, control, pools} from './model.js';
import {terrorOptions} from './actions.js';
import {legalCommands, legalSpecials} from './human.js';

export const escape = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const items = entries=>entries.map(item=>Array.isArray(item)?item:[item,item]);
export const btn = (action,title,{value='',kind='',disabled=false}={})=>
  '<button type="button" class="button '+escape(kind)+'" data-action="'+escape(action)+'" data-value="'+escape(value)+'"'+(disabled?' disabled':'')+'>'+escape(title)+'</button>';
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
function commandRow(g,f,cmd,row,base) {
  const space=select('Space',base+'.id',row.id,spaceOptions(),{refresh:true});
  if(cmd==='Rally') {
    const options=[['cells','Place Cells'],...(f==='r'?[['disc','Build Administration']]:f==='m'?[['disc','Build Network'],['hide','Hide Cells at a Network']]:[])];
    return space+select('Rally option',base+'.option',row.option,options,{refresh:true})+(row.option==='cells'?numeric('Resources to offset',base+'.offset',row.offset,{max:4}):'');
  }
  if(cmd==='Politics') return select('Political cube',base+'.side',row.side,cubeOptions);
  if(cmd==='Negotiate') return space+select('Deactivate',base+'.side',row.side,sides(['r','s']));
  if(cmd==='Activism') {
    const options=[['activate','Roll to Activate friendly Cells'],['flip','Flip enemy Cells'],['calm','Remove one Active friendly Cell'],...(f==='r'?[['agitate','Agitate at an Administration']]:[])];
    let detail='';
    if(row.option==='activate') detail=checks('Eligible activation spaces',base+'.sites',row.sites,spaceOptions(SPACE_IDS.filter(id=>g.board[id][f+'I'])));
    if(row.option==='flip') detail=space+select('Enemy faction',base+'.side',row.side,sides(FACTIONS.filter(x=>x!==f)))+
      select('Flip status to',base+'.direction',row.direction,[['active','Active'],['inactive','Inactive / Underground']])+numeric('Cells',base+'.count',row.count,{min:1,max:20});
    if(row.option==='calm') detail=space;
    if(row.option==='agitate') detail=space+check('Shift one step toward Opposition',base+'.shift',row.shift);
    return select('Activism option',base+'.option',row.option,options,{refresh:true})+detail;
  }
  if(cmd==='Terror') {
    const opts=row.id==='political'?[]:terrorOptions(g,row.id,f);
    const choice=row.id==='political'?select('Remove',base+'.side',row.side,cubeOptions):select('Casualties',base+'.targets',row.targets,
      opts.map(x=>[x.removed.join(','),x.removed.map(key=>LABEL[key]).join(' + ')]),{empty:'First legal target'});
    return select('Space or display',base+'.id',row.id,[...spaceOptions(),['political','Political Display']],{refresh:true})+choice;
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
      check('Prefer an Active Cell',base+'.activeFirst',row.activeFirst)+check('Carry the Personality',base+'.person',row.person);
  }
  const source=g.board[row.from], target=g.board[row.to];
  const attack=cmd==='Attack', trainAttack=attack&&target&&row.from!==row.to;
  const destinations=attack?[row.from,...(NEAR[row.from]??[])]:NEAR[row.from]??[];
  const unique=[...new Set(source?.caps[f]??[])];
  let html=select('Origin',base+'.from',row.from,spaceOptions(),{refresh:true})+
    select(attack?'Target':'Destination',base+'.to',row.to,spaceOptions(destinations),{empty:'Choose a space',refresh:true})+
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
  return html;
}
function specialFields(g,f,s,base) {
  const selected=s.name;
  if(selected==='Political Event'||selected==='Publish') {
    const legal=SPACE_IDS.filter(id=>selected==='Publish'?cells(g.board[id],'m')||g.board[id].network:g.board[id][f+'A']&&control(g.board[id])===f);
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
  if(selected==='Personality') return select('Personality option',base+'.option',s.option,[['place','Place in a Town'],...(g.phase===2?[['earn','Use News to gain Resources'],['lower','Use News to lower Polarization']]:[])],{refresh:true})+
    select('Space',base+'.id',s.id,spaceOptions(s.option==='place'?TOWNS:SPACE_IDS),{empty:'Choose space'})+
    (s.option!=='place'?select('Held News',base+'.token',s.token,g.news.filter(x=>x.owner==='m').map(x=>[x.id,'News '+x.id+' · '+spaceName(x.space)]),{empty:'Choose News',number:true})+
    select('Place cube',base+'.side',s.side,cubeOptions):'');
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
  const baseRows=select('Command',base+'.command',cmd,legalCommands(g,f),{refresh:true})+
    check('Resolve with the physical faction aid',base+'.manual',intent.manual,{refresh:true});
  if(intent.manual) return baseRows+'<p class="quiet">Follow the faction aid, then enter the affected spaces and tracks in the app. This keeps your turn and board together.</p>';
  const rowsHtml=rows.map((row,i)=>'<div class="step-box"><div class="line"><strong>'+escape(cmd)+' '+(rows.length>1?i+1:'')+'</strong>'+
    (rows.length>1?btn('remove-row','Remove',{value:base+'|'+i,kind:'subtle small'}):'')+'</div>'+
    group(commandRow(g,f,cmd,row,base+'.rows.'+i))+'</div>').join('');
  const extras=(!limited&&cmd!=='Politics'?btn('add-row','Add '+(cmd==='March'||cmd==='Message'?'movement':'selection'),{value:base,kind:'subtle'}):'')+
    (cmd==='Negotiate'?check('Reduce Polarization',base+'.reduce',intent.reduce):'');
  let sa='';
  if(!limited) sa='<details class="inline"'+(special.name?' open':'')+'><summary>Special Activity'+(special.name?' · '+escape(special.name):'')+'</summary>'+
    group(select('Activity',base+'.special.name',special.name,legalSpecials(g,f,cmd),{empty:'None',refresh:true})+
    (special.name?select('Timing',base+'.special.timing',special.timing,Array.from({length:rows.length+1},(_,i)=>[i,i===0?'Before Command':i===rows.length?'After Command':'After selection '+i]),{number:true}):'')+specialFields(g,f,special,base+'.special'))+'</details>';
  const recycling='<details class="inline"'+(intent.recycle.length?' open':'')+'><summary>Return friendly pieces to Available</summary>'+
    '<p class="quiet">Use only when making pieces Available during this action (§1.4.2).</p>'+
    intent.recycle.map((row,i)=>group(select('Space',base+'.recycle.'+i+'.id',row.id,spaceOptions())+
      select('Piece',base+'.recycle.'+i+'.key',row.key,[f+'A',f+'I',...(f==='r'?['admin']:f==='m'?['network','person']:[])].map(x=>[x,LABEL[x]]))+
      numeric('Count',base+'.recycle.'+i+'.count',row.count,{min:1,max:20})+btn('remove-recycle','Remove',{value:base+'|'+i,kind:'subtle small'}))).join('')+
    btn('add-recycle','Add return',{value:base,kind:'subtle small'})+'</details>';
  return baseRows+rowsHtml+extras+sa+recycling;
}
