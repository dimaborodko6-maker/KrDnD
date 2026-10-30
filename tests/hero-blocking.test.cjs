const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./helpers/game-harness.cjs');
const statuses = require('../public/unit-statuses.js');

for (const [y, x, speed] of [[2, 1, 5], [3, 1, 5], [2, 3, 1]]) {
    test('нулевой лимит запрещает перехват: герой на строке ' + y + ', враг стартует на x=' + x, () => {
        const g = game(); const { hero } = g.player(); hero.y = y; hero.blockLimit = 0;
        const enemy = g.enemy(1, x, 2, { speed });
        g.moveEnemies();
        assert.equal(enemy.x, x + speed);
        assert.deepEqual(Array.from(hero.blockedEnemyIds), []);
        assert.ok(!statuses.buildIndex(g.state).get(enemy).some(status => status.id === 'blocked'));
    });
}

test('отсутствующий лимит в старом герое сохраняет прежнее значение по умолчанию', () => {
    const g = game(); const { hero } = g.player(); delete hero.blockLimit;
    g.enemy(1, 1, 2, { speed:5 }); const extra = g.enemy(2, 1, 2, { speed:5 });
    g.moveEnemies();
    assert.deepEqual(Array.from(hero.blockedEnemyIds), [1]);
    assert.equal(extra.x, 6);
});

test('старые связи сверх нулевого лимита снимаются до движения врага', () => {
    const g = game(); const { hero } = g.player(); hero.blockLimit = 0; hero.blockedEnemyIds = [1];
    const enemy = g.enemy(1, 3, 2, { speed:2 });
    g.moveEnemies();
    assert.deepEqual(Array.from(hero.blockedEnemyIds), []);
    assert.equal(enemy.x, 5);
});

test('загруженное превышение лимита снимается до первого хода волны', () => {
    const original = game(); const { hero } = original.player('torghar');
    for (let id = 1; id <= 5; id++) original.enemy(id, 3, 2, {speed:2});
    hero.blockedEnemyIds = [1, 2, 3, 4, 5];
    const g = game({savedState:JSON.parse(JSON.stringify(original.state))});
    assert.deepEqual(Array.from(g.state.players[hero.name].blockedEnemyIds), [1, 2, 3]);
    g.moveEnemies();
    assert.deepEqual(Array.from(g.state.players[hero.name].blockedEnemyIds), [1, 2, 3]);
    assert.ok(g.state.enemies.slice(3).every(enemy => enemy.x === 5));
});

for (const limit of [0, 1, 3]) {
    test('конец ультимейта Торгара освобождает лишних врагов при исходном лимите ' + limit, () => {
        const g = game(); const { hero } = g.player('torghar'); hero.blockLimit = limit;
        const enemies = Array.from({length:limit + 2}, (_, i) => g.enemy(i + 1, 1, 2, {speed:5}));
        g.castAbility(hero.name, 'ultimate', -1, 1);
        assert.equal(hero.blockLimit, limit + 2);
        g.moveEnemies();
        assert.equal(hero.invulnerableRounds, 0);
        assert.equal(hero.blockLimit, limit);
        assert.deepEqual(Array.from(hero.blockedEnemyIds), enemies.slice(0, limit).map(enemy => enemy.id));
        assert.ok(enemies.every(enemy => enemy.x === 3)); // Бонус действует весь ход волны.
        const index = statuses.buildIndex(g.state);
        for (const enemy of enemies.slice(limit)) assert.ok(!index.get(enemy).some(status => status.id === 'blocked'));
        g.moveEnemies();
        assert.ok(enemies.slice(0, limit).every(enemy => enemy.x === 3));
        assert.ok(enemies.slice(limit).every(enemy => enemy.x === 8));
    });
}

test('мастер уменьшает лимит сразу, сохраняя первые захваченные цели', () => {
    const g = game(); const { hero } = g.player();
    g.enemy(1, 3, 2); g.enemy(2, 4, 2); hero.blockedEnemyIds = [1, 2];
    g.send(g.master, {type:'MASTER_EDIT_HERO', playerName:hero.name, values:{blockLimit:1}});
    assert.deepEqual(Array.from(g.state.players[hero.name].blockedEnemyIds), [1]);
    g.send(g.master, {type:'MASTER_EDIT_HERO', playerName:hero.name, values:{blockLimit:0}});
    assert.deepEqual(Array.from(g.state.players[hero.name].blockedEnemyIds), []);
});

test('некорректная правка лимита не снимает существующие блокировки', () => {
    const g = game(); const { hero } = g.player();
    g.enemy(1, 3, 2); hero.blockedEnemyIds = [1];
    g.send(g.master, {type:'MASTER_EDIT_HERO', playerName:hero.name, values:{blockLimit:0, hp:hero.maxHp + 1}});
    assert.equal(g.state.players[hero.name].blockLimit, 2);
    assert.deepEqual(Array.from(g.state.players[hero.name].blockedEnemyIds), [1]);
});

for (const direct of [false, true]) {
    test('два героя в зоне перехвата назначают мобу одного блокирующего: direct=' + direct, () => {
        const g = game(); const { hero:first } = g.player(); const { hero:second } = g.player('connor');
        if (!direct) { first.y = 1; second.y = 3; }
        const enemy = g.enemy(1, direct ? 3 : 1, 2, {speed:5});
        g.moveEnemies();
        assert.equal(enemy.x, direct ? 4 : 3);
        assert.deepEqual(Array.from(first.blockedEnemyIds), [1]);
        assert.deepEqual(Array.from(second.blockedEnemyIds), []);
        g.moveEnemies();
        assert.deepEqual(Array.from(first.blockedEnemyIds), [1]);
        assert.deepEqual(Array.from(second.blockedEnemyIds), []);
    });
}

test('второй герой на клетке удерживаемого моба не получает его блок и одиночный удар', () => {
    const g = game(); const { hero:first } = g.player(); const { hero:second } = g.player('connor');
    const enemy = g.enemy(1, 3, 2, {speed:3, meleeDmg:10}); first.blockedEnemyIds = [1];
    g.send(g.master, {type:'MOVE_HERO', playerName:second.name, x:3, y:2});
    const secondHp = second.hp, firstHp = first.hp;
    g.moveEnemies();
    assert.equal(enemy.x, 3);
    assert.deepEqual(Array.from(first.blockedEnemyIds), [1]);
    assert.deepEqual(Array.from(second.blockedEnemyIds), []);
    assert.equal(second.hp, secondHp);
    assert.ok(first.hp < firstHp);
});

test('после гибели первого героя моба перехватывает второй', () => {
    const g = game(); const { hero:first } = g.player(); const { hero:second } = g.player('connor');
    const enemy = g.enemy(1, 3, 2, {speed:1}); first.blockedEnemyIds = [1];
    first.hp = 0; g.applyDeathOrSurvival(first);
    g.moveEnemies();
    assert.equal(enemy.x, 4);
    assert.deepEqual(Array.from(first.blockedEnemyIds), []);
    assert.deepEqual(Array.from(second.blockedEnemyIds), [1]);
});
