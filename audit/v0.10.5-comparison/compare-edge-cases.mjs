import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root = resolve(process.argv[2]);
const load = relative => import(pathToFileURL(join(root, relative)).href);
const {position} = await load('test/fixtures.mjs');
const {TOWNS, VERSION} = await load('src/data.js');
const {clone, validateGame} = await load('src/model.js');
const {preview} = await load('src/engine.js');
const {shuffle} = await load('src/random.js');
const storage = await load('src/storage.js');
const {collectionWithHistory} = await load('audit/v0.10.4/cases.mjs');

function marchPosition(converging) {
  const game = position({humans:['r','m'],phase:2,current:32,upcoming:33});
  Object.assign(game, {round:2, eligible:['r','m','s'], actions:[
    {f:'r',action:'limited'}, {f:'m',action:'pass'}
  ]});
  game.rng = Array.from({length:500}, (_,rng) => rng).find(rng =>
    shuffle({rng}, [54,55,56,57,58,59])[0] === 59);
  game.board.mik.sI = 4;
  game.board.mik.caps.s = ['train'];
  game.sabotage = ['ham/mik'];
  if (converging) {
    for (const town of TOWNS.filter(town => town !== 'hel')) game.board[town].sI = 1;
    game.board.kar.sI = 4;
  } else {
    game.board.uus.sI = 4;
  }
  return validateGame(game);
}

const report = {version:VERSION, march:{}};
for (const [label,converging,guideCommand] of [
  ['originAlsoDestination',false,false],
  ['originAlsoDestinationTabletop',false,true],
  ['sharedDestination',true,false]
]) {
  const game = marchPosition(converging);
  const original = clone(game);
  try {
    const plan = preview(game,{type:'bot',guideCommand});
    assert(plan.log.some(line => line.includes('#59 March')));
    report.march[label] = {title:plan.title, log:plan.log, cells:Object.fromEntries(
      ['hel','mik','kar','uus'].map(id=>[id,plan.after.board[id].sI+plan.after.board[id].sA])
    )};
  } catch(error) {
    report.march[label] = {error:error.message};
  }
  assert.deepEqual(game,original,'Preview must preserve the original state');
}

const workspace = storage.emptyCollection();
const first = storage.addCampaign(workspace,storage.newCampaign('Earlier export',position()));
const oldExport = storage.decode(storage.encodeCampaign(first));
while (workspace.campaigns.length < storage.MAX_CAMPAIGNS) storage.duplicateCampaign(workspace,first.id);
first.game.tracks.r = 12;
first.draft.boardFilter = 'recent changes';
try {
  const imported = storage.importCopies(workspace,oldExport);
  report.importAtCapacity = {result:'accepted',count:imported.campaigns.length,
    resourcesBefore:12,resourcesAfter:imported.campaigns.find(c=>c.id===first.id).game.tracks.r,
    draftAfter:imported.campaigns.find(c=>c.id===first.id).draft};
} catch (error) {
  report.importAtCapacity = {result:'rejected',error:error.message,resourcesAfter:first.game.tracks.r};
}

if (storage.splitCollection) {
  // This first uses a small collection and a reduced limit to isolate the byte-counting algorithm.
  const sample = collectionWithHistory(2);
  for (const campaign of sample.campaigns) campaign.name = 'Häme · ' + 'ä'.repeat(35);
  const raw = storage.encode(sample);
  const parts = storage.splitCollection(sample,raw.length);
  report.splitByteLimit = {limit:raw.length,partCount:parts.length,
    bytes:parts.map(part=>Buffer.byteLength(storage.encode(part)))};
}

if (process.argv[3]) {
  const out = resolve(process.argv[3]);
  for (const [name,shared] of [['march-source-destination',false],['march-converging',true]]) {
    const campaign = storage.newCampaign('Audit · #59 March',marchPosition(shared));
    await writeFile(join(out,name+'.json'),storage.encodeCampaign(campaign));
  }
  await writeFile(join(out,'full-workspace.json'),storage.encode(workspace));
  await writeFile(join(out,'earlier-campaign-export.json'),storage.encode(oldExport));
}
console.log(JSON.stringify(report,null,2));
