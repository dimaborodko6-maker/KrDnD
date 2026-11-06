'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game, data } = require('./helpers/game-harness.cjs');

test('режим игры по умолчанию gm (с Мастером), переключается на coop', () => {
    const g = game();
    const { ws } = g.player('gerald');
    assert.equal(g.state.gameMode || 'gm', 'gm');

    g.send(ws, { type: 'SET_GAME_MODE', mode: 'coop' });
    assert.equal(g.state.gameMode, 'coop');

    g.send(ws, { type: 'SET_GAME_MODE', mode: 'gm' });
    assert.equal(g.state.gameMode, 'gm');
});

test('в режиме coop игрок может запустить волну через COOP_START_WAVE', () => {
    const g = game({ gamePeriod: 'preparation' });
    const { ws } = g.player('gerald');
    g.send(ws, { type: 'SET_GAME_MODE', mode: 'coop' });
    assert.equal(g.state.gamePeriod, 'preparation');

    g.send(ws, { type: 'COOP_START_WAVE' });
    assert.equal(g.state.gamePeriod, 'game');
    assert.equal(g.state.wave, 1);
    assert.ok(g.state.enemies.length > 0 || (g.state.pendingSpawns && g.state.pendingSpawns.length > 0));
});

test('в режиме coop, когда все игроки готовы, раунд продвигается автоматически', () => {
    const g = game({ gamePeriod: 'game' });
    const { hero, ws } = g.player('gerald');
    g.send(ws, { type: 'SET_GAME_MODE', mode: 'coop' });
    
    // Спавним тестового врага
    g.enemy(1, 0, 2);
    const initialRound = g.state.roundCounter || 0;

    // Игрок завершает ход
    g.send(ws, { type: 'TOGGLE_READY' });

    // В кооп-режиме раунд продвинулся автоматически
    assert.ok((g.state.roundCounter || 0) > initialRound, 'Раунд должен автоматически увеличиться');
    assert.equal(hero.isReady, false, 'Флаг готовности должен сброситься для нового раунда');
});

test('в режиме gm (старый способ) готовность игрока НЕ продвигает раунд автоматически', () => {
    const g = game({ gamePeriod: 'game' });
    const { hero, ws } = g.player('gerald');
    assert.equal(g.state.gameMode || 'gm', 'gm');
    
    g.enemy(1, 0, 2);
    const initialRound = g.state.roundCounter || 0;

    // Игрок завершает ход в обычном режиме мастера
    g.send(ws, { type: 'TOGGLE_READY' });

    // Раунд не продвигается, ждет мастера
    assert.equal(g.state.roundCounter || 0, initialRound, 'В режиме мастера раунд не должен продвигаться сам');
    assert.equal(hero.isReady, true, 'Флаг готовности должен остаться true');
});

test('в режиме coop при гибели всех врагов игра автоматически переходит в подготовку', () => {
    const g = game({ gamePeriod: 'game' });
    const { ws } = g.player('gerald');
    g.send(ws, { type: 'SET_GAME_MODE', mode: 'coop' });

    // Нет врагов и нет очереди
    g.state.enemies = [];
    g.state.pendingSpawns = [];

    // Вызываем moveEnemies()
    g.moveEnemies();

    // Должна включиться подготовка
    assert.equal(g.state.gamePeriod, 'preparation', 'После зачистки волны должна включиться фаза подготовки');
});

function testScene(id = 'bridge') {
    return { id, title: 'Bridge Defense', description: 'Desc', objectives: 'Hold', gold: 500, baseHp: 20, gridWidth: 8, gridHeight: 8,
        availableTowerTypes: ['archer_1', 'barracks_1', 'mage_1', 'bombard_1'],
        grid: Array.from({length: 8}, (_, y) => Array.from({length: 8}, (_, x) => ({ x, y, type: y === 2 ? (x === 0 ? 'spawn' : x === 7 ? 'castle' : 'road') : 'empty' }))),
        enemies: [], waves: [{ waveNum: 1, title: 'W1', desc: 'W1', enemies: [{ type: 'bandit', count: 1, offsetDelay: 0 }] }],
        notes: [] };
}

test('в режиме coop игрок может сменить карту через COOP_ACTIVATE_SCENE в фазе подготовки', () => {
    const s = testScene();
    const g = game({ gamePeriod: 'preparation', savedScenes: { version: 1, revision: 0, scenes: [s] } });
    const { ws } = g.player('gerald');
    g.send(ws, { type: 'SET_GAME_MODE', mode: 'coop' });

    g.send(ws, { type: 'COOP_ACTIVATE_SCENE', sceneId: 'bridge' });
    assert.equal(g.state.gameMode, 'coop', 'Режим coop должен сохраниться');
    assert.equal(g.state.gamePeriod, 'preparation');
    assert.equal(g.state.sceneMaster?.id, 'bridge');
    assert.equal(g.state.gridWidth, 8);
    assert.equal(g.state.gridHeight, 8);
    assert.equal(g.state.gold, 500);
});

test('в режиме coop нельзя сменить карту во время боя (gamePeriod === game)', () => {
    const s = testScene();
    const g = game({ gamePeriod: 'game', savedScenes: { version: 1, revision: 0, scenes: [s] } });
    const { ws } = g.player('gerald');
    g.send(ws, { type: 'SET_GAME_MODE', mode: 'coop' });

    g.send(ws, { type: 'COOP_ACTIVATE_SCENE', sceneId: 'bridge' });
    assert.ok(ws.messages.some(m => m.type === 'COMMAND_ERROR' && m.message.includes('Preparation period')), 'Смена карты во время боя должна отклоняться');
    assert.notEqual(g.state.sceneMaster?.id, 'bridge');
});
