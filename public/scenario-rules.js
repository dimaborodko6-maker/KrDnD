'use strict';
const SCENARIO_RULES = (() => {
    const conditions = {manual:'GM decision',round:'Round completed',counter:'Counter value',baseHp:'Base health',defeated:'Enemies defeated',enemyHp:'Enemy HP, %',goal:'Objective state',clear:'Map cleared of enemies'};
    const actions = {spawn:'Spawn reinforcements',wave:'Launch scene wave',cell:'Change cell / open passage',counter:'Change counter',note:'Reveal or hide note',goal:'Change objective',finish:'End scene',message:'Message to players'};
    const outcomes = {success:'Full success',partial:'Partial success',failure:'Defeat'};
    const statuses = {pending:'In progress',completed:'Completed',failed:'Failed'};
    const kinds = {combat:'Combat',social:'Conversation',exploration:'Exploration'};
    const cardKinds = {npc:'Character (NPC)',tactics:'Enemy tactics',boss:'Boss and phases'};
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    function integer(value,min,max,label) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}: an integer from ${min} to ${max}`); return value; }
    function text(value,max,label,required=false) { if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label}: text up to ${max} characters${required ? ', not empty' : ''}`); return value.trim(); }
    function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value) || ['__proto__','constructor','prototype'].includes(value)) throw new Error('Invalid scenario ID'); return value; }
    function choice(value,values,label) { if (!Object.hasOwn(values,value)) throw new Error('Invalid value: '+label); return value; }
    function boolean(value,fallback,label) { if (value === undefined) return fallback; if (typeof value !== 'boolean') throw new Error('Invalid flag: '+label); return value; }
    function list(value,max,label) { if (!Array.isArray(value) || value.length > max) throw new Error(`${label}: list of up to ${max} entries`); return value; }
    function unique(items,label) { if (new Set(items.map(item=>item.id)).size !== items.length) throw new Error('Duplicate ID: '+label); }
    function enemy(type,ctx) { id(type); if (ctx.strict !== false && !Object.hasOwn(ctx.data.enemies,type)) throw new Error('Unknown enemy type: '+type); return type; }
    function reference(value,items,label) { id(value); if (!items.some(item=>item.id === value)) throw new Error('Reference not found: '+label); return value; }
    function condition(input,ctx) {
        if (!object(input)) throw new Error('No condition specified');
        const kind = choice(input.kind,conditions,'condition'), result = {kind};
        if (['counter','baseHp'].includes(kind)) { result.operator = choice(input.operator ?? 'gte',{gte:1,lte:1},'comparison'); result.value = integer(input.value,0,1000000,'Threshold'); }
        if (kind === 'round') result.value = integer(input.value,1,10000,'Round');
        if (kind === 'counter') result.counterId = reference(input.counterId,ctx.counters,'counter');
        if (['defeated','enemyHp'].includes(kind)) result.enemyType = enemy(input.enemyType,ctx);
        if (kind === 'defeated') result.count = integer(input.count,1,100000,'Number of defeated enemies');
        if (kind === 'enemyHp') result.percent = integer(input.percent,1,100,'HP threshold, %');
        if (kind === 'goal') { result.goalId = reference(input.goalId,ctx.goals,'objective'); result.status = choice(input.status ?? 'completed',statuses,'objective state'); }
        return result;
    }
    function action(input,ctx) {
        if (!object(input)) throw new Error('No event action specified');
        const kind = choice(input.kind,actions,'action'), result = {kind};
        if (['spawn','cell'].includes(kind)) { result.x = integer(input.x,0,ctx.width-1,'X coordinate'); result.y = integer(input.y,0,ctx.height-1,'Y coordinate'); }
        if (kind === 'spawn') { result.enemyType = enemy(input.enemyType,ctx); result.count = integer(input.count,1,200,'Reinforcement size'); }
        if (kind === 'cell') result.cellType = choice(input.cellType,{empty:1,road:1,slot:1},'event cell');
        if (kind === 'wave') { result.waveNum = integer(input.waveNum,1,10000,'Wave'); if (!ctx.waves.some(wave=>wave.waveNum === result.waveNum)) throw new Error('Event wave is missing from the scene'); }
        if (kind === 'counter') { result.counterId = reference(input.counterId,ctx.counters,'counter'); result.operation = choice(input.operation ?? 'add',{add:1,set:1},'operation'); result.value = integer(input.value,result.operation === 'set' ? 0 : -1000000,1000000,'Counter value'); }
        if (kind === 'note') { result.noteId = reference(input.noteId,ctx.notes,'note'); result.revealed = boolean(input.revealed,true,'note visibility'); }
        if (kind === 'goal') { result.goalId = reference(input.goalId,ctx.goals,'objective'); result.status = choice(input.status,statuses,'objective state'); }
        if (kind === 'finish') result.outcome = choice(input.outcome,outcomes,'outcome');
        if (kind === 'message') result.text = text(input.text,2000,'Message to players',true);
        return result;
    }
    function normalize(input,ctx) {
        input ??= {}; if (!object(input)) throw new Error('Invalid scenario');
        const counters = list(input.counters ?? [],50,'Counters').map(item=>{
            if (!object(item)) throw new Error('Invalid counter');
            return {id:id(item.id),title:text(item.title,160,'Counter title',true),initial:integer(item.initial ?? 0,0,1000000,'Initial value'),target:integer(item.target ?? 1,1,1000000,'Target value'),visible:boolean(item.visible,true,'counter visibility')};
        });
        const sourceGoals = list(input.goals ?? [],50,'Objectives');
        const refs = {...ctx,counters,goals:sourceGoals};
        const goals = sourceGoals.map(item=>{
            if (!object(item)) throw new Error('Invalid objective');
            return {id:id(item.id),title:text(item.title,160,'Objective title',true),description:text(item.description ?? '',2000,'Objective description'),visible:boolean(item.visible,true,'objective visibility'),required:boolean(item.required,true,'required objective'),
                success:condition(item.success ?? {kind:'manual'},refs),failure:item.failure == null ? null : condition(item.failure,refs)};
        });
        unique(counters,'counter'); unique(goals,'objective');
        const visiting = new Set(), visited = new Set();
        function visit(goal) { if (visiting.has(goal.id)) throw new Error('Objectives cannot have circular dependencies'); if (visited.has(goal.id)) return; visiting.add(goal.id); for (const rule of [goal.success,goal.failure]) if (rule?.kind === 'goal') visit(goals.find(item=>item.id === rule.goalId)); visiting.delete(goal.id); visited.add(goal.id); }
        goals.forEach(visit);
        const events = list(input.events ?? [],100,'Events').map(item=>{
            if (!object(item)) throw new Error('Invalid event');
            const eventActions = list(item.actions,10,'Event actions'); if (!eventActions.length) throw new Error('An event needs at least one action');
            return {id:id(item.id),title:text(item.title,160,'Event title',true),notes:text(item.notes ?? '',2000,'Event hint'),confirm:boolean(item.confirm,true,'event confirmation'),condition:condition(item.condition ?? {kind:'manual'},refs),actions:eventActions.map(item=>action(item,refs))};
        }); unique(events,'event');
        const endings = input.endings ?? {}; if (!object(endings)) throw new Error('Invalid scene outcomes');
        return {counters,goals,events,autoResolve:boolean(input.autoResolve,false,'automatic outcome'),endings:Object.fromEntries(Object.keys(outcomes).map(key=>[key,text(endings[key] ?? '',2000,'Outcome text for players')]))};
    }
    function cards(input,ctx) {
        const result = list(input ?? [],100,'GM cards').map(item=>{
            if (!object(item)) throw new Error('Invalid card');
            const kind = choice(item.kind,cardKinds,'card type');
            const card = {id:id(item.id),kind,title:text(item.title,160,'Card title',true),notes:text(item.notes ?? '',4000,'Card notes')};
            if (kind === 'npc') for (const field of ['role','motivation','personality','information','help','surrender']) card[field] = text(item[field] ?? '',2000,'NPC field');
            else {
                card.enemyType = item.enemyType ? enemy(item.enemyType,ctx) : '';
                if (kind === 'tactics') for (const field of ['priority','opening','retreat','surrender']) card[field] = text(item[field] ?? '',2000,'Tactics');
                else {
                    card.phases = list(item.phases ?? [],10,'Boss phases').map(phase=>({id:id(phase.id),title:text(phase.title,160,'Phase title',true),threshold:integer(phase.threshold,1,100,'Phase HP threshold'),description:text(phase.description ?? '',4000,'Phase description')}));
                    unique(card.phases,'phase');
                    if (card.phases.some((phase,index)=>index > 0 && phase.threshold >= card.phases[index-1].threshold)) throw new Error('Boss phase thresholds must decrease, for example 100, 50, 20');
                }
            }
            return card;
        }); unique(result,'card'); return result;
    }
    function transitions(adventure,outcome) {
        const index=adventure.steps.findIndex(step=>step.id === adventure.currentStepId),current=adventure.steps[index];if(!current)return [];
        if(current.branches.length)return current.branches.filter(branch=>branch.outcome === 'any' || branch.outcome === outcome);
        const next=adventure.steps.slice(index+1).find(step=>step.kind !== 'backup');return next ? [{id:next.id,title:next.title,target:next.id,outcome:'any'}] : [];
    }
    return {conditions,actions,outcomes,statuses,kinds,cardKinds,normalize,cards,transitions,integer,text,id,choice,list,unique,boolean};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SCENARIO_RULES;
if (typeof window !== 'undefined') window.SCENARIO_RULES = SCENARIO_RULES;
