const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { game, data } = require('./helpers/game-harness.cjs');

const setPeriod = (g, gamePeriod) => g.send(g.master, { type: 'MASTER_SET_GAME_PERIOD', gamePeriod });

test('новая партия начинается с подготовки, старые сохранения сохраняют обычные правила', () => {
    const fresh = game({ gamePeriod: null });
    assert.equal(fresh.state.gamePeriod, 'preparation');
    const legacy = JSON.parse(JSON.stringify(fresh.state));
    delete legacy.gamePeriod;
    const loaded = game({ gamePeriod: null, savedState: legacy });
    assert.equal(loaded.state.gamePeriod, 'game');
    for (const period of ['preparation', 'game']) {
        legacy.gamePeriod = period;
        assert.equal(game({ gamePeriod: null, savedState: legacy }).state.gamePeriod, period);
    }
});

test('период переключает только мастер; переключение не лечит и не меняет номер раунда', () => {
    const g = game(); const { hero, ws } = g.player();
    hero.hp = 1; hero.mana = 0; hero.cooldowns = { ultimate: 5 }; hero.isReady = true;
    g.send(ws, { type: 'MASTER_SET_GAME_PERIOD', gamePeriod: 'preparation' });
    assert.equal(g.state.gamePeriod, 'game');
    assert.equal(ws.messages.at(-1).type, 'COMMAND_ERROR');
    setPeriod(g, 'unknown'); assert.equal(g.state.gamePeriod, 'game');
    const round = g.state.roundCounter;
    setPeriod(g, 'preparation');
    assert.equal(g.state.gamePeriod, 'preparation');
    assert.equal(hero.hp, 1); assert.equal(hero.mana, 0); assert.equal(hero.cooldowns.ultimate, 5);
    assert.equal(hero.isReady, false); assert.equal(g.state.roundCounter, round);
    assert.equal(ws.messages.at(-1).state.gamePeriod, 'preparation');
    hero.isReady = true;
    setPeriod(g, 'preparation'); assert.equal(hero.isReady, true);
});

test('в подготовке каждое перемещение полностью восстанавливает героя, включая павшего, без ударов в спину', () => {
    const g = game({ gamePeriod: 'preparation' }); const { hero, ws } = g.player();
    g.enemy(1, 4, 2, { meleeDmg: 1000 }); hero.blockedEnemyIds = [1];
    for (const [x, y] of [[15, 15], [0, 0]]) {
        Object.assign(hero, { hp: 0, mana: 0, deathTimer: 2, hasMovedThisRound: true,
            hasAttackedThisRound: true, isReady: true, cooldowns: { ultimate: 5, spell_inspire: 3 }, fatedUsedThisWave: true });
        g.send(ws, { type: 'MOVE_HERO', x, y });
        assert.equal(hero.x, x); assert.equal(hero.y, y);
        assert.equal(hero.hp, hero.maxHp); assert.equal(hero.mana, hero.maxMana);
        assert.equal(hero.deathTimer, 0); assert.equal(Object.keys(hero.cooldowns).length, 0);
        assert.equal(hero.hasMovedThisRound, false); assert.equal(hero.hasAttackedThisRound, false);
        assert.equal(hero.isReady, false); assert.equal(hero.fatedUsedThisWave, false);
    }
    assert.ok(g.state.actionLogs.every(log => !log.text.includes('[Backstab]')));
    hero.hp = 1;
    for (const [x, y] of [[0, 0], [-1, 0], [16, 0], [1.5, 0]]) g.send(ws, { type: 'MOVE_HERO', x, y });
    g.state.grid[0][1].type = 'slot';
    g.send(ws, { type: 'MOVE_HERO', x: 1, y: 0 });
    assert.equal(hero.hp, 1); assert.equal(hero.x, 0);
});

test('перемещение в подготовке возвращает израсходованный Святой Грааль и работает при переносе мастером', () => {
    const g = game({ gamePeriod: 'preparation' }); const { hero } = g.player('connor', ['grail']);
    hero.hp = 0; g.applyDeathOrSurvival(hero);
    assert.equal(hero.skills.includes('grail'), false);
    g.send(g.master, { type: 'MOVE_HERO', playerName: 'connor', x: 15, y: 15 });
    assert.equal(hero.hp, hero.maxHp); assert.equal(hero.skills.includes('grail'), true);
    hero.hp = 0; g.applyDeathOrSurvival(hero); assert.ok(hero.hp > 0);
});

test('телепортация и рывок в подготовке также восстанавливают ресурсы при смене клетки', () => {
    const g = game({ gamePeriod: 'preparation' }); const { hero } = g.player('zefira', ['blink']);
    hero.hp = 1;
    g.castAbility('zefira', 'spell_blink', 'cell_8_2', 1);
    assert.equal(hero.x, 8); assert.equal(hero.hp, hero.maxHp); assert.equal(hero.mana, hero.maxMana);
    assert.equal(Object.keys(hero.cooldowns).length, 0); assert.equal(hero.hasAttackedThisRound, false);
    const { hero: medic } = g.player('ratchet', ['ambulance_rush']);
    medic.hp = 1;
    g.castAbility('ratchet', 'spell_ambulance_rush', 'player_zefira', 1);
    assert.equal(medic.x, 8); assert.equal(medic.hp, medic.maxHp); assert.equal(medic.mana, medic.maxMana);
    assert.equal(Object.keys(medic.cooldowns).length, 0);
});

test('период игры возвращает ограничения движения, затраты ресурсов и ход волны', () => {
    const g = game({ gamePeriod: 'preparation' }); const { hero, ws } = g.player('zefira', ['blink']);
    setPeriod(g, 'game'); hero.hp = 1;
    g.send(ws, { type: 'MOVE_HERO', x: 15, y: 15 }); assert.equal(hero.x, 4);
    g.send(ws, { type: 'MOVE_HERO', x: 5, y: 2 }); assert.equal(hero.x, 5); assert.equal(hero.hp, 1);
    g.send(ws, { type: 'MOVE_HERO', x: 6, y: 2 }); assert.equal(hero.x, 5);
    const mana = hero.mana;
    g.castAbility('zefira', 'spell_blink', 'cell_6_2', 1);
    assert.equal(hero.mana, mana - 3); assert.ok(hero.cooldowns.spell_blink > 0);
    g.send(g.master, { type: 'MASTER_MOVE_ENEMIES' });
    assert.equal(g.state.roundCounter, 1); assert.equal(g.state.gamePeriod, 'game');
});

test('выпуск и очистка волн не переключают период; ход волны в подготовке отклоняется', () => {
    const g = game({ gamePeriod: 'preparation' });
    g.send(g.master, { type: 'MASTER_START_PRESET_WAVE', waveIndex: 1 });
    assert.equal(g.state.gamePeriod, 'preparation');
    const world = JSON.stringify(g.state);
    g.send(g.master, { type: 'MASTER_MOVE_ENEMIES' });
    assert.equal(g.master.messages.at(-1).type, 'COMMAND_ERROR');
    assert.equal(JSON.stringify(g.state), world);
    setPeriod(g, 'game'); g.state.enemies = []; g.state.pendingSpawns = [];
    g.send(g.master, { type: 'MASTER_MOVE_ENEMIES' }); assert.equal(g.state.gamePeriod, 'game');
});

test('снос в подготовке возвращает все затраты, включая ветку улучшений и специализацию', () => {
    for (const gamePeriod of ['preparation', 'game']) {
        const g = game({ gamePeriod }); const { ws } = g.player();
        const cell = g.state.grid[1][4]; cell.type = 'slot';
        const gold = g.state.gold;
        g.send(ws, { type: 'BUILD_TOWER', x: 4, y: 1, towerType: 'mage_1' });
        for (const targetType of ['mage_2', 'mage_3', 'mage_sorcerer']) {
            g.send(ws, { type: 'UPGRADE_TOWER', x: 4, y: 1, targetType });
        }
        g.send(ws, { type: 'BUY_TOWER_UPGRADE', x: 4, y: 1, upgradeId: 'sorcerer_golem' });
        assert.ok(g.state.soldiers.length > 0);
        const spent = gold - g.state.gold;
        assert.equal(cell.investedGold, spent);
        const before = g.state.gold;
        g.send(ws, { type: 'REQUEST_DEMOLISH', x: 4, y: 1 });
        const refund = gamePeriod === 'preparation' ? spent : Math.round(data.towers.mage_sorcerer.cost * 0.6);
        assert.equal(g.state.gold, before + refund); assert.equal(cell.type, 'slot');
        assert.equal(g.state.soldiers.length, 0); assert.equal(cell.investedGold, undefined);
    }
});

test('старые улучшенные башни получают полную стоимость, снос по голосованию и решению мастера учитывает период', () => {
    for (const force of [false, true]) {
        const g = game({ gamePeriod: 'preparation' }); const { ws } = g.player(); const other = g.player('malik');
        g.tower('archer_3');
        const expected = data.towers.archer_1.cost + data.towers.archer_2.cost + data.towers.archer_3.cost;
        delete g.state.grid[1][4].investedGold; // Формат старого сохранения.
        const gold = g.state.gold;
        g.send(ws, { type: 'REQUEST_DEMOLISH', x: 4, y: 1 });
        assert.equal(g.state.demolishVote.refundGold, expected);
        assert.equal(g.state.gold, gold);
        if (force) g.send(g.master, { type: 'MASTER_FORCE_DEMOLISH' });
        else g.send(other.ws, { type: 'VOTE_DEMOLISH', vote: true });
        assert.equal(g.state.gold, gold + expected); assert.equal(g.state.demolishVote, null);
    }
});

test('переключение периода отменяет голосование со старой суммой и очищает историю отката', () => {
    const g = game({ gamePeriod: 'preparation' }); const { ws } = g.player(); const other = g.player('malik');
    g.tower('archer_1');
    g.send(ws, { type: 'REQUEST_DEMOLISH', x: 4, y: 1 });
    assert.ok(g.state.demolishVote);
    const gold = g.state.gold;
    setPeriod(g, 'game');
    assert.equal(g.state.demolishVote, null);
    assert.equal(g.master.messages.at(-1).state.playerHistory.length, 0);
    g.send(other.ws, { type: 'VOTE_DEMOLISH', vote: true }); assert.equal(g.state.gold, gold);
    g.send(ws, { type: 'REQUEST_DEMOLISH', x: 4, y: 1 });
    assert.equal(g.state.demolishVote.refundGold, Math.round(data.towers.archer_1.cost * 0.6));
});

test('оба сброса партии возвращают период подготовки', () => {
    for (const type of ['MASTER_RESET_SESSION', 'MASTER_RESET_FULL']) {
        const g = game(); g.send(g.master, { type });
        assert.equal(g.state.gamePeriod, 'preparation');
    }
});

test('пульт мастера показывает выбранный период и блокирует ход волны во время подготовки', () => {
    const elements = new Map();
    const ui = id => {
        if (!elements.has(id)) elements.set(id, { classList: { toggle() {} }, setAttribute(k, v) { this[k] = v; } });
        return elements.get(id);
    };
    const sent = [];
    const source = fs.readFileSync(path.join(__dirname, '../public/master-ui.js'), 'utf8');
    const functions = source.slice(source.indexOf('function setGamePeriod('), source.indexOf("socket.addEventListener('open'"));
    const context = vm.createContext({ ui, sendMaster: message => sent.push(message) });
    vm.runInContext(functions, context);
    for (const gamePeriod of ['preparation', 'game']) {
        context.renderGamePeriod({ gamePeriod });
        assert.equal(ui('period-' + gamePeriod)['aria-pressed'], 'true');
        assert.equal(ui('btn-move-enemies').disabled, gamePeriod === 'preparation');
    }
    context.setGamePeriod('preparation');
    assert.equal(sent[0].type, 'MASTER_SET_GAME_PERIOD'); assert.equal(sent[0].gamePeriod, 'preparation');
});
