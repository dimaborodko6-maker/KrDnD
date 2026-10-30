'use strict';
/* global structuredClone */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../public/activated-event-rules');
const createEvents=require('../activated-events');

function fixture() {
    let state={gamePeriod:'game',roundCounter:0,players:{a:{hp:100,speed:3,x:1,y:1},b:{hp:100,speed:4,x:4,y:1}},enemies:[],soldiers:[],grid:Array.from({length:6},()=>Array.from({length:6},()=>({type:'empty'})))};
    for(let x=0;x<6;x++)state.grid[5][x]={type:x === 5 ? 'castle' : 'road'};
    let sequence=0;
    const data={enemies:{goblin:{hp:20,speed:2,reward:3}}}, logs=[];
    const ctx={getState:()=>state,getData:()=>data,createEnemy:(type,x,y)=>({id:++sequence,type,x,y,hp:20,maxHp:20,reward:3,traits:{}}),damage:(unit,amount)=>{unit.hp=Math.max(0,unit.hp-amount);},removeDeadEnemies:()=>{state.enemies=state.enemies.filter(u=>u.hp > 0);},refreshBlocks:()=>{},log:text=>logs.push(text),random:()=>0};
    const events=createEvents(ctx);
    return {get state(){return state;},replace:next=>{state=next;},data,ctx,events,logs,tick(){state.roundCounter++;events.beginRound();events.enemyRound();events.endRound();}};
}

test('frost applies only failed checks and limits exactly two hero phases',()=>{
    const g=fixture();
    assert.throws(()=>g.events.activate({kind:'frost',playerNames:['a','b'],results:{a:'fail'}}));
    assert.equal(g.state.players.a.hp,100);
    g.events.activate({kind:'frost',playerNames:['a','b'],results:{a:'fail',b:'pass'}});
    assert.equal(g.state.players.a.hp,90);assert.equal(g.state.players.b.hp,100);
    assert.equal(rules.heroSpeed(g.state.players.a,0),1);
    g.tick();assert.equal(rules.heroSpeed(g.state.players.a,1),1);
    g.tick();assert.equal(rules.heroSpeed(g.state.players.a,2),3);
});

test('frost appears in active events without private rolls and overlapping freezes can be ended independently',()=>{
    const g=fixture();
    const first=g.events.activate({kind:'frost',playerNames:['a'],results:{a:'fail'},duration:2});
    const second=g.events.activate({kind:'frost',playerNames:['a'],results:{a:'fail'},duration:3});
    assert.equal(g.state.activeEvents.length,2);
    assert.equal(g.state.activeEvents[0].config.results,undefined);
    g.events.finish(second.id);
    assert.equal(g.state.players.a.frostSlowUntilRound,2);
    g.events.finish(first.id);
    assert.equal(rules.heroSpeed(g.state.players.a,0),3);
});

test('sandstorm uses circular area, hits both sides and soldiers, skips structures and fallen',()=>{
    const g=fixture();
    g.state.enemies.push({id:10,hp:20,x:1,y:2},{id:11,hp:20,x:3,y:3},{id:12,hp:20,x:1,y:1,eventStructure:true});
    g.state.soldiers.push({id:'s',hp:20,x:2,y:1},{id:'dead',hp:0,x:1,y:1});
    g.events.activate({kind:'sandstorm',x:1,y:1,radius:2,duration:2});
    assert.equal(g.state.players.a.hp,100);
    g.tick();assert.equal(g.state.players.a.hp,95);assert.equal(g.state.enemies[0].hp,15);assert.equal(g.state.enemies[1].hp,20);assert.equal(g.state.enemies[2].hp,20);assert.equal(g.state.soldiers[0].hp,15);
    g.tick();assert.equal(g.state.players.a.hp,90);assert.equal(g.state.activeEvents.length,0);
    g.tick();assert.equal(g.state.players.a.hp,90);
});

test('bombardment is delayed and overlapping circles damage each unit once',()=>{
    const g=fixture();
    g.events.activate({kind:'bombardment',areas:[{x:1,y:1},{x:1,y:2}]});
    g.state.players.b.x=1;g.state.players.b.y=1;
    g.state.players.a.x=5;g.state.players.a.y=0;
    assert.equal(g.state.players.b.hp,100);
    g.tick();assert.equal(g.state.players.b.hp,85);assert.equal(g.state.players.a.hp,100);
    g.tick();assert.equal(g.state.players.b.hp,85);
});

test('chain lightning deterministic order, side filtering, no repeats and optional delay',()=>{
    const g=fixture();
    g.state.enemies.push({id:20,hp:30,x:2,y:1},{id:21,hp:30,x:3,y:1});
    const config={...rules.defaults('chainLightning'),target:{kind:'player',id:'a'}};
    const path=rules.chain(g.state,config);
    assert.equal(path[0].id,'a');assert.equal(new Set(path.map(t=>t.kind+t.id)).size,path.length);
    g.events.activate({...config,delay:1});assert.equal(g.state.players.a.hp,100);
    g.tick();assert.equal(g.state.players.a.hp,90);assert.equal(g.state.enemies[0].hp,20);
    assert.throws(()=>g.events.activate({...config,side:'enemies'}));
});

test('golden goblin moves only traversable cells, stays off castle, expires without reward',()=>{
    const g=fixture();
    g.events.activate({kind:'goldenGoblin',x:0,y:0});
    const unit=g.state.enemies[0];
    g.state.players.a.x=5;g.state.players.a.y=0;
    assert.equal(unit.reward,50);assert.equal(unit.eventStructure,false);
    assert.equal(unit.type,'event_goldenGoblin');
    assert.equal(g.events.moveSpecial(unit),true);assert.equal(unit.y,2);
    assert.throws(()=>g.events.activate({kind:'goldenGoblin',x:5,y:5}));
    for(let i=0;i<5;i++)g.tick();
    assert.equal(g.state.enemies.length,0);
});

test('golden goblin is intercepted mid-move and stops after reaching a defender',()=>{
    const g=fixture();
    g.events.activate({kind:'goldenGoblin',x:0,y:0});
    const unit=g.state.enemies[0];
    g.events.moveSpecial(unit);
    assert.equal(unit.x,0);assert.equal(unit.y,1);
    assert.ok(g.state.players.a.blockedEnemyIds.includes(unit.id));
});

test('goblin tower attacks nearest hero and spawns on its fifth round with a living cap',()=>{
    const g=fixture();
    g.events.activate({kind:'goblinTower',x:0,y:1,spawnX:0,spawnY:5,maxAlive:1});
    const unit=g.state.enemies[0];assert.equal(unit.eventStructure,true);assert.equal(g.events.moveSpecial(unit),true);
    for(let i=0;i<4;i++)g.tick();
    assert.equal(g.state.players.a.hp,80);assert.equal(g.state.enemies.length,1);
    g.tick();assert.equal(g.state.enemies.length,2);assert.equal(g.state.enemies[1].reward,0);
    for(let i=0;i<5;i++)g.tick();assert.equal(g.state.enemies.length,2);
});

test('totem summons once after three rounds; destroying it cancels summoning',()=>{
    const g=fixture();
    g.events.activate({kind:'ritualTotem',x:0,y:0,spawnX:0,spawnY:5});
    g.tick();g.tick();assert.equal(g.state.enemies.length,1);
    g.tick();assert.equal(g.state.enemies.length,3);assert.ok(g.state.enemies.every(u=>u.reward === 0));assert.equal(g.state.activeEvents.length,0);
    g.events.activate({kind:'ritualTotem',x:0,y:0,spawnX:0,spawnY:5});
    g.state.enemies.at(-1).hp=0;
    g.tick();assert.equal(g.state.enemies.length,3);
});

test('banner strongest bonus only, bearer/special exclusions, death and duration',()=>{
    const g=fixture();
    const bearer={id:10,hp:20,x:2,y:2},other={id:11,hp:20,x:3,y:2},gold={id:12,hp:20,x:2,y:2,eventKind:'goldenGoblin'};
    g.state.enemies.push(bearer,other,gold);
    g.events.activate({kind:'banner',sourceId:10});g.events.activate({kind:'banner',sourceId:10,bonus:30});
    assert.equal(rules.auraBonus(g.state,other,'damage'),30);assert.equal(rules.auraBonus(g.state,bearer,'damage'),0);assert.equal(rules.auraBonus(g.state,gold,'damage'),0);
    assert.throws(()=>g.events.activate({kind:'banner',sourceId:12}));
    g.tick();g.tick();g.tick();assert.equal(rules.auraBonus(g.state,other,'damage'),0);
});

test('validation prevents invalid coordinates/paths, presets omit live references, state replacements work',()=>{
    const g=fixture();
    assert.throws(()=>g.events.activate({kind:'sandstorm',x:-1,y:1}));
    assert.throws(()=>g.events.activate({kind:'goldenGoblin',x:0,y:0,speed:1000000}));
    const sanitized=rules.normalize({kind:'sandstorm',x:0,y:0,results:{secret:'fail'},playerNames:['a']},g.state,g.data);
    assert.equal(sanitized.results,undefined);assert.equal(sanitized.playerNames,undefined);
    g.state.grid[5][4].type='empty';
    assert.throws(()=>g.events.activate({kind:'goblinTower',x:0,y:0,spawnX:0,spawnY:5}));
    const preset=rules.normalize({kind:'frost',playerNames:['a'],results:{a:'fail'}},g.state,g.data,{preset:true});
    assert.equal(preset.playerNames,undefined);assert.equal(preset.results,undefined);
    const next=structuredClone(g.state);next.players.a.hp=50;g.replace(next);
    g.events.activate({kind:'frost',playerNames:['a'],results:{a:'fail'}});assert.equal(g.state.players.a.hp,40);
    g.state.gamePeriod='preparation';assert.throws(()=>g.events.activate({kind:'sandstorm',x:0,y:0}));
});
