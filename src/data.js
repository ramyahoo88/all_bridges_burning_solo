export const VERSION = '0.10.6';
export const FACTIONS = ['r', 's', 'm'];
export const NAME = {r:'Reds', s:'Senate', m:'Moderates', g:'Germany', u:'Russia'};
export const TYPES = ['cannon','train','officer'];
export const CAP_STOCK = {officer:4,cannon:2,train:2};
export const CAP_NAME = {cannon:'Cannon',train:'Train',officer:'Commander / Jaeger'};
export const capabilityName = (cap,f) => cap==='officer'?(f==='r'?'Commander':'Jaeger'):CAP_NAME[cap];
export const MARK = ['rA','rI','sA','sI','mA','mI','admin','network','u','g','rPrep','sPrep','rTerror','sTerror'];
export const LABEL = {
  rA:'Active Reds',rI:'Inactive Reds',sA:'Active Senate',sI:'Inactive Senate',
  mA:'Active Moderates',mI:'Underground Moderates',admin:'Administration',network:'Network',
  u:'Russian Troops',g:'German Troops',rPrep:'Reds Prepared',sPrep:'Senate Prepared',
  rTerror:'Red Terror',sTerror:'White Terror',support:'Support / Opposition',person:'Personality',
  r:'Reds',s:'Senate',m:'Moderates',pol:'Polarization',coordinate:'Coordinate',round:'Propaganda rounds',
  rOut:'Reds out of play',sOut:'Senate out of play',mOut:'Moderates out of play',
  rPow:'Reds prisoners',sPow:'Senate prisoners',uOut:'Russian out of play',gOut:'German out of play',
  rV:'Russian Vassalage',sV:'German Vassalage',rC:'Red political cubes',sC:'White political cubes',
  rIssue:'Red resolved issues',sIssue:'White resolved issues',phase:'Phase'
};
export const MOOD = ['Active Opposition','Passive Opposition','Neutral','Passive Support','Active Support'];
export const SPACES = {
  hel:['Helsinki',2,1], tam:['Tampere',1,1], tur:['Turku',1,1], vaa:['Vaasa',1,1], vii:['Viipuri',1,1],
  ham:['Häme',1,0], kar:['Karelia',1,0], kuo:['Kuopion lääni',0,0], mik:['Mikkelin lääni',0,0],
  oul:['Oulun lääni',0,0], poh:['Pohjanmaa',1,0], uus:['Uusimaa',1,0], var:['Varsinais-Suomi',1,0]
};
export const SPACE_IDS = Object.keys(SPACES);
export const TOWNS = SPACE_IDS.filter(id=>SPACES[id][2]);
export const spaceName = id=>SPACES[id]?.[0] ?? id;
export const pop = id=>SPACES[id][1];
export const town = id=>Boolean(SPACES[id][2]);
export const edge = (a,b)=>[a,b].sort().join('/');
export const RAIL = [
  ['hel','uus'],['tam','ham'],['tur','var'],['tur','uus'],['vaa','poh'],['vii','kar'],
  ['ham','poh'],['ham','mik'],['ham','uus'],['ham','var'],['kar','kuo'],['kar','uus'],
  ['kuo','mik'],['kuo','oul'],['oul','poh'],['uus','mik']
].map(([a,b])=>edge(a,b));
export const BORDERS = [...RAIL,...[
  ['kar','mik'],['kuo','poh'],['poh','var'],['uus','var'],['ham','kuo']
].map(([a,b])=>edge(a,b))].sort();
export const NEAR = Object.fromEntries(SPACE_IDS.map(id=>[id,BORDERS.filter(key=>key.split('/').includes(id)).map(key=>key.split('/').find(other=>other!==id))]));
export function distance(from,to) {
  let layer=[from];
  const visited=new Set(layer);
  for(let n=0;layer.length;n++) {
    if(layer.includes(to)) return n;
    layer=layer.flatMap(id=>NEAR[id]).filter(id=>{
      if(visited.has(id)) return false;
      visited.add(id);
      return true;
    });
  }
  return Infinity;
}
export const borderName = key=>key.split('/').map(spaceName).join(' / ');
export const ISSUE_LABELS = ['Eight-hour working day','Land reform','Social security'];
export const COMMANDS = {
  r:['Rally','Activism','Terror','Attack','March'],
  s:['Rally','Activism','Terror','Attack','March'],
  m:['Rally','Message','Negotiate','Politics']
};
export const SPECIALS = {
  r:['Political Event','Foreign Relations','Prepare'],
  s:['Political Event','Foreign Relations','Prepare','Coordinate','Crackdown'],
  m:['Personality','Dialogue','Publish']
};
export const BOT_CARD = {
  48:['r','Rally','8.3.1'],49:['r','Activism','8.3.2'],50:['r','Activism','8.3.3'],
  51:['r','Terror','8.3.4'],52:['r','Attack','8.3.5'],53:['r','March','8.3.6'],
  54:['s','Rally','8.4.1'],55:['s','Rally','8.4.2'],56:['s','Activism','8.4.3'],
  57:['s','Terror','8.4.4'],58:['s','Attack','8.4.5'],59:['s','March','8.4.6'],
  60:['m','Rally','8.5.1'],61:['m','Negotiate','8.5.2'],62:['m','Message','8.5.3'],
  63:['m','Message','8.5.4'],64:['m','Politics','8.5.5']
};
// Card metadata records printed symbols, including the side of every Event or instruction symbol.
const EVENT_ROWS = [
  [1,'February Revolution in Russia','','','',0,'officer'],
  [2,'“July Days” in Russia','','','m'],
  [3,'October Revolution in Russia'],
  [4,'Strikes','','rs!'],
  [5,'“Powers Act”','r','','rs!'],
  [6,'General Election','r','rs!'],
  [7,'“We Demand” Manifesto','','','m!'],
  [8,'General Strike','m','rs!','m!'],
  [9,'Declaration of Finnish Independence','r','rs!','m'],
  [10,'Weapons and Jaeger from Germany?','','','m!',0,'officer'],
  [11,'Weapons from Lenin','','r!'],
  [12,'Food Supply Issues','m','rs!','m!'],
  [13,'Joblessness','m','rs!','m!'],
  [14,'Cannons','','','',0,'cannon'],
  [15,'Trains','','','',0,'train'],
  [16,'Jaeger','','','',0,'officer'],
  [17,'Trains','','','',0,'train'],
  [18,'Mobilization in the Periphery','','s!','m'],
  [19,'Political Struggle','','m!','m!'],
  [20,'The Leg of Tokoi’s Chair','','rs!'],
  [21,'Workers’ Halls','','','r!'],
  [22,'1st Propaganda'],[23,'2nd Propaganda'],[24,'Red Revolt!'],
  [25,'Disarming Russian Garrisons','','s!','r!',1],
  [26,'Jaeger Return to Finland','','','',1,'officer'],
  [27,'The Reds Launch a Major Offensive','','s!','r!',1],
  [28,'Hennala','','m!','',1],
  [29,'War with Many Names','','s!','m!'],
  [30,'Meetings in the Catacombs','','','m'],
  [31,'German Invasion of Hanko','','','',1],
  [32,'Armistice Proposal','','','m!'],
  [33,'Battle of Helsinki','','','',1],
  [34,'Political Arrests','m','rs!'],
  [35,'Home Front','','','rm!',1],
  [36,'Prisoners','','','m!'],
  [37,'VATO','r','rs!'],
  [38,'Tanner Abroad','','s!','m!'],
  [39,'First Post-War Parliament','m','rs!','m!',1],
  [40,'Battle of Tampere','','rs!','',1],
  [41,'Battle of Lahti','','','r!',1],
  [42,'Battle of Viipuri','s','s!'],
  [43,'Rough Justice','','rs!','m'],
  [44,'Mannerheim’s Victory Parade','','s!','r!'],
  [45,'Fate in the Balance','sm','','m!',1],
  [46,'3rd Propaganda'],[47,'4th Propaganda']
];
export const PROPAGANDA = [22,23,46,47];
export const EVENTS = Object.fromEntries(EVENT_ROWS.map(([id,title,pass='',light='',dark='',german=0,cap=null])=>
  [id,{id,title,pass,light,dark,german:Boolean(german),cap,prop:PROPAGANDA.includes(id),year:id<24?1917:id>24?1918:null}]));
export const eventName = id=>id==null?'Unrevealed':(EVENTS[id]?('#'+id+' '+EVENTS[id].title):'Unknown card');
export const SALT = {setup:0x5f2a8b71,deck:0x6340193e};
