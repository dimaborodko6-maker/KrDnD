'use strict';
/* global sceneEl, PLANNING_UI, sceneDraft, sceneChanged, ACTIVATED_EVENT_RULES, GAME_DATA, selectedCell, sceneNewId, confirm */

function renderSceneEventPresets() {
    const list=sceneEl('scene-event-presets'),p=PLANNING_UI;
    list.replaceChildren();
    for (const preset of sceneDraft.eventPresets || []) {
        const row=p.node('article',null,'scene-detail-entry');
        row.append(p.node('strong',preset.title),p.node('p',ACTIVATED_EVENT_RULES.kinds[preset.kind],'muted'),
            p.button('Edit',()=>editSceneEventPreset(preset)),p.button('Delete',()=>{
                if (!confirm('Delete this activated event preset?')) return;
                sceneDraft.eventPresets=sceneDraft.eventPresets.filter(item=>item.id !== preset.id);
                sceneChanged();renderSceneEventPresets();
            },'danger-outline'));
        list.append(row);
    }
    if (!(sceneDraft.eventPresets || []).length) list.append(p.node('p','No activated event presets. The GM can also configure events during play.','muted'));
}

function editSceneEventPreset(source) {
    const p=PLANNING_UI,d=p.dialog('Activated event preset');
    const title=p.field(d.body,'Preset title',source?.title || 'Frost',{required:true,maxLength:120});
    const kind=p.field(d.body,'Event',source?.kind || 'frost',{options:ACTIVATED_EVENT_RULES.kinds});
    const body=p.node('div',null,'planning-form');d.body.append(body);
    let fields={},areaReaders=[];
    const labels={damage:'Damage',duration:'Duration, rounds',dc:'Constitution check DC',hp:'Object HP',speed:'Speed, cells',reward:'Kill reward, G',radius:'Radius, cells',interval:'Spawn interval, rounds',maxAlive:'Maximum living summons',count:'Number of targets / summons',summonReward:'Reward per summon, G',delay:'Delay, rounds',bonus:'Bonus (% damage, armor points or speed cells)',x:'X coordinate',y:'Y coordinate',spawnX:'Reinforcement X',spawnY:'Reinforcement Y'};
    function number(key,value) {
        const coordinate=['x','y','spawnX','spawnY'].includes(key),zero=['damage','reward','summonReward','delay'].includes(key) || coordinate;
        const max=['x','spawnX'].includes(key) ? sceneDraft.gridWidth-1 : ['y','spawnY'].includes(key) ? sceneDraft.gridHeight-1 : key === 'radius' || key === 'dc' ? 40 : key === 'count' ? 100 : 1000000;
        fields[key]=p.field(body,labels[key] || key,value,{type:'number',min:zero ? 0 : 1,max,step:1,required:true});
    }
    function build() {
        body.replaceChildren();fields={};areaReaders=[];
        const config=source?.kind === kind.value ? source : ACTIVATED_EVENT_RULES.defaults(kind.value);
        for (const [key,value] of Object.entries(ACTIVATED_EVENT_RULES.defaults(kind.value))) {
            if (typeof value === 'number') number(key,config[key] ?? value);
        }
        if (['goldenGoblin','sandstorm','goblinTower','ritualTotem'].includes(kind.value)) {
            number('x',config.x ?? selectedCell?.x ?? 0);number('y',config.y ?? selectedCell?.y ?? 0);
        }
        if (['goblinTower','ritualTotem'].includes(kind.value)) {
            fields.enemyType=p.field(body,'Summoned enemy',config.enemyType || 'goblin',{options:Object.fromEntries(Object.entries(GAME_DATA.enemies).map(([id,mob])=>[id,mob.name])),required:true});
            number('spawnX',config.spawnX ?? 0);number('spawnY',config.spawnY ?? 0);
            body.append(p.node('p','Place the object on empty grass. Reinforcements need a road or spawn connected to the castle.','muted'));
        }
        if (config.damageType !== undefined) fields.damageType=p.field(body,'Damage type',config.damageType,{options:{physical:'Physical',magic:'Magic',true:'True'}});
        if (config.side !== undefined) fields.side=p.field(body,'Affected side',config.side,{options:{all:'All creatures',heroes:'Heroes and allies',enemies:'Enemies'}});
        if (kind.value === 'banner') {
            fields.buff=p.field(body,'Banner bonus',config.buff || 'damage',{options:{damage:'Damage, %',armor:'Armor, percentage points',speed:'Speed, cells'}});
            fields.buff.onchange=()=>{fields.bonus.value=fields.buff.value === 'speed' ? 1 : 20;};
        }
        if (kind.value === 'bombardment') {
            const areas=p.node('div');body.append(areas);
            function addArea(area) {
                const row=p.node('div',null,'form-row');
                const x=p.field(row,'Impact X',area.x,{type:'number',min:0,max:sceneDraft.gridWidth-1,step:1,required:true}),y=p.field(row,'Impact Y',area.y,{type:'number',min:0,max:sceneDraft.gridHeight-1,step:1,required:true});
                const reader={read:()=>({x:Number(x.value),y:Number(y.value)})};areaReaders.push(reader);
                row.append(p.button('Remove impact',()=>{areaReaders=areaReaders.filter(item=>item !== reader);row.remove();}));areas.append(row);
            }
            for (const area of config.areas?.length ? config.areas : [selectedCell || {x:0,y:0}]) addArea(area);
            body.append(p.button('＋ Impact cell',()=>{if(areaReaders.length >= 20){d.error('No more than 20 impact cells');return;}addArea(selectedCell || {x:0,y:0});}));
        }
        if (['frost','banner','chainLightning'].includes(kind.value)) body.append(p.node('p','Live targets are selected on the GM dashboard. Saving throw results are entered after rolling at the table.','muted'));
    }
    kind.onchange=()=>{title.value=ACTIVATED_EVENT_RULES.kinds[kind.value];build();};build();
    d.show(()=>{
        const config={kind:kind.value,title:title.value,...Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,p.value(input)]))};
        if (kind.value === 'bombardment') config.areas=areaReaders.map(item=>item.read());
        const normalized=ACTIVATED_EVENT_RULES.normalize(config,{grid:sceneDraft.grid,players:{},enemies:[],soldiers:[]},GAME_DATA,{preset:true});
        delete normalized.playerNames;delete normalized.results;delete normalized.sourceId;delete normalized.target;
        const preset={id:source?.id || sceneNewId(),...normalized},presets=sceneDraft.eventPresets || [];
        if (!source && presets.length >= 100) throw new Error('No more than 100 activated event presets per scene');
        const index=presets.findIndex(item=>item.id === preset.id);
        if (index < 0) presets.push(preset);else presets[index]=preset;
        sceneDraft.eventPresets=presets;sceneChanged();renderSceneEventPresets();
    });
}
sceneEl('add-event-preset').onclick=()=>editSceneEventPreset();
