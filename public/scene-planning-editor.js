'use strict';
function renderScenePlanning() {
    if(!sceneDraft)return;
    sceneDraft.kind ||= 'combat';
    sceneDraft.scenario ||= SCENARIO_RULES.normalize(undefined,{data:GAME_DATA,width:sceneDraft.gridWidth,height:sceneDraft.gridHeight,waves:sceneDraft.waves,notes:sceneDraft.notes});
    sceneDraft.cards ||= [];
    const p=PLANNING_UI,scenario=sceneDraft.scenario;
    sceneEl('scene-kind').value=sceneDraft.kind;
    const region=sceneEl('scene-planning');region.replaceChildren();
    const counters=p.node('div',null,'planning-list'),goals=p.node('div',null,'planning-list');
    function entry(container,title,detail,edit,remove) {const row=p.node('article',null,'planning-entry');row.append(p.node('strong',title),p.node('p',detail,'muted'));const buttons=p.node('div',null,'button-row');buttons.append(p.button('Edit',edit),p.button('Delete',remove,'danger-outline'));row.append(buttons);container.append(row);}
    function removeItem(key,id) {
        if(!confirm('Delete entry from draft?'))return;
        const candidate=sceneClone(scenario);candidate[key]=candidate[key].filter(item=>item.id !== id);
        try {validateScenePlanning(candidate);sceneDraft.scenario=candidate;sceneChanged();renderScenePlanning();}catch(error){sceneNotify('Remove references to this entry first. '+error.message,true);}
    }
    const heading=p.node('div',null,'section-heading');heading.append(p.node('h2','Objectives and counters'),p.button('＋ Objective',()=>editSceneGoal()),p.button('＋ Counter',()=>editSceneCounter()));region.append(heading);
    for(const item of scenario.counters)entry(counters,item.title,'Start: '+item.initial+' · target: '+item.target+' · '+(item.visible ? 'visible to players' : 'GM only'),()=>editSceneCounter(item),()=>removeItem('counters',item.id));
    for(const item of scenario.goals)entry(goals,item.title,(item.required ? 'Primary' : 'Secondary')+' · '+p.conditionText(item.success,sceneDraft)+' · '+(item.visible ? 'visible to players' : 'hidden'),()=>editSceneGoal(item),()=>removeItem('goals',item.id));
    region.append(counters,goals);if(!scenario.goals.length && !scenario.counters.length)region.append(p.node('p','Add an objective such as “Hold the Bridge” or a counter for rescued villagers.','muted'));
    const endings=p.node('details'),summary=p.node('summary','Scene outcomes');endings.append(summary);
    const auto=p.field(endings,'Determine outcome automatically from primary objectives',scenario.autoResolve,{type:'checkbox'});auto.onchange=()=>{scenario.autoResolve=auto.checked;sceneChanged();};
    endings.append(p.node('p','Full success: all primary objectives completed. Partial success: all primary objectives resolved, some completed and some failed. Defeat: all primary objectives failed. The GM can choose an outcome manually.','muted'));
    for(const [key,title] of Object.entries(SCENARIO_RULES.outcomes)) {const input=p.field(endings,title+' · player text',scenario.endings[key],{type:'textarea',maxLength:2000});input.oninput=()=>{scenario.endings[key]=input.value;sceneChanged();};}region.append(endings);
    const events=sceneEl('scene-events');events.replaceChildren();
    for(const event of scenario.events)entry(events,event.title,p.conditionText(event.condition,sceneDraft)+' · '+(event.confirm ? 'after GM confirmation' : 'automatically')+' · actions: '+event.actions.length,()=>editSceneEvent(event),()=>removeItem('events',event.id));
    if(!scenario.events.length)events.append(p.node('p','Events trigger reinforcements, open passages, change counters and reveal notes.','muted'));
    const cards=sceneEl('scene-cards');cards.replaceChildren();
    for(const card of sceneDraft.cards)entry(cards,card.title,SCENARIO_RULES.cardKinds[card.kind]+(card.kind === 'boss' ? ' · phases: '+card.phases.length : ''),()=>editSceneCard(card),()=>{if(confirm('Delete card?')){sceneDraft.cards=sceneDraft.cards.filter(item=>item.id !== card.id);sceneChanged();renderScenePlanning();}});
    if(!sceneDraft.cards.length)cards.append(p.node('p','Only the GM can see NPC, tactics and boss phase cards.','muted'));
}
function validateScenePlanning(scenario) {return SCENARIO_RULES.normalize(scenario,{data:GAME_DATA,width:sceneDraft.gridWidth,height:sceneDraft.gridHeight,waves:sceneDraft.waves,notes:sceneDraft.notes});}
function savePlanningItem(key,item) {
    const candidate=sceneClone(sceneDraft.scenario),index=candidate[key].findIndex(entry=>entry.id === item.id);
    if(index < 0)candidate[key].push(item);else candidate[key][index]=item;
    sceneDraft.scenario=validateScenePlanning(candidate);sceneChanged();renderScenePlanning();
}
function editSceneCounter(source) {
    const item=source || {id:sceneNewId(),title:'Rescued villagers',initial:0,target:10,visible:true},p=PLANNING_UI,d=p.dialog('Scene counter');
    const fields={title:p.field(d.body,'Counter title',item.title,{required:true}),initial:p.field(d.body,'Initial value',item.initial,{type:'number',min:0,max:1000000,step:1,required:true}),target:p.field(d.body,'Target value',item.target,{type:'number',min:1,max:1000000,step:1,required:true}),visible:p.field(d.body,'Show to players',item.visible,{type:'checkbox'})};
    d.show(()=>savePlanningItem('counters',{id:item.id,...Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,p.value(input)]))}));
}
function editSceneGoal(source) {
    const item=source || {id:sceneNewId(),title:'Hold the Bridge',description:'',required:true,visible:true,success:{kind:'round',value:6},failure:null},p=PLANNING_UI,d=p.dialog('Scene objective');
    const fields={title:p.field(d.body,'Objective title',item.title,{required:true}),description:p.field(d.body,'Player description, if objective is revealed',item.description,{type:'textarea',maxLength:2000}),required:p.field(d.body,'Primary objective',item.required,{type:'checkbox'}),visible:p.field(d.body,'Show to players',item.visible,{type:'checkbox'})};
    const successBox=p.node('section',null,'planning-rule');successBox.append(p.node('h3','When objective is completed'));d.body.append(successBox);const success=p.ruleForm(successBox,item.success,sceneDraft);
    const useFailure=p.field(d.body,'Add failure condition',!!item.failure,{type:'checkbox'}),failureBox=p.node('section',null,'planning-rule');d.body.append(failureBox);const failure=p.ruleForm(failureBox,item.failure || {kind:'baseHp',operator:'lte',value:0},sceneDraft);useFailure.onchange=()=>{failureBox.hidden=!useFailure.checked;failureBox.querySelectorAll('input,select,textarea').forEach(input=>{input.disabled=!useFailure.checked;});};useFailure.onchange();
    d.show(()=>savePlanningItem('goals',{id:item.id,...Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,p.value(input)])),success:success.read(),failure:useFailure.checked ? failure.read() : null}));
}
function editSceneEvent(source) {
    const item=source ? sceneClone(source) : {id:sceneNewId(),title:'Reinforcement',notes:'',confirm:true,condition:{kind:'round',value:3},actions:[{kind:'spawn',enemyType:Object.keys(GAME_DATA.enemies)[0],count:3,x:0,y:0}]},p=PLANNING_UI,d=p.dialog('Scene event');
    const title=p.field(d.body,'Event title · GM only',item.title,{required:true}),notes=p.field(d.body,'GM hint',item.notes,{type:'textarea',maxLength:2000}),confirmField=p.field(d.body,'Apply after GM confirmation',item.confirm,{type:'checkbox'});
    const conditionBox=p.node('section',null,'planning-rule');d.body.append(conditionBox);const condition=p.ruleForm(conditionBox,item.condition,sceneDraft);
    const actionsBox=p.node('section');d.body.append(actionsBox);let readers=[];
    function collect(){if(readers.length)item.actions=readers.map(reader=>reader.read());}
    function draw(){actionsBox.replaceChildren();readers=[];item.actions.forEach((action,index)=>{const box=p.node('section',null,'planning-rule');box.append(p.node('h3','Action '+(index+1)),p.button('Remove action',()=>{collect();item.actions.splice(index,1);draw();},'danger-outline'));actionsBox.append(box);readers.push(p.ruleForm(box,action,sceneDraft,true));});}
    draw();d.body.append(p.button('＋ Action',()=>{collect();if(item.actions.length >= 10){d.error('No more than 10 actions');return;}item.actions.push({kind:'message',text:''});draw();}));
    d.show(()=>{collect();savePlanningItem('events',{id:item.id,title:title.value,notes:notes.value,confirm:confirmField.checked,condition:condition.read(),actions:item.actions});});
}
function editSceneCard(source) {
    const kind=source?.kind || sceneEl('scene-card-kind').value,item=source ? sceneClone(source) : {id:sceneNewId(),kind,title:kind === 'npc' ? 'Village elder' : kind === 'boss' ? 'Orc commander' : 'Enemy tactics',phases:[],notes:''},p=PLANNING_UI,d=p.dialog(SCENARIO_RULES.cardKinds[kind]);
    const fields={title:p.field(d.body,'Card title',item.title,{required:true})};
    const labels=kind === 'npc' ? {role:'Role in adventure',motivation:'Goal and motivation',personality:'Personality and speech',information:'Known information',help:'Conditions for helping',surrender:'Surrender / concession conditions'} : kind === 'tactics' ? {priority:'Target priority',opening:'Actions at combat start',retreat:'When to retreat',surrender:'When to surrender'} : {};
    if(kind !== 'npc')fields.enemyType=p.field(d.body,'Linked enemy type',item.enemyType || '',{options:{'':'Unlinked',...Object.fromEntries(Object.entries(GAME_DATA.enemies).map(([id,mob])=>[id,mob.name]))}});
    for(const [key,label] of Object.entries(labels))fields[key]=p.field(d.body,label,item[key] || '',{type:'textarea',maxLength:2000});
    fields.notes=p.field(d.body,'Secrets and GM notes',item.notes,{type:'textarea'});
    let phaseReaders=[];
    if(kind === 'boss') {
        const phases=p.node('section');d.body.append(p.node('p','List phases in descending HP threshold order: 100, 50, 20. In play, the GM receives a reminder; enemy stats do not change automatically.','muted'),phases);
        function collect(){if(phaseReaders.length)item.phases=phaseReaders.map(read=>read());}
        function draw(){phases.replaceChildren();phaseReaders=[];item.phases.forEach((phase,index)=>{const row=p.node('section',null,'planning-rule');const title=p.field(row,'Phase title',phase.title,{required:true}),threshold=p.field(row,'HP threshold, %',phase.threshold,{type:'number',min:1,max:100,step:1,required:true}),description=p.field(row,'Tactics, dialogue and reminders',phase.description,{type:'textarea'});row.append(p.button('Remove phase',()=>{collect();item.phases.splice(index,1);draw();},'danger-outline'));phases.append(row);phaseReaders.push(()=>({id:phase.id,title:title.value,threshold:Number(threshold.value),description:description.value}));});}
        draw();d.body.append(p.button('＋ Boss phase',()=>{collect();if(item.phases.length >= 10){d.error('No more than 10 phases');return;}item.phases.push({id:sceneNewId(),title:'Phase '+(item.phases.length+1),threshold:item.phases.length ? Math.max(1,item.phases.at(-1).threshold-25) : 100,description:''});draw();}));
    }
    d.show(()=>{const card={id:item.id,kind,...Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,p.value(input)]))};if(kind === 'boss')card.phases=phaseReaders.map(read=>read());const cards=sceneDraft.cards.filter(entry=>entry.id !== card.id);cards.push(card);sceneDraft.cards=SCENARIO_RULES.cards(cards,{data:GAME_DATA});sceneChanged();renderScenePlanning();});
}
sceneEl('scene-kind').onchange=event=>{sceneDraft.kind=event.target.value;sceneChanged();};
sceneEl('add-scene-event').onclick=()=>editSceneEvent();
sceneEl('add-scene-card').onclick=()=>editSceneCard();
