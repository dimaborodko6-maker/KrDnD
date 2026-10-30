var _tr = typeof _tr !== 'undefined' ? _tr : (text => (typeof window !== 'undefined' && window.KR_I18N ? window.KR_I18N.t(text) : text));
'use strict';
const planEl=id=>document.getElementById(id), planCopy=value=>JSON.parse(JSON.stringify(value)), planUI=PLANNING_UI;
let planLibrary=[],planScenes=[],planRevision=-1,planDraft=null,planDirty=false,planSaving=false,planOnline=false,planConflict=false,planReload=false,planSocket;
function planNotice(message,error=false){planEl('plan-notice').textContent=message;planEl('plan-notice').hidden=!message;planEl('plan-notice').classList.toggle('error',error);}
function planControls(){
    planEl('plan-empty').hidden=!!planDraft;planEl('plan-fields').hidden=!planDraft;planEl('plan-fields').disabled=!planDraft || planSaving;
    planEl('new-plan').disabled=planRevision < 0 || planSaving;planEl('copy-plan').disabled=!planDraft || planSaving;
    planEl('save-plan').disabled=!planDraft || !planDirty || !planOnline || planSaving || planConflict;
    planEl('delete-plan').disabled=!planDraft || !planOnline || planSaving || planConflict || !planLibrary.some(plan=>plan.id === planDraft.id);
    planEl('reload-plans').disabled=planSaving;
    planEl('plan-save-state').textContent=planSaving ? _tr('Saving…') : planConflict ? _tr('The library changed in another window') : planDirty ? _tr('You have unsaved changes') : planRevision < 0 ? _tr('Loading…') : _tr('Saved · version ')+planRevision;
}
function changePlan(){planDirty=true;planControls();planDuration();}
function discardPlan(){return !planDirty || confirm(_tr('Discard unsaved plan changes?'));}
function sendPlan(message){if(!planOnline){planNotice('No connection. Your draft remains in this window.',true);return false;}planSocket.send(JSON.stringify(message));return true;}
function connectPlan(){
    planSocket=new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://')+location.host);window.KR_DIAGNOSTICS?.trackSocket(planSocket);
    planSocket.onopen=()=>{planOnline=true;planEl('plan-connection').textContent=_tr('connected');sendPlan({type:'REGISTER_SCENE_EDITOR'});planControls();};
    planSocket.onclose=()=>{planOnline=false;planSaving=false;planEl('plan-connection').textContent=_tr('disconnected');planNotice('Connection lost. Your changes remain in this window. Click “Load from server” to reconnect.',true);planControls();};
    planSocket.onmessage=event=>{
        const message=JSON.parse(event.data);
        if(message.type === 'COMMAND_ERROR'){planSaving=false;planNotice(message.message,true);planControls();return;}
        if(message.type !== 'SCENE_LIBRARY')return;
        if(planDirty && !planReload && message.reason !== 'saved'){
            if(message.revision !== planRevision){planConflict=true;planNotice('The library was changed in another window. Load the latest version before saving. Your draft remains here for now.',true);}planControls();return;
        }
        const selected=planDraft?.id;planScenes=message.scenes;planLibrary=message.adventures || [];planRevision=message.revision;
        planDraft=planCopy(planLibrary.find(plan=>plan.id === selected) || planLibrary[0] || null);
        planDirty=planSaving=planConflict=planReload=false;renderPlan();planNotice(message.reason === 'saved' ? 'Plan saved. You can launch it from the GM dashboard.' : '');
    };
}
function planDuration(){if(!planDraft)return;const main=planDraft.steps.filter(step=>step.kind !== 'backup').reduce((sum,step)=>sum+(step.minutes || 0),0),backup=planDraft.steps.filter(step=>step.kind === 'backup').reduce((sum,step)=>sum+(step.minutes || 0),0);planEl('plan-duration').textContent=_tr('Estimated time: ')+main+_tr(' min. · backup scenes: ')+backup+_tr(' min.');}
function renderPlan(){
    planControls();const list=planEl('plan-list');list.replaceChildren();
    for(const plan of planLibrary){const button=planUI.button('',()=>{if(planSaving || !discardPlan())return;planDraft=planCopy(plan);planDirty=false;renderPlan();});button.className='scene-entry';button.setAttribute('aria-pressed',String(plan.id === planDraft?.id));button.append(planUI.node('strong',plan.title),planUI.node('span',_tr('Scenes: ')+plan.steps.length,'muted'));list.append(button);}
    if(!planLibrary.length)list.textContent=_tr('No saved adventures yet.');
    if(!planDraft)return;
    planEl('plan-title').value=planDraft.title;planEl('plan-description').value=planDraft.description;planEl('plan-heading').textContent=planDraft.title;
    const choice=planEl('plan-scene-choice');choice.replaceChildren();for(const scene of planScenes)choice.add(new Option(scene.title+' · '+_tr(SCENARIO_RULES.kinds[scene.kind || 'combat']),scene.id));
    planEl('add-plan-step').disabled=!planScenes.length;planDuration();renderPlanSteps();
}
function renderPlanSteps(){
    const container=planEl('plan-steps');container.replaceChildren();
    planDraft.steps.forEach((step,index)=>{
        const article=planUI.node('article',null,'planning-entry'),head=planUI.node('div',null,'section-heading');head.append(planUI.node('h3',(index+1)+'. '+step.title));
        const controls=planUI.node('div',null,'button-row');
        for(const [title,delta] of [['↑',-1],['↓',1]]){const button=planUI.button(title,()=>{[planDraft.steps[index],planDraft.steps[index+delta]]=[planDraft.steps[index+delta],planDraft.steps[index]];changePlan();renderPlanSteps();});button.disabled=index+delta < 0 || index+delta >= planDraft.steps.length;button.setAttribute('aria-label',delta < 0 ? 'Move scene up' : 'Move scene down');controls.append(button);}
        controls.append(planUI.button('Remove step',()=>{if(!confirm(_tr('Remove this step and all transitions leading to it?')))return;planDraft.steps.splice(index,1);for(const other of planDraft.steps)other.branches=other.branches.filter(branch=>branch.target !== step.id);changePlan();renderPlanSteps();},'danger-outline'));head.append(controls);article.append(head);
        const fields=planUI.node('div',null,'scene-text-fields');
        const title=planUI.field(fields,'Step title',step.title,{required:true}),kind=planUI.field(fields,'Scene importance',step.kind,{options:{essential:'Required',optional:'Optional',backup:'Backup'}}),minutes=planUI.field(fields,'Duration, minutes',step.minutes,{type:'number',min:0,max:300,step:1,required:true}),scene=planUI.field(fields,'Scene template',step.sceneId,{options:Object.fromEntries(planScenes.map(scene=>[scene.id,scene.title])),required:true});
        title.oninput=()=>{step.title=title.value;changePlan();head.querySelector('h3').textContent=(index+1)+'. '+step.title;};kind.onchange=()=>{step.kind=kind.value;changePlan();};minutes.oninput=()=>{step.minutes=Number(minutes.value);changePlan();};scene.onchange=()=>{step.sceneId=scene.value;changePlan();};article.append(fields);
        const notes=planUI.field(article,'GM notes for this encounter',step.notes,{type:'textarea'});notes.oninput=()=>{step.notes=notes.value;changePlan();};
        const branches=planUI.node('div');article.append(planUI.node('h3','Branches'),branches);
        step.branches.forEach((branch,branchIndex)=>{
            const row=planUI.node('section',null,'planning-rule'),branchTitle=planUI.field(row,'Transition title',branch.title,{required:true}),outcome=planUI.field(row,'Available on outcome',branch.outcome,{options:{any:'Any / GM decision',...SCENARIO_RULES.outcomes}}),target=planUI.field(row,'Destination',branch.target,{options:Object.fromEntries(planDraft.steps.filter(other=>other.id !== step.id).map(other=>[other.id,other.title])),required:true});
            branchTitle.oninput=()=>{branch.title=branchTitle.value;changePlan();};outcome.onchange=()=>{branch.outcome=outcome.value;changePlan();};target.onchange=()=>{branch.target=target.value;changePlan();};
            row.append(planUI.button('Remove transition',()=>{step.branches.splice(branchIndex,1);changePlan();renderPlanSteps();},'danger-outline'));branches.append(row);
        });
        const add=planUI.button('＋ Branch',()=>{const target=planDraft.steps.find(other=>other.id !== step.id);if(!target || step.branches.length >= 8){planNotice('A branch needs another scene; up to 8 transitions per step.',true);return;}step.branches.push({id:sceneNewId(),title:'Go to: '+target.title,target:target.id,outcome:'any'});changePlan();renderPlanSteps();});article.append(add);container.append(article);
    });
    if(!planDraft.steps.length)container.append(planUI.node('p','Add at least one saved scene.','muted'));
}
planEl('plan-title').oninput=event=>{planDraft.title=event.target.value;planEl('plan-heading').textContent=planDraft.title;changePlan();};
planEl('plan-description').oninput=event=>{planDraft.description=event.target.value;changePlan();};
planEl('new-plan').onclick=()=>{if(!discardPlan())return;planDraft={id:sceneNewId(),title:'New adventure',description:'',steps:[]};planDirty=true;renderPlan();};
planEl('copy-plan').onclick=()=>{planDraft=planCopy(planDraft);planDraft.id=sceneNewId();planDraft.title=(planDraft.title+' — copy').slice(0,160);planDirty=true;renderPlan();};
planEl('add-plan-step').onclick=()=>{const scene=planScenes.find(scene=>scene.id === planEl('plan-scene-choice').value);if(!scene)return;if(planDraft.steps.length >= 100){planNotice('No more than 100 steps.',true);return;}planDraft.steps.push({id:sceneNewId(),sceneId:scene.id,title:scene.title,kind:'essential',minutes:20,notes:'',branches:[]});changePlan();renderPlanSteps();};
planEl('save-plan').onclick=()=>{if(planSaving || planConflict || !planEl('plan-fields'))return;if(![...planEl('plan-fields').querySelectorAll('input,textarea,select')].every(input=>input.reportValidity()))return;if(sendPlan({type:'ADVENTURE_SAVE',adventure:planDraft,revision:planRevision})){planSaving=true;planControls();}};
planEl('delete-plan').onclick=()=>{if(!confirm(_tr('Delete plan “'+planDraft.title+'” from the library? The active session will be preserved.')))return;if(sendPlan({type:'ADVENTURE_DELETE',adventureId:planDraft.id,revision:planRevision})){planSaving=true;planControls();}};
planEl('reload-plans').onclick=()=>{if(!discardPlan())return;planReload=true;if(!planOnline)connectPlan();else sendPlan({type:'SCENE_GET_LIBRARY'});};
window.addEventListener('beforeunload',event=>{if(planDirty){event.preventDefault();event.returnValue='';}});
planControls();connectPlan();
