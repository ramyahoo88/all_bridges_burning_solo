import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {collectionWithHistory} from '../audit/v0.10.4/cases.mjs';
import {validateGame} from '../src/model.js';
import {addCampaign,duplicateCampaign,emptyCollection,encode,encodeCampaign,MAX_CAMPAIGNS,newCampaign} from '../src/storage.js';
import {position,senateMarchPosition} from './fixtures.mjs';

const [kind,directory]=process.argv.slice(2);
async function write(name,raw) {
  await writeFile(join(directory,name),raw);
}
if(kind==='march') {
  const campaign=newCampaign('Senate March',validateGame(senateMarchPosition()));
  campaign.draft={intent:{type:'bot'},previewMode:'turn',previewVersion:'0.10.6'};
  const old=JSON.parse(encodeCampaign(campaign));
  old.version='0.10.6';
  await write('march.json',JSON.stringify(old));
} else if(kind==='capacity') {
  const collection=emptyCollection();
  const campaign=addCampaign(collection,newCampaign('Existing campaign',position()));
  await write('older.json',encodeCampaign(campaign));
  for(let i=1;i<MAX_CAMPAIGNS;i++) duplicateCampaign(collection,campaign.id);
  campaign.game.tracks.r=12;
  campaign.draft.boardFilter='Häme';
  await write('full.json',encode(collection));
} else if(kind==='backups') {
  const collection=collectionWithHistory(80);
  collection.campaigns[0].name='Häme and Tampere';
  collection.campaigns[0].draft.boardFilter='Häme';
  await write('campaigns.json',encode(collection));
} else throw Error('Choose march, capacity or backups.');
