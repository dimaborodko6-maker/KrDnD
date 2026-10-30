const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game, data } = require('./helpers/game-harness.cjs');
const rules = require('../public/battle-ability-rules.js');
const statuses = require('../public/unit-statuses.js');

test('Отход тратит действие каждого героя, но не ману и перемещение', () => {
    for (const key of Object.keys(data.heroes)) {
        const g = game(); const { hero, ws } = g.player(key); hero.mana = 0; hero.isReady = true;
        g.send(ws, { type: 'PLAYER_ACTION', ability: 'disengage' });
        assert.equal(hero.disengaged, true, key);
        assert.equal(hero.hasAttackedThisRound, true);
        assert.equal(hero.hasMovedThisRound, false);
        assert.equal(hero.mana, 0);
        assert.equal(hero.isReady, false);
        assert.equal(rules.manaCost('disengage'), 0);
        assert.equal(rules.definition('disengage', key).selection, 'none');
        assert.deepEqual(rules.availableTargets(g.state, key, 'disengage'), []);
        assert.ok(statuses.collect(hero).some(status => status.id === 'disengage'));
        const enemy = g.enemy(); const hp = enemy.hp;
        g.send(ws, { type: 'PLAYER_ACTION', ability: 'attack', targetId: enemy.id, dice: 8 });
        assert.equal(enemy.hp, hp);
    }
});

test('отступление от нескольких врагов безопасно только после Отхода', () => {
    for (const disengage of [false, true]) {
        const g = game(); const { hero, ws } = g.player();
        const enemies = [g.enemy(1), g.enemy(2, 4, 3)];
        hero.blockedEnemyIds = enemies.map(enemy => enemy.id);
        const hp = hero.hp;
        if (disengage) g.send(ws, { type: 'PLAYER_ACTION', ability: 'disengage' });
        g.send(ws, { type: 'MOVE_HERO', x: 6, y: 2 });
        assert.equal(hero.x, 6);
        assert.equal(hero.hasMovedThisRound, true);
        if (disengage) assert.equal(hero.hp, hp);
        else assert.ok(hero.hp < hp);
        const x = hero.x;
        g.send(ws, { type: 'MOVE_HERO', x: 7, y: 2 });
        assert.equal(hero.x, x);
    }
});

test('Отход недоступен павшему герою и после использованного действия', () => {
    for (const changes of [{ hp: 0, deathTimer: 2 }, { hasAttackedThisRound: true }]) {
        const g = game(); const { hero, ws } = g.player(); Object.assign(hero, changes);
        g.send(ws, { type: 'PLAYER_ACTION', ability: 'disengage' });
        assert.equal(hero.disengaged, undefined);
    }
});

test('Отход заканчивается с раундом и не защищает в следующем раунде', () => {
    const g = game(); const { hero, ws } = g.player();
    g.send(ws, { type: 'PLAYER_ACTION', ability: 'disengage' });
    g.moveEnemies();
    assert.equal(hero.disengaged, undefined);
    assert.equal(hero.hasAttackedThisRound, false);
    const enemy = g.enemy(); hero.blockedEnemyIds = [enemy.id];
    const hp = hero.hp;
    g.send(ws, { type: 'MOVE_HERO', x: 6, y: 2 });
    assert.ok(hero.hp < hp);
});

test('Отход сохраняется при загрузке и очищается при смене периода и восстановлении в подготовке', () => {
    const g = game(); const { hero, ws } = g.player();
    g.send(ws, { type: 'PLAYER_ACTION', ability: 'disengage' });
    const loaded = game({ savedState: JSON.parse(JSON.stringify(g.state)) });
    assert.equal(loaded.state.players.gerald.disengaged, true);
    g.send(g.master, { type: 'MASTER_SET_GAME_PERIOD', gamePeriod: 'preparation' });
    assert.equal(hero.disengaged, undefined);
    g.send(ws, { type: 'PLAYER_ACTION', ability: 'disengage' });
    g.send(ws, { type: 'MOVE_HERO', x: 5, y: 2 });
    assert.equal(hero.disengaged, undefined);
});
