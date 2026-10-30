const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game, data } = require('./helpers/game-harness.cjs');
const rules = require('../public/tower-rules.js');

const towers = { ...data.towers,
    ice: { name: 'Ледяная башня', cost: 80, range: 3, next: ['ice_storm', 'ice_shards'] },
    ice_storm: { name: 'Ледяная буря', cost: 120, range: 4 },
    ice_shards: { name: 'Осколки льда', cost: 130, range: 4 },
    fire: { name: 'Огненная башня', cost: 90, range: 3 } };
const toggle = (g, ws, towerType, enabled) => g.send(ws, { type: 'SET_TOWER_TYPE', towerType, enabled });

test('новые типы автоматически попадают в список, набор содержит максимум пять базовых типов', () => {
    const g = game({ gamePeriod: 'preparation', towers });
    assert.equal(rules.getBaseTypes(g.gameData.towers).length, 6);
    assert.equal(g.state.availableTowerTypes.length, 5);
    assert.ok(g.state.availableTowerTypes.includes('ice'));
    assert.ok(!g.state.availableTowerTypes.includes('ice_storm'));
});

test('набор общий: его могут менять разные игроки и мастер, обновление получают все', () => {
    const g = game({ gamePeriod: 'preparation', towers });
    const first = g.player(), second = g.player('malik');
    toggle(g, first.ws, 'archer_1', false);
    toggle(g, second.ws, 'fire', true);
    assert.equal(g.state.availableTowerTypes.includes('archer_1'), false);
    assert.equal(g.state.availableTowerTypes.includes('fire'), true);
    assert.deepEqual(first.ws.messages.at(-1).state.availableTowerTypes, second.ws.messages.at(-1).state.availableTowerTypes);
    toggle(g, g.master, 'fire', false);
    assert.equal(g.state.availableTowerTypes.includes('fire'), false);
});

test('два игрока не могут одновременно открыть шестой тип и не перезаписывают выбор друг друга', () => {
    const g = game({ gamePeriod: 'preparation', towers });
    const first = g.player(), second = g.player('malik');
    toggle(g, g.master, 'ice', false);
    assert.equal(g.state.availableTowerTypes.length, 4);
    toggle(g, first.ws, 'ice', true);
    toggle(g, second.ws, 'fire', true);
    assert.equal(second.ws.messages.at(-1).type, 'COMMAND_ERROR');
    assert.equal(g.state.availableTowerTypes.length, 5);
    assert.ok(g.state.availableTowerTypes.includes('ice'));
    assert.ok(!g.state.availableTowerTypes.includes('fire'));
});

test('набор меняется только в подготовке; посторонние, неизвестные типы и отдельные уровни отклоняются', () => {
    const g = game({ gamePeriod: 'preparation' }); const { ws } = g.player();
    const stranger = g.connect(), editor = g.connect();
    g.send(editor, { type: 'REGISTER_EDITOR' });
    for (const client of [stranger, editor]) {
        toggle(g, client, 'archer_1', false);
        assert.equal(client.messages.at(-1).type, 'COMMAND_ERROR');
    }
    for (const [towerType, enabled] of [['unknown', true], ['archer_2', true], ['archer_1', 'false']]) {
        toggle(g, ws, towerType, enabled); assert.equal(ws.messages.at(-1).type, 'COMMAND_ERROR');
    }
    assert.equal(g.state.availableTowerTypes.length, 4);
    g.send(g.master, { type: 'MASTER_SET_GAME_PERIOD', gamePeriod: 'game' });
    for (const client of [ws, g.master]) {
        toggle(g, client, 'archer_1', false);
        assert.equal(client.messages.at(-1).type, 'COMMAND_ERROR');
    }
    assert.equal(g.state.availableTowerTypes.length, 4);
});

test('тип с построенной башней или её улучшением нельзя убрать до сноса', () => {
    const g = game({ gamePeriod: 'preparation' }); const { ws } = g.player();
    g.tower('archer_ranger');
    toggle(g, ws, 'archer_1', false);
    assert.equal(ws.messages.at(-1).type, 'COMMAND_ERROR');
    assert.ok(g.state.availableTowerTypes.includes('archer_1'));
    g.send(ws, { type: 'REQUEST_DEMOLISH', x: 4, y: 1 });
    toggle(g, ws, 'archer_1', false);
    assert.equal(g.state.availableTowerTypes.includes('archer_1'), false);
});

test('невыбранные типы нельзя строить и улучшать обходом интерфейса', () => {
    const g = game({ gamePeriod: 'preparation' }); const { ws } = g.player();
    toggle(g, ws, 'mage_1', false);
    g.state.grid[1][4].type = 'slot';
    const gold = g.state.gold;
    g.send(ws, { type: 'BUILD_TOWER', x: 4, y: 1, towerType: 'mage_1' });
    assert.equal(g.state.grid[1][4].type, 'slot');
    // Выбранный тип тоже нельзя сразу построить на улучшенном уровне.
    g.send(ws, { type: 'BUILD_TOWER', x: 4, y: 1, towerType: 'archer_3' });
    assert.equal(g.state.grid[1][4].type, 'slot');
    g.tower('mage_1');
    for (const type of ['BUILD_TOWER', 'UPGRADE_TOWER']) {
        g.send(ws, { type, x: 4, y: 1, targetType: 'mage_2' });
        assert.equal(ws.messages.at(-1).type, 'COMMAND_ERROR');
        assert.equal(g.state.grid[1][4].type, 'mage_1');
    }
    g.tower('mage_sorcerer');
    g.send(ws, { type: 'BUY_TOWER_UPGRADE', x: 4, y: 1, upgradeId: 'sorcerer_golem' });
    assert.equal(ws.messages.at(-1).type, 'COMMAND_ERROR');
    assert.equal(g.state.gold, gold); assert.equal(g.state.soldiers.length, 0);
});

test('новый выбранный тип строится и проходит любую ветку улучшений, занимая один слот', () => {
    for (const targetType of ['ice_storm', 'ice_shards']) {
        const g = game({ gamePeriod: 'preparation', towers }); const { ws } = g.player();
        g.state.grid[1][4].type = 'slot';
        const selectedCount = g.state.availableTowerTypes.length;
        g.send(ws, { type: 'BUILD_TOWER', x: 4, y: 1, towerType: 'ice' });
        assert.equal(g.state.grid[1][4].type, 'ice');
        g.send(ws, { type: 'UPGRADE_TOWER', x: 4, y: 1, targetType });
        assert.equal(g.state.grid[1][4].type, targetType);
        assert.equal(g.state.availableTowerTypes.length, selectedCount);
    }
});

test('набор сохраняется при смене периода и загрузке; старые сохранения получают текущие базовые типы', () => {
    const g = game({ gamePeriod: 'preparation' }); const { ws } = g.player();
    toggle(g, ws, 'mage_1', false);
    const selected = Array.from(g.state.availableTowerTypes);
    g.send(g.master, { type: 'MASTER_SET_GAME_PERIOD', gamePeriod: 'game' });
    assert.deepEqual(Array.from(g.state.availableTowerTypes), selected);
    const save = JSON.parse(JSON.stringify(g.state));
    const loaded = game({ gamePeriod: null, savedState: save });
    assert.deepEqual(Array.from(loaded.state.availableTowerTypes), selected);
    delete save.availableTowerTypes;
    assert.equal(game({ gamePeriod: null, savedState: save }).state.availableTowerTypes.length, 4);
    save.availableTowerTypes = [];
    assert.equal(game({ gamePeriod: null, savedState: save }).state.availableTowerTypes.length, 0);
});

test('изменение общего набора игроком участвует в полном откате', () => {
    const g = game({ gamePeriod: 'preparation' }); const { ws } = g.player();
    toggle(g, ws, 'mage_1', false);
    const history = g.master.messages.at(-1).state.playerHistory;
    assert.equal(history.length, 1);
    g.send(g.master, { type: 'MASTER_ROLLBACK_PLAYER', historyId: history[0].id });
    assert.ok(g.state.availableTowerTypes.includes('mage_1'));
});
