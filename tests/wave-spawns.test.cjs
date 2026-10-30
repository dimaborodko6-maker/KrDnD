const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./helpers/game-harness.cjs');

function start(g, enemies) {
    g.gameData.presetWaves = [{ waveNum: 10, title: 'Gradual wave', desc: '', enemies }];
    g.send(g.master, { type: 'MASTER_START_PRESET_WAVE', waveIndex: 0 });
}

test('на одном входе группа из четырёх врагов выходит за четыре раунда появления', () => {
    const g = game(); start(g, [{ type: 'bandit', count: 4, offsetDelay: 0 }]);
    assert.equal(g.state.enemies.length, 1);
    assert.deepEqual(Array.from(g.state.pendingSpawns, entry => entry.round), [1, 2, 3]);
    for (let count = 2; count <= 4; count++) {
        g.moveEnemies();
        assert.equal(g.state.enemies.length, count);
        assert.equal(g.state.pendingSpawns.length, 4 - count);
        assert.equal(new Set(g.state.enemies.map(enemy => enemy.id)).size, count);
    }
});

test('несколько входов выпускают по одному врагу группы за ход, не дублируя остаток', () => {
    const g = game(); g.state.grid[3][0].type = 'spawn';
    start(g, [{ type: 'bandit', count: 5, offsetDelay: 0 }]);
    assert.deepEqual(Array.from(g.state.enemies, enemy => [enemy.x, enemy.y]), [[0, 2], [0, 3]]);
    assert.deepEqual(Array.from(g.state.pendingSpawns, entry => [entry.x, entry.y, entry.round]),
        [[0, 2, 1], [0, 3, 1], [0, 2, 2]]);
    g.moveEnemies(); assert.equal(g.state.enemies.length, 4);
    g.moveEnemies(); assert.equal(g.state.enemies.length, 5);
    assert.equal(g.state.pendingSpawns.length, 0);
});

test('задержанная группа переживает перезапуск посреди очереди и не завершает волну раньше срока', () => {
    const original = game(); original.state.roundCounter = 8;
    start(original, [{ type: 'bandit', count: 3, offsetDelay: 2 }]);
    assert.equal(original.state.enemies.length, 0);
    assert.deepEqual(Array.from(original.state.pendingSpawns, entry => entry.round), [10, 11, 12]);
    original.moveEnemies();
    assert.equal(original.state.enemies.length, 0);
    assert.ok(original.state.actionLogs.every(entry => !entry.text.includes('WAVE CLEARED')));
    original.moveEnemies(); assert.equal(original.state.enemies.length, 1);
    const restored = game({ savedState: JSON.parse(JSON.stringify(original.state)) });
    assert.equal(restored.state.pendingSpawns.length, 2);
    restored.moveEnemies(); assert.equal(restored.state.enemies.length, 2);
    assert.equal(restored.state.pendingSpawns.length, 1);
    restored.moveEnemies(); assert.equal(restored.state.enemies.length, 3);
    assert.equal(restored.state.pendingSpawns.length, 0);
});
