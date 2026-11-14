import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {VERSION} from '../src/data.js';

test('the shipped offline HTML rebuilds exactly and matches the release version and checksum',async t=>{
  const root=fileURLToPath(new URL('..',import.meta.url));
  const temporary=await mkdtemp(join(tmpdir(),'abb-release-'));
  t.after(()=>rm(temporary,{recursive:true,force:true}));
  const rebuilt=join(temporary,'rebuilt.html');
  execFileSync(process.execPath,['build.mjs',rebuilt],{cwd:root});
  const shipped=await readFile(join(root,'All_Bridges_Burning_Solo.html'));
  assert(shipped.equals(await readFile(rebuilt)),'Run node build.mjs and commit the generated HTML.');
  const sums=await readFile(join(root,'SHA256SUMS'),'utf8');
  assert.equal(sums.trim().split(/\s+/)[0],createHash('sha256').update(shipped).digest('hex'));
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
  assert.equal(pkg.version,VERSION);
  assert(!/<(?:script|link)[^>]+(?:src|href)=/i.test(shipped.toString('utf8')));
});
