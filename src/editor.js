import { MARK, SPACE_IDS} from './data.js';
import { clone, validateGame} from './model.js';

const TRACKS=['r','s','m','pol','rV','sV','rC','sC','rPow','sPow','rOut','sOut','mOut','gOut','uOut','coordinate'];
export const EDIT_TRACKS=TRACKS;
function setFields(dest,source,keys) {
  if(!source) return;
  for(const key of keys) if(Object.hasOwn(source,key)) dest[key]=source[key];
}
export function applyEdits(g,edit={}) {
  for(const id of SPACE_IDS) if(edit.spaces?.[id]) {
    const b=g.board[id], next=edit.spaces[id];
    setFields(b,next,[...MARK,'support','person']);
    setFields(b.caps,next.caps,['r','s']);
  }
  setFields(g.tracks,edit.tracks,TRACKS);
  if(edit.issues!==undefined) {
    g.issues=clone(edit.issues);
    for(const side of ['r','s']) g.tracks[side+'Issue']=g.issues.filter(x=>x===side).length;
  }
  if(edit.news!==undefined) g.news=clone(edit.news);
  if(edit.sabotage!==undefined) g.sabotage=clone(edit.sabotage);
  if(edit.held!==undefined) g.held=clone(edit.held);
  for(const f of ['r','s']) if(!g.humans.includes(f)) g.tracks[f]=0;
  validateGame(g);
}
