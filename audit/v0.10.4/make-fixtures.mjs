import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {encode,encodeCampaign,newCampaign} from '../../src/storage.js';
import {attritionIntent,attritionPosition,trainPosition,collectionWithHistory} from './cases.mjs';

const output=resolve(process.argv[2]??'/tmp/abb-audit2-fixtures');
await mkdir(output,{recursive:true});
const human=newCampaign('Audit 2 - German attrition',attritionPosition(true));
human.draft={intent:structuredClone(attritionIntent)};
await writeFile(resolve(output,'human-attrition.json'),encodeCampaign(human));
const g=trainPosition('s');
Object.assign(g,{eligible:['s','r','m'],current:1,upcoming:2,rng:15});
const bot=newCampaign('Audit 2 - Train target Capabilities',g);
bot.draft={intent:{type:'bot'}};
await writeFile(resolve(output,'bot-train.json'),encodeCampaign(bot));
// Keep the bulk fixture outside the repository; it is cheap to regenerate.
await writeFile(resolve(output,'eighty-campaigns.json'),encode(collectionWithHistory(80)));
console.log(output);
