import {mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {addNews, validateGame} from '../src/model.js';
import {preview} from '../src/engine.js';
import {newCampaign, encodeCampaign} from '../src/storage.js';
import {roll} from '../src/random.js';
import {begin, position} from './fixtures.mjs';

const dir=resolve(process.argv[2]??fileURLToPath(new URL('../saves/',import.meta.url)));
await mkdir(dir,{recursive:true});
const save=async(filename,name,g,draft={})=>{
  validateGame(g);
  const entry=newCampaign(name,g);
  entry.id=filename.replace(/[^a-z0-9-]/g,'-');
  entry.draft=draft;
  await writeFile(resolve(dir,filename+'.json'),encodeCampaign(entry)+'\n');
};
const afterPass=preview(begin(),{type:'human',action:'pass'}).after;
await save('01-senate-rally','Audit 01 · Senate Rally',afterPass,{intent:{type:'bot'}});
// Saves 02 and 03 are historical bytes. They exercise migration of an actual v0.9 guided Event.
const attack=position({phase:2,humans:['r'],current:3,upcoming:7});
Object.assign(attack.board.tam,{rI:3,rPrep:1,admin:1,support:-2});
attack.board.ham.sI=6;
attack.board.ham.caps.s=['train'];
attack.sabotage=['ham/tam'];
attack.eligible=['r','s'];
attack.ineligible='m';
attack.actions=[{f:'r',action:'limited'}];
for(let rng=0;rng<10000;rng++) {
  attack.rng=rng;
  const p=preview(attack,{type:'bot'});
  if(p.title.includes('Attack + Prepare')&&p.log.some(line=>line.endsWith('rolled 3'))) break;
}
await save('04-prepare-train-attack','Audit 04 · Prepare then Train Attack',attack,{intent:{type:'bot'}});
const news=position({phase:2,humans:['r'],current:3,upcoming:7});
news.board.tam.rI=2;
addNews(news,'tam','r');
const newsPending=preview(news,{type:'human',action:'limited',command:'Rally',rows:[{id:'tam'}]}).after;
await save('05-pending-news','Audit 05 · Pending News follow-up',newsPending,{intent:{type:'resolve',use:true,token:1,command:'Rally',rows:[{id:'vii',option:'cells',offset:0}]}});
const prop=position({phase:2,humans:['m'],current:47,upcoming:33});
prop.round=4;
prop.stage='propaganda';
prop.roundStep='endcheck';
prop.tracks.rV=2;
prop.tracks.sV=2;
prop.tracks.pol=4;
prop.tracks.m=15;
await save('06-final-scoring','Audit 06 · Final scoring power tie',prop,{intent:{type:'propaganda'}});
const hennala=position({phase:2,humans:['r'],current:28,upcoming:29});
hennala.eligible=['m','r','s'];
Object.assign(hennala.tracks,{m:12,pol:5,rPow:2,sPow:3});
for(let rng=0;rng<1000;rng++) if(roll({rng},[])===4) {
  hennala.rng=rng;
  break;
}
const prisoners=preview(hennala,{type:'bot'}).after;
await save('07-pending-hennala','Audit 07 · Pending Hennala prisoner decision',prisoners,{intent:{type:'resolve',count:1}});
const manifesto=position({humans:['r'],current:7,upcoming:3});
manifesto.eligible=['m','r','s'];
Object.assign(manifesto.board.tam,{mI:1,network:1});
manifesto.board.hel.support=2;
const placement=preview(manifesto,{type:'bot'}).after;
await save('08-pending-manifesto','Audit 08 · Pending Manifesto placement',placement,{intent:{type:'resolve',space:'ham'}});
const upgradedDraft=newCampaign('Audit 09 · Preview from v0.9',structuredClone(afterPass));
delete upgradedDraft.game.spaceRolls;
upgradedDraft.id='09-upgrade-preview';
upgradedDraft.draft={intent:{type:'bot',guideCommand:false},previewMode:'turn'};
const old=JSON.parse(encodeCampaign(upgradedDraft));
old.version='0.9.0';
await writeFile(resolve(dir,'09-upgrade-preview.json'),JSON.stringify(old)+'\n');
