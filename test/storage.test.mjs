import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {preview} from '../src/engine.js';
import {BACKUP_KEY, MAX_CAMPAIGNS, REJECTED_KEY, STORAGE_KEY, addCampaign, checkpointCampaign, commitCampaign, createStore, decode, duplicateCampaign, encode, encodeCampaign, importCopies, newCampaign, stepHistory} from '../src/storage.js';
import {MemoryStorage, begin} from './fixtures.mjs';

function collection(game=begin(),name='Test campaign') {
  const c=newCampaign(name,game);
  return {active:c.id,campaigns:[c]};
}
function saveStep(c,intent) {
  const {after,...report}=preview(c.game,intent);
  commitCampaign(c,after,report.title,report);
}

test('save, reopen, named Undo and Redo reproduce the exact chosen bot plan and RNG',()=>{
  const data=collection(), c=data.campaigns[0];
  saveStep(c,{type:'human',action:'pass'});
  const beforeBot=c.game;
  saveStep(c,{type:'bot'});
  const afterBot=c.game, title=c.last.title;
  const copy=decode(encode(data)).campaigns[0];
  assert.deepEqual(copy.game,afterBot);
  assert.equal(stepHistory(copy,'undo'),title);
  assert.deepEqual(copy.game,beforeBot);
  assert.equal(stepHistory(copy,'redo'),title);
  assert.deepEqual(copy.game,afterBot);
});
test('version 1 single campaign migrates a pending event, draft, and RNG to version 2',async()=>{
  const raw=await readFile(new URL('../saves/03-schema1-pending-event.json',import.meta.url),'utf8');
  const old=JSON.parse(raw), upgraded=decode(raw);
  assert.deepEqual(upgraded.campaigns[0].game,old.game);
  assert.equal(upgraded.campaigns[0].game.interrupt.scope,'event');
  assert.deepEqual(upgraded.campaigns[0].draft,old.draft);
  assert.deepEqual(decode(encode(upgraded)),upgraded);
});
test('export/import while a choice is pending creates new identities and preserves the form',()=>{
  const data=collection();
  const c=data.campaigns[0];
  c.draft={intent:{type:'human',action:'limited',command:'Rally',rows:[{id:'tam',option:'cells',offset:1}]}};
  checkpointCampaign(c,'After Propaganda 1');
  const combined=importCopies(data,decode(encodeCampaign(c)));
  assert.equal(combined.campaigns.length,2);
  assert.notEqual(combined.active,c.id);
  assert.deepEqual(combined.campaigns[1].draft,c.draft);
  assert.deepEqual(combined.campaigns[1].checkpoints,c.checkpoints);
});
test('corrupt or out-of-range saves fail before an import changes the working collection',()=>{
  assert.throws(()=>decode('{'));
  assert.throws(()=>decode(JSON.stringify({schema:2,type:'wrong'})));
  const data=collection();
  data.campaigns[0].game.board.hel.rI=21;
  assert.throws(()=>decode(encode(data)),/Inactive Reds/);
});
test('quota exhaustion first retries without backup when the main record can fit',async()=>{
  const memory=new MemoryStorage(), store=createStore(()=>memory), data=collection();
  store.open();
  assert.deepEqual(await store.save(data),{status:'saved',backup:false});
  const c=data.campaigns[0];
  saveStep(c,{type:'human',action:'pass'});
  memory.quota=encode(data).length+8;
  assert.deepEqual(await store.save(data),{status:'saved',backup:false});
  assert.equal(decode(memory.getItem(STORAGE_KEY)).campaigns[0].game.tracks.r,6);
  assert.equal(memory.getItem(BACKUP_KEY),null);
});
test('quota exhaustion preserves main and in-memory progress when the new main cannot fit',async()=>{
  const memory=new MemoryStorage(), store=createStore(()=>memory), data=collection();
  store.open();
  await store.save(data);
  const old=memory.getItem(STORAGE_KEY);
  memory.quota=old.length+5;
  saveStep(data.campaigns[0],{type:'human',action:'pass'});
  assert.equal((await store.save(data)).status,'full');
  assert.equal(memory.getItem(STORAGE_KEY),old);
  assert.equal(decode(encode(data)).campaigns[0].game.tracks.r,6);
});
test('blocked writes report unavailable and can be retried without discarding the draft',async()=>{
  const memory=new MemoryStorage(), store=createStore(()=>memory), data=collection();
  store.open();
  memory.fail=true;
  assert.equal((await store.save(data)).status,'unavailable');
  memory.fail=false;
  assert.equal((await store.save(data)).status,'saved');
});
test('corrupt local main remains intact until recovery explicitly archives the original',async()=>{
  const memory=new MemoryStorage(), data=collection();
  memory.setItem(STORAGE_KEY,'bad primary');
  memory.setItem(BACKUP_KEY,encode(data));
  const store=createStore(()=>memory);
  assert.deepEqual(store.open(),{collection:{active:null,campaigns:[]},status:'recovery',backup:true});
  assert.equal(store.rawRecovery(),'bad primary');
  assert.equal((await store.save(data)).status,'recovery');
  assert.equal(memory.getItem(STORAGE_KEY),'bad primary');
  assert.equal((await store.save(store.readBackup(),{recover:true})).status,'saved');
  assert.equal(memory.getItem(REJECTED_KEY),'bad primary');
  assert.deepEqual(decode(memory.getItem(STORAGE_KEY)),data);
});
test('corrupt backup has no effect on a valid current save',async()=>{
  const memory=new MemoryStorage(), data=collection();
  memory.setItem(STORAGE_KEY,encode(data));
  memory.setItem(BACKUP_KEY,'broken');
  const store=createStore(()=>memory);
  const restored=store.open();
  assert.equal(restored.status,'saved');
  assert.equal(restored.backup,false);
  assert.deepEqual(restored.collection,data);
});
test('a stale second tab cannot overwrite a newer save; its export remains recoverable',async()=>{
  const memory=new MemoryStorage();
  const store1=createStore(()=>memory), store2=createStore(()=>memory);
  const original=collection();
  store1.open();
  await store1.save(original);
  const older=store2.open().collection;
  saveStep(original.campaigns[0],{type:'human',action:'pass'});
  await store1.save(original);
  older.campaigns[0].draft.note='local unsaved text';
  assert.equal(store2.remoteChanged(),true);
  assert.equal((await store2.save(older)).status,'conflict');
  assert.equal(decode(memory.getItem(STORAGE_KEY)).campaigns[0].game.tracks.r,6);
  assert.equal(decode(encode(older)).campaigns[0].draft.note,'local unsaved text');
});
test('queued writes through Web Locks serialize and leave the most recent draft on disk',async()=>{
  const memory=new MemoryStorage();
  const requested=[];
  const locks={request:async(key,work)=>{requested.push(key);return work();}};
  const store=createStore(()=>memory,locks), data=collection();
  store.open();
  const first=store.save(data);
  data.campaigns[0].draft.note='latest';
  const second=store.save(data);
  assert.deepEqual((await Promise.all([first,second])).map(x=>x.status),['saved','saved']);
  assert.equal(requested.length,2);
  assert.equal(decode(memory.getItem(STORAGE_KEY)).campaigns[0].draft.note,'latest');
});

test('failed retry under quota restores a previous backup when it still fits',async()=>{
  const memory=new MemoryStorage(), store=createStore(()=>memory), data=collection();
  store.open();
  await store.save(data);
  const c=data.campaigns[0];
  saveStep(c,{type:'human',action:'pass'});
  await store.save(data);
  const primary=memory.getItem(STORAGE_KEY), backup=memory.getItem(BACKUP_KEY);
  memory.quota=primary.length+backup.length;
  c.draft.notes='x'.repeat(memory.quota);
  const result=await store.save(data);
  assert.deepEqual(result,{status:'full',backup:true});
  assert.equal(memory.getItem(STORAGE_KEY),primary);
  assert.equal(memory.getItem(BACKUP_KEY),backup);
});

test('draft recovery keeps valid cached actions and corrections and leaves saved bytes available',()=>{
  const memory=new MemoryStorage(), data=collection(), campaign=data.campaigns[0];
  const rally={type:'human',action:'limited',command:'Rally',rows:[{id:'tam',option:'cells'}]};
  campaign.draft={intent:{...rally,rows:null},turnForms:{full:{...rally,action:'full'},limited:null},
    edit:{focus:'hel',spaces:{hel:{rI:2}}},previewMode:'turn'};
  const raw=encode(data);
  memory.setItem(STORAGE_KEY,raw);
  const opened=createStore(()=>memory).open();
  assert.equal(opened.recoveredDraft,true);
  assert.deepEqual(opened.collection.campaigns[0].game,campaign.game);
  assert.deepEqual(opened.collection.campaigns[0].draft,{
    turnForms:{full:{...rally,action:'full'}},edit:campaign.draft.edit
  });
  assert.equal(memory.getItem(STORAGE_KEY),raw);
});

test('create, duplicate and import honor the campaign limit without changing the workspace',()=>{
  const game=begin();
  const campaigns=Array.from({length:MAX_CAMPAIGNS},(_,i)=>newCampaign('Campaign '+i,game));
  const data={active:campaigns[0].id,campaigns};
  const incoming=collection(game);
  assert.throws(()=>addCampaign(data,incoming.campaigns[0]),/250 campaigns/);
  assert.throws(()=>duplicateCampaign(data,data.active),/250 campaigns/);
  assert.throws(()=>importCopies(data,incoming),/250 campaigns/);
  assert.equal(data.campaigns.length,MAX_CAMPAIGNS);
  assert.equal(data.active,campaigns[0].id);
  assert.equal(decode(encode(data)).campaigns.length,MAX_CAMPAIGNS);
});
