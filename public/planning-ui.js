'use strict';
const PLANNING_UI = (() => {
    let fieldSequence = 0;
    const _tr = text => (typeof window !== 'undefined' && window.KR_I18N && typeof window.KR_I18N.t === 'function' ? window.KR_I18N.t(text) : text);
    function node(tag,text,className) { const element=document.createElement(tag); if(text != null)element.textContent=_tr(text); if(className)element.className=className; return element; }
    function button(text,action,className='') { const element=node('button',text,className); element.type='button'; element.onclick=action; return element; }
    function field(parent,label,value,options={}) {
        const wrapper=node('label',label), input=document.createElement(options.options ? 'select' : options.type === 'textarea' ? 'textarea' : 'input');
        input.id='planning-field-'+(++fieldSequence); wrapper.htmlFor=input.id;
        if(options.options) for(const [key,title] of Object.entries(options.options)) input.add(new Option(_tr(title),key));
        else if(options.type === 'textarea') { input.rows=options.rows || 3; input.maxLength=options.maxLength || 4000; }
        else { input.type=options.type || 'text'; if(input.type !== 'checkbox' && input.type !== 'number')input.maxLength=options.maxLength || 160; }
        if(input.type === 'checkbox') { input.checked=!!value; wrapper.className='planning-checkbox'; }
        else input.value=value ?? '';
        for(const key of ['min','max','step','required']) if(options[key] !== undefined) input[key]=options[key];
        wrapper.append(input); parent.append(wrapper); return input;
    }
    function value(input) { return input.type === 'checkbox' ? input.checked : input.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value; }
    function dialog(title,saveLabel='Save in draft') {
        const modal=node('dialog',null,'planning-dialog'),form=node('form'),heading=node('div',null,'section-heading');
        heading.append(node('h2',title),button('✕',close));
        const body=node('div',null,'planning-form'),error=node('p',null,'note-error'),actions=node('div',null,'button-row'); error.hidden=true;
        const save=node('button',saveLabel,'primary'); save.type='submit'; actions.append(save,button('Cancel',close));
        form.append(heading,body,error,actions);modal.append(form);document.body.append(modal);
        let dirty=false,submitting=false;
        const unload=event=>{if(dirty){event.preventDefault();event.returnValue='';}};
        function close() { if(dirty && !confirm('Discard changes in this form?'))return; modal.close(); }
        form.addEventListener('input',()=>{dirty=true;});
        modal.addEventListener('cancel',event=>{event.preventDefault();close();});
        modal.addEventListener('close',()=>{window.removeEventListener('beforeunload',unload);modal.remove();});
        window.addEventListener('beforeunload',unload);
        return {body,modal,show(callback) {form.onsubmit=event=>{event.preventDefault();if(submitting || !form.reportValidity())return;try{submitting=true;callback();dirty=false;modal.close();}catch(e){error.textContent=e.message;error.hidden=false;}finally{submitting=false;}};modal.showModal();},error(message){error.textContent=message;error.hidden=false;}};
    }
    function conditionText(rule,scene) {
        if(!rule)return _tr('No');
        const find=(items,id)=>items.find(item=>item.id === id)?.title || id;
        const enemy=rule.enemyType ? (GAME_DATA.enemies[rule.enemyType]?.name || rule.enemyType) : '';
        switch(rule.kind) {
            case 'round':return _tr('Round completed ')+rule.value;
            case 'counter':return find(scene.scenario.counters,rule.counterId)+(rule.operator === 'lte' ? ' ≤ ' : ' ≥ ')+rule.value;
            case 'baseHp':return _tr('Base health')+(rule.operator === 'lte' ? ' ≤ ' : ' ≥ ')+rule.value;
            case 'defeated':return _tr('Defeated: ')+enemy+' × '+rule.count;
            case 'enemyHp':return enemy+': HP ≤ '+rule.percent+'%';
            case 'goal':return find(scene.scenario.goals,rule.goalId)+': '+_tr(SCENARIO_RULES.statuses[rule.status]);
            default:return _tr(SCENARIO_RULES.conditions[rule.kind] || rule.kind);
        }
    }
    function actionText(action,scene) {
        const enemy=action.enemyType ? (GAME_DATA.enemies[action.enemyType]?.name || action.enemyType) : '';
        switch(action.kind) {
            case 'spawn':return _tr('Reinforcement: ')+enemy+' × '+action.count+' '+_tr('at cell ')+action.x+','+action.y;
            case 'wave':return _tr('Launch: ')+(scene.waves.find(wave=>wave.waveNum === action.waveNum)?.title || action.waveNum);
            case 'cell':return _tr('Cell ')+action.x+','+action.y+' → '+_tr(({road:'Road / open passage',empty:'Grass / closed passage',slot:'Tower slot'})[action.cellType]);
            case 'counter':return (scene.scenario.counters.find(item=>item.id === action.counterId)?.title || action.counterId)+(action.operation === 'set' ? ' = ' : action.value >= 0 ? ' + ' : ' − ')+Math.abs(action.value);
            case 'note':return (action.revealed ? _tr('Reveal note: ') : _tr('Hide note: '))+(scene.notes.find(item=>item.id === action.noteId)?.title || action.noteId);
            case 'goal':return (scene.scenario.goals.find(item=>item.id === action.goalId)?.title || action.goalId)+' → '+_tr(SCENARIO_RULES.statuses[action.status]);
            case 'finish':return _tr('End scene: ')+_tr(SCENARIO_RULES.outcomes[action.outcome]);
            case 'message':return _tr('Tell players: ')+action.text;
            default:return action.kind;
        }
    }
    function ruleForm(container,source,scene,action=false) {
        let current={...source},fields={};
        const options=action ? SCENARIO_RULES.actions : SCENARIO_RULES.conditions;
        const type=field(container,action ? 'Action' : 'Condition',current.kind,{options});
        const body=node('div',null,'planning-form');container.append(body);
        const optionsFor=(items,key='id')=>Object.fromEntries(items.map(item=>[item[key],item.title]));
        function add(key,label,fallback,opts) { fields[key]=field(body,label,current[key] ?? fallback,opts); }
        function build() {
            fields={};body.replaceChildren();const kind=type.value;
            const number={type:'number',min:0,max:1000000,step:1,required:true};
            if(['counter','baseHp'].includes(kind) && !action) { add('operator','Comparison','gte',{options:{gte:'At least (≥)',lte:'At most (≤)'}}); add('value','Threshold',1,number); }
            if(kind === 'round')add('value','Round number',3,{...number,min:1,max:10000});
            if(kind === 'counter')add('counterId','Counter',scene.scenario.counters[0]?.id || '',{options:optionsFor(scene.scenario.counters),required:true});
            if(['defeated','enemyHp','spawn'].includes(kind))add('enemyType','Enemy type',Object.keys(GAME_DATA.enemies)[0],{options:Object.fromEntries(Object.entries(GAME_DATA.enemies).map(([id,mob])=>[id,mob.name])),required:true});
            if(kind === 'defeated')add('count','Defeats required',1,{...number,min:1,max:100000});
            if(kind === 'enemyHp')add('percent','HP threshold, %',50,{...number,min:1,max:100});
            if(kind === 'goal') {add('goalId','Goal',scene.scenario.goals[0]?.id || '',{options:optionsFor(scene.scenario.goals),required:true});add('status','Objective state','completed',{options:SCENARIO_RULES.statuses});}
            if(!action)return;
            if(['spawn','cell'].includes(kind)) { add('x','X coordinate',0,{...number,max:scene.gridWidth-1});add('y','Y coordinate',0,{...number,max:scene.gridHeight-1}); }
            if(kind === 'spawn')add('count','Reinforcement size',3,{...number,min:1,max:200});
            if(kind === 'cell')add('cellType','New cell type','road',{options:{road:'Road / open passage',empty:'Grass / closed passage',slot:'Tower slot'}});
            if(kind === 'wave')add('waveNum','Scene wave',scene.waves[0]?.waveNum || '',{options:optionsFor(scene.waves,'waveNum'),required:true});
            if(kind === 'counter') {add('operation','Operation','add',{options:{add:'Add / subtract',set:'Set'}});add('value','Value',1,{...number,min:-1000000});}
            if(kind === 'note') {add('noteId','Note',scene.notes[0]?.id || '',{options:optionsFor(scene.notes),required:true});add('revealed','Show to players',true,{type:'checkbox'});}
            if(kind === 'finish')add('outcome','Scene outcome','success',{options:SCENARIO_RULES.outcomes});
            if(kind === 'message')add('text','Player text','',{type:'textarea',maxLength:2000,required:true});
        }
        type.onchange=()=>{current={kind:type.value};build();};build();
        return {read(){const result={kind:type.value,...Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,value(input)]))};if(action && result.kind === 'wave')result.waveNum=Number(result.waveNum);return result;}};
    }
    return {node,button,field,value,dialog,conditionText,actionText,ruleForm};
})();
