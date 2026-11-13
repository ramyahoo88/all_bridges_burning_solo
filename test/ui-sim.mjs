import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import {MemoryStorage} from './fixtures.mjs';

const require=createRequire(import.meta.url);
const {parseHTML}=require(process.env.ABB_DOM_MODULE??'linkedom');
const filename=resolve(process.argv[2]??'All_Bridges_Burning_Solo.html');
const file=await readFile(filename,'utf8');
const script=file.match(/<script>([\s\S]*?)<\/script>/)[1];
const storage=new MemoryStorage();
const key='abb-companion.campaigns';
function launch() {
  const {document,Event}=parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  const win={localStorage:storage,addEventListener(){}};
  runInNewContext(script,{document,window:win,navigator:{},setTimeout,clearTimeout,TextEncoder,structuredClone,crypto:globalThis.crypto,console});
  return {document,Event};
}
let app=launch();
const get=selector=>{
  const element=app.document.querySelector(selector);
  assert(element,'Missing '+selector);
  return element;
};
const fire=(el,event)=>el.dispatchEvent(new app.Event(event,{bubbles:true,cancelable:true}));
const click=(action,value)=>{
  const element=get('[data-action="'+action+'"]'+(value===undefined?'':'[data-value="'+value+'"]'));
  fire(element,'click');
};
function fill(path,value) {
  const element=get('[data-bind="'+path+'"]');
  if(element.tagName==='SELECT') Object.defineProperty(element,'value',{value});
  else element.value=value;
  fire(element,element.tagName==='SELECT'?'change':'input');
}
const state=()=>JSON.parse(storage.getItem(key)).campaigns[0];
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
fill('new.seed','4');
click('create');
await flush();
fill('intent.current','3');
fill('intent.upcoming','4');
click('preview');
click('apply');
click('preview');
click('apply');
click('select-action','pass');
click('preview');
click('apply');
await flush();
assert.equal(state().game.tracks.r,6);
const before=state().game;
click('preview');
await flush();
assert.deepEqual(state().game,before);
assert.match(get('#preview-panel').textContent,/Senate · Rally/);
app=launch();
assert.match(get('#preview-panel').textContent,/Senate · Rally/);
click('apply');
await flush();
const after=state().game;
assert.equal(after.board.hel.sI,2);
click('undo');
await flush();
assert.deepEqual(state().game,before);
click('redo');
await flush();
assert.deepEqual(state().game,after);
click('screen','board');
click('quick-correct','hel');
fill('edit.spaces.hel.sI','1');
click('preview-correction');
click('apply');
await flush();
assert.equal(state().game.board.hel.sI,1);
assert.equal(state().game.rng,after.rng);
console.log('PASS simulated DOM · opening form, Pass, bot preview, persistent preview, Apply, Undo/Redo, board correction');
