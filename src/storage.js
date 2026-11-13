import {VERSION} from './data.js';
import {clone, validateGame} from './model.js';

export const SCHEMA=2;
export const STORAGE_KEY='abb-companion.campaigns';
export const BACKUP_KEY=STORAGE_KEY+'.backup';
export const REJECTED_KEY=STORAGE_KEY+'.rejected';
const HISTORY_LIMIT=30;
const TYPE='all-bridges-burning';
const id=()=>globalThis.crypto?.randomUUID?.()??('abb-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));

export const emptyCollection=()=>({active:null,campaigns:[]});
export const newCampaign=(name,game)=>({id:id(),name,game,draft:{},undo:[],redo:[],checkpoints:[],last:null});
export const activeCampaign=collection=>collection.campaigns.find(c=>c.id===collection.active)??null;
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
  entry.draft=previous.draft??{};
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
export function encodeCampaign(entry) {return encode({active:entry.id,campaigns:[entry]});}
export function decode(raw) {
  if(typeof raw!=='string'||raw.length>16_000_000) throw Error('Save is missing or too large.');
  const saved=JSON.parse(raw,(key,value)=>{
    if(['__proto__','prototype','constructor'].includes(key)) throw Error('Invalid save field.');
    return value;
  });
  if(!saved||saved.type!==TYPE||![1,SCHEMA].includes(saved.schema)) throw Error('This is not a supported All Bridges Burning save.');
  const collection=saved.schema===1?migrate(saved):{active:saved.active,campaigns:saved.campaigns};
  if(!Array.isArray(collection.campaigns)||collection.campaigns.length>250) throw Error('Invalid campaign list.');
  const ids=new Set();
  for(const c of collection.campaigns) {
    if(typeof c?.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(c.id)||ids.has(c.id)||typeof c.name!=='string'||c.name.length<1||c.name.length>100) throw Error('Invalid campaign identity.');
    ids.add(c.id);
    validateGame(c.game);
    validateDraft(c.draft);
    for(const field of ['undo','redo','checkpoints']) {
      if(!Array.isArray(c[field])||c[field].length>HISTORY_LIMIT) throw Error('Invalid campaign '+field+'.');
      for(const entry of c[field]) {
        if(typeof entry?.label!=='string'||entry.label.length>220) throw Error('Invalid saved history entry.');
        validateGame(entry.game);
        validateDraft(entry.draft??{});
        validateReport(entry.last);
      }
    }
    validateReport(c.last);
  }
  if(collection.active!==null&&!ids.has(collection.active)) throw Error('Active campaign is missing.');
  return collection;
}
function validateDraft(draft) {
  if(!draft||typeof draft!=='object'||Array.isArray(draft)) throw Error('Invalid unfinished form.');
  if(draft.boardFilter!==undefined&&(typeof draft.boardFilter!=='string'||draft.boardFilter.length>100)) throw Error('Invalid board filter.');
  if(draft.edit!==undefined&&(!draft.edit||typeof draft.edit!=='object'||Array.isArray(draft.edit))) throw Error('Invalid board edits.');
  if(draft.previewMode!==undefined&&!['turn','correct'].includes(draft.previewMode)) throw Error('Invalid pending preview.');
  if(draft.previewVersion!==undefined&&(typeof draft.previewVersion!=='string'||draft.previewVersion.length>40)) throw Error('Invalid pending preview version.');
  if(draft.intent!==undefined&&(!draft.intent||typeof draft.intent!=='object'||Array.isArray(draft.intent)||typeof draft.intent.type!=='string')) throw Error('Invalid draft action.');
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
  const copies=incoming.campaigns.map(entry=>({...clone(entry),id:id()}));
  const index=incoming.campaigns.findIndex(c=>c.id===incoming.active);
  return {active:copies[index]?.id??copies[0]?.id??collection.active,campaigns:[...collection.campaigns,...copies]};
}
export function campaignSizes(collection) {
  return collection.campaigns.map(c=>[c.name,new TextEncoder().encode(JSON.stringify(c)).length]).sort((a,b)=>b[1]-a[1]);
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
        const collection=expected===null?emptyCollection():decode(expected);
        return {collection,status:expected===null?'ready':'saved',backup:Boolean(backup)};
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
    const raw=encode(collection);
    try {
      return await serialize(()=>{
        const storage=getStorage();
        if(storage.getItem(STORAGE_KEY)!==expected) return {status:'conflict',backup:backupStatus(storage)};
        if(rejected&&!recover) return {status:'recovery',backup:backupStatus(storage)};
        if(raw===expected) return {status:'saved',backup:backupStatus(storage)};
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
