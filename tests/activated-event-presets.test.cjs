'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {validateScene,createSceneStore,captureScene}=require('../scene-library');
const RULES=require('../public/activated-event-rules');
const data=require('../public/gamedata');

function scene() {
    return {id:'events',title:'Activated events',gold:300,baseHp:20,gridWidth:8,gridHeight:8,
        grid:Array.from({length:8},(_,y)=>Array.from({length:8},(_,x)=>({x,y,type:y === 2 ? x === 0 ? 'spawn' : x === 7 ? 'castle' : 'road' : 'empty'}))),enemies:[],waves:[],notes:[]};
}
function preset(kind) {
    return {id:kind,title:RULES.kinds[kind],...RULES.defaults(kind),x:1,y:1,spawnX:1,spawnY:2,areas:[{x:4,y:2}]};
}
test('all eight named presets round-trip without requiring live targets or rolling saves',t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kr-event-presets-'));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const file=path.join(dir,'scenes.json'),store=createSceneStore(data,file),draft=scene();
    draft.eventPresets=Object.keys(RULES.kinds).map(preset);
    Object.assign(draft.eventPresets[0],{playerNames:['absent'],results:{absent:'fail'}});
    draft.eventPresets.find(item=>item.kind === 'banner').sourceId='missing';
    draft.eventPresets.find(item=>item.kind === 'chainLightning').target={kind:'enemy',id:'missing'};
    store.save(draft,0);
    const restored=createSceneStore(data,file).get('events');
    assert.equal(restored.eventPresets.length,8);
    for (const item of restored.eventPresets) for (const key of ['playerNames','results','sourceId','target']) assert.equal(Object.hasOwn(item,key),false);
    assert.equal(restored.eventPresets.find(item=>item.kind === 'goldenGoblin').reward,50);
    assert.deepEqual(store.get('events'),restored);
});
test('old scenes default to no presets and invalid preset settings are rejected',()=>{
    assert.deepEqual(validateScene(scene(),data).eventPresets,[]);
    for (const mutate of [
        p=>p.id='bad id',p=>p.title='',p=>p.kind='unknown',p=>p.radius=-1,p=>p.x=8,
        p=>p.spawnY=8,p=>p.spawnY=1,p=>p.enemyType='missing'
    ]) {
        const draft=scene(),p=preset('goblinTower');mutate(p);draft.eventPresets=[p];
        assert.throws(()=>validateScene(draft,data));
    }
    const duplicate=scene();duplicate.eventPresets=[preset('frost'),preset('frost')];
    assert.throws(()=>validateScene(duplicate,data),/unique/);
    const crowded=scene();crowded.eventPresets=Array.from({length:101},(_,i)=>({...preset('frost'),id:'p'+i}));
    assert.throws(()=>validateScene(crowded,data),/100/);
});
test('loading library tolerates removed custom reinforcement types, saving requires repair',()=>{
    const draft=scene();draft.eventPresets=[{...preset('ritualTotem'),enemyType:'removed_custom'}];
    assert.doesNotThrow(()=>validateScene(draft,data,false));
    assert.throws(()=>validateScene(draft,data,true),/reinforcement|enemy/i);
});
test('capturing a map preserves presets and omits runtime event units',()=>{
    const draft=scene();draft.eventPresets=[preset('frost')];
    const world={...draft,sceneMaster:draft,enemies:[
        {id:1,type:'goblin',hp:10,x:2,y:2},
        {id:2,type:'event_goldenGoblin',eventKind:'goldenGoblin',hp:20,x:3,y:1},
        {id:3,type:'event_goblinTower',eventKind:'goblinTower',eventStructure:true,hp:80,x:4,y:1}
    ]};
    const captured=captureScene(world,data,'capture');
    assert.equal(captured.enemies.length,1);assert.equal(captured.enemies[0].type,'goblin');
    assert.equal(captured.eventPresets[0].kind,'frost');
});
