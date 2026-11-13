import {readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=dirname(fileURLToPath(import.meta.url));
const source=resolve(root,'src');
const out=resolve(process.argv[2]??resolve(root,'All_Bridges_Burning_Solo.html'));
const loaded=new Map();

async function moduleFactory(filename) {
  if(loaded.has(filename)) return;
  let code=await readFile(resolve(source,filename),'utf8');
  const dependencies=[];
  code=code.replace(/^import\s+\{([^}]+)\}\s+from\s+'\.\/([^']+)';$/gm,(_,names,file)=>{
    dependencies.push(file);
    return 'const {'+names.replace(/\s+as\s+/g,':')+'}=require('+JSON.stringify(file)+');';
  });
  const exports=[];
  code=code.replace(/^export\s+(const|function|class)\s+([a-zA-Z_$][\w$]*)/gm,(_,kind,name)=>{
    exports.push(name);
    return kind+' '+name;
  });
  if(/^\s*(import|export)\s/m.test(code)) throw Error('Unsupported module syntax in '+filename);
  loaded.set(filename,code+'\nreturn {'+exports.join(',')+'};');
  for(const file of dependencies) await moduleFactory(file);
}
await moduleFactory('ui.js');
const factories=[...loaded].sort(([a],[b])=>a.localeCompare(b,'en')).map(([file,code])=>JSON.stringify(file)+': function(require) {\n'+code+'\n}').join(',\n');
const js="'use strict';\n(() => {\nconst modules={\n"+factories+"\n};\nconst cache=Object.create(null);\nfunction require(file) { return cache[file] ??= modules[file](require); }\nrequire('ui.js');\n})();\n";
if(/<\/script/i.test(js)) throw Error('Escape closing script tags in app source.');
const [template,style]=await Promise.all([readFile(resolve(source,'index.html'),'utf8'),readFile(resolve(source,'style.css'),'utf8')]);
const html=template.replace('/* ABB_STYLE */',()=>style).replace('/* ABB_SCRIPT */',()=>js);
await writeFile(out,html);
console.log(createHash('sha256').update(html).digest('hex')+'  '+out);
