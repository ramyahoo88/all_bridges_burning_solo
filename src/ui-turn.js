import { FACTIONS, ISSUE_LABELS, NAME, SPACE_IDS, TOWNS, eventName, spaceName} from './data.js';
import {cells, human, pools, tracksResources} from './model.js';
import {TURN_LABEL, actor, options} from './sequence.js';
import {capAvailable, capDestinations, capabilityChoice, eventPrompt, eventSides} from './events.js';
import {agitationSpaces} from './rounds.js';
import {eventChoiceSpaces} from './bot-events.js';
import {availableTable, boardCards, editorHtml} from './ui-board.js';
import {btn, check, commandFields, cubeOptions, ensure, escape, eventOptions, group, numeric, select, sideOptions, sides, spaceOptions} from './ui-fields.js';

const headings={setup:'Confirm tabletop setup',reveal:'Reveal the next card',enter:'Start the current card',advance:'Advance the Event deck',german:'Germany acts',revolt:'Resolve Red Revolt!',propaganda:'Propaganda Round',ended:'Campaign complete'};
const roundLabels={victory:'Victory check',politics:'Politics',resources:'Resources',turmoil:'Russian Turmoil','agitate-0':'Senate Agitation','agitate-1':'Reds Agitation','agitate-2':'Moderates Agitation',endcheck:'Victory or Reset','pow-r':'Reds release decision','pow-s':'Senate release decision','pow-end':'Remaining prisoners',reset:'Reset'};
export function turnStatus(g) {
  const f=actor(g);
  if(g.interrupt) return g.interrupt.title;
  if(g.stage==='turn') return NAME[f]+(human(g,f)?' · your turn':' · bot turn');
  if(g.stage==='propaganda') return 'Propaganda '+g.round+' · '+(roundLabels[g.roundStep??'victory']??'Continue');
  return headings[g.stage]??'Current action';
}
export function sequenceHtml(g) {
  if(!g.current) return '';
  const players=g.eligible.map(f=>{
    const taken=g.actions.find(a=>a.f===f);
    return '<div class="order-chip'+(!taken&&g.stage==='turn'&&f===actor(g)?' active':'')+'"><span class="dot '+f+'"></span><span>'+escape(NAME[f])+'</span><small>'+
      (taken?escape(taken.action==='full'?'Command':TURN_LABEL[taken.action]):human(g,f)?'Human':'Bot')+'</small></div>';
  });
  if(g.ineligible) players.push('<div class="order-chip ineligible"><span class="dot '+g.ineligible+'"></span><span>'+NAME[g.ineligible]+'</span><small>Ineligible</small></div>');
  return '<div class="event-pair"><div><span>Current</span><strong>'+escape(eventName(g.current))+'</strong></div><div><span>Upcoming</span><strong>'+escape(eventName(g.upcoming))+'</strong></div></div>'+
    (g.reserved?'<p class="reservation">NP to Play · '+escape(NAME[g.reserved.f])+' reserved '+escape(eventName(g.reserved.card))+'</p>':'')+
    '<div class="order" aria-label="Eligibility order">'+players.join('')+'</div>'+
    (g.german==='before'||g.german==='after'?'<p class="quiet german-order">Germany acts '+g.german+' the factions'+(g.tracks.coordinate?' · Coordinate':'')+'.</p>':'');
}
const previewButton=(label='Preview changes')=>btn('preview',label,{kind:'primary'});
const guidedNote='<p class="quiet">The app pauses here while you check the physical components. Enter the resulting changes, preview them, then apply once.</p>';
function eventSelect(g,intent,base,f) {
  const choices=eventSides(g.current);
  ensure(intent,'side',choices[0]);
  const c=capabilityChoice(g,f,g.current,intent.side);
  let extra='';
  if(c?.owner==='m') extra+=select('Award to',base+'.beneficiary',intent.beneficiary??'',sides(['r','s']),{empty:'Choose faction',refresh:true});
  const owner=c?.owner==='m'?intent.beneficiary:c?.owner;
  if([3,11,45].includes(g.current)&&intent.side==='light') {
    if(g.current!==3) {
      ensure(intent,'power',f==='s'?'s':'r');
      extra+=select('Vassalage track',base+'.power',intent.power,[['r','Russian'],['s','German']]);
    }
    if(g.current===45) {
      ensure(intent,'amount',2);
      extra+=numeric('Steps to decrease',base+'.amount',intent.amount,{min:0,max:2});
    } else {
      ensure(intent,'direction','lower');
      extra+=select('Direction',base+'.direction',intent.direction,[['lower','Decrease one'],['raise','Increase one']]);
    }
  }
  if(g.current===4&&intent.side==='dark'||g.current===8&&intent.side==='dark') {
    extra+=select('Placement space',base+'.destination',intent.destination??'',spaceOptions(),{empty:'Choose a space'});
  }
  if(g.current===5&&intent.side==='dark'||g.current===9&&intent.side==='light'||g.current===37&&intent.side==='light') {
    ensure(intent,'direction',f==='s'?'support':'opposition');
    extra+=select('Shift direction',base+'.direction',intent.direction,[['support','Toward Active Support'],['opposition','Toward Active Opposition']])+
      select('Space to shift',base+'.destination',intent.destination??'',spaceOptions(),{empty:'Choose a space'});
  }
  if(g.current===30&&intent.side==='dark') {
    ensure(intent,'reward','resources');
    extra+=select('Moderates benefit',base+'.reward',intent.reward,[['resources','Gain 3 Resources'],['cube','Place a political cube']],{refresh:true});
  }
  if(g.current===9&&intent.side==='dark'||g.current===30&&intent.side==='dark'&&intent.reward==='cube') {
    ensure(intent,'cube',pools(g).rC?'r':'s');
    extra+=select('Political cube',base+'.cube',intent.cube,cubeOptions);
  }
  if(c&&owner&&capAvailable(g,c.cap)>0&&g.phase===2&&human(g,owner)) {
    const sites=capDestinations(g,owner,c.cap);
    if(sites.length>1) extra+=select('Place Capability',base+'.destination',intent.destination??'',spaceOptions(sites),{empty:'Choose a space'});
  }
  return group(select('Event side',base+'.side',intent.side,sideOptions.filter(([value])=>choices.includes(value)),{refresh:true})+extra)+
    '<p class="quiet">'+escape(eventPrompt(g.current,intent.side))+'</p>';
}
function editFor(draft,g,base) {
  const edit=base==='edit'?ensure(draft,'edit',{}):ensure(draft.intent,'edit',{});
  return editorHtml(g,edit,base);
}
function manual(g,draft,p) {
  const i=draft.intent;
  const event=p.scope==='event';
  let sidesHtml='';
  if(event) {
    const valid=eventSides(p.card);
    ensure(i,'side',p.side??valid[0]);
    ensure(i,'skip',false);
    sidesHtml=group(select('Event side used', 'intent.side',i.side,sideOptions.filter(([key])=>valid.includes(key)),{refresh:true}))+ 
      '<p class="quiet">'+escape(eventPrompt(p.card,i.side))+'</p>'+
      check(human(g,p.f)?'Return to turn without playing the Event':'Event has no effect or the aid directs a Command · continue priorities','intent.skip',i.skip,{refresh:true});
  }
  if(p.scope==='bot-command') {
    ensure(i,'recordAction',p.action);
    sidesHtml=group(select('Record eligibility as','intent.recordAction',i.recordAction,p.choices.map(x=>[x,TURN_LABEL[x]])));
  }
  return '<p class="guided-badge">Tabletop procedure</p>'+(p.reason?'<p class="quiet">'+escape(p.reason)+'</p>':'')+'<p>'+escape(p.instruction)+'</p>'+
    (p.aid?'<p class="quiet">Use the boxed Solitaire Play Aid for the bot’s choice. The printed instruction takes precedence over the general priorities.</p>':'')+
    (event&&!p.aid&&!human(g,p.f)?'<details class="inline" data-detail-key="bot-event-priorities"><summary>General bot Event priorities · §8.1.7</summary><p>Use a random draw for remaining choices. Reds favor Opposition and Reds Control. Senate favors Support and Senate Control. Moderates favor Neutral and Uncontrolled Population. Prefer Towns for Support and Opposition, target Active Reds or Senate and Underground Moderates, and use at most one matching disc or Prepared marker in a space.</p></details>':'')+
    sidesHtml+(i.skip?'':guidedNote+editFor(draft,g,'intent.edit'))+
    (i.skip?'':group('<label class="field"><span>Tabletop note (optional)</span><input data-bind="intent.note" maxlength="380" value="'+escape(i.note??'')+'"></label>'))+
    previewButton(i.skip?'Preview continuation':'Preview recorded result');
}
function estimateAgitateCost(g,f,plans) {
  let cost=0;
  for(const plan of plans) {
    const b=g.board[plan.id];
    const steps=Math.max(1,Number(plan.steps)||1);
    if(plan.kind==='disc'||plan.kind==='cube') cost+=1;
    else {
      if(f!=='m'&&b) cost+=b.rTerror+b.sTerror;
      cost+=steps;
    }
  }
  if(cost&&f!=='m') cost+=g.tracks[f==='s'?'rIssue':'sIssue'];
  return cost;
}
export function agitationSummaryHtml(g,f,plans) {
  const cost=estimateAgitateCost(g,f,plans);
  const spaces=agitationSpaces(g,f).map(spaceName);
  return '<div class="summary-line"><span>Estimated cost <strong>'+cost+'</strong> · Resources <strong>'+g.tracks[f]+'</strong></span>'+
    '<span>Qualifying spaces · '+escape(spaces.join(', ')||'None')+'</span></div>';
}
function pending(g,draft) {
  const p=g.interrupt, i=ensure(draft,'intent',{type:'resolve'});
  if(p.kind==='manual') return manual(g,draft,p);
  if(p.kind==='event-choice') {
    const spaces=eventChoiceSpaces(g);
    const label=p.event===7?'Town or Province for the Reds Cell':'Space for Senate Crackdown';
    if(!spaces.includes(i.space)) i.space=spaces[0]??'';
    return (spaces.length?group(select(label,'intent.space',i.space,spaceOptions(spaces)))+
      '<p class="quiet">Legal choices ('+spaces.length+') · '+escape(spaces.map(spaceName).join(', '))+'</p>':'<p>There is no eligible space. Continue the Event.</p>')+
      previewButton('Preview Event resolution');
  }
  if(p.kind==='news') {
    if(p.bot) return '<p>Spend held News and draw from a fresh bot mini-deck for one more Limited Command.</p>'+previewButton('Preview News follow-up');
    ensure(i,'use',false);
    ensure(i,'token',g.news.find(n=>n.owner===p.f)?.id);
    return check('Spend News for an extra paid Limited Command', 'intent.use',i.use,{refresh:true})+
      (i.use?group(select('Held News','intent.token',i.token,g.news.filter(n=>n.owner===p.f).map(n=>[n.id,'News '+n.id+' · '+spaceName(n.space)]),{number:true}))+
        commandFields(g,p.f,i,'intent',{limited:true}):'')+previewButton(i.use?'Preview extra Command':'Preview keeping News');
  }
  if(p.kind==='politics') {
    if(p.sub==='issue') {
      ensure(i,'issue',p.choices[0]);
      ensure(i,'side',p.side??'r');
      return group(select('Resolved Issue','intent.issue',i.issue,p.choices.map(n=>[n,ISSUE_LABELS[n]]),{number:true})+
        (p.side?'<p class="quiet">Majority color · '+NAME[p.side]+'</p>':select('Break the tie','intent.side',i.side,sides(['r','s']))))+previewButton();
    }
    ensure(i,'space',p.choices[0]);
    return group(select('Town for the Personality','intent.space',i.space,spaceOptions(p.choices)))+previewButton();
  }
  if(p.kind==='prisoners') {
    ensure(i,'count',0);
    const max=Math.min(p.max,g.tracks[p.f==='r'?'sPow':'rPow']);
    if(i.count>max) i.count=max;
    return group(numeric('Enemy prisoners to release', 'intent.count',i.count,{max}))+
      '<p class="quiet">Available prisoners to release: 0 to '+max+'.</p>'+previewButton();
  }
  if(p.kind==='capabilities') {
    ensure(i,'space',p.choices[0]);
    return group(select('Place '+p.cap,'intent.space',i.space,spaceOptions(p.choices)))+previewButton();
  }
  if(p.kind==='revolt') {
    ensure(i,'choice','skip');
    ensure(i,'space','');
    ensure(i,'disc',false);
    const candidates=TOWNS.filter(id=>cells(g.board[id],'r')||i.choice==='rally'&&g.board[id].admin);
    return group(select('Reds choice','intent.choice',i.choice,[['skip','Decline the optional Reds action'],['remove','Remove Senate Cells and Prepared'],['rally','Free Limited Rally']],{refresh:true})+
      (i.choice==='skip'?'':select('Town','intent.space',i.space,spaceOptions(candidates),{empty:'Choose Town'}))+
      (i.choice==='rally'?check('Build an Administration','intent.disc',i.disc):''))+previewButton();
  }
  if(p.kind==='agitate') {
    const plans=ensure(i,'plans',[]), spaces=agitationSpaces(g,p.f);
    const list=[['shift',p.f==='m'?'Shift toward Neutral':'Shift Support / Opposition'],['polarization','Reduce Polarization'],...(p.f==='s'?[]:[['disc',p.f==='r'?'Build Administration':'Build Network']]),...(p.f==='m'?[['cube','Place political cube']]:[])];
    return '<div class="form-summary" id="agitation-summary">'+agitationSummaryHtml(g,p.f,plans)+'</div>'+
      '<p class="quiet">Choose actions in resolution order. Resources are checked before the result can be applied.</p>'+
      plans.map((plan,n)=>{
        const base='intent.plans.'+n;
        return '<div class="step-box">'+group(select('Space',base+'.id',plan.id,spaceOptions(spaces),{empty:'Choose space'})+
          select('Agitation',base+'.kind',plan.kind,list,{refresh:true})+
          (['shift','polarization'].includes(plan.kind)?numeric('Steps',base+'.steps',plan.steps,{min:1,max:10}):'')+
          (plan.kind==='shift'&&p.f!=='m'?select('Shift toward',base+'.direction',plan.direction??(p.f==='r'?'opposition':'support'),[['support','Support'],['opposition','Opposition']]):'')+
          (plan.kind==='cube'?select('Cube',base+'.side',plan.side,cubeOptions):'')+
          btn('remove-agitation','Remove',{value:n,kind:'subtle small'}))+'</div>';
      }).join('')+
      btn('add-agitation','Add Agitation',{kind:'subtle'})+previewButton(plans.length?'Preview Agitation':'Preview no Agitation');
  }
  return '<p>Resume the pending decision.</p>';
}
export function turnBody(g,draft) {
  if(g.interrupt) return pending(g,draft);
  if(g.stage==='ended') {
    const r=g.result;
    return '<div class="result"><strong>'+escape(r?.winner?NAME[r.winner]+' wins':'No faction or power wins')+'</strong>'+
      (g.humans.length===1?'<p>'+escape(r?.soloWin?'Solo victory':'Solo defeat')+'</p>':'')+
      '<div class="available">'+(r?.order??FACTIONS).map(f=>'<span>'+NAME[f]+' margin <strong>'+escape(r?.margins?.[f]??'—')+'</strong></span>').join('')+'</div></div>';
  }
  if(g.stage==='setup') {
    const i=ensure(draft,'intent',{type:'start',current:'',upcoming:''});
    const opts=eventOptions(g);
    return '<p>Match the board and cylinders to this setup. All starting Cells are symbol-side down.</p>'+
      '<ul class="setup-list">'+g.setupLog.map(x=>'<li>'+escape(x)+'</li>').join('')+
      '<li>Polarization 3, each Vassalage 3. Human Resources 5; bot Moderates 0. Ten Senate Cells, three Russian Troops and six German Troops begin Out of Play.</li></ul>'+
      '<details class="inline" data-detail-key="setup-board"><summary>Physical board and Available Forces</summary>'+availableTable(g)+boardCards(g,SPACE_IDS.filter(id=>Object.values(g.board[id]).some(x=>typeof x==='number'&&x!==0)))+'</details>'+
      '<details class="inline" data-detail-key="setup-markers"><summary>Initial markers and boxes</summary><ul><li>Set all three Prepared markers aside and place the political cubes in the matching Available boxes.</li><li>Place both News markers and the Personality in Moderates Available.</li><li>Set Germany’s cylinder in its holding slot. Keep Coordinate off the board.</li><li>Mark Reds + Senate Cells at 13, Senate Town Population at 1, Opposition + Administrations at 3, and Issues + Networks + 1 at 1.</li></ul></details>'+
      (g.mode==='physical'?'<details class="inline" data-detail-key="setup-deck"><summary>Prepare the physical Event deck</summary><p>Build two 1917 and two 1918 piles. Each pile has five random year cards on top of four year cards shuffled with one Propaganda. Stack the two 1917 piles above the two 1918 piles. Set #24 aside. Enter the top two cards as you reveal them.</p></details>'+
        group(select('Current Event','intent.current',i.current,opts.filter(([id])=>id<=21),{empty:'Choose first card',number:true})+
          select('Upcoming Event','intent.upcoming',i.upcoming,opts.filter(([id])=>id<=21),{empty:'Choose next card',number:true})):'<p class="quiet">The app will reveal the first two Event IDs from its seeded deck. Pull the matching physical cards when needed.</p>')+previewButton('Preview opening setup');
  }
  if(g.stage==='reveal') {
    const i=ensure(draft,'intent',{type:'reveal',card:''});
    return '<p>Keep '+escape(eventName(g.current))+' in the current slot. Reveal one card from the physical deck and enter its number. Propaganda is resolved immediately.</p>'+
      group(select('Revealed card','intent.card',i.card,eventOptions(g),{empty:'Choose card',number:true}))+previewButton('Preview reveal');
  }
  if(g.stage==='turn') {
    const f=actor(g), choices=options(g);
    if(!human(g,f)) {
      const i=ensure(draft,'intent',{type:'bot'});
      return '<p>Check the bot’s selected action and targets before changing the physical board.</p>'+
        '<details class="inline" data-detail-key="bot-tabletop-option"><summary>Tabletop resolution option</summary>'+
        check('Resolve a bot Command using the boxed card','intent.guideCommand',i.guideCommand)+
        '<p class="quiet">Use this for a Train position or priority that depends on the printed map or a boxed instruction. The app still follows the bot’s Event and Pass priorities.</p></details>'+
        previewButton('Preview '+NAME[f]+' bot');
    }
    const i=ensure(draft,'intent',{type:'human',action:choices.includes('limited')?'limited':choices.find(x=>x!=='pass')??'pass'});
    const controls=choices.map(a=>btn('select-action',TURN_LABEL[a],{value:a,kind:i.action===a?'selected':'subtle'})).join('');
    return '<div class="action-options" aria-label="Available turn actions">'+controls+'</div>'+
      (i.action==='event'?eventSelect(g,i,'intent',f):i.action==='pass'?'<p class="quiet">Gain one Resource (up to 30) and remain eligible for the upcoming card. Current '+NAME[f]+' Resources: '+g.tracks[f]+'/30.</p>':commandFields(g,f,i,'intent',{limited:i.action==='limited'}))+
      previewButton(i.action==='pass'?'Preview Pass':'Preview changes');
  }
  const types={enter:'enter',advance:'advance',german:'german',revolt:'revolt',propaganda:'propaganda'};
  ensure(draft,'intent',{type:types[g.stage]});
  const hints={
    enter:'Open the current card. If it calls for Germany in Phase II, the app rolls before any faction acts.',
    advance:'Move eligibility cylinders and advance the deck as shown in the preview.',
    german:'Resolve the next step of the German Actions flowchart.',
    revolt:'Finish the Reds choice, place Capabilities, and adjust the Powers before continuing Phase II.',
    propaganda:'Resolve this Propaganda step before the next one opens.'
  };
  return '<p>'+escape(hints[g.stage])+'</p>'+previewButton(g.stage==='propaganda'?'Preview '+(roundLabels[g.roundStep??'victory']??'Propaganda'):'Preview '+(g.stage==='enter'?'card start':g.stage==='advance'?'advance':g.stage==='german'?'German action':'pivotal step'));
}
export function actionSummary(g) {
  if(g.stage==='setup') return 'Full campaign · '+(g.mode==='physical'?'physical Event deck':'app Event deck');
  return 'Phase '+(g.phase===1?'I':'II')+' · '+(g.stage==='propaganda'?'Round '+g.round:'Campaign '+Math.min(4,g.round+1))+' · '+(g.mode==='physical'?'physical deck':'app deck');
}
export function resourceRow(g) {
  return '<div class="resources">'+FACTIONS.map(f=>'<div><span class="dot '+f+'"></span>'+NAME[f]+' <strong>'+ (tracksResources(g,f)?g.tracks[f]:'—')+'</strong><small>'+ (human(g,f)?'Human':'Bot')+'</small></div>').join('')+'</div>';
}
