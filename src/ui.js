import {FACTIONS, NAME, NEAR, SPACES, SPACE_IDS, VERSION, spaceName} from './data.js';
import {boardDiff, cells, clone, newGame, newsAt} from './model.js';
import {actor} from './sequence.js';
import {preview} from './engine.js';
import {STORAGE_KEY, activeCampaign, addCampaign, campaignSizes, checkpointCampaign, commitCampaign, createStore, decode, duplicateCampaign, encode, encodeCampaign, importCopies, newCampaign, recoverDraft, renameCampaign, stepHistory, validateDraft} from './storage.js';
import {availableTable, boardCards, checklistKeys, editSpace, editorHtml, reportHtml, scoreStrip, spaceOccupied} from './ui-board.js';
import {actionSummary, agitationSummaryHtml, resourceRow, sequenceHtml, turnBody, turnStatus} from './ui-turn.js';
import {btn, check, checks, commandSummaryHtml, ensure, escape, group, lineInput, makeRow, numeric, resetSpecial, rowHelperText, select, spaceOptions} from './ui-fields.js';

const root=document.getElementById('app');
const store=createStore(()=>window.localStorage,globalThis.navigator.locks);
const boot=store.open();
let collection=boot.collection;
let status=boot.status, backup=boot.backup, screen=collection.active?'turn':'campaigns', activePreview=null;
const recoveredMessage='Recovered saved campaign. Damaged form fields were cleared.';
let pendingWrite=null, changeSerial=0, writtenSerial=0, message=boot.recoveredDraft?recoveredMessage:'', faulty='', switchFocus=null, importInput=null;
let draftNew={name:'',humans:['r'],mode:'physical',seed:randomSeed(),checkpoint:true};
let renameState={id:null,name:''}, exportedAt=collection.exportedAt;
let showNew=!collection.active, confirm=null, remote=false;
const entry=()=>activeCampaign(collection);
const game=()=>entry()?.game;
const focus=selector=>{switchFocus=selector;};
const formatStamp=value=>new Date(value).toLocaleString();
const foldName=value=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
function randomSeed() {
  return globalThis.crypto?.getRandomValues?.(new Uint32Array(1))[0]??Math.floor(Math.random()*0x100000000);
}
function statusLabel() {
  if(status==='recovery') return 'Recovery needed';
  if(status==='conflict') return 'Other tab has newer data';
  if(status==='full') return 'Storage full · unsaved';
  if(status==='unavailable') return entry()?'Storage unavailable · export to save':'Storage unavailable';
  if(changeSerial!==writtenSerial) return 'Saving…';
  return status==='saved'?'Saved on this device':'Ready for offline play';
}
function paintStatus() {
  const badge=document.getElementById('save-status');
  if(badge) {
    badge.textContent=statusLabel();
    badge.dataset.status=status;
  }
  const banner=document.getElementById('storage-alert');
  if(banner) banner.innerHTML=storageAlert();
}
function storageAlert() {
  if(status==='recovery') return '<div class="notice warn" role="alert">The local save could not be read. Use Campaigns to export the original bytes or restore the previous save.</div>';
  if(status==='full') return '<div class="notice warn" role="alert">Storage is full. Your current changes are in memory. Export a copy or open Campaigns to see which saves are largest.</div>';
  if(status==='conflict') return '<div class="notice warn" role="alert">'+(remote?'This tab detected a newer saved version. ':'')+'Export your changes before loading the saved version in Campaigns.</div>';
  if(status==='unavailable'&&entry()) return '<div class="notice warn" role="alert">Local storage is unavailable in this browser view. Export your campaign before closing this tab.</div>';
  return '';
}
function changed() {
  changeSerial++;
  clearTimeout(pendingWrite);
  pendingWrite=setTimeout(()=>{void saveNow();},180);
  paintStatus();
}
async function saveNow(opts={}) {
  clearTimeout(pendingWrite);
  const serial=changeSerial;
  const target=collection;
  const stamp=serial!==writtenSerial?new Date().toISOString():target.savedAt;
  const snapshot={...target,savedAt:stamp,exportedAt};
  const result=await store.save(snapshot,opts);
  if(target!==collection) return result;
  if(result.status==='saved') {
    if(stamp&&serial>=writtenSerial) collection.savedAt=stamp;
    if(snapshot.exportedAt&&serial>=writtenSerial) collection.exportedAt=snapshot.exportedAt;
    writtenSerial=Math.max(writtenSerial,serial);
  }
  status=result.status;
  backup=result.backup;
  paintStatus();
  if(screen==='campaigns') paintBackup();
  return result;
}
function detailKey(el) {
  return el.dataset.detailKey||el.id||(el.querySelector('summary')?.textContent?.trim().slice(0,120)??'');
}
function captureDomState() {
  const openMap=new Map();
  for(const el of root.querySelectorAll('details')) {
    const key=detailKey(el);
    if(key) openMap.set(key,el.open);
  }
  let activeSelector=null, selection=null;
  const active=document.activeElement;
  if(active&&root.contains(active)&&active!==root) {
    if(active.dataset?.bind) activeSelector='[data-bind="'+CSS.escape(active.dataset.bind)+'"]';
    else if(active.dataset?.list&&active.value!==undefined) activeSelector='[data-list="'+CSS.escape(active.dataset.list)+'"][value="'+CSS.escape(active.value)+'"]';
    else if(active.dataset?.checkItem) activeSelector='[data-check-item="'+CSS.escape(active.dataset.checkItem)+'"]';
    else if(active.dataset?.action) activeSelector='[data-action="'+CSS.escape(active.dataset.action)+'"]'+(active.dataset.value?'[data-value="'+CSS.escape(active.dataset.value)+'"]':'');
    else if(active.id) activeSelector='#'+CSS.escape(active.id);
    if(typeof active.selectionStart==='number'&&typeof active.selectionEnd==='number'&&active.type==='text') {
      selection=[active.selectionStart,active.selectionEnd];
    }
  }
  return {openMap,activeSelector,selection};
}
function restoreDomState({openMap,activeSelector,selection},sameScreen) {
  if(sameScreen&&openMap.size) {
    for(const el of root.querySelectorAll('details')) {
      const key=detailKey(el);
      if(key&&openMap.has(key)) el.open=openMap.get(key);
    }
  }
  const targetSelector=switchFocus??(sameScreen?activeSelector:null);
  switchFocus=null;
  if(targetSelector) {
    const target=root.querySelector(targetSelector);
    if(target) {
      target.focus({preventScroll:true});
      if(selection&&typeof target.setSelectionRange==='function'&&target.type==='text') {
        try {target.setSelectionRange(selection[0],selection[1]);} catch { /* Non-text input. */ }
      }
    }
  }
}
function safeRenderSection(c) {
  if(screen==='campaigns'||!c) return campaignHtml();
  if(screen==='guide') return guideHtml();
  const render=()=>screen==='board'?boardHtml(c.game):screen==='correct'?correctHtml(c.game,c.draft):turnHtml(c);
  try {
    validateDraft(c.draft,c.game);
  } catch {
    c.draft=recoverDraft(c.draft,c.game);
    activePreview=null;
    message=recoveredMessage;
    changed();
  }
  try { return render(); }
  catch {
    screen='campaigns';
    activePreview=null;
    faulty='This view could not open. You can export the campaign from here.';
    return campaignHtml();
  }
}
let resetReceiptOpen=false;
function refresh(next=null) {
  const sameScreen=next===null||next===screen;
  const domState=captureDomState();
  if(resetReceiptOpen) {
    for(const key of domState.openMap.keys()) {
      if(key==='tabletop-checklist'||key.startsWith('receipt-')) domState.openMap.delete(key);
    }
    resetReceiptOpen=false;
  }
  if(next) screen=next;
  const c=entry();
  const section=safeRenderSection(c);
  root.innerHTML='<header class="mast"><div class="top-line"><a href="#turn" data-action="screen" data-value="turn" class="wordmark"><span>ALL BRIDGES</span><span>BURNING</span></a>'+
    '<div class="header-meta"><span class="edition">Tabletop companion</span><span id="save-status" data-status="'+escape(status)+'" role="status">'+escape(statusLabel())+'</span></div></div>'+
    '<nav aria-label="Companion tabs">'+[['turn','Turn'],['board','Board'],['campaigns','Campaigns'],['guide','Guide']].map(([id,label])=>
      '<button type="button" data-action="screen" data-value="'+id+'"'+(screen===id||id==='board'&&screen==='correct'?' aria-current="page"':'')+(id==='board'&&!c?' disabled':'')+'>'+label+'</button>').join('')+'</nav></header>'+
    '<main id="main"'+(screen==='turn'&&c?.last?' class="print-receipt"':'')+'><div id="storage-alert">'+storageAlert()+'</div>'+
    (message?'<div class="notice" role="status">'+escape(message)+'</div>':'')+
    (faulty?'<div class="notice error" id="error-note" tabindex="-1" role="alert">'+escape(faulty)+'</div>':'')+
    section+'</main><footer><span>All Bridges Burning · COIN Volume X</span><span>v'+VERSION+' · English</span></footer>'+
    '<input type="file" id="import-file" accept=".json,application/json" hidden>';
  importInput=document.getElementById('import-file');
  restoreDomState(domState,sameScreen);
}
function turnHtml(c) {
  const g=c.game;
  const trail=g.changedSpaces??[];
  const last=c.last;
  return '<div class="turn-layout"><section class="turn-main"><div class="card context"><p class="eyebrow">'+escape(actionSummary(g))+'</p>'+sequenceHtml(g)+resourceRow(g)+'</div>'+
    '<section class="card action-card" id="action-card"><div class="section-title"><h1>'+escape(turnStatus(g))+'</h1></div>'+
    (activePreview?.screen==='turn'?previewHtml(activePreview.plan):turnBody(g,c.draft))+'</section>'+
    (last?'<details class="card receipt" id="tabletop-checklist" data-detail-key="tabletop-checklist" '+(last.diff.spaces.length||last.diff.tracks.length?'open':'')+'><summary>Tabletop checklist · '+escape(last.title)+'</summary>'+
      (last.diff.spaces.length||last.diff.tracks.length?'<p class="quiet">Match these counts and markers on the physical board before continuing.</p>':'')+reportHtml(last,{applied:true,checkedItems:c.draft.checkedItems??[]})+'</details>':'')+
    '</section><aside class="turn-side"><div class="card compact"><h2>Board tracks</h2>'+scoreStrip(g)+'</div>'+
    '<div class="card compact"><h2>History</h2><div class="button-stack">'+
    btn('undo',c.undo.length?'Undo · '+c.undo.at(-1).label:'Undo',{kind:'subtle',disabled:!c.undo.length})+
    btn('redo',c.redo.length?'Redo · '+c.redo.at(-1).label:'Redo',{kind:'subtle',disabled:!c.redo.length})+'</div>'+
    (trail.length?'<h3>Spaces changed this card</h3><div class="space-tabs">'+trail.map(id=>btn('quick-correct',spaceName(id),{value:id,kind:'subtle small'})).join('')+'</div>':'')+'</div></aside></div>';
}
function previewHtml(plan) {
  return '<section class="preview" id="preview-panel" tabindex="-1" aria-label="Action preview"><div class="preview-title"><div><p class="eyebrow">Preview</p><h2>'+escape(plan.title)+'</h2></div></div>'+
    reportHtml(plan)+
    (game()&&JSON.stringify(game().actions)!==JSON.stringify(plan.after.actions)?'<p class="quiet eligibility-note">Eligibility · '+escape(plan.after.actions.length?plan.after.actions.map(step=>NAME[step.f]+' '+(step.action==='full'?'Command':step.action==='limited'?'Limited Command':step.action==='event'?'Event':'Pass')).join(' · '):'reset for the next card')+'</p>':'')+
    (plan.after.interrupt?'<p class="pending-note">Next decision · '+escape(plan.after.interrupt.title)+'</p>':'')+
    '<div class="controls">'+btn('apply','Apply',{kind:'primary'})+btn('dismiss-preview','Back to choices',{kind:'subtle'})+'</div></section>';
}
function boardHtml(g) {
  const c=entry(), draft=c.draft;
  const filter=draft.boardFilter??'';
  const scope=draft.boardScope??'all';
  const changedIds=[...new Set((c.last?.diff.spaces??[]).map(x=>x.id).filter(id=>Object.hasOwn(SPACES,id)))];
  const nearOrigin=draft.boardNear||(changedIds[0]??'hel');
  const faction=draft.boardFaction??'all';
  const needle=foldName(filter.trim());
  const matches=SPACE_IDS.filter(id=>{
    if(needle&&!foldName(spaceName(id)).includes(needle)) return false;
    const b=g.board[id];
    if(faction==='news'&&!newsAt(g,id).length) return false;
    if(['g','u'].includes(faction)&&!b[faction]) return false;
    if(FACTIONS.includes(faction)&&!(cells(b,faction)||(faction==='r'?b.admin:faction==='m'?b.network:0))) return false;
    if(scope==='occupied') return spaceOccupied(g,id);
    if(scope==='changed') return changedIds.includes(id);
    if(scope==='nearby') return id===nearOrigin||NEAR[nearOrigin]?.includes(id);
    return true;
  });
  const scopes=[['all','All ('+SPACE_IDS.length+')'],['occupied','Occupied ('+SPACE_IDS.filter(id=>spaceOccupied(g,id)).length+')'],
    ['changed','Last step ('+changedIds.length+')'],['nearby','Nearby']];
  const scopeButtons='<div class="space-tabs" role="group" aria-label="Board space filters">'+scopes.map(([key,label])=>
    btn('board-scope',label,{value:key,kind:scope===key?'selected small':'subtle small',pressed:scope===key})).join('')+'</div>';
  const filters=group(select('Pieces to show','boardFaction',faction,[['all','All spaces'],...['r','s','m','g','u'].map(f=>[f,NAME[f]]),['news','News']],{refresh:true})+
    (scope==='nearby'?select('Spaces adjacent to','boardNear',nearOrigin,spaceOptions(),{refresh:true}):''));
  return '<section class="card"><div class="line"><div><p class="eyebrow">'+escape(actionSummary(g))+'</p><h1>Board</h1></div>'+btn('quick-correct','Correct board',{kind:'subtle'})+'</div>'+
    scoreStrip(g)+resourceRow(g)+'<details class="inline" data-detail-key="board-available"><summary>Available Forces</summary>'+availableTable(g)+'</details></section>'+
    '<section class="card"><div class="line"><h2>Spaces</h2>'+lineInput('Find space','boardFilter',filter,{placeholder:'Name a space'})+'</div>'+
    scopeButtons+filters+
    (matches.length?boardCards(g,matches,{changedIds,nearOrigin:scope==='nearby'?nearOrigin:null}):'<p class="quiet">No matching space.</p>')+'</section>';
}
function correctHtml(g,draft) {
  const edit=ensure(draft,'edit',{});
  return '<section class="card"><div class="line"><h1>Correct board</h1>'+btn('screen','Back to Board',{value:'board',kind:'subtle'})+'</div>'+
    (activePreview?.screen==='correct'?previewHtml(activePreview.plan):editorHtml(g,edit,'edit')+
    '<div class="controls">'+btn('preview-correction','Preview correction',{kind:'primary'})+btn('clear-correction','Clear correction draft',{kind:'subtle'})+'</div>')+'</section>';
}
function campaignHtml() {
  const c=entry();
  const controls='<div class="controls">'+btn('new','New campaign',{kind:'primary'})+btn('import','Import save',{kind:'subtle'})+
    btn('export-all','Export all',{kind:'subtle',disabled:collection.campaigns.length===0})+'</div>';
  const list=collection.campaigns.map(item=>{
    const isRenaming=renameState.id===item.id;
    return '<div class="campaign-row"><div><strong>'+escape(item.name)+'</strong><p class="quiet">'+
      escape(item.game.humans.map(f=>NAME[f]).join(' + '))+' · '+escape(actionSummary(item.game))+'</p>'+
      (isRenaming?'<div class="rename-box">'+lineInput('Campaign name','rename.name',renameState.name,{max:100})+
        '<div class="controls">'+btn('save-rename','Save name',{value:item.id,kind:'primary small'})+btn('cancel-rename','Cancel',{kind:'subtle small'})+'</div></div>':'')+
      '</div><div class="controls">'+btn('open-campaign',item.id===c?.id?'Resume':'Open',{value:item.id,kind:'subtle small'})+
      btn('start-rename','Rename',{value:item.id,kind:'subtle small'})+
      btn('duplicate-campaign','Duplicate',{value:item.id,kind:'subtle small'})+
      btn('export-one','Export',{value:item.id,kind:'subtle small'})+
      btn('ask-delete','Delete',{value:item.id,kind:'subtle small'})+'</div></div>';
  }).join('');
  const form=showNew?'<section class="card" id="new-campaign"><p class="eyebrow">Full campaign · Living Rules</p><h2>New campaign</h2>'+
    '<p>Choose one human faction for solitaire, or two humans and one bot. Use the physical Event deck or let the app reveal the card IDs.</p>'+
    group(lineInput('Campaign name','new.name',draftNew.name,{placeholder:'Finnish Civil War'})+
      select('Event deck','new.mode',draftNew.mode,[['physical','Physical deck · enter card IDs'],['digital','App deck · seeded draw']])+
      numeric('Random seed','new.seed',draftNew.seed,{max:4294967295}))+checks('Human factions · choose one or two','new.humans',draftNew.humans,FACTIONS.map(f=>[f,NAME[f]]))+
    check('Keep a checkpoint after each Propaganda Round','new.checkpoint',draftNew.checkpoint)+
    '<div class="controls">'+btn('create','Create campaign',{kind:'primary'})+btn('randomize','New seed',{kind:'subtle'})+'</div></section>':'';
  const checkpoint=c?.checkpoints.length?'<details class="inline" data-detail-key="campaign-checkpoints"><summary>Campaign checkpoints · '+c.checkpoints.length+'</summary>'+
    c.checkpoints.map((cp,i)=>'<div class="line checkpoint"><span>'+escape(cp.label)+'</span>'+btn('restore-checkpoint','Restore as new history step',{value:i,kind:'subtle small'})+'</div>').join('')+'</details>':'';
  const dialog=confirm?'<div class="notice warn"><strong>'+escape(confirm.text)+'</strong><div class="controls">'+btn('confirm','Confirm',{kind:'primary'})+btn('cancel-confirm','Cancel',{kind:'subtle'})+'</div></div>':'';
  return '<section class="card"><div class="section-title"><h1>Campaigns</h1></div>'+controls+dialog+(list?'<div class="campaign-list">'+list+'</div>':'<p class="quiet">Start a campaign or import a saved one.</p>')+checkpoint+'</section>'+
    form+'<section class="card compact" id="backup-panel">'+backupHtml()+'</section>';
}
function backupHtml() {
  const sizes=campaignSizes(collection);
  const timestamps=[collection.savedAt?'Last saved '+formatStamp(collection.savedAt):null,exportedAt?'Last exported '+formatStamp(exportedAt):null].filter(Boolean).join(' · ');
  const recovery='<div class="controls">'+
    ((status==='conflict'||status==='unavailable'||status==='full')?btn('retry','Retry save',{kind:'subtle'}):'')+
    (status==='conflict'?btn('ask-reload','Load newer local save',{kind:'subtle'}):'')+
    (status==='recovery'||store.hasArchived()?btn('download-recovery','Export unreadable original',{kind:'subtle'}):'')+
    (backup?btn('copy-backup',status==='recovery'?'Restore previous save':'Import previous save as copies',{kind:'subtle'}):'')+
    (status==='recovery'?btn('replace-recovery','Use this workspace as the active save',{kind:'subtle'}):'')+'</div>';
  return '<h2>Save and backup</h2><p id="backup-state">'+(backup?'Previous local save available':'No previous local save')+(timestamps?' · '+escape(timestamps):'')+'</p>'+
    '<p class="quiet">Exports include the board, eligibility, unfinished choices, and random state. Import adds copies to this browser.</p>'+recovery+
    (sizes.length?'<details class="inline" data-detail-key="campaign-sizes"><summary>Local campaign sizes</summary>'+sizes.map(([name,bytes])=>'<div class="line"><span>'+escape(name)+'</span><span>'+Math.ceil(bytes/1024)+' KB</span></div>').join('')+'</details>':'');
}
function paintBackup() {
  const panel=document.getElementById('backup-panel');
  if(panel) {
    const active=panel.contains(document.activeElement)?captureDomState():null;
    const open=panel.querySelector('details[open]');
    panel.innerHTML=backupHtml();
    if(open) panel.querySelector('details')?.setAttribute('open','');
    if(active?.activeSelector) panel.querySelector(active.activeSelector)?.focus({preventScroll:true});
  }
}
function guideHtml() {
  const table=[
    ['Setup','Automatic + tabletop','Copy the listed pieces and order. Enter the physical cards or use the app deck.'],
    ['Eligibility and bot deck','Automatic','Review the selected box, mini-deck draw, conditions, and targets before Apply.'],
    ['Human Commands','Guided','Choose spaces, payments, pieces and timing. For combinations that need the physical aid, enter the tabletop result.'],
    ['Bots: Commands and Special Activities','Automatic with documented edge cases','The action record gives the card number and priority. Check the boxed cards for exceptional situations.'],
    ['Events and free actions','Automatic bot priorities + guided choices','The app applies the boxed Event priorities. It saves any prompted human choice before continuing the Event. For a Tabletop procedure, follow the physical card and enter all resulting changes.'],
    ['Germany and Red Revolt','Automatic + guided choices','German timing, the standard German actions, and bot Red Revolt run in the app. Use the tabletop workflow for Coordinate.'],
    ['Propaganda and scoring','Automatic + human choices','Confirm each phase and resolve requested choices. The board generates victory margins.'],
    ['Corrections and saves','Guided','Enter final piece and marker counts. Undo and Redo include the named step. Export a copy before moving browsers or devices.']
  ];
  return '<section class="card"><p class="eyebrow">Tabletop companion · v'+VERSION+'</p><h1>How to play alongside the board</h1>'+
    '<ol class="steps"><li>Start a campaign and match the setup on the table.</li><li>Preview the current action. Check the spaces, tracks, and bot decision.</li><li>Apply once, then copy the checklist to the tabletop.</li><li>Use Correct for a mismatch. Reopen this same file or import an exported save.</li></ol>'+
    '<p class="quiet">On Android, open the downloaded HTML in a browser that runs local JavaScript. If the file viewer limits storage or downloads, use the desktop file or a local HTTP server. Export regularly when the save indicator reports a storage problem.</p>'+
    '<h2>Coverage</h2><div class="coverage">'+table.map(([area,mode,detail])=>'<div><strong>'+escape(area)+'</strong><span>'+escape(mode)+'</span><p>'+escape(detail)+'</p></div>').join('')+'</div>'+
    '<h2>Rules edition</h2><p>GMT Games Living Rules and Living Playbook, November 2023, and the boxed Solitaire Play Aid. New campaigns use the printed two-die Random Spaces Map. Campaigns from v0.9 keep the uniform-die option.</p>'+
    '<p class="quiet">All Bridges Burning is designed by V.P.J. Arponen and published by GMT Games. This independent companion uses the physical game’s pieces and cards.</p></section>';
}
function getPath(path) {
  const parts=path.split('.');
  if(parts[0]==='new') {
    parts.shift();
    return [draftNew,parts];
  }
  if(parts[0]==='rename') {
    parts.shift();
    return [renameState,parts];
  }
  return [entry()?.draft,parts];
}
const at=(obj,path)=>path.reduce((node,key)=>node?.[key],obj);
function assignPath(obj,parts,value) {
  const last=parts.at(-1);
  for(let i=0;i<parts.length-1;i++) {
    const key=parts[i], next=parts[i+1];
    if(obj[key]===undefined) obj[key]=/^\d+$/.test(next)?[]:{};
    obj=obj[key];
  }
  obj[last]=value;
}
function editBinding(path,value) {
  const parts=path.split('.');
  const isEdit=parts[0]==='edit'||parts[0]==='intent'&&parts[1]==='edit';
  if(!isEdit) return false;
  const offset=parts[0]==='edit'?1:2;
  const [obj]=getPath(path);
  const edit=at(obj,parts.slice(0,offset));
  const g=game(), tail=parts.slice(offset);
  if(tail[0]==='focus'&&value) editSpace(g,edit,value);
  if(tail[0]==='newsSlot') {
    edit.news??=clone(g.news);
    const id=Number(tail[1]);
    const token=edit.news.find(x=>x.id===id);
    if(tail[2]==='space') {
      if(!value) edit.news=edit.news.filter(x=>x.id!==id);
      else if(token) token.space=value;
      else edit.news.push({id,space:value,owner:null});
    } else if(token) token.owner=value||null;
    return true;
  }
  if(tail[0]==='issues') {
    edit.issues??=clone(g.issues);
    edit.issues[tail[1]]=value||null;
    return true;
  }
  if(tail[0]==='held'||tail[2]==='caps') {
    const [f,key]=tail.slice(-2), n=Number(value);
    const held=tail[0]==='held';
    const container=held?(edit.held??=clone(g.held)):(edit.spaces[tail[1]].caps??={});
    const previous=container[f]??g.board[tail[1]].caps[f];
    container[f]=previous.filter(cap=>cap!==key).concat(Array(Math.max(0,Math.min(20,Number.isInteger(n)?n:0))).fill(key));
    return true;
  }
  return false;
}
function updateFormGuidance() {
  const command=document.getElementById('command-summary');
  const agitation=document.getElementById('agitation-summary');
  if(!command&&!agitation) return;
  const g=game(), intent=entry().draft.intent;
  const f=g.interrupt?.f??actor(g);
  if(command) {
    command.innerHTML=commandSummaryHtml(g,f,intent,intent.action==='limited'||g.interrupt?.kind==='news');
    for(const hint of root.querySelectorAll('[data-row-hint]')) {
      const row=at(entry().draft,hint.dataset.rowHint.split('.'));
      const text=rowHelperText(g,f,intent.command,row);
      hint.textContent=text;
      hint.hidden=!text;
    }
  }
  if(agitation) agitation.innerHTML=agitationSummaryHtml(g,f,intent.plans);
}
function binding(e) {
  const target=e.target;
  if(target.dataset?.checkItem) {
    const c=entry();
    if(!c) return;
    const set=new Set(c.draft.checkedItems??[]);
    if(target.checked) set.add(target.dataset.checkItem);
    else set.delete(target.dataset.checkItem);
    c.draft.checkedItems=[...set];
    changed();
    refresh();
    return;
  }
  const path=target.dataset.bind??target.dataset.list;
  if(!path) return;
  const [obj,parts]=getPath(path);
  if(!obj) return;
  const last=parts.at(-1);
  let value=target.type==='checkbox'?target.checked:target.type==='number'||Object.hasOwn(target.dataset,'number')?(target.value===''?'':Number(target.value)):target.value;
  if(target.dataset.list) {
    let old=at(obj,parts);
    if(path.endsWith('.sabotage')&&old===undefined) old=game().sabotage;
    const copy=new Set(old??[]);
    if(target.checked) copy.add(target.value);
    else copy.delete(target.value);
    value=[...copy];
  }
  if(path.includes('.capCounts.')) {
    const row=at(obj,parts.slice(0,-2));
    const n=Math.max(0,Math.min(8,Number.isInteger(value)?value:0));
    row.caps=(row.caps??[]).filter(cap=>cap!==last).concat(Array(n).fill(last));
  } else if(!editBinding(path,value)) assignPath(obj,parts,value);
  if(path==='intent.command') {
    obj.intent.rows=[makeRow(game(),value,game().interrupt?.f??actor(game()))];
    obj.intent.special={};
    resetSpecial(obj.intent);
  }
  if(path==='intent.special.name') resetSpecial(obj.intent);
  if(path==='intent.side') {
    delete obj.intent.destination;
    delete obj.intent.beneficiary;
    delete obj.intent.direction;
  }
  if(path.includes('.rows.')&&['id','from','to'].includes(last)) {
    const row=at(obj,parts.slice(0,-1));
    if(last==='id') {
      if(obj.intent.command==='Terror') row.targets='';
      if(obj.intent.command==='Rally') row.offset=0;
    }
    if(last==='from') {
      row.caps=[];
      row.to='';
      if(row.path) row.path=['','',''];
    }
    if(last==='from'||last==='to') {
      row.retreat='';
      row.localCount=0;
      row.localRussian=0;
      row.localActiveFirst=false;
    }
  }
  if(path.includes('.path.')) {
    const route=at(obj,parts.slice(0,-1));
    for(let i=Number(last)+1;i<route.length;i++) route[i]='';
  }
  if(!path.startsWith('new.')&&!path.startsWith('rename.')) changed();
  if(Object.hasOwn(target.dataset,'refresh')||path==='boardFilter'||path.endsWith('.special.sites')) {
    refresh();
  } else if(path.startsWith('intent.')) {
    updateFormGuidance();
  }
}
root.addEventListener('input',event=>{
  if(event.target.matches('input:not([type=checkbox]):not([type=file])')) binding(event);
});
root.addEventListener('change',event=>{
  if(event.target.id==='import-file') {
    const file=event.target.files?.[0];
    if(file) void importFile(file);
  } else if(!event.target.matches('input:not([type=checkbox])')) binding(event);
});
function applyPlan() {
  if(!activePreview||activePreview.campaign!==entry()?.id||activePreview.before!==game()) throw Error('The board changed. Preview the action again.');
  const {plan,screen:origin}=activePreview, c=entry(), old=c.game;
  const {after,title,log,diff}=plan;
  const cardChanged=old.current!==after.current&&old.stage!=='setup';
  after.changedSpaces=[...new Set([...(cardChanged?[]:old.changedSpaces??[]),...diff.spaces.map(x=>x.id)])];
  const beforeDraft=c.draft;
  commitCampaign(c,after,title,{title,log,diff});
  resetReceiptOpen=true;
  for(const key of ['boardFilter','boardScope','boardNear','boardFaction']) {
    if(beforeDraft[key]!==undefined) c.draft[key]=beforeDraft[key];
  }
  if(origin==='correct') {
    c.draft=clone(beforeDraft);
    delete c.draft.edit;
    delete c.draft.checkedItems;
    clearPreviewDraft(c.draft);
  }
  if(after.checkpoint&&old.stage==='propaganda'&&old.roundStep==='reset') checkpointCampaign(c,'After Propaganda '+old.round);
  activePreview=null;
  changed();
  void saveNow();
  message=origin==='correct'?'Board correction applied.':'';
  refresh(origin==='correct'?'board':'turn');
  document.getElementById('action-card')?.scrollIntoView({block:'nearest'});
}
function clearPreviewDraft(draft) {
  delete draft.previewMode;
  delete draft.previewVersion;
}
function setPreview(intent,origin) {
  const g=game();
  const plan=preview(g,intent);
  entry().draft.previewMode=origin;
  entry().draft.previewVersion=VERSION;
  activePreview={plan,screen:origin,campaign:entry().id,before:g};
  changed();
  void saveNow();
  focus('#preview-panel');
  refresh(origin);
  document.getElementById('preview-panel')?.scrollIntoView({block:'nearest'});
}
function recoverPreview(target=screen) {
  const c=entry();
  if(c) c.draft=recoverDraft(c.draft,c.game);
  const mode=c?.draft.previewMode;
  if(!mode||target!==mode&&target!=='resume') return target==='resume'?'turn':target;
  if(c.draft.previewVersion!==VERSION) {
    clearPreviewDraft(c.draft);
    message='The app was updated. Review a fresh preview before applying these saved choices.';
    changed();
    return mode;
  }
  try {
    const intent=mode==='correct'?{type:'correct',edit:c.draft.edit}:c.draft.intent;
    activePreview={plan:preview(c.game,intent),screen:mode,campaign:c.id,before:c.game};
    return mode;
  } catch {
    clearPreviewDraft(c.draft);
    c.draft=recoverDraft(c.draft,c.game);
    return target==='resume'?'turn':target;
  }
}
function download(raw,filename) {
  if(raw==null) throw Error('There is no saved copy to export.');
  const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
  const link=document.createElement('a');
  link.href=url;
  link.download=filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const safeName=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,65)||'campaign';
async function importFile(file) {
  try {
    if(file.size>16_000_000) throw Error('This save file is too large.');
    let recoveredDraft=false;
    const incoming=decode(await file.text(),{onDraftRecovery:()=>{recoveredDraft=true;}});
    if(!incoming.campaigns.length) throw Error('The file contains no campaigns.');
    collection=importCopies(collection,incoming);
    activePreview=null;
    message='Imported '+incoming.campaigns.length+' campaign '+(incoming.campaigns.length===1?'copy.':'copies.');
    if(recoveredDraft) message+=' Damaged form fields were cleared.';
    faulty='';
    showNew=false;
    changed();
    await saveNow();
    refresh('campaigns');
  } catch(error) {
    faulty='Import failed. '+error.message;
    refresh('campaigns');
  }
}
function doConfirm() {
  const choice=confirm;
  confirm=null;
  if(choice?.type==='delete') {
    const target=collection.campaigns.find(x=>x.id===choice.id);
    collection.campaigns=collection.campaigns.filter(c=>c.id!==choice.id);
    if(collection.active===choice.id) collection.active=collection.campaigns[0]?.id??null;
    message='Deleted '+target.name+'.';
    changed();
    void saveNow();
  }
  if(choice?.type==='reload') {
    const opened=store.open();
    collection=opened.collection;
    exportedAt=collection.exportedAt;
    status=opened.status;
    backup=opened.backup;
    writtenSerial=changeSerial;
    remote=false;
    message=opened.recoveredDraft?recoveredMessage:'Loaded the saved workspace.';
  }
  if(choice?.type==='recover') {
    changed();
    void saveNow({recover:true});
  }
  refresh('campaigns');
}
root.addEventListener('click',event=>{
  const button=event.target.closest('[data-action]');
  if(!button) return;
  event.preventDefault();
  const {action,value}=button.dataset;
  const c=entry(), g=c?.game;
  faulty='';
  if(action!=='apply') message='';
  try {
    if(action==='screen') {
      activePreview=null;
      if(c&&changeSerial!==writtenSerial) void saveNow();
      refresh(value==='turn'&&!c?'campaigns':recoverPreview(value));
    } else if(action==='new') {
      showNew=true;
      refresh('campaigns');
      document.getElementById('new-campaign')?.scrollIntoView({block:'nearest'});
    } else if(action==='randomize') {
      draftNew.seed=randomSeed();
      refresh();
    } else if(action==='create') {
      const state=newGame({...draftNew,seed:draftNew.seed===''?randomSeed():Number(draftNew.seed)});
      const name=draftNew.name.trim()||'Full Campaign · '+state.humans.map(f=>NAME[f]).join(' + ');
      addCampaign(collection,newCampaign(name,state));
      draftNew={...draftNew,name:'',seed:randomSeed()};
      showNew=false;
      changed();
      void saveNow();
      refresh('turn');
    } else if(action==='open-campaign') {
      if(!collection.campaigns.some(x=>x.id===value)) throw Error('Campaign could not be opened.');
      activePreview=null;
      collection.active=value;
      changed();
      void saveNow();
      refresh(recoverPreview('resume'));
    } else if(action==='start-rename') {
      const target=collection.campaigns.find(x=>x.id===value);
      if(!target) throw Error('Campaign not found.');
      renameState={id:target.id,name:target.name};
      focus('[data-bind="rename.name"]');
      refresh('campaigns');
    } else if(action==='save-rename') {
      const target=collection.campaigns.find(x=>x.id===value);
      if(!target) throw Error('Campaign not found.');
      renameCampaign(target,renameState.name);
      renameState={id:null,name:''};
      message='Renamed campaign to '+target.name+'.';
      changed();
      void saveNow();
      refresh('campaigns');
    } else if(action==='cancel-rename') {
      renameState={id:null,name:''};
      refresh('campaigns');
    } else if(action==='duplicate-campaign') {
      const copy=duplicateCampaign(collection,value);
      activePreview=null;
      message='Duplicated campaign as '+copy.name+'.';
      changed();
      void saveNow();
      refresh('campaigns');
    } else if(action==='board-scope') {
      c.draft.boardScope=value;
      changed();
      refresh('board');
    } else if(action==='check-all-adjustments') {
      c.draft.checkedItems=checklistKeys(c.last);
      changed();
      refresh();
    } else if(action==='clear-adjustments') {
      c.draft.checkedItems=[];
      changed();
      refresh();
    } else if(action==='print-checklist') {
      const checklist=document.getElementById('tabletop-checklist');
      const sections=[checklist,...checklist.querySelectorAll('details[data-detail-key="receipt-tracks"]')];
      const wasOpen=sections.map(el=>el.open);
      sections.forEach(el=>{el.open=true;});
      try { window.print?.(); }
      finally { sections.forEach((el,index)=>{el.open=wasOpen[index];}); }
    } else if(action==='select-action') {
      const prior=c.draft.intent;
      c.draft.turnForms??={};
      c.draft.turnForms[prior.action]=prior;
      c.draft.intent=c.draft.turnForms[value]??{type:'human',action:value};
      changed();
      refresh();
    } else if(action==='preview') setPreview(c.draft.intent,'turn');
    else if(action==='preview-correction') setPreview({type:'correct',edit:c.draft.edit},'correct');
    else if(action==='dismiss-preview') {
      activePreview=null;
      clearPreviewDraft(c.draft);
      changed();
      void saveNow();
      refresh();
    } else if(action==='apply') applyPlan();
    else if(action==='undo'||action==='redo') {
      activePreview=null;
      const previous=g;
      const label=stepHistory(c,action);
      if(label) {
        message=(action==='undo'?'Undid ':'Redid ')+label+'. Check the tabletop position.';
        const diff=boardDiff(previous,c.game);
        c.last={title:(action==='undo'?'Undo':'Redo')+' · '+label,log:[],diff};
        delete c.draft.checkedItems;
        resetReceiptOpen=true;
        changed();
        void saveNow();
      }
      refresh('turn');
    } else if(action==='quick-correct') {
      const edit=ensure(c.draft,'edit',{});
      clearPreviewDraft(c.draft);
      if(value) {
        editSpace(g,edit,value);
        edit.focus=value;
      }
      activePreview=null;
      changed();
      refresh('correct');
    } else if(action==='clear-correction') {
      delete c.draft.edit;
      clearPreviewDraft(c.draft);
      changed();
      refresh();
    } else if(action==='focus-edit'||action==='reset-edit-space') {
      const [base,id]=value.split('|');
      const edit=at(c.draft,base.split('.'));
      if(action==='reset-edit-space') delete edit.spaces[id];
      editSpace(g,edit,id);
      edit.focus=id;
      changed();
      refresh();
    } else if(['add-row','remove-row','add-recycle','remove-recycle'].includes(action)) {
      const [base,index]=value.split('|'), intent=at(c.draft,base.split('.'));
      const atEnd=intent.special?.timing===intent.rows.length;
      if(action==='add-row'&&intent.rows.length<SPACE_IDS.length+Number(intent.command==='Activism')) {
        intent.rows.push(makeRow(g,intent.command,g.interrupt?.f??actor(g)));
      }
      if(action==='remove-row') intent.rows.splice(Number(index),1);
      if(action==='add-recycle') intent.recycle.push({id:'hel',key:(g.interrupt?.f??actor(g))+'I',count:1});
      if(action==='remove-recycle') intent.recycle.splice(Number(index),1);
      if(intent.special) intent.special.timing=atEnd?intent.rows.length:Math.min(intent.special.timing,intent.rows.length);
      changed();
      refresh();
    } else if(action==='add-agitation'||action==='remove-agitation') {
      if(action==='add-agitation') c.draft.intent.plans.push({id:'',kind:'shift',steps:1,side:'r'});
      else c.draft.intent.plans.splice(Number(value),1);
      changed();
      refresh();
    } else if(action==='export-one') {
      const item=collection.campaigns.find(x=>x.id===value);
      download(encodeCampaign(item),'abb-'+safeName(item.name)+'.json');
      exportedAt=new Date().toISOString();
      message='Campaign export prepared.';
      if(status==='saved'&&changeSerial===writtenSerial) { changed(); void saveNow(); }
      refresh();
    } else if(action==='export-all') {
      download(encode(collection),'abb-campaigns.json');
      exportedAt=new Date().toISOString();
      message='Campaign collection export prepared.';
      if(status==='saved'&&changeSerial===writtenSerial) { changed(); void saveNow(); }
      refresh();
    } else if(action==='import') importInput.click();
    else if(action==='retry') void saveNow();
    else if(action==='download-recovery') download(store.rawRecovery(),'abb-unreadable-original.json');
    else if(action==='copy-backup') {
      const old=store.readBackup();
      if(!old) throw Error('No readable previous save is available.');
      const recovery=status==='recovery';
      collection=importCopies(collection,old);
      changed();
      void saveNow({recover:recovery});
      message='Imported the previous save as campaign copies.';
      refresh();
    } else if(action==='restore-checkpoint') {
      const cp=c.checkpoints[Number(value)];
      const after=clone(cp.game), title='Restore '+cp.label;
      commitCampaign(c,after,title,{title,log:[],diff:boardDiff(g,after)});
      c.draft=recoverDraft(clone(cp.draft),c.game);
      delete c.draft.checkedItems;
      resetReceiptOpen=true;
      changed();
      void saveNow();
      refresh('turn');
    } else if(action==='ask-delete') {
      confirm={type:'delete',id:value,text:'Delete '+collection.campaigns.find(x=>x.id===value).name+' from this browser?'};
      refresh();
    } else if(action==='ask-reload') {
      confirm={type:'reload',text:'Load the saved version and discard this tab’s unsaved changes?'};
      refresh();
    } else if(action==='replace-recovery') {
      confirm={type:'recover',text:'Archive the unreadable bytes and save the current workspace?'};
      refresh();
    } else if(action==='confirm') doConfirm();
    else if(action==='cancel-confirm') {
      confirm=null;
      refresh();
    }
  } catch(error) {
    faulty=error.message;
    focus('#error-note');
    refresh();
  }
});
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY&&event.key!==null) return;
  try {
    if(store.remoteChanged()) {
      status='conflict';
      remote=true;
      paintStatus();
      if(screen==='campaigns') paintBackup();
    }
  } catch {
    status='unavailable';
    paintStatus();
  }
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'&&changeSerial!==writtenSerial) void saveNow();
});
window.addEventListener('beforeunload',event=>{
  if(changeSerial===writtenSerial||status==='recovery'&&!entry()) return;
  event.preventDefault();
  event.returnValue='';
});
refresh(entry()?recoverPreview('resume'):'campaigns');
