import {BORDERS, COMMANDS, FACTIONS, MARK, SPACE_IDS, SPECIALS, TYPES, VERSION} from './data.js';
import {EDIT_TRACKS} from './editor.js';
import {clone, human, validateGame} from './model.js';
import {actor, options} from './sequence.js';

export const SCHEMA=2;
export const STORAGE_KEY='abb-companion.campaigns';
export const BACKUP_KEY=STORAGE_KEY+'.backup';
export const REJECTED_KEY=STORAGE_KEY+'.rejected';
export const MAX_CAMPAIGNS=250;
export const MAX_SAVE_BYTES=64_000_000;
const BACKUP_PART_BYTES=16_000_000;
const HISTORY_LIMIT=30;
const TYPE='all-bridges-burning';
const encoder=new TextEncoder();
export const utf8Bytes=raw=>encoder.encode(raw).byteLength;
const exceedsSaveLimit=raw=>raw.length>MAX_SAVE_BYTES||(raw.length*3>MAX_SAVE_BYTES&&utf8Bytes(raw)>MAX_SAVE_BYTES);
const id=()=>globalThis.crypto?.randomUUID?.()??('abb-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
const isPlainObject=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const isInt=(value,min,max)=>Number.isInteger(value)&&value>=min&&value<=max;
const isOptInt=(value,min,max)=>value===undefined||value===''||isInt(value,min,max);
const isSpaceOrEmpty=value=>value===undefined||value===''||SPACE_IDS.includes(value);
const timestamp=value=>typeof value==='string'&&value.length<=60&&Number.isFinite(Date.parse(value));

export const emptyCollection=()=>({active:null,campaigns:[]});
export const newCampaign=(name,game)=>({id:id(),name,game,draft:{},undo:[],redo:[],checkpoints:[],last:null});
export const activeCampaign=collection=>collection.campaigns.find(c=>c.id===collection.active)??null;
export function addCampaign(collection,campaign) {
  checkCampaignRoom(collection,1);
  collection.campaigns.push(campaign);
  collection.active=campaign.id;
  return campaign;
}
function checkCampaignRoom(collection,additional) {
  if(collection.campaigns.length+additional>MAX_CAMPAIGNS) throw Error('This workspace can hold up to '+MAX_CAMPAIGNS+' campaigns. Export and remove a campaign to make room.');
}
export function renameCampaign(entry,name) {
  const clean=String(name??'').trim().slice(0,100);
  if(!clean) throw Error('Enter a campaign name.');
  entry.name=clean;
  return entry;
}
export function duplicateCampaign(collection,sourceId) {
  const source=collection.campaigns.find(c=>c.id===sourceId);
  if(!source) throw Error('Campaign could not be duplicated.');
  return addCampaign(collection,{...clone(source),id:id(),name:source.name.slice(0,93)+' (Copy)'});
}
export function commitCampaign(entry,game,label,detail) {
  entry.undo.push({label,game:entry.game,draft:entry.draft,last:entry.last});
  if(entry.undo.length>HISTORY_LIMIT) entry.undo.shift();
  entry.game=game;
  entry.draft={};
  entry.redo=[];
  entry.last=detail;
}
export function stepHistory(entry,dir) {
  const from=entry[dir], to=entry[dir==='undo'?'redo':'undo'];
  if(!from.length) return null;
  const previous=from.pop();
  to.push({label:previous.label,game:entry.game,draft:entry.draft,last:entry.last});
  entry.game=previous.game;
  entry.draft=recoverDraft(previous.draft??{},previous.game);
  entry.last=previous.last??null;
  return previous.label;
}
export function checkpointCampaign(entry,label) {
  const old=entry.checkpoints.findIndex(x=>x.label===label);
  const item={label,game:clone(entry.game),draft:clone(entry.draft)};
  if(old>=0) entry.checkpoints[old]=item;
  else entry.checkpoints.push(item);
  if(entry.checkpoints.length>8) entry.checkpoints.shift();
}
export function encode(collection) {
  return JSON.stringify({type:TYPE,schema:SCHEMA,version:VERSION,...collection});
}
export function encodeCampaign(entry) {
  const raw=encode({active:entry.id,campaigns:[entry]});
  if(exceedsSaveLimit(raw)) throw Error('This campaign exceeds the '+MAX_SAVE_BYTES/1_000_000+' MB import limit.');
  return raw;
}
export function encodeBackupParts(collection) {
  // Measure each campaign once, then assemble complete schema-2 files.
  const entries=collection.campaigns.map(campaign=>{
    const raw=JSON.stringify(campaign);
    return {id:campaign.id,raw,bytes:utf8Bytes(raw)};
  });
  const header=active=>{
    const {savedAt,exportedAt}=collection;
    return encode({active,savedAt,exportedAt,campaigns:[]}).slice(0,-2);
  };
  // Reserve enough room for any valid active ID, including the first ID of a new part.
  const longestId=entries.reduce((longest,item)=>item.id.length>(longest?.length??0)?item.id:longest,null);
  const overhead=utf8Bytes(header(longestId))+2;
  const parts=[];
  let batch=[], bytes=overhead;
  const finishPart=()=>{
    const active=batch.some(item=>item.id===collection.active)?collection.active:batch[0].id;
    const raw=header(active)+batch.map(item=>item.raw).join(',')+']}';
    parts.push({raw,bytes:utf8Bytes(raw),campaigns:batch.length});
    batch=[];
    bytes=overhead;
  };
  for(const item of entries) {
    if(item.bytes+overhead>MAX_SAVE_BYTES) throw Error('A campaign exceeds the '+MAX_SAVE_BYTES/1_000_000+' MB import limit. Export other campaigns individually.');
    if(batch.length&&bytes+1+item.bytes>BACKUP_PART_BYTES) finishPart();
    bytes+=Number(batch.length>0)+item.bytes;
    batch.push(item);
  }
  if(batch.length) finishPart();
  return parts;
}
export function decode(raw,{onDraftRecovery}={}) {
  if(typeof raw!=='string'||exceedsSaveLimit(raw)) throw Error('Save is missing or too large.');
  const saved=JSON.parse(raw,(key,value)=>{
    if(['__proto__','prototype','constructor'].includes(key)) throw Error('Invalid save field.');
    return value;
  });
  if(!saved||saved.type!==TYPE||![1,SCHEMA].includes(saved.schema)) throw Error('This is not a supported All Bridges Burning save.');
  const collection=saved.schema===1?migrate(saved):{active:saved.active,campaigns:saved.campaigns};
  if(!Array.isArray(collection.campaigns)||collection.campaigns.length>MAX_CAMPAIGNS) throw Error('Invalid campaign list.');
  for(const key of ['savedAt','exportedAt']) if(timestamp(saved[key])) collection[key]=saved[key];
  const restore=(draft,game)=>{
    const recovered=recoverDraft(draft,game);
    if(recovered!==draft) onDraftRecovery?.();
    return recovered;
  };
  const ids=new Set();
  for(const c of collection.campaigns) {
    if(typeof c?.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(c.id)||ids.has(c.id)||typeof c.name!=='string'||c.name.length<1||c.name.length>100) throw Error('Invalid campaign identity.');
    ids.add(c.id);
    validateGame(c.game);
    c.draft=restore(c.draft,c.game);
    for(const field of ['undo','redo','checkpoints']) {
      if(!Array.isArray(c[field])||c[field].length>HISTORY_LIMIT) throw Error('Invalid campaign '+field+'.');
      for(const entry of c[field]) {
        if(typeof entry?.label!=='string'||entry.label.length>220) throw Error('Invalid saved history entry.');
        validateGame(entry.game);
        entry.draft=restore(entry.draft??{},entry.game);
        validateReport(entry.last);
      }
    }
    validateReport(c.last);
  }
  if(collection.active!==null&&!ids.has(collection.active)) throw Error('Active campaign is missing.');
  return collection;
}
function validateEdit(edit) {
  if(!isPlainObject(edit)) throw Error('Invalid board edits.');
  if(edit.focus!==undefined&&edit.focus!==null&&!isSpaceOrEmpty(edit.focus)) throw Error('Invalid edited space focus.');
  if(edit.spaces!==undefined) {
    if(!isPlainObject(edit.spaces)) throw Error('Invalid edited spaces.');
    for(const [spaceId,sp] of Object.entries(edit.spaces)) {
      if(!SPACE_IDS.includes(spaceId)||!isPlainObject(sp)) throw Error('Invalid edited space entry.');
      for(const key of MARK) if(!isOptInt(sp[key],0,key.endsWith('Prep')?1:key.endsWith('Terror')?2:20)) throw Error('Invalid edited piece count.');
      if(sp.support!==undefined&&!isInt(sp.support,-2,2)) throw Error('Invalid edited Support or Opposition.');
      if(sp.person!==undefined&&typeof sp.person!=='boolean') throw Error('Invalid edited Personality flag.');
      if(sp.caps!==undefined) {
        if(!isPlainObject(sp.caps)) throw Error('Invalid edited space Capabilities.');
        for(const f of ['r','s']) if(sp.caps[f]!==undefined&&(!Array.isArray(sp.caps[f])||sp.caps[f].length>8||sp.caps[f].some(cap=>!TYPES.includes(cap)))) throw Error('Invalid edited Capability list.');
      }
    }
  }
  if(edit.tracks!==undefined) {
    if(!isPlainObject(edit.tracks)) throw Error('Invalid edited tracks.');
    for(const [key,val] of Object.entries(edit.tracks)) {
      if(!EDIT_TRACKS.includes(key)) throw Error('Invalid edited track key.');
      if(key==='coordinate'?typeof val!=='boolean':!isOptInt(val,0,30)) throw Error('Invalid edited track value.');
    }
  }
  if(edit.news!==undefined&&(!Array.isArray(edit.news)||edit.news.length>2||edit.news.some(n=>!isPlainObject(n)||![1,2].includes(n.id)||!SPACE_IDS.includes(n.space)||n.owner!==null&&n.owner!==''&&!FACTIONS.includes(n.owner)))) throw Error('Invalid edited News.');
  if(edit.sabotage!==undefined&&(!Array.isArray(edit.sabotage)||edit.sabotage.length>BORDERS.length||edit.sabotage.some(b=>!BORDERS.includes(b)))) throw Error('Invalid edited Sabotage.');
  if(edit.issues!==undefined&&(!Array.isArray(edit.issues)||edit.issues.length!==3||edit.issues.some(x=>![null,'','r','s'].includes(x)))) throw Error('Invalid edited Issues.');
  if(edit.held!==undefined) {
    if(!isPlainObject(edit.held)) throw Error('Invalid edited Capabilities box.');
    for(const f of ['r','s']) if(edit.held[f]!==undefined&&(!Array.isArray(edit.held[f])||edit.held[f].length>8||edit.held[f].some(cap=>!TYPES.includes(cap)))) throw Error('Invalid edited held Capabilities.');
  }
}
function validateRow(row) {
  if(!isPlainObject(row)) throw Error('Invalid command row.');
  if(row.id!==undefined&&row.id!=='political'&&!isSpaceOrEmpty(row.id)) throw Error('Invalid command row space.');
  if(!isSpaceOrEmpty(row.from)||!isSpaceOrEmpty(row.to)) throw Error('Invalid command row movement space.');
  if(row.retreat!==undefined&&row.retreat!==null&&!isSpaceOrEmpty(row.retreat)) throw Error('Invalid command row retreat space.');
  if(row.option!==undefined&&typeof row.option!=='string') throw Error('Invalid command row option.');
  if(row.side!==undefined&&!['r','s','m'].includes(row.side)) throw Error('Invalid command row faction.');
  if(row.direction!==undefined&&!['active','inactive','support','opposition'].includes(row.direction)) throw Error('Invalid command row direction.');
  if(row.targets!==undefined&&typeof row.targets!=='string') throw Error('Invalid Terror target selection.');
  if(row.defenders!==undefined&&!['s','g','both'].includes(row.defenders)) throw Error('Invalid Attack defender selection.');
  if(row.casualty!==undefined&&!['active','inactive'].includes(row.casualty)) throw Error('Invalid Attack casualty order.');
  if(row.attrition!==undefined&&!['active','inactive'].includes(row.attrition)) throw Error('Invalid Attack attrition order.');
  if(row.capture!==undefined&&!isSpaceOrEmpty(row.capture)) throw Error('Invalid Message capture space.');
  for(const key of ['offset','count','russian','boost','token','localCount','localRussian','activateCount']) if(!isOptInt(row[key],0,30)) throw Error('Invalid command row count.');
  for(const key of ['shift','activeFirst','person','localActiveFirst']) if(row[key]!==undefined&&typeof row[key]!=='boolean') throw Error('Invalid command row flag.');
  if(row.caps!==undefined&&(!Array.isArray(row.caps)||row.caps.length>8||row.caps.some(cap=>!TYPES.includes(cap)))) throw Error('Invalid command row Capabilities.');
  if(row.sites!==undefined&&(!Array.isArray(row.sites)||row.sites.length>SPACE_IDS.length||row.sites.some(id=>!SPACE_IDS.includes(id)))) throw Error('Invalid Activism spaces.');
  if(row.path!==undefined&&(!Array.isArray(row.path)||row.path.length>3||row.path.some(id=>!isSpaceOrEmpty(id)))) throw Error('Invalid Message path.');
}
function validateSpecial(special) {
  if(!isPlainObject(special)) throw Error('Invalid Special Activity form.');
  const allSpecials=new Set(Object.values(SPECIALS).flat());
  if(special.name!==undefined&&special.name!==''&&!allSpecials.has(special.name)) throw Error('Invalid Special Activity name.');
  if(!isOptInt(special.timing,0,SPACE_IDS.length+1)||!isOptInt(special.boost,0,30)||!isOptInt(special.token,0,2)) throw Error('Invalid Special Activity number.');
  if(special.option!==undefined&&typeof special.option!=='string') throw Error('Invalid Special Activity option.');
  if(!isSpaceOrEmpty(special.id)) throw Error('Invalid Special Activity space.');
  if(special.border!==undefined&&special.border!==''&&!BORDERS.includes(special.border)) throw Error('Invalid Special Activity border.');
  if(special.side!==undefined&&!['r','s'].includes(special.side)) throw Error('Invalid Special Activity side.');
  if(special.sites!==undefined&&(!Array.isArray(special.sites)||special.sites.length>SPACE_IDS.length||special.sites.some(id=>!SPACE_IDS.includes(id)))) throw Error('Invalid Special Activity spaces.');
  if(special.amounts!==undefined) {
    if(!isPlainObject(special.amounts)) throw Error('Invalid Publish amounts.');
    for(const [site,val] of Object.entries(special.amounts)) if(!SPACE_IDS.includes(site)||!isOptInt(val,0,10)) throw Error('Invalid Publish amount entry.');
  }
}
function validateIntent(intent,game=null) {
  if(!isPlainObject(intent)||typeof intent.type!=='string') throw Error('Invalid draft action.');
  const allowedTypes=['start','reveal','enter','advance','german','revolt','propaganda','bot','human','resolve'];
  if(!allowedTypes.includes(intent.type)) throw Error('Invalid draft action type.');
  if(game) {
    const expected=game.interrupt?'resolve':game.stage==='setup'?'start':game.stage==='turn'?(human(game,actor(game))?'human':'bot'):game.stage;
    if(intent.type!==expected) throw Error('Draft action does not match the current stage.');
    if(intent.type==='human'&&(!options(game).includes(intent.action)||intent.command!==undefined&&
      (!COMMANDS[actor(game)]?.includes(intent.command)||game.phase===1&&['March','Attack'].includes(intent.command)))) {
      throw Error('Invalid draft turn action or Command.');
    }
  }
  if(intent.action!==undefined&&!['pass','limited','full','event'].includes(intent.action)) throw Error('Invalid draft turn action.');
  const allCommands=new Set(Object.values(COMMANDS).flat());
  if(intent.command!==undefined&&!allCommands.has(intent.command)) throw Error('Invalid draft command.');
  for(const key of ['manual','guideCommand','skip','use','reduce','disc']) if(intent[key]!==undefined&&typeof intent[key]!=='boolean') throw Error('Invalid draft boolean flag.');
  if(intent.side!==undefined&&!['light','dark','r','s'].includes(intent.side)) throw Error('Invalid draft side.');
  if(intent.recordAction!==undefined&&!['pass','limited','full','event'].includes(intent.recordAction)) throw Error('Invalid draft eligibility choice.');
  if(intent.choice!==undefined&&!['skip','remove','rally'].includes(intent.choice)) throw Error('Invalid draft revolt choice.');
  if(intent.power!==undefined&&!['r','s'].includes(intent.power)) throw Error('Invalid draft power choice.');
  if(intent.direction!==undefined&&!['lower','raise','support','opposition'].includes(intent.direction)) throw Error('Invalid draft direction.');
  if(intent.beneficiary!==undefined&&intent.beneficiary!==''&&!['r','s'].includes(intent.beneficiary)) throw Error('Invalid draft beneficiary.');
  if(intent.reward!==undefined&&!['resources','cube'].includes(intent.reward)) throw Error('Invalid draft reward.');
  if(intent.cube!==undefined&&!['r','s'].includes(intent.cube)) throw Error('Invalid draft cube.');
  if(!isSpaceOrEmpty(intent.space)||!isSpaceOrEmpty(intent.destination)) throw Error('Invalid draft space selection.');
  for(const key of ['current','upcoming','card','count','issue','token','amount']) if(!isOptInt(intent[key],0,60)) throw Error('Invalid draft number.');
  if(intent.note!==undefined&&(typeof intent.note!=='string'||intent.note.length>500)) throw Error('Invalid draft note.');
  if(intent.edit!==undefined) validateEdit(intent.edit);
  if(intent.rows!==undefined) {
    const maxRows=SPACE_IDS.length+Number(intent.command==='Activism');
    if(!Array.isArray(intent.rows)||intent.rows.length<1||intent.rows.length>maxRows) throw Error('Invalid draft command rows.');
    for(const row of intent.rows) validateRow(row);
  }
  if(intent.special!==undefined) validateSpecial(intent.special);
  if(intent.recycle!==undefined) {
    if(!Array.isArray(intent.recycle)||intent.recycle.length>20) throw Error('Invalid draft recycle list.');
    for(const item of intent.recycle) {
      if(!isPlainObject(item)||!isSpaceOrEmpty(item.id)||typeof item.key!=='string'||!isOptInt(item.count,1,20)) throw Error('Invalid draft recycle entry.');
    }
  }
  if(intent.plans!==undefined) {
    if(!Array.isArray(intent.plans)||intent.plans.length>20) throw Error('Invalid draft Agitation plans.');
    for(const plan of intent.plans) {
      if(!isPlainObject(plan)||!isSpaceOrEmpty(plan.id)||!['shift','polarization','disc','cube'].includes(plan.kind)||!isOptInt(plan.steps,1,10)) throw Error('Invalid draft Agitation plan.');
      if(plan.direction!==undefined&&!['support','opposition'].includes(plan.direction)) throw Error('Invalid draft Agitation direction.');
      if(plan.side!==undefined&&!['r','s'].includes(plan.side)) throw Error('Invalid draft Agitation cube.');
    }
  }
}
export function validateDraft(draft,game=null) {
  if(!isPlainObject(draft)) throw Error('Invalid unfinished form.');
  if(draft.boardFilter!==undefined&&(typeof draft.boardFilter!=='string'||draft.boardFilter.length>100)) throw Error('Invalid board filter.');
  if(draft.boardScope!==undefined&&!['all','occupied','changed','nearby'].includes(draft.boardScope)) throw Error('Invalid board scope filter.');
  if(draft.boardNear!==undefined&&!isSpaceOrEmpty(draft.boardNear)) throw Error('Invalid nearby space filter.');
  if(draft.checkedItems!==undefined&&(!Array.isArray(draft.checkedItems)||draft.checkedItems.length>200||draft.checkedItems.some(x=>typeof x!=='string'||x.length>120))) throw Error('Invalid checklist state.');
  if(draft.boardFaction!==undefined&&!['all','r','s','m','g','u','news'].includes(draft.boardFaction)) throw Error('Invalid faction or News filter.');
  if(draft.edit!==undefined) validateEdit(draft.edit);
  if(draft.previewMode!==undefined&&!['turn','correct'].includes(draft.previewMode)) throw Error('Invalid pending preview.');
  if(draft.previewVersion!==undefined&&(typeof draft.previewVersion!=='string'||draft.previewVersion.length>40)) throw Error('Invalid pending preview version.');
  if(draft.intent!==undefined) validateIntent(draft.intent,game);
  if(draft.turnForms!==undefined) {
    if(!isPlainObject(draft.turnForms)) throw Error('Invalid saved turn forms.');
    for(const [key,form] of Object.entries(draft.turnForms)) {
      if(!['pass','limited','full','event'].includes(key)) throw Error('Invalid turn form key.');
      validateIntent(form,game);
      if(form.action!==key) throw Error('Saved form does not match its turn action.');
    }
  }
  return draft;
}
export function recoverDraft(draft,game=null) {
  try {
    validateDraft(draft,game);
    return draft;
  } catch {
    if(!isPlainObject(draft)) return {};
    const clean={};
    if(typeof draft.boardFilter==='string'&&draft.boardFilter.length<=100) clean.boardFilter=draft.boardFilter;
    if(['all','occupied','changed','nearby'].includes(draft.boardScope)) clean.boardScope=draft.boardScope;
    if(isSpaceOrEmpty(draft.boardNear)&&draft.boardNear) clean.boardNear=draft.boardNear;
    if(['all','r','s','m','g','u','news'].includes(draft.boardFaction)) clean.boardFaction=draft.boardFaction;
    if(typeof draft.note==='string'&&draft.note.length<=500) clean.note=draft.note;
    if(typeof draft.notes==='string') clean.notes=draft.notes;
    try {
      if(draft.edit!==undefined) {
        validateEdit(draft.edit);
        clean.edit=draft.edit;
      }
    } catch { /* Drop damaged board edit draft. */ }
    try {
      if(draft.intent!==undefined) {
        validateIntent(draft.intent,game);
        clean.intent=draft.intent;
      }
    } catch { /* Drop damaged turn intent draft. */ }
    if(isPlainObject(draft.turnForms)) {
      const forms={};
      for(const [key,form] of Object.entries(draft.turnForms)) {
        if(!['pass','limited','full','event'].includes(key)) continue;
        try { validateIntent(form,game); if(form.action===key) forms[key]=form; }
        catch { /* Keep the other saved action forms. */ }
      }
      if(Object.keys(forms).length) clean.turnForms=forms;
    }
    if(['turn','correct'].includes(draft.previewMode)&&((draft.previewMode==='turn'&&clean.intent)||(draft.previewMode==='correct'&&clean.edit))) {
      clean.previewMode=draft.previewMode;
      if(typeof draft.previewVersion==='string'&&draft.previewVersion.length<=40) clean.previewVersion=draft.previewVersion;
    }
    return clean;
  }
}
function validateReport(report) {
  if(report==null) return;
  if(!report||typeof report.title!=='string'||!Array.isArray(report.log)||report.log.some(line=>typeof line!=='string')||!report.diff||!Array.isArray(report.diff.spaces)||!Array.isArray(report.diff.tracks)) throw Error('Invalid tabletop checklist.');
  const row=x=>Array.isArray(x)&&x.length===3&&x.every(y=>typeof y==='string');
  if(report.diff.tracks.some(x=>!row(x))||report.diff.spaces.some(x=>!x||typeof x.id!=='string'||!Array.isArray(x.rows)||x.rows.some(y=>!row(y))||x.position!==undefined&&(!Array.isArray(x.position)||x.position.some(y=>!row(y)))||!Array.isArray(x.control)||x.control.length!==2||x.control.some(y=>typeof y!=='string'))) throw Error('Invalid board comparison.');
}
function migrate(save) {
  if(!save.game) throw Error('The version 1 save is missing its game.');
  const campaign=newCampaign(String(save.name||'Imported campaign').slice(0,100),save.game);
  campaign.draft=save.draft??{};
  return {active:campaign.id,campaigns:[campaign]};
}
export function importCopies(collection,incoming) {
  checkCampaignRoom(collection,incoming.campaigns.length);
  const copies=incoming.campaigns.map(entry=>{
    const copy=clone(entry);
    copy.id=id();
    copy.draft=recoverDraft(copy.draft,copy.game);
    return copy;
  });
  const index=incoming.campaigns.findIndex(c=>c.id===incoming.active);
  return {...collection,active:copies[index]?.id??copies[0]?.id??collection.active,campaigns:[...collection.campaigns,...copies]};
}
export function campaignSizes(collection) {
  return collection.campaigns.map(c=>[c.name,utf8Bytes(JSON.stringify(c))]).sort((a,b)=>b[1]-a[1]);
}
const isQuota=error=>['QuotaExceededError','NS_ERROR_DOM_QUOTA_REACHED'].includes(error?.name);
export function createStore(getStorage,locks) {
  let expected=null,rejected=null,queue=Promise.resolve();
  function readBackup(storage) {
    const raw=storage.getItem(BACKUP_KEY);
    try {return raw===null?null:decode(raw);}
    catch {return null;}
  }
  function open() {
    expected=null;
    rejected=null;
    try {
      const storage=getStorage();
      expected=storage.getItem(STORAGE_KEY);
      const backup=readBackup(storage);
      try {
        let recoveredDraft=false;
        const collection=expected===null?emptyCollection():decode(expected,{onDraftRecovery:()=>{recoveredDraft=true;}});
        return {collection,status:expected===null?'ready':'saved',backup:Boolean(backup),...(recoveredDraft?{recoveredDraft}: {})};
      } catch {
        rejected=expected;
        return {collection:emptyCollection(),status:'recovery',backup:Boolean(backup)};
      }
    } catch {
      return {collection:emptyCollection(),status:'unavailable',backup:false};
    }
  }
  function serialize(fn) {
    const work=queue.then(async()=>{
      if(!locks?.request) return fn();
      let entered=false;
      try {return await locks.request(STORAGE_KEY,()=>{entered=true;return fn();});}
      catch(error) {
        if(!entered&&['SecurityError','NotSupportedError'].includes(error.name)) return fn();
        throw error;
      }
    });
    queue=work.catch(()=>{});
    return work;
  }
  function backupStatus(storage) {
    try {return Boolean(readBackup(storage));}
    catch {return false;}
  }
  async function save(collection,{recover=false}={}) {
    try {
      const raw=encode(collection);
      return await serialize(()=>{
        const storage=getStorage();
        if(storage.getItem(STORAGE_KEY)!==expected) return {status:'conflict',backup:backupStatus(storage)};
        if(rejected&&!recover) return {status:'recovery',backup:backupStatus(storage)};
        if(raw===expected) return {status:'saved',backup:backupStatus(storage)};
        if(exceedsSaveLimit(raw)) return {status:'full',backup:backupStatus(storage)};
        if(rejected) storage.setItem(REJECTED_KEY,rejected);
        const oldBackup=storage.getItem(BACKUP_KEY);
        try {
          if(expected!==null&&!rejected) storage.setItem(BACKUP_KEY,expected);
          storage.setItem(STORAGE_KEY,raw);
        } catch(error) {
          if(!isQuota(error)||expected===null||rejected) throw error;
          if(storage.getItem(STORAGE_KEY)!==expected) return {status:'conflict',backup:backupStatus(storage)};
          storage.removeItem(BACKUP_KEY);
          try {storage.setItem(STORAGE_KEY,raw);}
          catch(retryError) {
            if(oldBackup!==null&&storage.getItem(STORAGE_KEY)===expected) {
              try {storage.setItem(BACKUP_KEY,oldBackup);} catch { /* Current save remains available. */ }
            }
            return {status:isQuota(retryError)?'full':'unavailable',backup:backupStatus(storage)};
          }
        }
        expected=raw;
        rejected=null;
        return {status:'saved',backup:backupStatus(storage)};
      });
    } catch(error) {return {status:isQuota(error)?'full':'unavailable',backup:backupAvailable()};}
  }
  function backupAvailable() {
    try {return backupStatus(getStorage());} catch {return false;}
  }
  return {
    open,save,backupAvailable,
    readBackup:()=>readBackup(getStorage()),
    hasArchived:()=>{try {return getStorage().getItem(REJECTED_KEY)!==null;}catch {return false;}},
    rawRecovery:()=>rejected??getStorage().getItem(REJECTED_KEY),
    remoteChanged:()=>getStorage().getItem(STORAGE_KEY)!==expected
  };
}
