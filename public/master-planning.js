'use strict';
const masterPlanningTr = text => typeof window._tr === 'function' ? window._tr(text) :
    window.KR_I18N?.t ? window.KR_I18N.t(text) : text;
let masterAdventureEntries=[];
const masterPlanPanel=PLANNING_UI.node('section',null,'panel master-scene-panel');masterPlanPanel.id='master-plan-panel';masterPlanPanel.setAttribute('aria-label','Session Plan');
const masterScenarioPanel=PLANNING_UI.node('section',null,'panel master-scene-panel');masterScenarioPanel.id='master-scenario-panel';masterScenarioPanel.hidden=true;
document.getElementById('master-plan-slot').append(masterPlanPanel);
document.getElementById('master-scenario-slot').append(masterScenarioPanel);
function masterScenarioCommand(type,values={}) {return sendMaster({type,...values,revision:lastState?.sceneMaster?.runtime?.revision});}
function planningSection(parent,title,key) {const details=PLANNING_UI.node('details');details.dataset.planningKey=key;details.append(PLANNING_UI.node('summary',title));parent.append(details);return details;}
function preservePlanningDetails(panel,render) {const open=new Set([...panel.querySelectorAll('details[open]')].map(item=>item.dataset.planningKey));render();panel.querySelectorAll('details').forEach(item=>{item.open=open.has(item.dataset.planningKey);});}
function updateAdventureLibrary(plans){masterAdventureEntries=plans || [];renderMasterAdventure(lastState);}
function renderMasterAdventure(state) {
    const p=PLANNING_UI,previous=masterPlanPanel.querySelector('select')?.value;
    preservePlanningDetails(masterPlanPanel,()=>{
        masterPlanPanel.replaceChildren();const heading=p.node('div',null,'section-heading');heading.append(p.node('h2','Session Plan'));
        const link=p.node('a','Prepare plan ↗','editor-link');link.href='adventure-editor.html';link.target='_blank';link.rel='noopener';heading.append(link);masterPlanPanel.append(heading);
        const controls=p.node('div',null,'form-row'),choice=p.field(controls,'Adventure',previous,{options:Object.fromEntries(masterAdventureEntries.map(plan=>[plan.id,plan.title]))});
        if(!choice.value && masterAdventureEntries.length)choice.value=masterAdventureEntries[0].id;
        const start=p.button('Start adventure',()=>{const plan=masterAdventureEntries.find(plan=>plan.id === choice.value);if(!plan || !confirm(masterPlanningTr('Start “'+plan.title+'”? The first scene will replace the map and resources; heroes will recover in preparation.')))return;sendMaster({type:'MASTER_START_ADVENTURE',adventureId:plan.id,revision:masterSceneRevision});},'primary');start.disabled=!masterAdventureEntries.length || socket.readyState !== WebSocket.OPEN;controls.append(start);masterPlanPanel.append(controls);
        if(!masterAdventureEntries.length)masterPlanPanel.append(p.node('p','Save a session plan in the adventure editor.','muted'));
        const active=state?.adventureMaster;if(!active)return;
        const current=active.steps.find(step=>step.id === active.currentStepId),details=planningSection(masterPlanPanel,active.title+(active.finished ? ' · plan finished' : ' · '+(current?.title || '')),'adventure');
        details.append(p.node('p',active.description,'planning-private'));
        for(const step of active.steps){const row=p.node('div',null,'planning-entry'+(step.id === active.currentStepId ? ' planning-current' : ''));row.append(p.node('strong',(step.id === active.currentStepId ? '▶ ' : active.visited.includes(step.id) ? '✓ ' : '')+step.title),p.node('p',({essential:'Required',optional:'Optional',backup:'Backup'})[step.kind]+' · '+step.minutes+' min.'+(active.results[step.id] ? ' · '+SCENARIO_RULES.outcomes[active.results[step.id]] : ''),'muted'));if(step.id === active.currentStepId)row.append(p.node('p',step.notes,'planning-private'));details.append(row);}
        if(active.finished)return;
        const transitions=SCENARIO_RULES.transitions(active,state.sceneMaster?.runtime?.outcome),buttons=p.node('div',null,'planning-actions');
        for(const branch of transitions)buttons.append(p.button('Next: '+branch.title,()=>{if(confirm(masterPlanningTr('Go to the next scene? The map and resources will be replaced; heroes will recover.')))sendMaster({type:'MASTER_ADVENTURE_NEXT',stepId:branch.target,revision:lastState.adventureMaster.revision});},'primary'));
        buttons.append(p.button('Finish plan',()=>{if(confirm(masterPlanningTr('Mark the session plan as finished?')))sendMaster({type:'MASTER_ADVENTURE_FINISH',revision:lastState.adventureMaster.revision});}));details.append(buttons);
        if(!transitions.length)details.append(p.node('p',current?.branches.length ? 'This branch needs a matching scene outcome. Select an outcome in the scenario panel.' : 'This is the last scene in the sequence.','muted'));
        const jump=p.field(details,'Manual transition, including backup scenes',active.currentStepId,{options:Object.fromEntries(active.steps.map(step=>[step.id,step.title]))});details.append(p.button('Open selected step',()=>{if(confirm(masterPlanningTr('Open the selected step regardless of branches? The map and resources will be replaced.')))sendMaster({type:'MASTER_ADVENTURE_GOTO',stepId:jump.value,revision:lastState.adventureMaster.revision});}));
    });
}
function renderMasterPlanning(state) {
    renderMasterAdventure(state);
    const scene=state.sceneMaster,runtime=scene?.runtime,p=PLANNING_UI;
    masterScenarioPanel.hidden=!runtime;if(!runtime)return;
    preservePlanningDetails(masterScenarioPanel,()=>{
        masterScenarioPanel.replaceChildren();const heading=p.node('div',null,'section-heading');heading.append(p.node('h2','Scenario · '+SCENARIO_RULES.kinds[scene.kind || 'combat']),p.node('strong',runtime.outcome ? SCENARIO_RULES.outcomes[runtime.outcome] : 'Round '+(state.roundCounter || 0),'planning-status'));masterScenarioPanel.append(heading);
        for(const card of scene.cards || [])if(card.kind === 'boss'){
            const phase=card.phases.find(phase=>phase.id === runtime.bossPhases[card.id]);
            if(phase)masterScenarioPanel.append(p.node('p','Boss phase · '+card.title+': '+phase.title+' (HP ≤ '+phase.threshold+'%)','planning-status'));
        }
        for(const counter of scene.scenario.counters){const row=p.node('div',null,'planning-counter');row.append(p.node('strong',counter.title+' · '+runtime.counters[counter.id]+' / '+counter.target));
            for(const [label,amount] of [['−1',-1],['+1',1]]){const button=p.button(label,()=>{const current=lastState.sceneMaster.runtime;masterScenarioCommand('MASTER_SCENE_COUNTER',{counterId:counter.id,value:current.counters[counter.id]+amount});});button.disabled=runtime.counters[counter.id]+amount < 0 || runtime.counters[counter.id]+amount > 1000000;row.append(button);}
            row.append(p.button('Set',()=>{const d=p.dialog(counter.title,'Apply to scene'),value=p.field(d.body,'Counter value',lastState.sceneMaster.runtime.counters[counter.id],{type:'number',min:0,max:1000000,step:1,required:true});d.show(()=>{if(!masterScenarioCommand('MASTER_SCENE_COUNTER',{counterId:counter.id,value:Number(value.value)}))throw new Error('Disconnected');});}));masterScenarioPanel.append(row);
        }
        const pending=scene.scenario.events.filter(event=>['pending','error'].includes(runtime.events[event.id]?.status));
        for(const event of pending)masterScenarioPanel.append(renderLiveEvent(event,runtime.events[event.id],scene));
        const goals=planningSection(masterScenarioPanel,'Scene objectives · '+scene.scenario.goals.filter(goal=>runtime.goals[goal.id].status === 'completed').length+'/'+scene.scenario.goals.length,'goals');
        for(const goal of scene.scenario.goals){const row=p.node('article',null,'planning-entry');row.append(p.node('strong',goal.title+' · '+SCENARIO_RULES.statuses[runtime.goals[goal.id].status]),p.node('p',p.conditionText(goal.success,scene)+(goal.failure ? ' · failure: '+p.conditionText(goal.failure,scene) : ''),'muted'),p.node('p',goal.description,'planning-private'));const actions=p.node('div',null,'planning-actions');for(const [status,title] of Object.entries(SCENARIO_RULES.statuses)){const button=p.button(title,()=>masterScenarioCommand('MASTER_SCENE_GOAL',{goalId:goal.id,status}));button.disabled=runtime.goals[goal.id].status === status;actions.append(button);}row.append(actions);goals.append(row);}
        const result=planningSection(masterScenarioPanel,'Choose outcome manually','outcome');for(const [outcome,title] of Object.entries(SCENARIO_RULES.outcomes))result.append(p.button(title,()=>{if(confirm(masterPlanningTr('End scene: '+masterPlanningTr(title)+'? Players will see the outcome text.')))masterScenarioCommand('MASTER_SCENE_OUTCOME',{outcome});}));
        if(runtime.outcomeText)result.append(p.node('p',runtime.outcomeText,'planning-private'));
        const events=planningSection(masterScenarioPanel,'All events · '+scene.scenario.events.length,'events');for(const event of scene.scenario.events)events.append(renderLiveEvent(event,runtime.events[event.id],scene));
        const cards=planningSection(masterScenarioPanel,'GM cards · '+(scene.cards || []).length,'cards');
        for(const card of scene.cards || []){
            const detail=planningSection(cards,card.title+(runtime.usedCards.includes(card.id) ? ' · used' : ''),'card-'+card.id);detail.append(p.node('p',SCENARIO_RULES.cardKinds[card.kind],'muted'));
            const labels=card.kind === 'npc' ? {role:'Role',motivation:'Goal',personality:'Personality',information:'Known information',help:'Conditions for helping',surrender:'Surrender conditions',notes:'Secrets and notes'} : {priority:'Target priority',opening:'Combat opening',retreat:'Retreat',surrender:'Surrender',notes:'Notes'};
            for(const [key,title] of Object.entries(labels))if(card[key]){detail.append(p.node('strong',title),p.node('p',card[key],'planning-private'));}
            if(card.kind === 'boss')for(const phase of card.phases){const row=p.node('div',null,'planning-entry'+(runtime.bossPhases[card.id] === phase.id ? ' planning-current' : ''));row.append(p.node('strong',phase.title+' · HP ≤ '+phase.threshold+'%'),p.node('p',phase.description,'planning-private'),p.button(runtime.bossPhases[card.id] === phase.id ? 'Current phase' : 'Switch phase',()=>masterScenarioCommand('MASTER_BOSS_PHASE',{cardId:card.id,phaseId:phase.id})));detail.append(row);}
            detail.append(p.button(runtime.usedCards.includes(card.id) ? 'Mark unused' : 'Mark used',()=>masterScenarioCommand('MASTER_CARD_USED',{cardId:card.id,used:!lastState.sceneMaster.runtime.usedCards.includes(card.id)})));
        }
    });
}
function renderLiveEvent(event,entry,scene){
    const p=PLANNING_UI,row=p.node('article',null,'planning-entry');row.append(p.node('strong',event.title+' · '+({waiting:'pending',pending:'needs confirmation',done:'completed',skipped:'skipped',error:'error'})[entry.status]),p.node('p',p.conditionText(event.condition,scene),'muted'));
    if(event.notes)row.append(p.node('p',event.notes,'planning-private'));if(entry.error)row.append(p.node('p',entry.error,'note-error'));
    const preview=planningSection(row,'Event actions · '+event.actions.length,'event-'+event.id),list=p.node('ul');for(const action of event.actions)list.append(p.node('li',p.actionText(action,scene),'planning-private'));preview.append(list);
    if(!['done','skipped'].includes(entry.status)){const actions=p.node('div',null,'planning-actions');if(entry.status !== 'waiting' || event.condition.kind === 'manual')actions.append(p.button(entry.status === 'error' ? 'Retry' : 'Apply event',()=>{if(confirm(masterPlanningTr('Apply event “'+event.title+'”? Actions: '+event.actions.length)))masterScenarioCommand('MASTER_SCENE_EVENT',{eventId:event.id,action:'apply'});},'primary'));actions.append(p.button('Skip',()=>{if(confirm(masterPlanningTr('Skip event “'+event.title+'”?')))masterScenarioCommand('MASTER_SCENE_EVENT',{eventId:event.id,action:'skip'});}));row.append(actions);}return row;
}
socket.addEventListener('close',()=>renderMasterAdventure(lastState));
