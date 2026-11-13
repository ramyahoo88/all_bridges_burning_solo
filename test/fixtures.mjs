import {SPACE_IDS} from '../src/data.js';
import {blankSpace, newGame} from '../src/model.js';
import {preview} from '../src/engine.js';

export function position({humans=['r'],seed=4,phase=1,current=3,upcoming=4}={}) {
  const g=newGame({humans,seed});
  g.board=Object.fromEntries(SPACE_IDS.map(id=>[id,blankSpace()]));
  g.tracks.sOut=0;
  g.phase=phase;
  g.current=current;
  g.upcoming=upcoming;
  g.stage='turn';
  g.eligible=['r','s','m'];
  return g;
}
export function begin(seed=4,humans=['r'],mode='physical') {
  let g=newGame({humans,seed,mode});
  g=preview(g,{type:'start',current:3,upcoming:4}).after;
  return preview(g,{type:'enter'}).after;
}
export class MemoryStorage {
  data=new Map();
  quota=Infinity;
  fail=false;
  getItem(key) {
    if(this.fail) throw Error('blocked');
    return this.data.get(key)??null;
  }
  setItem(key,value) {
    if(this.fail) throw Error('blocked');
    const next=new Map(this.data).set(key,value);
    if([...next.values()].reduce((n,s)=>n+s.length,0)>this.quota) throw Object.assign(Error('full'),{name:'QuotaExceededError'});
    this.data=next;
  }
  removeItem(key) {this.data.delete(key);}
}
