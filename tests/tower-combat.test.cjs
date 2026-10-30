const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game, data } = require('./helpers/game-harness.cjs');

function tower(g, type, upgrades = [], x = 4, y = 1) {
    g.tower(type, x, y);
    const cell = g.state.grid[y][x];
    cell.upgrades = upgrades;
    return cell;
}
function fire(g, round = 1) {
    g.state.roundCounter = round;
    g.fireTowers();
}

test('обычная атака выбирает первого врага в круглом радиусе, включая точную границу', () => {
    const g = game(); tower(g, 'archer_1'); g.gameData.towers.archer_1.range = 5;
    const outside = g.enemy(1, 8, 5), edge = g.enemy(2, 7, 5), closer = g.enemy(3, 4, 2);
    fire(g);
    assert.equal(outside.hp, 1000); assert.equal(edge.hp, 993); assert.equal(closer.hp, 1000);
});

for (const [type, armor, magicRes, damage] of [['archer_1', 50, 0, 4], ['mage_1', 90, 25, 9]]) {
    test(type + ': обычный выстрел учитывает свой вид сопротивления', () => {
        const g = game(); tower(g, type); const e = g.enemy(1, 4, 2, { armor, magicRes });
        fire(g); assert.equal(e.hp, 1000 - damage);
    });
}

test('бомбарда пропускает воздух при выборе основной цели, осколки сохраняют прежние правила', () => {
    const g = game(); tower(g, 'bombard_1');
    const air = g.enemy(1, 4, 2, { isFlying: true, armor: 50 });
    const ground = g.enemy(2, 5, 2, { armor: 50 });
    fire(g); assert.equal(ground.hp, 990); assert.equal(air.hp, 995);
});

test('фазы инициативы и порядок клеток внутри фазы сохраняются', () => {
    const g = game();
    tower(g, 'archer_3', [], 5, 1); tower(g, 'archer_1', [], 4, 1);
    tower(g, 'mage_1', [], 3, 1); tower(g, 'archer_musketeer', [], 2, 1);
    const first = g.enemy(1, 4, 2, { hp: 7 }), second = g.enemy(2, 4, 2);
    fire(g);
    const shots = g.state.debugLogs.filter(text => text.includes('[TOWER_SHOT]'));
    assert.match(shots[0], /Archers I\]/); assert.match(shots[1], /Archers III\]/);
    assert.match(shots[2], /Mage Tower I\]/); assert.match(shots[3], /Musketeer/);
    assert.equal(first.hp, 0); assert.equal(second.hp, 1000 - 24 - 12 - 65);
});

test('инициатива вне существующих фаз не добавляет башне атаку', () => {
    const g = game(); tower(g, 'archer_1'); g.gameData.towers.archer_1.initiative = 100;
    const e = g.enemy(); fire(g); assert.equal(e.hp, 1000);
});

test('следопыт накладывает яд, а корни срабатывают по номеру общего раунда', () => {
    for (const round of [2, 3]) {
        const g = game(); tower(g, 'archer_ranger', ['ranger_poison', 'ranger_roots']);
        const e = g.enemy(); fire(g, round);
        assert.equal(e.hp, 972); assert.equal(e.poisonTurns, 2); assert.equal(e.poisonDmg, 6);
        assert.equal(e.stunTurns, round === 3 ? 1 : 0);
    }
});

test('яд следопыта тикает со следующего хода и обновляется очередным попаданием', () => {
    const g = game(); tower(g, 'archer_ranger', ['ranger_poison']); const e = g.enemy();
    g.moveEnemies(); assert.equal(e.hp, 972);
    g.moveEnemies(); assert.equal(e.hp, 938); assert.equal(e.poisonTurns, 2);
});

test('разрывные пули уменьшают броню главной цели на 35 пунктов и дают осколки', () => {
    const g = game(); tower(g, 'archer_musketeer', ['musketeer_shrapnel']);
    const main = g.enemy(1, 4, 2, { armor: 60 }), other = g.enemy(2, 5, 2, { armor: 50 });
    fire(g); assert.equal(main.hp, 951); assert.equal(other.hp, 990);
});

test('меткий выстрел: порог мгновенного убийства, тройной урон и защита босса', () => {
    for (const [extra, expected] of [
        [{ hp: 150, maxHp: 150 }, 0],
        [{}, 886],
        [{ isMiniBoss: true, armor: 50 }, 925]
    ]) {
        const g = game({ random: 0.1 }); const cell = tower(g, 'archer_musketeer', ['musketeer_sniper']);
        const e = g.enemy(1, 4, 2, extra); fire(g);
        assert.equal(e.hp, expected); assert.equal(cell.lastSniperRound, 1);
    }
});

test('меткий выстрел сохраняет шанс 35% и перезарядку три раунда', () => {
    const g = game({ random: 0.34 }); const cell = tower(g, 'archer_musketeer', ['musketeer_sniper']);
    const e = g.enemy(); fire(g, 1); assert.equal(cell.lastSniperRound, 1);
    fire(g, 3); assert.equal(cell.lastSniperRound, 1);
    fire(g, 4); assert.equal(cell.lastSniperRound, 4); assert.equal(e.hp, 1000 - 45 * 7);
    const failed = game({ random: 0.35 });
    const failedCell = tower(failed, 'archer_musketeer', ['musketeer_sniper']);
    failed.enemy(); fire(failed); assert.equal(failedCell.lastSniperRound, undefined);
});

test('арканный приговор выбирает первую цель и повторяется через пять раундов', () => {
    const g = game(); const cell = tower(g, 'mage_arcane', ['arcane_death']);
    for (let round = 1; round <= 6; round++) {
        g.state.enemies = [];
        const first = g.enemy(round, 4, 2, { hp: 200, maxHp: 200 });
        fire(g, round);
        assert.equal(first.hp, round === 1 || round === 6 ? 0 : 120);
        assert.equal(cell.lastArcaneDeathRound, round === 6 ? 6 : 1);
    }
});

test('приговор сохраняет порог ХП и урон боссу, даже если первая цель не подлежит казни', () => {
    for (const [extra, expected] of [[{ hp: 201, maxHp: 201 }, 121], [{ isBoss: true }, 770]]) {
        const g = game(); const cell = tower(g, 'mage_arcane', ['arcane_death']);
        const e = g.enemy(1, 4, 2, extra), second = g.enemy(2, 4, 2, { hp: 100, maxHp: 100 });
        fire(g); assert.equal(e.hp, expected); assert.equal(second.hp, 100);
        assert.equal(cell.lastArcaneDeathRound, 1);
    }
});

test('телепортация выбирает ближайшую к замку цель, сохраняя порядок при равенстве', () => {
    const g = game(); const cell = tower(g, 'mage_arcane', ['arcane_teleport']);
    const far = g.enemy(1, 4, 2), near = g.enemy(2, 6, 2), tied = g.enemy(3, 6, 2);
    fire(g); assert.equal(far.x, 4); assert.equal(near.x, 4); assert.equal(tied.x, 6);
    assert.equal(cell.lastTeleportRound, 1);
    fire(g, 5); assert.equal(cell.lastTeleportRound, 1);
    fire(g, 6); assert.equal(tied.x, 4); assert.equal(cell.lastTeleportRound, 6);
});

test('неудачная телепортация не расходует перезарядку', () => {
    const g = game(); const cell = tower(g, 'mage_arcane', ['arcane_teleport']);
    g.state.grid[2][0].type = 'road'; g.enemy(); fire(g);
    assert.equal(cell.lastTeleportRound, undefined);
});

test('полиморф сохраняет шанс, длительность, потерю ХП и иммунитет босса', () => {
    const g = game({ random: 0.1 }); tower(g, 'mage_sorcerer', ['sorcerer_polymorph']);
    const e = g.enemy(1, 4, 2, { armor: 50 }); fire(g);
    assert.equal(e.hp, 580); assert.equal(e.maxHp, 600); assert.equal(e.armor, 0);
    assert.equal(e.oldArmor, 50); assert.equal(e.polymorphTurns, 2);
    fire(g, 2); assert.equal(e.maxHp, 600);
    const bossGame = game({ random: 0.1 }); tower(bossGame, 'mage_sorcerer', ['sorcerer_polymorph']);
    const boss = bossGame.enemy(1, 4, 2, { isMiniBoss: true }); fire(bossGame);
    assert.equal(boss.isPolymorphed, undefined); assert.equal(boss.maxHp, 1000);
});

test('ракета Берты срабатывает по чётным раундам вне радиуса, включая воздух и равные цели', () => {
    const g = game(); tower(g, 'bombard_bertha', ['bertha_missiles'], 0, 0);
    const far = g.enemy(1, 10, 2), first = g.enemy(2, 14, 2, { isFlying: true, armor: 100 });
    const tied = g.enemy(3, 14, 2);
    fire(g, 1); assert.equal(first.hp, 1000);
    fire(g, 2); assert.equal(first.hp, 950); assert.equal(tied.hp, 1000); assert.equal(far.hp, 1000);
});

test('напалм появляется на месте попадания даже после гибели основной цели', () => {
    const g = game(); tower(g, 'bombard_bertha', ['bertha_napalm']); g.enemy(1, 4, 2, { hp: 1 });
    fire(g); assert.deepEqual(JSON.parse(JSON.stringify(g.state.napalmPuddles)), [{ x: 4, y: 2, turns: 2, dmg: 10 }]);
});

for (const upgraded of [false, true]) {
    test('Тесла: порядок цепи, круглый радиус, обход сопротивления и лимит, перегрузка=' + upgraded, () => {
        const g = game({ random: 0.1 }); tower(g, 'bombard_tesla', upgraded ? ['tesla_overcharge'] : []);
        const main = g.enemy(1, 4, 2, { magicRes: 80 });
        const outside = g.enemy(2, 6, 3), chain = [];
        for (let id = 3; id <= 7; id++) chain.push(g.enemy(id, 6, 2, { magicRes: 100 }));
        fire(g); assert.equal(main.hp, 991); assert.equal(outside.hp, 1000);
        const count = upgraded ? 4 : 2, damage = upgraded ? 30 : 20;
        assert.deepEqual(chain.map(e => e.hp), chain.map((_, i) => i < count ? 1000 - damage : 1000));
        assert.deepEqual(chain.map(e => e.stunTurns), chain.map((_, i) => upgraded && i < count ? 1 : 0));
    });
}

test('поле Теслы действует до выстрела, использует смежные клетки и выдаёт награду один раз', () => {
    const g = game(); tower(g, 'bombard_tesla', ['tesla_field']);
    const e = g.enemy(1, 5, 2, { hp: 15, magicRes: 100, reward: 9 });
    fire(g); assert.equal(e.hp, 0); assert.equal(g.state.gold, 10009);
    assert.equal(g.state.enemies.length, 0);
    assert.equal(g.state.debugLogs.some(text => text.includes('[TOWER_SHOT]')), false);
});

test('цепная молния проходит через систему щитов врага', () => {
    const g = game(); tower(g, 'bombard_tesla'); g.enemy();
    const other = g.enemy(2, 5, 2, { traits: { shield: { percent: 10 } } });
    fire(g); assert.equal(other.hp, 1000); assert.equal(other.shieldHp, 80); assert.equal(other.lastDamageRound, 1);
});

test('убитый башней враг запускает взрыв при гибели ровно один раз', () => {
    const g = game(); const { hero } = g.player('malik'); hero.armor = 0; hero.hp = hero.maxHp = 100;
    tower(g, 'bombard_tesla', ['tesla_field']);
    g.enemy(1, 4, 2, { hp: 1, traits: { deathExplosion: { radius: 1, damage: 20 } } });
    fire(g); assert.equal(hero.hp, 80);
    assert.equal(g.state.actionLogs.filter(e => e.text.includes('DEATH EXPLOSION')).length, 1);
});

test('наездник после гибели основной цели доступен следующей башне в том же ходе', () => {
    const g = game(); tower(g, 'archer_1'); tower(g, 'archer_1', [], 5, 1);
    g.enemy(1, 4, 2, { type: 'goblin_rider', hp: 5, maxHp: 100, reward: 9 });
    fire(g); assert.equal(g.state.gold, 10009); assert.equal(g.state.enemies.length, 1);
    assert.equal(g.state.enemies[0].type, 'goblin'); assert.equal(g.state.enemies[0].hp, data.enemies.goblin.hp - 7);
});

test('смерть основной и побочной целей от взрыва начисляет каждую награду один раз', () => {
    const g = game(); tower(g, 'bombard_1');
    g.enemy(1, 4, 2, { hp: 1, reward: 7 }); g.enemy(2, 5, 2, { hp: 1, reward: 9 });
    fire(g); assert.equal(g.state.gold, 10016); assert.equal(g.state.enemies.length, 0);
});

test('паладины лечатся в общем третьем раунде при ХП строго ниже половины', () => {
    const g = game(); tower(g, 'barracks_paladins', ['paladin_grace']);
    const [low, half] = g.state.soldiers; low.hp = 20; half.hp = 75;
    g.state.roundCounter = 1; g.moveEnemies(); assert.equal(low.hp, 20);
    g.moveEnemies(); assert.equal(low.hp, 95); assert.equal(half.hp, 75);
});

test('святой щит паладина блокирует удар, сохраняя ответную атаку гарнизона', () => {
    const g = game({ random: 0.1 }); tower(g, 'barracks_paladins', ['paladin_shield']);
    const soldier = g.state.soldiers[0], e = g.enemy(1, soldier.x, soldier.y, { meleeDmg: 100 });
    g.moveEnemies(); assert.equal(soldier.hp, 150); assert.equal(e.hp, 964);
});

test('варвары предпочитают воздушную цель для топоров и сохраняют фиксированный урон', () => {
    const g = game(); tower(g, 'barracks_barbarians', ['barbarian_axes']);
    g.enemy(1, 6, 2); const air = g.enemy(2, 6, 2, { isFlying: true, armor: 100 });
    g.moveEnemies(); assert.equal(air.hp, 955);
});

test('жажда крови лечит убийцу и усиливает его до завершения волны', () => {
    const g = game(); tower(g, 'barracks_barbarians', ['barbarian_bloodlust']);
    const soldier = g.state.soldiers[0]; soldier.hp = 50;
    g.enemy(1, soldier.x, soldier.y, { hp: 1, stunTurns: 1 }); g.enemy(2, 0, 0);
    g.moveEnemies(); assert.equal(soldier.hp, 80); assert.equal(soldier.dmg, 25);
});

test('топоры варваров выбирают свободную наземную цель и пропускают удерживаемую', () => {
    const g = game(); const { hero } = g.player(); hero.x = 6; hero.y = 2;
    tower(g, 'barracks_barbarians', ['barbarian_axes']);
    g.enemy(1, 6, 2); hero.blockedEnemyIds = [1];
    const free = g.enemy(2, 2, 2);
    g.moveEnemies(); assert.equal(free.hp, 955);
    assert.equal(g.state.debugLogs.filter(text => text.includes('[BARBARIAN_AXE_GROUND]')).length, 3);
});

test('после полного отката башни используют восстановленный мир и купленные способности', () => {
    const g = game(); const { ws } = g.player(); tower(g, 'mage_arcane');
    g.send(ws, { type: 'BUY_TOWER_UPGRADE', x: 4, y: 1, upgradeId: 'arcane_death' });
    const changedState = g.state;
    const history = g.master.messages.at(-1).state.playerHistory;
    g.send(g.master, { type: 'MASTER_ROLLBACK_PLAYER', historyId: history[0].id });
    assert.notEqual(g.state, changedState);
    const enemy = g.enemy(1, 4, 2, { hp: 200, maxHp: 200 });
    fire(g); assert.equal(enemy.hp, 120);
    assert.equal(g.state.grid[1][4].lastArcaneDeathRound, undefined);
});

test('новый раунд пересобирает список башен после замены типа и изменения размеров карты', () => {
    const g = game(); tower(g, 'archer_1'); const enemy = g.enemy();
    fire(g); assert.equal(enemy.hp, 993);
    g.send(g.master, { type: 'MASTER_SET_TOWER', x: 4, y: 1, towerType: 'mage_1' });
    g.send(g.master, { type: 'MASTER_RESIZE_MAP', width: 20, height: 20 });
    fire(g, 2); assert.equal(enemy.hp, 981);
    g.send(g.master, { type: 'MASTER_SET_TOWER', x: 4, y: 1, towerType: 'slot' });
    fire(g, 3); assert.equal(enemy.hp, 981);
});

test('загрузка сохранённой башни сохраняет её перезарядку', () => {
    const original = game(); const cell = tower(original, 'mage_arcane', ['arcane_death']);
    cell.lastArcaneDeathRound = 4;
    const g = game({ savedState: JSON.parse(JSON.stringify(original.state)) });
    const enemy = g.enemy(1, 4, 2, { hp: 200, maxHp: 200 });
    fire(g, 8); assert.equal(enemy.hp, 120);
    fire(g, 9); assert.equal(enemy.hp, 0); assert.equal(g.state.grid[1][4].lastArcaneDeathRound, 9);
});
