'use strict';
const RULES = require('./public/scenario-rules');
module.exports = function createSceneDirector(ctx) {
    const world = () => ctx.getState();
    function ensure() {
        const scene = world().sceneMaster;
        if (!scene?.scenario) return null;
        scene.runtime ||= {revision:0,counters:{},goals:{},events:{},defeated:{},outcome:null,outcomeText:'',usedCards:[],bossPhases:{},battleStarted:false};
        const runtime = scene.runtime;
        for (const counter of scene.scenario.counters) runtime.counters[counter.id] ??= counter.initial;
        for (const goal of scene.scenario.goals) runtime.goals[goal.id] ||= {status:'pending',manual:false};
        for (const event of scene.scenario.events) runtime.events[event.id] ||= {status:'waiting'};
        return runtime;
    }
    function condition(rule, forGoal = false) {
        const state = world(), runtime = ensure(); if (!runtime || !rule) return false;
        const compare = value => rule.operator === 'lte' ? value <= rule.value : value >= rule.value;
        switch (rule.kind) {
            case 'manual': return false;
            case 'round': return (state.roundCounter || 0) >= rule.value;
            case 'counter': return compare(runtime.counters[rule.counterId] || 0);
            case 'baseHp': return compare(state.baseHp);
            case 'defeated': return (runtime.defeated[rule.enemyType] || 0) >= rule.count;
            case 'enemyHp': return state.enemies.some(enemy=>enemy.type === rule.enemyType && enemy.hp > 0 && enemy.hp*100 <= (enemy.maxHp || enemy.hp)*rule.percent);
            case 'goal': return runtime.goals[rule.goalId]?.status === rule.status;
            case 'clear': return runtime.battleStarted && !state.enemies.some(enemy=>enemy.hp > 0) && !(state.pendingSpawns || []).length &&
                (!forGoal || !state.sceneMaster.scenario.events.some(event=>!['done','skipped'].includes(runtime.events[event.id].status) && event.actions.some(action=>['spawn','wave'].includes(action.kind))));
            default: return false;
        }
    }
    function finish(outcome) {
        const runtime = ensure(); RULES.choice(outcome,RULES.outcomes,'outcome');
        runtime.outcome = outcome; runtime.outcomeText = world().sceneMaster.scenario.endings[outcome] || '';
        const adventure = world().adventureMaster;
        if (adventure) { adventure.results[adventure.currentStepId] = outcome; adventure.revision++; }
    }
    function preflight(event) {
        const state = world(), scene = state.sceneMaster, runtime = ensure();
        const counters = {...runtime.counters}; let additions = 0;
        for (const action of event.actions) {
            if (action.kind === 'spawn') {
                if (!Object.hasOwn(ctx.getData().enemies,action.enemyType)) throw new Error('Reinforcement type was removed from the catalog');
                if (!state.grid[action.y]?.[action.x]) throw new Error('Reinforcement cell is outside the map');
                additions += action.count;
            }
            if (action.kind === 'wave') {
                const wave = scene.waves.find(wave=>wave.waveNum === action.waveNum);
                if (!wave || wave.enemies.some(group=>!Object.hasOwn(ctx.getData().enemies,group.type))) throw new Error('The event wave or its enemy type is unavailable');
                additions += wave.enemies.reduce((sum,group)=>sum+group.count,0);
            }
            if (action.kind === 'cell' && !state.grid[action.y]?.[action.x]) throw new Error('The cell to edit is outside the map');
            if (action.kind === 'note' && !scene.notes.some(note=>note.id === action.noteId)) throw new Error('The event note was removed');
            if (action.kind === 'counter') {
                if (!Object.hasOwn(counters,action.counterId)) throw new Error('The event counter was removed');
                counters[action.counterId] = RULES.integer(action.operation === 'set' ? action.value : counters[action.counterId]+action.value,0,1000000,'Counter result');
            }
            if (action.kind === 'goal' && !runtime.goals[action.goalId]) throw new Error('The event objective was removed');
        }
        if (state.enemies.length+(state.pendingSpawns || []).length+additions > 1000) throw new Error('This event would exceed the limit of 1,000 active and pending enemies');
    }
    function applyEvent(event) {
        preflight(event);
        const scene = world().sceneMaster, runtime = ensure();
        for (const action of event.actions) {
            switch (action.kind) {
                case 'spawn': for (let i=0;i<action.count;i++) world().enemies.push(ctx.createEnemy(action.enemyType,action.x,action.y)); runtime.battleStarted=true; break;
                case 'wave': ctx.startWave(scene.waves.find(wave=>wave.waveNum === action.waveNum)); runtime.battleStarted=true; break;
                case 'cell': ctx.setCell(action.x,action.y,action.cellType); break;
                case 'counter': runtime.counters[action.counterId] = action.operation === 'set' ? action.value : runtime.counters[action.counterId]+action.value; break;
                case 'note': scene.notes.find(note=>note.id === action.noteId).revealed = action.revealed; scene.noteRevision = (scene.noteRevision || 0)+1; break;
                case 'goal': runtime.goals[action.goalId] = {status:action.status,manual:action.status !== 'pending'}; break;
                case 'finish': finish(action.outcome); break;
                case 'message': ctx.log(action.text); break;
            }
        }
        runtime.events[event.id] = {status:'done',round:world().roundCounter || 0};
    }
    function evaluate() {
        const runtime = ensure(); if (!runtime) return;
        const state = world(), scene = state.sceneMaster, before = JSON.stringify(runtime);
        if (state.enemies.some(enemy=>enemy.hp > 0) || state.pendingSpawns?.length) runtime.battleStarted = true;
        if (state.gamePeriod === 'game' || scene.kind !== 'combat') {
            // Каждый проход может завершить цель или событие только один раз. Цепочки ограничены размером схемы.
            for (let pass=0;pass <= scene.scenario.goals.length+scene.scenario.events.length;pass++) {
                let changed = false;
                if (runtime.outcome) break;
                for (const goal of scene.scenario.goals) {
                    const entry = runtime.goals[goal.id];
                    if (entry.status !== 'pending' || entry.manual) continue;
                    const status = condition(goal.failure,true) ? 'failed' : condition(goal.success,true) ? 'completed' : 'pending';
                    if (status !== 'pending') { entry.status=status; changed=true; }
                }
                for (const event of scene.scenario.events) {
                    if (runtime.outcome) break;
                    const entry = runtime.events[event.id];
                    if (entry.status !== 'waiting' || !condition(event.condition)) continue;
                    if (event.confirm) runtime.events[event.id] = {status:'pending',round:state.roundCounter || 0};
                    else {
                        try { applyEvent(event); }
                        catch (error) { runtime.events[event.id] = {status:'error',error:error.message}; }
                    }
                    changed=true;
                }
                if (!changed) break;
            }
            const required = scene.scenario.goals.filter(goal=>goal.required);
            if (!runtime.outcome && scene.scenario.autoResolve && required.length) {
                if (required.every(goal=>runtime.goals[goal.id].status === 'completed')) finish('success');
                else if (required.every(goal=>runtime.goals[goal.id].status !== 'pending')) finish(required.some(goal=>runtime.goals[goal.id].status === 'completed') ? 'partial' : 'failure');
            }
            for (const card of scene.cards || []) if (card.kind === 'boss' && card.enemyType) {
                const enemies = state.enemies.filter(enemy=>enemy.type === card.enemyType && enemy.hp > 0);
                if (!enemies.length) continue;
                const hp = Math.min(...enemies.map(enemy=>enemy.hp*100/(enemy.maxHp || enemy.hp)));
                const current = card.phases.findIndex(phase=>phase.id === runtime.bossPhases[card.id]);
                let next = current;
                card.phases.forEach((phase,index)=>{if(index > next && hp <= phase.threshold)next=index;});
                if (next > current) runtime.bossPhases[card.id] = card.phases[next].id;
            }
        }
        if (JSON.stringify(runtime) !== before) runtime.revision++;
    }
    function enemyDied(enemy) {
        if (!enemy || enemy.hp > 0 || enemy.escapedToCastle || enemy.scenarioDeathCounted) return;
        const runtime = ensure(); if (!runtime) return;
        enemy.scenarioDeathCounted = true;
        runtime.defeated[enemy.type] = (runtime.defeated[enemy.type] || 0)+1;
        runtime.battleStarted = true;
        runtime.revision++;
    }
    function command(message) {
        const runtime = ensure(); if (!runtime) throw new Error('Open a prepared scene first');
        if (message.revision !== runtime.revision) throw new Error('The scene state has changed. Try again using the current values.');
        const scene = world().sceneMaster;
        switch (message.type) {
            case 'MASTER_SCENE_COUNTER':
                if (!Object.hasOwn(runtime.counters,message.counterId)) throw new Error('Counter not found');
                runtime.counters[message.counterId] = RULES.integer(message.value,0,1000000,'Counter value'); break;
            case 'MASTER_SCENE_GOAL':
                if (!Object.hasOwn(runtime.goals,message.goalId)) throw new Error('Objective not found');
                runtime.goals[message.goalId] = {status:RULES.choice(message.status,RULES.statuses,'objective state'),manual:message.status !== 'pending'}; break;
            case 'MASTER_SCENE_OUTCOME': finish(message.outcome); break;
            case 'MASTER_SCENE_EVENT': {
                const event = scene.scenario.events.find(event=>event.id === message.eventId);
                if (!event) throw new Error('Event not found');
                const entry = runtime.events[event.id];
                if (['done','skipped'].includes(entry.status)) throw new Error('This event has already been completed or skipped');
                if (message.action === 'skip') runtime.events[event.id] = {status:'skipped'};
                else if (message.action === 'apply') {
                    if (entry.status === 'waiting' && event.condition.kind !== 'manual' && !condition(event.condition)) throw new Error('The event condition has not been met yet');
                    applyEvent(event);
                } else throw new Error('Unknown event action');
                break;
            }
            case 'MASTER_CARD_USED': {
                if (!(scene.cards || []).some(card=>card.id === message.cardId) || typeof message.used !== 'boolean') throw new Error('Card not found');
                runtime.usedCards = runtime.usedCards.filter(id=>id !== message.cardId); if (message.used) runtime.usedCards.push(message.cardId); break;
            }
            case 'MASTER_BOSS_PHASE': {
                const card = (scene.cards || []).find(card=>card.kind === 'boss' && card.id === message.cardId);
                if (!card?.phases.some(phase=>phase.id === message.phaseId)) throw new Error('Boss phase not found');
                runtime.bossPhases[card.id] = message.phaseId; break;
            }
            default: throw new Error('Unknown scene command');
        }
        runtime.revision++;
    }
    function publicView() {
        const scene = world().sceneMaster, runtime = scene?.runtime; if (!runtime) return null;
        return {round:world().roundCounter || 0,outcome:runtime.outcome,text:runtime.outcomeText,
            goals:scene.scenario.goals.filter(goal=>goal.visible).map(goal=>({id:goal.id,title:goal.title,description:goal.description,status:runtime.goals[goal.id]?.status || 'pending'})),
            counters:scene.scenario.counters.filter(counter=>counter.visible).map(counter=>({id:counter.id,title:counter.title,value:runtime.counters[counter.id] ?? counter.initial,target:counter.target}))};
    }
    return {ensure,evaluate,enemyDied,command,publicView,condition};
};
