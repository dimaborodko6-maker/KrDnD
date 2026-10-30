'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {game}=require('./helpers/game-harness.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const result=ws=>ws.messages.findLast(message=>message.type === 'EVENT_RESULT');
const update=ws=>ws.messages.findLast(message=>message.type === 'STATE_UPDATE');
function activate(g,config) {
    g.send(g.master,{type:'MASTER_ACTIVATE_EVENT',requestId:'test',config});
    assert.equal(result(g.master)?.ok,true,result(g.master)?.error);
    return g.state.activeEvents?.at(-1);
}
const tick=g=>g.send(g.master,{type:'MASTER_MOVE_ENEMIES'});

test('active event geometry prevents unsafe map shrinking until the event is ended',()=>{
    const g=game();
    const event=activate(g,{kind:'sandstorm',x:14,y:14});
    g.send(g.master,{type:'MASTER_RESIZE_MAP',width:8,height:8});
    assert.equal(g.state.gridWidth,16);
    assert.match(g.master.messages.at(-1).message,/End active events/);
    g.send(g.master,{type:'MASTER_FINISH_EVENT',id:event.id});
    g.send(g.master,{type:'MASTER_RESIZE_MAP',width:8,height:8});
    assert.equal(g.state.gridWidth,8);
});

test('catalog cannot remove a reinforcement type reserved by an active event',()=>{
    const g=game();
    g.gameData.enemies.event_custom={...g.gameData.enemies.goblin,name:'Event custom'};
    activate(g,{kind:'ritualTotem',x:4,y:1,spawnX:0,spawnY:2,enemyType:'event_custom'});
    const editor=g.connect();g.send(editor,{type:'REGISTER_EDITOR'});
    const initial=editor.messages.findLast(message=>message.type === 'CATALOG_STATE');
    const catalog=plain(initial.catalog);delete catalog.enemies.event_custom;
    g.send(editor,{type:'EDITOR_SAVE_CATALOG',revision:initial.revision,catalog});
    assert.equal(editor.messages.at(-1).type,'COMMAND_ERROR');
    assert.match(editor.messages.at(-1).message,/waiting to spawn|active summoner/);
    assert.ok(g.gameData.enemies.event_custom);
});

test('event commands are GM only, atomic on invalid settings and support intervention undo',()=>{
    const g=game();const {ws}=g.player();
    const before=plain(g.state);
    g.send(ws,{type:'MASTER_ACTIVATE_EVENT',config:{kind:'sandstorm',x:4,y:2}});
    assert.equal(result(ws).ok,false);assert.deepEqual(plain(g.state),before);
    g.send(g.master,{type:'MASTER_ACTIVATE_EVENT',config:{kind:'sandstorm',x:-1,y:2}});
    assert.equal(result(g.master).ok,false);assert.deepEqual(plain(g.state),before);
    activate(g,{kind:'sandstorm',x:4,y:2});
    const undo=update(g.master).state.masterUndo;
    assert.ok(undo?.id);assert.equal(undo.snapshot,undefined);
    g.send(g.master,{type:'MASTER_UNDO_INTERVENTION',id:undo.id});
    assert.deepEqual(plain(g.state.enemies),before.enemies);
    assert.equal(g.state.activeEvents.length,0);
});

test('frost magical damage respects magic resistance and barrier; server enforces slowed movement',()=>{
    const g=game();const {hero,ws}=g.player('ratchet');
    hero.hp=100;hero.maxHp=100;hero.armor=80;hero.magicRes=50;hero.shieldHp=3;hero.speed=4;
    activate(g,{kind:'frost',playerNames:[hero.name],results:{[hero.name]:'fail'}});
    assert.equal(hero.hp,98);assert.equal(hero.shieldHp,0);
    g.send(ws,{type:'MOVE_HERO',x:6,y:2});assert.equal(hero.x,4);
    g.send(ws,{type:'MOVE_HERO',x:5,y:2});assert.equal(hero.x,5);
    tick(g);g.send(ws,{type:'MOVE_HERO',x:7,y:2});assert.equal(hero.x,5);
    tick(g);g.send(ws,{type:'MOVE_HERO',x:7,y:2});assert.equal(hero.x,7);
});

test('storm actual round damages enemies through shields and awards kill gold once',()=>{
    const g=game();g.player('ratchet');
    g.enemy(41,5,2,{hp:3,maxHp:3,shieldHp:2,armor:0,traits:{},reward:7});
    const gold=g.state.gold;
    activate(g,{kind:'sandstorm',x:5,y:2,radius:1,damage:5,duration:2});
    tick(g);assert.equal(g.state.enemies.length,0);assert.equal(g.state.gold,gold+7);
    tick(g);assert.equal(g.state.gold,gold+7);
});

test('goblin tower attacks and summons fifth round, destroyed source does not summon',()=>{
    const g=game();const {hero}=g.player('ratchet');hero.hp=1000;hero.maxHp=1000;hero.armor=0;
    activate(g,{kind:'goblinTower',x:4,y:1,spawnX:0,spawnY:2});
    for(let i=0;i<4;i++)tick(g);
    assert.equal(g.state.enemies.length,1);
    tick(g);assert.equal(g.state.enemies.filter(u=>!u.eventStructure).length,1);
    assert.equal(g.state.enemies.find(u=>!u.eventStructure).reward,0);
    const h=game();h.player('ratchet');
    activate(h,{kind:'goblinTower',x:4,y:1,spawnX:0,spawnY:2,hp:1});
    h.tower('archer_1',4,0);
    for(let i=0;i<5;i++)tick(h);
    assert.equal(h.state.enemies.length,0);assert.equal(h.state.activeEvents.length,0);
});

test('golden goblin gives exactly 50 gold for a hero kill',()=>{
    const g=game();g.player('bolin');
    activate(g,{kind:'goldenGoblin',x:5,y:2});
    const unit=g.state.enemies[0];unit.hp=1;
    const gold=g.state.gold;
    g.castAbility('bolin','attack',unit.id,8);
    assert.equal(g.state.gold,gold+50);assert.equal(g.state.enemies.length,0);
    tick(g);assert.equal(g.state.gold,gold+50);
});

test('golden goblin gives exactly 50 gold for a tower kill and none on escape',()=>{
    const g=game();
    activate(g,{kind:'goldenGoblin',x:5,y:2});g.state.enemies[0].hp=1;
    g.tower('archer_1',5,1);
    const gold=g.state.gold;g.fireTowers();assert.equal(g.state.gold,gold+50);
    g.fireTowers();assert.equal(g.state.gold,gold+50);
    const h=game();activate(h,{kind:'goldenGoblin',x:8,y:0,duration:1});
    const initial=h.state.gold;tick(h);assert.equal(h.state.enemies.length,0);assert.equal(h.state.gold,initial);
});

test('special event creatures do not gain fallback melee attacks against soldiers',()=>{
    const g=game();
    activate(g,{kind:'goldenGoblin',x:5,y:2});
    const golden=g.state.enemies[0];
    g.state.soldiers.push({id:'guard',hp:100,maxHp:100,x:5,y:2,armor:0,dmg:1,respawnTimer:0,blockedEnemyIds:[golden.id],towerKey:'5,1',towerType:'barracks_1',blockLimit:1});
    tick(g);assert.equal(g.state.soldiers[0].hp,100);
    const h=game();const {hero,ws}=h.player('ratchet');
    activate(h,{kind:'goldenGoblin',x:5,y:2});
    hero.blockedEnemyIds=[h.state.enemies[0].id];
    const hp=hero.hp;
    h.send(ws,{type:'MOVE_HERO',x:2,y:2});
    assert.equal(hero.x,2);assert.equal(hero.hp,hp);
});

function armorScenario(source) {
    const g=game();
    const target=g.enemy(11,5,2,{armor:0,hp:1000});
    g.enemy(12,6,2,{armor:0,hp:1000});
    if(source)activate(g,{kind:'banner',sourceId:12,buff:'armor',bonus:50});
    return {g,target};
}
test('banner armor changes physical hero and tower damage',()=>{
    const before=armorScenario(false),after=armorScenario(true);
    for(const sample of [before,after]) {sample.g.player('bolin');sample.g.castAbility('bolin','attack',11,8);}
    assert.equal(1000-after.target.hp,Math.max(1,Math.round((1000-before.target.hp)/2)));
    const a=armorScenario(false),b=armorScenario(true);
    for(const sample of [a,b]){sample.g.tower('archer_1',5,1);sample.g.fireTowers();}
    assert.equal(1000-b.target.hp,Math.max(1,Math.round((1000-a.target.hp)/2)));
});

test('banner armor changes physical soldier damage; damage auras use strongest bonus',()=>{
    const a=armorScenario(false),b=armorScenario(true);
    for(const sample of [a,b]) {
        sample.g.state.soldiers.push({id:'test',hp:100,maxHp:100,x:5,y:2,armor:0,dmg:20,respawnTimer:0,blockedEnemyIds:[11],towerKey:'5,1',towerType:'barracks_1',blockLimit:1});
        tick(sample.g);
    }
    assert.equal(1000-a.target.hp,20);assert.equal(1000-b.target.hp,10);
    const g=game();const {hero}=g.player('ratchet');hero.armor=0;hero.hp=100;hero.maxHp=100;hero.hasAttackedThisRound=true;
    g.enemy(10,4,2,{meleeDmg:10});g.enemy(12,5,2);
    activate(g,{kind:'banner',sourceId:12,buff:'damage',bonus:20});
    activate(g,{kind:'banner',sourceId:12,buff:'damage',bonus:50});
    tick(g);assert.equal(hero.hp,85);
});

test('saved active events and frost survive loading; public state excludes saving throw results and scene presets',()=>{
    const g=game();const {hero,ws}=g.player('ratchet');
    activate(g,{kind:'frost',playerNames:[hero.name],results:{[hero.name]:'fail'}});
    activate(g,{kind:'sandstorm',x:0,y:2,duration:3,results:{private:'fail'},playerNames:[hero.name]});
    const publicState=update(ws).state;
    assert.equal(JSON.stringify(publicState).includes('"results"'),false);
    assert.equal(publicState.sceneMaster,undefined);
    const restored=game({savedState:plain(g.state)});
    assert.equal(restored.state.players[hero.name].frostSlowUntilRound,2);
    assert.deepEqual(Array.from(restored.state.activeEvents,event=>event.kind),['frost','sandstorm']);
    tick(restored);assert.equal(restored.state.activeEvents.length,2);
    tick(restored);assert.deepEqual(Array.from(restored.state.activeEvents,event=>event.kind),['sandstorm']);
});
