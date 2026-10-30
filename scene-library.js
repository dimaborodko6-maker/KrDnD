'use strict';
const fs = require('node:fs');
const { validateCatalog } = require('./game-catalog');
const TOWER_RULES = require('./public/tower-rules');
const SCENARIO_RULES = require('./public/scenario-rules');
const copy = value => JSON.parse(JSON.stringify(value));
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function integer(value, min, max, label) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${label}: an integer from ${min} to ${max}`);
    return value;
}
function text(value, max, label, required = false) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label}: ${required ? 'non-empty ' : ''}text up to ${max} characters`);
    return value.trim();
}
function id(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error('Invalid identifier');
    return value;
}
function position(input, width, height) {
    return { x:integer(input.x,0,width-1,'X coordinate'), y:integer(input.y,0,height-1,'Y coordinate') };
}
function validateNote(input, width, height) {
    if (!object(input)) throw new Error('Invalid note');
    return { id:id(input.id), ...position(input,width,height), title:text(input.title,120,'Note title',true),
        text:text(input.text ?? '',4000,'Player text'), secret:text(input.secret ?? '',4000,'GM secret'),
        skill:text(input.skill ?? '',100,'Check'), dc:input.dc == null ? null : integer(input.dc,1,40,'Check difficulty'),
        success:text(input.success ?? '',2000,'On success'), failure:text(input.failure ?? '',2000,'On failure') };
}
function validateScene(input, data, strictReferences = true) {
    if (!object(input)) throw new Error('Invalid scene');
    const width = integer(input.gridWidth,8,40,'Width'), height = integer(input.gridHeight,8,40,'Height');
    if (!Array.isArray(input.grid) || input.grid.length !== height) throw new Error('Map height does not match its dimensions');
    const grid = input.grid.map((row,y) => {
        if (!Array.isArray(row) || row.length !== width) throw new Error('Map width does not match its dimensions');
        return row.map((source,x) => {
            if (!object(source) || (!['empty','road','spawn','castle','slot'].includes(source.type) && !Object.hasOwn(data.towers,source.type))) throw new Error('Unknown cell type');
            const cell = { x,y,type:source.type };
            if (Object.hasOwn(data.towers,source.type)) {
                const upgrades = source.upgrades ?? [];
                if (!Array.isArray(upgrades) || upgrades.some(key => !(data.towers[source.type].upgrades || []).some(upgrade => upgrade.id === key))) throw new Error('Unknown tower upgrade');
                cell.upgrades = [...new Set(upgrades)];
                if (source.rallyPoint != null) cell.rallyPoint = position(source.rallyPoint,width,height);
            }
            return cell;
        });
    });
    if (!Array.isArray(input.enemies) || input.enemies.length > 100) throw new Error('No more than 100 enemy groups');
    let total = 0;
    const enemies = input.enemies.map(group => {
        if (!object(group) || typeof group.type !== 'string' || !/^[a-z][a-z0-9_]{0,49}$/.test(group.type) || (strictReferences && !Object.hasOwn(data.enemies,group.type))) throw new Error('Placement references an unknown enemy');
        const count = integer(group.count,1,200,'Group size'); total += count;
        return { type:group.type,count,...position(group,width,height) };
    });
    if (total > 500) throw new Error('No more than 500 enemies in the placement');
    if (!Array.isArray(input.waves) || input.waves.length > 200) throw new Error('No more than 200 waves per scene');
    // На диске могут остаться ссылки на удалённые собственные типы. Их проверяем при сохранении и запуске.
    const waveEnemies = copy(data.enemies);
    if (!strictReferences) for (const wave of input.waves) for (const group of wave.enemies || []) {
        if (typeof group.type === 'string' && /^[a-z][a-z0-9_]{0,49}$/.test(group.type) && !Object.hasOwn(waveEnemies,group.type)) {
            waveEnemies[group.type] = copy(Object.values(data.enemies)[0]);
        }
    }
    const waves = input.waves.length ? validateCatalog({ enemies:waveEnemies,presetWaves:input.waves },[]).presetWaves : [];
    if (!Array.isArray(input.notes) || input.notes.length > 200) throw new Error('No more than 200 notes per scene');
    const notes = input.notes.map(note => validateNote(note,width,height));
    if (new Set(notes.map(note => note.id)).size !== notes.length) throw new Error('Note IDs must be unique');
    const availableTowerTypes = input.availableTowerTypes ?? TOWER_RULES.getBaseTypes(data.towers).slice(0,5);
    if (!Array.isArray(availableTowerTypes) || availableTowerTypes.length > 5 || new Set(availableTowerTypes).size !== availableTowerTypes.length || availableTowerTypes.some(type => !TOWER_RULES.getBaseTypes(data.towers).includes(type))) throw new Error('Invalid tower roster');
    if ([...TOWER_RULES.getBuiltFamilies({grid},data.towers)].some(type => !availableTowerTypes.includes(type))) throw new Error('All built towers must be included in the team roster');
    const kind = SCENARIO_RULES.choice(input.kind ?? 'combat',SCENARIO_RULES.kinds,'scene type');
    const context = {data,strict:strictReferences,width,height,waves,notes};
    const scenario = SCENARIO_RULES.normalize(input.scenario,context), cards = SCENARIO_RULES.cards(input.cards,context);
    return { id:id(input.id),kind,scenario,cards,title:text(input.title,160,'Scene title',true), description:text(input.description ?? '',8000,'Description'),
        objectives:text(input.objectives ?? '',4000,'Victory conditions'),gold:integer(input.gold,0,1000000,'Starting gold'),
        baseHp:integer(input.baseHp,1,1000000,'Base health'),gridWidth:width,gridHeight:height,grid,enemies,waves,notes,availableTowerTypes:[...availableTowerTypes] };
}
function validatePlayable(scene, data) {
    const next = validateScene(scene,data);
    if (next.kind !== 'combat') return next;
    const spawns = next.grid.flat().filter(cell => cell.type === 'spawn');
    const castles = next.grid.flat().filter(cell => cell.type === 'castle');
    if (!spawns.length || !castles.length) throw new Error('A spawn and a castle are required to start');
    const seen = new Set(castles.map(cell => `${cell.x},${cell.y}`)), queue = [...castles];
    for (let i=0; i<queue.length; i++) for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const x = queue[i].x+dx, y = queue[i].y+dy, key = `${x},${y}`;
        if (!seen.has(key) && ['road','spawn','castle'].includes(next.grid[y]?.[x]?.type)) { seen.add(key); queue.push({x,y}); }
    }
    if (spawns.some(cell => !seen.has(`${cell.x},${cell.y}`))) throw new Error('Connect every spawn to the castle with an unbroken road');
    if (next.enemies.some(group => !data.enemies[group.type].isFlying && !seen.has(`${group.x},${group.y}`))) throw new Error('Ground enemies must be placed on a road connected to the castle');
    return next;
}
function publicSceneNotes(scene) {
    return (scene?.notes || []).filter(note => note.revealed).map(({id,x,y,title,text}) => ({id,x,y,title,text}));
}
function captureScene(state, data, sceneId) {
    const enemies = [];
    for (const enemy of (state.enemies || []).filter(enemy => enemy.hp > 0)) {
        const group = enemies.find(group => group.type === enemy.type && group.x === enemy.x && group.y === enemy.y && group.count < 200);
        if (group) group.count++; else enemies.push({type:enemy.type,x:enemy.x,y:enemy.y,count:1});
    }
    return validateScene({ id:sceneId,kind:state.sceneMaster?.kind || 'combat',scenario:state.sceneMaster?.scenario,cards:state.sceneMaster?.cards,title:state.sceneMaster?.title || 'Scene from current map',
        description:state.sceneMaster?.description || '',objectives:state.sceneMaster?.objectives || '',
        gridWidth:state.gridWidth,gridHeight:state.gridHeight,grid:state.grid,gold:state.gold,baseHp:Math.max(1,state.baseHp),
        availableTowerTypes:state.availableTowerTypes,
        enemies,
        waves:state.sceneMaster?.waves || data.presetWaves,notes:state.sceneMaster?.notes || [] },data);
}
function validateAdventure(input, scenes) {
    const rules = SCENARIO_RULES;
    if (!object(input)) throw new Error('Invalid adventure plan');
    const steps = rules.list(input.steps,100,'Plan scenes').map(step=>{
        if (!object(step) || !scenes.some(scene=>scene.id === step.sceneId)) throw new Error('A scene in the plan is missing from the library');
        return {id:rules.id(step.id),sceneId:step.sceneId,title:rules.text(step.title,160,'Step title',true),
            kind:rules.choice(step.kind ?? 'essential',{essential:1,optional:1,backup:1},'scene importance'),notes:rules.text(step.notes ?? '',4000,'Step notes'),
            minutes:rules.integer(step.minutes ?? 20,0,300,'Estimated duration'),
            branches:rules.list(step.branches ?? [],8,'Branches').map(branch=>({id:rules.id(branch.id),title:rules.text(branch.title,160,'Transition title',true),
                target:rules.id(branch.target),outcome:rules.choice(branch.outcome ?? 'any',{any:1,...rules.outcomes},'transition outcome')}))};
    });
    if (!steps.length) throw new Error('Add at least one scene to the plan');
    rules.unique(steps,'adventure step');
    for (const step of steps) {
        rules.unique(step.branches,'branch');
        if (step.branches.some(branch=>branch.target === step.id || !steps.some(target=>target.id === branch.target))) throw new Error('A branch must lead to a different existing step');
    }
    return {id:rules.id(input.id),title:rules.text(input.title,160,'Adventure title',true),description:rules.text(input.description ?? '',8000,'Adventure premise'),steps};
}
function adventureTransitions(adventure, outcome) {
    return SCENARIO_RULES.transitions(adventure,outcome);
}
function createSceneStore(data, file) {
    let revision = 0, scenes = [], adventures = [];
    if (fs.existsSync(file)) {
        const saved = JSON.parse(fs.readFileSync(file,'utf8'));
        if (saved.version !== 1 || !Array.isArray(saved.scenes) || saved.scenes.length > 100) throw new Error('Invalid scene library: ' + file);
        revision = integer(saved.revision,0,Number.MAX_SAFE_INTEGER,'Library version');
        scenes = saved.scenes.map(scene => validateScene(scene,data,false));
        if (new Set(scenes.map(scene => scene.id)).size !== scenes.length) throw new Error('Duplicate scene IDs');
        adventures = SCENARIO_RULES.list(saved.adventures ?? [],100,'Adventures').map(adventure=>validateAdventure(adventure,scenes));
        SCENARIO_RULES.unique(adventures,'adventure');
    }
    function commit(next, expected, nextAdventures = adventures) {
        if (expected !== revision) throw new Error('The library was changed in another window. Load the latest version.');
        if (next.length > 100) throw new Error('No more than 100 scenes in the library');
        const raw = JSON.stringify({version:1,revision:revision+1,scenes:next,adventures:nextAdventures},null,2);
        if (Buffer.byteLength(raw) > 32*1024*1024) throw new Error('The library exceeds 32 MiB');
        try { fs.writeFileSync(file+'.tmp',raw,'utf8'); fs.renameSync(file+'.tmp',file); }
        catch (error) { try { if (fs.existsSync(file+'.tmp')) fs.unlinkSync(file+'.tmp'); } catch {} throw new Error('Could not save scenes: '+error.message); }
        revision++; scenes = next; adventures = nextAdventures;
    }
    return {
        read() { return {revision,scenes:copy(scenes),adventures:copy(adventures)}; },
        get(sceneId) { const scene = scenes.find(scene => scene.id === sceneId); if (!scene) throw new Error('Scene not found'); return copy(scene); },
        save(input, expected) { const scene = validateScene(input,data); const next = scenes.filter(item => item.id !== scene.id); const index = scenes.findIndex(item => item.id === scene.id); next.splice(index < 0 ? next.length : index,0,scene); commit(next,expected); },
        delete(sceneId, expected) { this.get(sceneId); if (adventures.some(plan=>plan.steps.some(step=>step.sceneId === sceneId))) throw new Error('This scene is used in an adventure plan. Remove it from the plan first.'); commit(scenes.filter(scene => scene.id !== sceneId),expected); },
        getAdventure(adventureId) { const plan = adventures.find(item=>item.id === adventureId); if (!plan) throw new Error('Adventure not found'); return copy(plan); },
        saveAdventure(input, expected) { const plan = validateAdventure(input,scenes), next = adventures.filter(item=>item.id !== plan.id); if (next.length >= 100) throw new Error('No more than 100 adventures'); const index = adventures.findIndex(item=>item.id === plan.id); next.splice(index < 0 ? next.length : index,0,plan); commit(scenes,expected,next); },
        deleteAdventure(adventureId, expected) { this.getAdventure(adventureId); commit(scenes,expected,adventures.filter(item=>item.id !== adventureId)); }
    };
}
module.exports = { createSceneStore,validateScene,validateNote,validatePlayable,captureScene,publicSceneNotes,validateAdventure,adventureTransitions };
