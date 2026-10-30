const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { game, targetUI, clientSource, data } = require('./helpers/game-harness.cjs');

test('Джеральд выбирает врага для ультимейта и наносит 200 чистого урона', () => {
    const g = game(); const { hero } = g.player(); const enemy = g.enemy();
    const targets = targetUI(g.state, 'gerald', 'ultimate');
    assert.ok(targets.ids.includes('1')); assert.ok(!targets.ids.includes('-1'));
    g.castAbility(hero.name, 'ultimate', 1, 1);
    assert.equal(enemy.hp, 800); assert.equal(hero.hasAttackedThisRound, true);
});
test('Малик применяет круговой ультимейт без вражеской цели', () => {
    const g = game(); const { hero } = g.player('malik'); const enemy = g.enemy(); const far = g.enemy(2, 8, 2);
    g.castAbility(hero.name, 'ultimate', -1, 1);
    assert.equal(enemy.hp, 820); assert.equal(far.hp, 1000); assert.equal(hero.cooldowns.ultimate, 5);
});
for (const [key, turns] of [['torghar',1], ['connor',2]]) {
    test(key + ': иммунитет защищает ровно ' + turns + ' ходов врагов', () => {
        const g = game(); const { hero } = g.player(key); g.enemy(1,4,2,{meleeDmg:10}); hero.blockedEnemyIds=[1];
        g.castAbility(key,'ultimate',-1,1);
        const hp = hero.hp;
        for(let i=0;i<turns;i++) { g.moveEnemies(); assert.equal(hero.hp,hp); }
        assert.equal(hero.invulnerableRounds,0);
        g.moveEnemies(); assert.ok(hero.hp<hp);
        if(key==='torghar') assert.equal(hero.blockLimit,3);
    });
}
test('Shield Wall сохраняет броню на два полных хода и возвращает прежнее значение', () => {
    const g = game(); const { hero } = g.player('torghar',['shield_wall']);
    g.castAbility('torghar','spell_shield_wall',-1,1);
    assert.equal(hero.armor,80); g.moveEnemies(); assert.equal(hero.armor,80);
    g.moveEnemies(); assert.equal(hero.armor,55);
});
test('смерть при отступлении запускает обычное возрождение', () => {
    const g = game(); const { hero, ws } = g.player(); g.enemy(1,4,2,{meleeDmg:100}); hero.blockedEnemyIds=[1]; hero.hp=1;
    g.send(ws,{type:'MOVE_HERO',x:6,y:2});
    assert.equal(hero.hp,0); assert.equal(hero.deathTimer,2); assert.equal(hero.x,4);
    g.moveEnemies(); assert.equal(hero.deathTimer,1);
    g.moveEnemies(); assert.equal(hero.hp,hero.maxHp); assert.equal(hero.deathTimer,0); assert.equal(hero.x,15);
});
test('недопустимое перемещение не наносит ударов в спину и не расходует движение', () => {
    const g=game(); const {hero,ws}=g.player(); g.enemy(); hero.blockedEnemyIds=[1];
    const hp=hero.hp;
    for(const x of [12,-1]) g.send(ws,{type:'MOVE_HERO',x,y:2});
    assert.equal(hero.hp,hp); assert.equal(hero.x,4); assert.equal(hero.hasMovedThisRound,false);
});
test('Fated Survivor спасает и при отступлении', () => {
    const g=game(); const {hero,ws}=g.player('gerald',['fated']); g.enemy(1,4,2,{meleeDmg:100}); hero.blockedEnemyIds=[1];hero.hp=1;
    g.send(ws,{type:'MOVE_HERO',x:6,y:2});
    assert.ok(hero.hp>0);assert.equal(hero.deathTimer,0);assert.equal(hero.fatedUsedThisWave,true);
});
test('враг на клетке замка учитывается даже после перехвата или размещения мастером', () => {
    const g=game();const {hero}=g.player();hero.x=15;
    g.enemy(1,14,2,{speed:1});g.moveEnemies();
    assert.equal(g.state.baseHp,19);assert.equal(g.state.enemies.length,0);
    g.enemy(2,15,2);g.moveEnemies();assert.equal(g.state.baseHp,18);assert.equal(g.state.enemies.length,0);
});
test('гарнизон атакует оглушённого врага, а враг пропускает атаку', () => {
    const g=game();const {hero}=g.player();hero.x=0;hero.y=0;g.tower('barracks_1');
    const s=g.state.soldiers[0],e=g.enemy(1,s.x,s.y,{stunTurns:1});s.blockedEnemyIds=[1];
    g.moveEnemies();assert.equal(e.hp,991);assert.deepEqual(Array.from(g.state.soldiers,s=>s.hp),[40,40,40]);
});
for(const cleave of [false,true]) {
    test('одна атака врага по гарнизону: aoeCleave='+cleave,()=>{
        const g=game();const {hero}=g.player();hero.x=0;hero.y=0;g.tower('barracks_1');
        const s=g.state.soldiers[0];g.enemy(1,s.x-1,s.y,{speed:1,meleeDmg:10,aoeCleave:cleave});
        g.moveEnemies();assert.equal(g.state.soldiers.filter(s=>s.hp<40).length,cleave?3:1);
    });
}
test('одиночный враг не атакует одновременно героя и солдат',()=>{
    const g=game();const {hero}=g.player();g.tower('barracks_1');g.enemy(1,3,2,{speed:1,meleeDmg:10});
    g.moveEnemies();assert.ok(hero.hp<hero.maxHp);assert.ok(g.state.soldiers.every(s=>s.hp===s.maxHp));
});
test('барьер Рэтчета поглощает урон солдату',()=>{
    const g=game();const {hero}=g.player('ratchet',['ambulance_rush']);g.tower('barracks_1');
    const s=g.state.soldiers[0];g.enemy(1,s.x,s.y,{meleeDmg:10});s.blockedEnemyIds=[1];hero.x=2;
    g.castAbility('ratchet','spell_ambulance_rush','soldier_'+s.id,8);hero.x=0;hero.y=0;
    g.moveEnemies();g.moveEnemies();assert.equal(s.hp,40);assert.equal(s.shieldHp,2);
});
test('дальняя атака учитывает броню и Iron Skin',()=>{
    const g=game();const {hero}=g.player('torghar',['flat_reduction']);hero.x=1;hero.y=0;
    g.enemy(1,4,2,{isRanged:true,range:4,rangedDmg:13});const hp=hero.hp;
    g.moveEnemies();assert.equal(hp-hero.hp,5);
});
test('повторная постройка чародея позволяет снова купить и призвать голема',()=>{
    const g=game();const {ws}=g.player();g.tower('mage_sorcerer');
    const buy={type:'BUY_TOWER_UPGRADE',x:4,y:1,upgradeId:'sorcerer_golem'};
    g.send(ws,buy);assert.equal(g.state.soldiers.length,1);
    g.send(ws,{type:'REQUEST_DEMOLISH',x:4,y:1});assert.equal(g.state.soldiers.length,0);assert.equal(g.state.grid[1][4].upgrades,undefined);
    g.send(ws,{type:'BUILD_TOWER',x:4,y:1,towerType:'mage_1'});
    for(const targetType of ['mage_2','mage_3','mage_sorcerer'])g.send(ws,{type:'UPGRADE_TOWER',x:4,y:1,targetType});
    g.send(ws,buy);assert.equal(g.state.soldiers.length,1);assert.equal(g.state.soldiers[0].isGolem,true);
});
test('изменение размера сохраняет улучшения, точку сбора и состояние гарнизона',()=>{
    const g=game();const {ws}=g.player();g.tower('mage_sorcerer');g.send(ws,{type:'BUY_TOWER_UPGRADE',x:4,y:1,upgradeId:'sorcerer_golem'});
    const before=JSON.parse(JSON.stringify(g.state.grid[1][4]));g.state.soldiers[0].hp=100;
    for(const width of [16,20,8])g.send(g.master,{type:'MASTER_RESIZE_MAP',width,height:16});
    assert.deepEqual(JSON.parse(JSON.stringify(g.state.grid[1][4])),before);assert.equal(g.state.soldiers[0].hp,100);
});
test('сокращение карты удаляет гарнизон башни за её пределами',()=>{
    const g=game();g.tower('barracks_1',12,1);g.send(g.master,{type:'MASTER_RESIZE_MAP',width:8,height:8});
    assert.equal(g.state.soldiers.length,0);
});
test('Foehammer наносит сплеш по клетке цели',()=>{
    const g=game();g.player('malik',['joehammer']);const a=g.enemy(),b=g.enemy(2),far=g.enemy(3,5,2);
    g.castAbility('malik','attack',1,8);assert.equal(a.hp,986);assert.equal(b.hp,993);assert.equal(far.hp,1000);
});
test('Explosive Rounds взрывается только на каждом пятом дальнем выстреле',()=>{
    const g=game();const {hero}=g.player('bolin',['explosive']);hero.x=1;g.enemy();const other=g.enemy(2,5,2);
    for(let i=0;i<4;i++){hero.hasAttackedThisRound=false;g.castAbility('bolin','attack',1,8);assert.equal(other.hp,1000);}
    hero.hasAttackedThisRound=false;g.castAbility('bolin','attack',1,8);assert.equal(other.hp,990);
});
test('Blink выбирает клетку, телепортирует, даёт движение и временный бонус скорости',()=>{
    const g=game();const {hero,ws}=g.player('zefira',['blink']);
    assert.ok(targetUI(g.state,'zefira','spell_blink').ids.includes('cell_8_2'));
    g.castAbility('zefira','spell_blink','cell_8_2',8);assert.equal(hero.x,8);assert.equal(hero.speedBonus,2);assert.equal(hero.cooldowns.spell_blink,2);
    g.send(ws,{type:'MOVE_HERO',x:14,y:2});assert.equal(hero.x,14);
    g.moveEnemies();assert.equal(hero.speedBonus,2);g.moveEnemies();assert.equal(hero.speedBonus,0);
});
test('неверная клетка Blink не расходует действие и ману',()=>{
    const g=game();const {hero}=g.player('zefira',['blink']);const mana=hero.mana;
    g.castAbility('zefira','spell_blink','cell_14_2',8);assert.equal(hero.mana,mana);assert.equal(hero.hasAttackedThisRound,false);
});
test('Obliterate отбрасывает на две клетки к спавну и разрывает блокирование',()=>{
    const g=game();const {hero}=g.player('malik',['obliterate']);const e=g.enemy(1,5,2);hero.blockedEnemyIds=[1];
    g.castAbility('malik','spell_obliterate',1,8);assert.equal(e.x,3);assert.equal(hero.blockedEnemyIds.length,0);
});
test('Templar Retribution парирует только следующую атаку и контратакует',()=>{
    const g=game();const {hero}=g.player('connor',['connor_retribution']);const e=g.enemy(1,4,2,{meleeDmg:10});hero.blockedEnemyIds=[1];
    g.castAbility('connor','spell_connor_retribution',-1,12);assert.equal(e.hp,1000);const hp=hero.hp;
    g.moveEnemies();assert.equal(hero.hp,hp);assert.equal(e.hp,986);
    g.moveEnemies();assert.equal(hero.hp,hp-10);
});
test('мину можно поставить на пустую дорогу; она взрывается один раз при наступании',()=>{
    const g=game();const {hero}=g.player('bolin',['mines']);
    assert.ok(targetUI(g.state,'bolin','spell_mines').ids.includes('cell_5_2'));
    g.castAbility('bolin','spell_mines','cell_5_2',12);assert.equal(g.state.mines.length,1);hero.x=0;hero.y=0;
    const e=g.enemy(1,4,2,{speed:1});g.moveEnemies();assert.equal(e.hp,986);assert.equal(g.state.mines.length,0);
    g.moveEnemies();assert.equal(e.hp,986);
});
test('новая волна сбрасывает Fated Survivor и бонус урона варваров',()=>{
    const g=game();const {hero}=g.player('gerald',['fated']);g.tower('barracks_barbarians');g.state.soldiers[0].dmg=35;
    hero.fatedUsedThisWave=true;g.send(g.master,{type:'MASTER_START_PRESET_WAVE',waveIndex:0});
    assert.equal(hero.fatedUsedThisWave,false);assert.equal(g.state.soldiers[0].dmg,20);
    hero.hp=0;g.applyDeathOrSurvival(hero);assert.ok(hero.hp>0);
});
test('offsetDelay выпускает группы на соответствующих ходах, не объявляя волну завершённой заранее',()=>{
    const g=game();g.send(g.master,{type:'MASTER_START_PRESET_WAVE',waveIndex:1});
    assert.equal(g.state.enemies.length,3);assert.equal(g.state.pendingSpawns.length,4);
    g.state.enemies=[];g.moveEnemies();assert.equal(g.state.enemies.length,2);assert.equal(g.state.pendingSpawns.length,2);
    assert.ok(g.state.actionLogs.every(entry=>!entry.text.includes('ВОЛНА ЗАЧИЩЕНА')));
    g.moveEnemies();assert.equal(g.state.enemies.length,4);assert.equal(g.state.pendingSpawns.length,0);
});
test('сброс сессии удаляет отложенные группы, мины и напалм',()=>{
    const g=game();g.send(g.master,{type:'MASTER_START_PRESET_WAVE',waveIndex:1});g.state.mines.push({x:1,y:2,damage:10});g.state.napalmPuddles=[{x:1,y:2,turns:2}];
    g.send(g.master,{type:'MASTER_RESET_SESSION',clearTowers:false});g.moveEnemies();
    assert.equal(g.state.enemies.length,0);assert.equal(g.state.pendingSpawns.length,0);assert.equal(g.state.mines.length,0);assert.equal(g.state.napalmPuddles.length,0);
});
test('сервер отклоняет повторно выданные очки и способности другого героя',()=>{
    const g=game();const ws=g.connect();
    for(const [stats,skills] of [[{str:20,dex:20,con:20,int:20,wis:20,cha:20},['fated']], [{str:10,dex:10,con:10,int:10,wis:10,cha:10},['blink']]]) {
        g.send(ws,{type:'REGISTER_PLAYER',name:'invalid',heroName:data.heroes.gerald.heroName,stats,skills});assert.equal(g.state.players.invalid,undefined);
    }
});
test('повторный показ конструктора не возвращает потраченные очки, смена героя удаляет чужие навыки',()=>{
    const nodes={};const element=()=>({innerHTML:'',innerText:'',style:{},classList:{remove(){},add(){}},appendChild(){}});
    const document={getElementById:id=>nodes[id]??=(element()),createElement:element};
    const context=vm.createContext({document,window:{GAME_DATA:data},alert(){}});
    const setup=clientSource.slice(clientSource.indexOf('const heroesBase ='),clientSource.indexOf('function renderSkillsBuilder('));
    vm.runInContext(setup+"\nwindow.selectHero(0);for(let i=0;i<10;i++)window.adjustStat('str',1);renderStatsBuilder();character.skills=['fated','steel','vigor'];window.selectHero(1);globalThis.result={points:poolPoints,str:character.stats.str,skills:character.skills};",context);
    assert.equal(context.result.points,17);assert.equal(context.result.str,20);assert.equal(context.result.skills.length,0);
});
