const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const TRAITS = require('../public/enemy-traits.js');
const engine = require('../enemy-traits-engine');
const { validateCatalog, createCatalogStore } = require('../game-catalog');
const { game, data } = require('./helpers/game-harness.cjs');
const statuses = require('../public/unit-statuses.js');
const clone = value => JSON.parse(JSON.stringify(value));
const trait = (id,overrides={}) => ({[id]:{...TRAITS.defaults(id),...overrides}});
function simulation() {
    const state = {roundCounter:0,enemies:[],players:{},soldiers:[]};
    let id=0;
    const logs=[];
    const createEnemy = (type,x,y) => ({id:++id,type,name:type,x,y,hp:100,maxHp:100,traits:{}});
    const api = engine({getState:()=>state,getData:()=>data,createEnemy,log:text=>logs.push(text),
        damageDefender:(unit,damage)=>{unit.hp=Math.max(0,unit.hp-damage);},deathDefender:unit=>{if(unit.hp<=0)unit.deathTimer=2;}});
    function enemy(traits={},extra={}) { const e={...createEnemy('bandit',4,2),traits,...extra}; state.enemies.push(e); api.ensure(e); return e; }
    return {state,api,enemy,logs};
}

test('схема переносит старые способности в особенности, явный пустой набор отключает их',()=>{
    const input=clone(data), result=validateCatalog(input,Object.keys(data.enemies));
    assert.equal(result.enemies.orc_shaman.traits.healing.amount,data.enemies.orc_shaman.healPower);
    assert.equal(result.enemies.crowcaller.traits.summoning.type,'crow');
    input.enemies.orc_shaman.traits={};
    assert.deepEqual(validateCatalog(input,Object.keys(data.enemies)).enemies.orc_shaman.traits,{});
});

test('все семь особенностей сохраняются и восстанавливаются, копия не разделяет параметры',t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kr-traits-')),file=path.join(dir,'catalog.json');
    t.after(()=>{fs.unlinkSync(file);fs.rmdirSync(dir);});
    const store=createCatalogStore(clone(data),file),catalog=store.read().catalog;
    catalog.enemies.goblin.traits=Object.assign({},...Object.keys(TRAITS.definitions).map(id=>trait(id)));
    catalog.enemies.custom_1=clone(catalog.enemies.goblin);
    catalog.enemies.custom_1.traits.healing.amount=70;
    store.save(catalog,0);
    const restored=createCatalogStore(clone(data),file).read().catalog;
    assert.deepEqual(restored.enemies.goblin.traits,catalog.enemies.goblin.traits);
    assert.equal(restored.enemies.custom_1.traits.healing.amount,70);
    assert.equal(restored.enemies.goblin.traits.healing.amount,25);
});

test('невалидные особенности и удаление цели призыва отклоняются целиком',()=>{
    for(const mutate of [
        c=>c.enemies.goblin.traits={unknown:{}}, c=>c.enemies.goblin.traits={healing:{amount:-1}},
        c=>c.enemies.goblin.traits={shield:{percent:0}}, c=>c.enemies.goblin.traits={berserk:{threshold:100}},
        c=>c.enemies.goblin.traits={summoning:{count:1000}},c=>c.enemies.goblin.traits={summoning:{type:'missing'}},
        c=>c.enemies.goblin.traits={healing:{healSelf:'true'}},c=>c.enemies.goblin.traits={commander:{radius:NaN}},
        c=>c.enemies.goblin.traits={regeneration:{percent:1.5}},c=>c.enemies.goblin.traits={deathExplosion:{damage:Infinity}},
        c=>c.enemies.goblin.traits={summoning:{other:1}}
    ]) { const input=clone(data);mutate(input);assert.throws(()=>validateCatalog(input,Object.keys(data.enemies))); }
    const input=clone(data);
    input.enemies.custom_1=clone(input.enemies.goblin);
    input.enemies.goblin.traits=trait('summoning',{type:'custom_1'});
    delete input.enemies.custom_1;
    assert.throws(()=>validateCatalog(input,Object.keys(data.enemies)),/summon references an unknown/);
});

test('щит поглощает урон, задержка сбрасывается даже при ударе только по щиту, регенерация ждёт паузу',()=>{
    const {state,api,enemy}=simulation();
    const e=enemy({...trait('shield',{percent:35,rechargeDelay:2}),...trait('regeneration',{percent:10,delay:1})});
    api.damage(e,20);assert.equal(e.hp,100);assert.equal(e.shieldHp,15);
    state.roundCounter=1;api.damage(e,20);assert.equal(e.hp,95);assert.equal(e.shieldHp,0);
    state.roundCounter=2;api.recovery();assert.equal(e.hp,95);assert.equal(e.shieldHp,0);
    state.roundCounter=3;api.recovery();assert.equal(e.hp,100);assert.equal(e.shieldHp,0);
    state.roundCounter=4;api.recovery();assert.equal(e.shieldHp,35);
    e.traits.shield.recharge=false;api.damage(e,35);state.roundCounter=10;api.recovery();assert.equal(e.shieldHp,0);
});

test('берсерк активируется один раз, сохраняется после лечения и не накапливает бонус',()=>{
    const {api,enemy,logs}=simulation(),e=enemy(trait('berserk'));
    api.damage(e,59);assert.equal(e.rageActive,undefined);
    api.damage(e,1);assert.equal(e.rageActive,true);assert.equal(api.attackDamage(e,10),13);assert.equal(api.speedBonus(e),1);
    e.hp=100;api.damage(e,60);assert.equal(logs.filter(text=>text.includes('BERSERK')).length,1);
    assert.equal(api.attackDamage(e,10),13);assert.equal(e.speed,undefined);
    e.isPolymorphed=true;assert.equal(api.speedBonus(e),0);assert.equal(api.attackDamage(e,10),10);
});

test('аура усиливает только других мобов, берёт сильнейшую, исчезает после гибели, оглушения или выхода из радиуса',()=>{
    const {api,enemy}=simulation(),unit=enemy(trait('berserk'),{rageActive:true});
    const leader=enemy(trait('commander',{damagePercent:20}),{x:5});
    const stronger=enemy(trait('commander',{damagePercent:50}),{x:6});
    assert.equal(api.attackDamage(unit,100),195);assert.equal(api.auraBonus(stronger),20);
    stronger.hp=0;assert.equal(api.auraBonus(unit),20);
    leader.stunTurns=1;assert.equal(api.auraBonus(unit),0);
    leader.stunTurns=0;leader.x=8;assert.equal(api.auraBonus(unit),0);
});

test('целитель выбирает самых раненых в радиусе, соблюдает число целей, самолечение и интервал',()=>{
    const {state,api,enemy}=simulation();
    const healer=enemy(trait('healing',{healSelf:false,maxTargets:1,amount:25,interval:3}),{hp:10});
    const most=enemy({}, {hp:20}),less=enemy({}, {hp:70}),far=enemy({}, {x:9,hp:1});
    api.abilities();assert.equal(healer.hp,10);assert.equal(most.hp,45);assert.equal(less.hp,70);assert.equal(far.hp,1);
    state.roundCounter=2;api.abilities();assert.equal(most.hp,45);
    state.roundCounter=3;healer.stunTurns=1;api.abilities();assert.equal(most.hp,45);
    healer.stunTurns=0;healer.isPolymorphed=true;api.abilities();assert.equal(most.hp,45);
    healer.isPolymorphed=false;healer.traits.healing.healSelf=true;api.abilities();assert.equal(healer.hp,35);
});

test('призыв ограничен потомками одного владельца, интервалом, блокировкой и поколением',()=>{
    const {state,api,enemy}=simulation();
    const owner=enemy(trait('summoning',{count:2,maxAlive:3,interval:2}));
    api.abilities();assert.equal(state.enemies.length,3);assert.equal(state.enemies[1].reward,0);
    api.abilities();assert.equal(state.enemies.length,3);
    state.roundCounter=2;api.abilities();assert.equal(state.enemies.length,4);
    state.roundCounter=4;api.abilities();assert.equal(state.enemies.length,4);
    state.enemies[1].hp=0;state.players.a={hp:10,blockedEnemyIds:[owner.id]};api.abilities();assert.equal(state.enemies.length,4);
    state.players.a.blockedEnemyIds=[];api.abilities();assert.equal(state.enemies.length,5);
    owner.summonGeneration=1;state.roundCounter=6;state.enemies[2].hp=0;api.abilities();assert.equal(state.enemies.length,5);
    const second=enemy(trait('summoning',{maxAlive:1}));api.abilities();assert.equal(state.enemies.at(-1).summonedBy,second.id);
});

test('взрыв однократный, не поражает мобов и базу, пропускает прорыв и овцу',()=>{
    const {state,api,enemy,logs}=simulation();
    const bomb=enemy(trait('deathExplosion',{damage:20})),friend=enemy();
    state.baseHp=20;state.players.near={hp:10,x:4,y:2};state.players.far={hp:10,x:6,y:2};
    state.soldiers.push({hp:10,x:4,y:2,towerType:'barracks_1',blockedEnemyIds:[bomb.id]});
    api.damage(bomb,100);api.onDeath(bomb);api.onDeath(bomb);
    assert.equal(state.players.near.hp,0);assert.equal(state.players.near.deathTimer,2);assert.equal(state.players.far.hp,10);
    assert.equal(state.soldiers[0].respawnTimer,data.towers.barracks_1.respawnTurns || 2);
    assert.deepEqual(state.soldiers[0].blockedEnemyIds,[]);assert.equal(friend.hp,100);assert.equal(state.baseHp,20);
    assert.equal(logs.filter(text=>text.includes('EXPLOSION')).length,1);
    for(const extra of [{escapedToCastle:true},{isPolymorphed:true}]) {const e=enemy(trait('deathExplosion'),{hp:0,...extra});api.onDeath(e);}
    assert.equal(logs.filter(text=>text.includes('EXPLOSION')).length,1);
});

test('настоящий бой: щит защищает от ультимейта, кровотечения и урона башни',()=>{
    const g=game(),{hero}=g.player(),e=g.enemy(1,4,2,{traits:trait('shield',{percent:30,recharge:false}),bleedTurns:1,bleedDmg:10});
    g.castAbility(hero.name,'ultimate',1,1);assert.equal(e.hp,1000);assert.equal(e.shieldHp,100);
    hero.x=0;hero.y=0;g.tower('archer_1');g.moveEnemies();
    assert.equal(e.hp,1000);assert.ok(e.shieldHp<90);assert.equal(e.lastDamageRound,1);
});

test('настоящий бой: берсерк ускоряется после урона и усиливает ближнюю и дальнюю атаки с аурой',()=>{
    const g=game(),{hero}=g.player('malik');hero.x=0;hero.y=0;
    const runner=g.enemy(1,1,2,{hp:41,maxHp:100,speed:2,bleedTurns:1,bleedDmg:1,traits:trait('berserk')});
    g.moveEnemies();assert.equal(runner.x,4);assert.equal(runner.rageActive,true);
    g.state.enemies=[];hero.x=4;hero.y=2;hero.armor=0;hero.hp=hero.maxHp=1000;
    g.enemy(2,4,2,{meleeDmg:100,rageActive:true,traits:trait('berserk')});
    g.enemy(3,6,2,{traits:trait('commander')});
    g.moveEnemies();assert.equal(hero.hp,844);
    g.state.enemies[0].x=2;g.state.enemies[0].isRanged=true;g.state.enemies[0].rangedDmg=100;g.state.enemies[1].x=1;
    hero.blockedEnemyIds=[];hero.hasMovedThisRound=true;g.moveEnemies();assert.equal(hero.hp,688);
});

test('настоящий бой: универсальные лечение и призыв работают у собственного типа, потомки не призывают',()=>{
    const g=game();
    g.gameData.enemies.custom_1={...g.gameData.enemies.goblin,hp:100,speed:1,traits:{...trait('healing'),...trait('summoning',{type:'custom_1',count:2,maxAlive:2,blockedStops:false,interval:1})}};
    g.send(g.master,{type:'MASTER_SPAWN_ENEMY',enemyType:'custom_1',count:1,x:1,y:2});
    const parent=g.state.enemies[0];parent.speed=0;parent.hp=50;
    g.moveEnemies();assert.equal(parent.hp,75);assert.equal(g.state.enemies.length,3);
    g.moveEnemies();assert.equal(parent.hp,100);assert.equal(g.state.enemies.length,3); // Потомки тоже целители, но не призыватели.
    assert.ok(g.state.enemies.slice(1).every(e=>e.summonGeneration===1&&e.reward===0));
    assert.notEqual(g.state.enemies[1].traits,parent.traits);
});

test('настоящий бой: взрыв учитывает броню, барьеры, бессмертие, смерть героя и резерв гарнизона',()=>{
    const g=game(),{hero}=g.player('malik'),immortal=g.player('connor').hero;
    hero.hp=hero.maxHp=100;hero.armor=50;hero.shieldHp=10;immortal.invulnerableRounds=3;
    g.tower('barracks_1');const soldier=g.state.soldiers[0];soldier.x=4;soldier.y=2;soldier.hp=1;
    const bomb=g.enemy(1,4,2,{hp:1,maxHp:100,bleedTurns:1,bleedDmg:1,traits:trait('deathExplosion',{damage:60})});
    g.moveEnemies();assert.equal(hero.hp,80);assert.equal(hero.shieldHp,0);assert.equal(immortal.hp,immortal.maxHp);
    assert.equal(soldier.hp,0);assert.ok(soldier.respawnTimer>0);assert.equal(g.state.enemies.includes(bomb),false);
    hero.hp=1;g.enemy(2,4,2,{hp:1,maxHp:100,bleedTurns:1,bleedDmg:1,traits:trait('deathExplosion',{damage:60})});
    g.moveEnemies();assert.equal(hero.hp,0);assert.equal(hero.deathTimer,2);
});

test('настоящий бой: прорыв взрывного моба в замок наносит только штатный урон базе',()=>{
    const g=game(),{hero}=g.player();hero.x=15;hero.y=2;
    g.enemy(1,14,2,{speed:1,traits:trait('deathExplosion',{damage:1000})});
    g.moveEnemies();assert.equal(g.state.baseHp,19);assert.equal(hero.hp,hero.maxHp);
});

test('откат хода игрока возвращает щит, ХП, ярость, таймеры и параметры особенностей',()=>{
    const g=game(),{hero,ws}=g.player('malik');
    const enemy=g.enemy(1,4,2,{hp:80,maxHp:100,traits:{...trait('shield',{percent:50}),...trait('berserk',{threshold:79})}});
    enemy.shieldHp=5;enemy.nextHealRound=3;enemy.lastDamageRound=0;
    const before=clone(enemy);
    g.send(ws,{type:'PLAYER_ACTION',ability:'attack',targetId:String(enemy.id),dice:20});
    const history=g.master.messages.filter(message=>message.type==='STATE_UPDATE').at(-1).state.playerHistory;
    assert.equal(history.length,1);assert.equal(enemy.shieldHp,0);assert.equal(enemy.rageActive,true);assert.ok(enemy.hp<80);
    g.send(g.master,{type:'MASTER_ROLLBACK_PLAYER',historyId:history[0].id});
    assert.deepEqual(clone(g.state.enemies[0]),before);
    assert.equal(g.state.players[hero.name].hasAttackedThisRound,false);
});

test('сохранённый мир восстанавливает особенности и их состояние без пересоздания щита и ярости',()=>{
    const original=game();
    original.enemy(1,4,2,{hp:40,maxHp:100,shieldHp:0,rageActive:true,lastDamageRound:8,nextHealRound:12,nextSummonRound:13,
        traits:{...trait('shield'),...trait('berserk'),...trait('healing'),...trait('summoning')}});
    original.state.roundCounter=9;
    const saved=clone(original.state),restored=game({savedState:saved});
    assert.deepEqual(clone(restored.state.enemies[0]),saved.enemies[0]);
    assert.equal(restored.state.enemies[0].shieldHp,0);assert.equal(restored.state.enemies[0].rageActive,true);
});

test('старое сохранение переводит перезарядку шамана и заклинателя без досрочного применения',()=>{
    const saved=clone(game().state);saved.roundCounter=9;
    saved.enemies=[{...clone(data.enemies.orc_shaman),type:'orc_shaman',id:1,x:4,y:2,healPower:42,healCd:2},
        {...clone(data.enemies.crowcaller),type:'crowcaller',id:2,x:5,y:2,summonCd:1}];
    const restored=game({savedState:saved});
    assert.equal(restored.state.enemies[0].traits.healing.amount,42);
    assert.equal(restored.state.enemies[0].nextHealRound,12);
    assert.equal(restored.state.enemies[1].nextSummonRound,11);
});

test('карта показывает особенности, прочность щита, ярость, перезарядку и сильнейшую ауру',()=>{
    const unit={id:1,name:'Enemy',hp:30,maxHp:100,x:4,y:2,shieldHp:12,rageActive:true,nextHealRound:5,
        traits:{...trait('regeneration'),...trait('shield'),...trait('berserk'),...trait('healing'),...trait('summoning'),...trait('deathExplosion')}};
    const leader={id:2,name:'Командир',hp:100,x:5,y:2,traits:trait('commander')};
    const view=statuses.buildIndex({enemies:[unit,leader],roundCounter:3}).get(unit),text=statuses.describe(view);
    for(const part of ['durability: 12','Regeneration','Berserk: rage','ready in: 2','Summoner','Death explosion','+20% damage']) assert.ok(text.includes(part),part);
    unit.shieldHp=0;assert.ok(statuses.collect(unit).some(s=>s.id==='shield_empty'));
});
