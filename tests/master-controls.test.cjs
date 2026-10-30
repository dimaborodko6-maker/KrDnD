const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./helpers/game-harness.cjs');
const { spawnKey } = require('../master-controls');
const rules = require('../public/battle-ability-rules');
const plain = value => JSON.parse(JSON.stringify(value));
const latest = g => g.master.messages.at(-1).state;

test('очистка мобов сохраняет команду, ресурсы, поле и не вызывает смерть или награды', () => {
    const g = game(); const { hero } = g.player();
    g.enemy(1,4,2,{ traits:{ deathExplosion:{damage:10000,radius:5} } });
    hero.blockedEnemyIds = [1];
    g.state.soldiers.push({id:2,hp:10,x:4,y:2,blockedEnemyIds:[1]});
    g.state.pendingSpawns = [{type:'goblin',round:2,x:0,y:2}];
    const gold = g.state.gold, hp = hero.hp, grid = plain(g.state.grid);
    g.send(g.master, {type:'MASTER_CLEAR_ENEMIES',includePending:false});
    assert.equal(g.state.enemies.length,0); assert.equal(g.state.pendingSpawns.length,1);
    assert.equal(g.state.gold,gold); assert.equal(hero.hp,hp);
    assert.deepEqual(plain(g.state.grid),grid); assert.equal(g.state.soldiers[0].blockedEnemyIds.length,0);
    assert.equal(hero.blockedEnemyIds.length,0);
    g.send(g.master, {type:'MASTER_CLEAR_ENEMIES',includePending:true});
    assert.equal(g.state.pendingSpawns.length,0);
});

test('восстановление выборочное; воскрешение сохраняет позицию, сборку и временную броню', () => {
    const g = game(); const {hero} = g.player('torghar',['shield_wall']); const second = g.player('gerald').hero;
    Object.assign(hero,{ hp:0,deathTimer:2,mana:1,cooldowns:{spell_shield_wall:3,ultimate:4},hasAttackedThisRound:true,hasMovedThisRound:true,isReady:true,poisonTurns:2,armor:80,shieldWallRounds:2 });
    const before = plain(second), skills = plain(hero.skills), stats = plain(hero.stats);
    g.send(g.master,{type:'MASTER_RESTORE_HEROES',playerNames:[hero.name],options:{hp:true,mana:true}});
    assert.equal(hero.hp,0); assert.equal(hero.deathTimer,2); assert.equal(hero.mana,hero.maxMana);
    g.send(g.master,{type:'MASTER_RESTORE_HEROES',playerNames:[hero.name],options:{revive:true,cleanse:true,action:true,movement:true}});
    assert.equal(hero.hp,hero.maxHp); assert.equal(hero.deathTimer,0); assert.equal(hero.x,4); assert.equal(hero.y,2);
    assert.equal(hero.poisonTurns,0); assert.equal(hero.armor,80); assert.equal(hero.shieldWallRounds,2);
    assert.equal(hero.hasAttackedThisRound,false); assert.equal(hero.hasMovedThisRound,false); assert.equal(hero.isReady,false);
    assert.deepEqual(plain(hero.skills),skills); assert.deepEqual(plain(hero.stats),stats); assert.deepEqual(plain(second),before);
    g.send(g.master,{type:'MASTER_RESTORE_HEROES',playerNames:[hero.name],options:{cooldowns:true},ability:'spell_shield_wall'});
    assert.equal(hero.cooldowns.spell_shield_wall,0); assert.equal(hero.cooldowns.ultimate,4);
});

test('массовые команды атомарно отклоняют невалидные цели и параметры', () => {
    const g = game(); const {hero,ws} = g.player(); const enemy = g.enemy();
    const initial = plain(enemy);
    for (const message of [
        {type:'MASTER_MANAGE_ENEMIES',action:'heal',ids:[enemy.id,999]},
        {type:'MASTER_MANAGE_ENEMIES',action:'hp',ids:[enemy.id],hp:0},
        {type:'MASTER_MANAGE_ENEMIES',action:'hp',ids:[enemy.id],hp:1001},
        {type:'MASTER_MANAGE_ENEMIES',action:'move',ids:[enemy.id],x:-1,y:2},
        {type:'MASTER_MANAGE_ENEMIES',action:'effect',ids:[enemy.id],effect:'__proto__',turns:2,power:3},
        {type:'MASTER_RESTORE_HEROES',playerNames:[hero.name,'missing'],options:{hp:true}},
        {type:'MASTER_RESTORE_HEROES',playerNames:[hero.name],options:{hp:true,armor:true}},
        {type:'MASTER_RESTORE_HEROES',playerNames:[hero.name],options:{cooldowns:true},ability:'spell_blink'},
        {type:'MASTER_CLEAR_ENEMIES'}
    ]) {
        g.send(g.master,message); assert.equal(g.master.messages.at(-1).type,'COMMAND_ERROR'); assert.deepEqual(plain(enemy),initial);
    }
    for (const type of ['MASTER_CLEAR_ENEMIES','MASTER_RESTORE_HEROES','MASTER_CANCEL_SPAWNS','MASTER_MANAGE_ENEMIES','MASTER_UNDO_INTERVENTION']) {
        g.send(ws,{type,includePending:true,ids:[enemy.id],action:'remove',playerNames:[hero.name],options:{hp:true},all:true});
        assert.equal(ws.messages.at(-1).type,'COMMAND_ERROR'); assert.equal(g.state.enemies.length,1);
    }
});

test('изменение мобов обрабатывает выбранные экземпляры, блокировки и отрицательные эффекты', () => {
    const g = game(); const {hero} = g.player(); const first = g.enemy(1), second = g.enemy(2);
    first.hp = 10; first.isPolymorphed = true; first.polymorphTurns = 2; first.oldArmor = 40; first.armor = 0;
    g.send(g.master,{type:'MASTER_MANAGE_ENEMIES',action:'cleanse',ids:[1]});
    assert.equal(first.isPolymorphed,false); assert.equal(first.armor,40);
    g.send(g.master,{type:'MASTER_MANAGE_ENEMIES',action:'heal',ids:[1]}); assert.equal(first.hp,1000);
    g.send(g.master,{type:'MASTER_MANAGE_ENEMIES',action:'hp',ids:[1],hp:50}); assert.equal(first.hp,50); assert.equal(second.hp,1000);
    g.send(g.master,{type:'MASTER_MANAGE_ENEMIES',action:'effect',ids:[1],effect:'poison',turns:2,power:7});
    assert.equal(first.poisonTurns,2); assert.equal(first.poisonDmg,7);
    hero.blockedEnemyIds=[1,2]; g.state.soldiers.push({id:5,hp:10,blockedEnemyIds:[1]});
    g.send(g.master,{type:'MASTER_MANAGE_ENEMIES',action:'move',ids:[1],x:10,y:2});
    assert.equal(first.x,10); assert.ok(!hero.blockedEnemyIds.includes(1)); assert.equal(g.state.soldiers[0].blockedEnemyIds.length,0);
    const gold = g.state.gold;
    g.send(g.master,{type:'MASTER_MANAGE_ENEMIES',action:'remove',ids:[1]}); assert.equal(g.state.enemies.length,1); assert.equal(g.state.gold,gold);
});

test('отмена подкреплений удаляет только конкретную группу', () => {
    const g=game();
    const group={type:'goblin',round:2,x:0,y:2};
    g.state.pendingSpawns=[{...group},{...group},{...group,round:3}];
    g.send(g.master,{type:'MASTER_CANCEL_SPAWNS',group:spawnKey(group)});
    assert.equal(g.state.pendingSpawns.length,1); assert.equal(g.state.pendingSpawns[0].round,3);
    g.send(g.master,{type:'MASTER_CANCEL_SPAWNS',group:spawnKey(group)}); assert.equal(g.master.messages.at(-1).type,'COMMAND_ERROR');
    g.send(g.master,{type:'MASTER_CANCEL_SPAWNS',all:true}); assert.equal(g.state.pendingSpawns.length,0);
});

test('отмена вмешательства восстанавливает мир; снимок скрыт, изменения мира инвалидируют отмену', () => {
    const g=game(); const {hero,ws}=g.player(); g.enemy(); hero.hp=1;
    const before=plain(g.state);
    g.send(g.master,{type:'MASTER_CLEAR_ENEMIES',includePending:true});
    const id=latest(g).masterUndo.id;
    assert.equal(latest(g).masterUndo.snapshot,undefined);
    assert.equal(ws.messages.at(-1).state.masterUndo,undefined);
    g.send(g.master,{type:'REGISTER_MASTER'}); assert.equal(latest(g).masterUndo.id,id);
    g.send(g.master,{type:'MASTER_UNDO_INTERVENTION',id});
    assert.deepEqual(plain(g.state.enemies),before.enemies); assert.deepEqual(plain(g.state.players),before.players); assert.equal(g.state.masterUndo,undefined);
    g.send(g.master,{type:'MASTER_RESTORE_HEROES',playerNames:[hero.name],options:{hp:true}});
    const nextId=latest(g).masterUndo.id;
    g.send(ws,{type:'TOGGLE_READY'}); assert.equal(g.state.masterUndo,undefined);
    g.send(g.master,{type:'MASTER_UNDO_INTERVENTION',id:nextId}); assert.equal(g.master.messages.at(-1).type,'COMMAND_ERROR');
    const history=latestAfterRegister(g).playerHistory;
    g.send(g.master,{type:'MASTER_ROLLBACK_PLAYER',historyId:history[0].id});
    assert.equal(g.state.masterUndo,undefined);
});
function latestAfterRegister(g) { g.send(g.master,{type:'REGISTER_MASTER'}); return latest(g); }

test('общие метаданные дальности сохраняют круг и клеточную геометрию', () => {
    assert.equal(rules.rangeInfo('attack',{heroKey:'gerald',range:1}).metric,'chebyshev');
    assert.equal(rules.rangeInfo('attack',{heroKey:'zefira',range:4}).metric,'euclidean');
    assert.equal(rules.rangeInfo('spell_blades',{heroKey:'zefira',range:4}).range,1);
    assert.equal(rules.manaCost('spell_blink'),3); assert.equal(rules.manaCost('ultimate'),0);
});

test('восстановление и эффекты сохраняются после загрузки; снимок отмены не переживает перезапуск', () => {
    const g=game(); const {hero}=g.player(); hero.hp=1;
    g.enemy();
    g.send(g.master,{type:'MASTER_RESTORE_HEROES',playerNames:[hero.name],options:{hp:true,mana:true}});
    g.send(g.master,{type:'MASTER_MANAGE_ENEMIES',action:'effect',ids:[1],effect:'poison',turns:2,power:7});
    const restored=game({savedState:plain(g.state)});
    assert.equal(restored.state.masterUndo,undefined);
    assert.equal(restored.state.players[hero.name].hp,hero.maxHp);
    assert.equal(restored.state.enemies[0].poisonTurns,2);
    assert.equal(restored.state.enemies[0].poisonDmg,7);
    const hp=restored.state.enemies[0].hp;
    restored.moveEnemies();
    assert.equal(restored.state.enemies[0].hp,hp-7);
    assert.equal(restored.state.enemies[0].poisonTurns,1);
});
