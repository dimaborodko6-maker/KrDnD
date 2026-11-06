'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./helpers/game-harness.cjs');
const TOWER_CATALOG = require('../public/tower-catalog-data.js').TOWERS;
const GAME_DATA = require('../public/gamedata.js');
const createEnemyTraitsEngine = require('../enemy-traits-engine.js');
const createTowerCombat = require('../tower-combat.js');

test('Battle-Mecha T-200 progression tree and tier 4 branches exist in catalog', () => {
    assert.ok(TOWER_CATALOG.mecha_1, 'mecha_1 exists');
    assert.equal(TOWER_CATALOG.mecha_1.next, 'mecha_2');
    assert.equal(TOWER_CATALOG.mecha_2.next, 'mecha_3');
    assert.deepEqual(TOWER_CATALOG.mecha_3.next, ['mecha_flame', 'mecha_missile', 'mecha_heavy']);

    // Check tier 4 branches
    assert.ok(TOWER_CATALOG.mecha_flame, 'Flame Mecha exists');
    assert.equal(TOWER_CATALOG.mecha_flame.dmgType, 'magic');
    assert.ok(TOWER_CATALOG.mecha_flame.upgrades.some(u => u.id === 'mecha_magma'));
    assert.ok(TOWER_CATALOG.mecha_flame.upgrades.some(u => u.id === 'mecha_inferno'));

    assert.ok(TOWER_CATALOG.mecha_missile, 'Missile Mecha exists');
    assert.equal(TOWER_CATALOG.mecha_missile.range, 4);
    assert.ok(TOWER_CATALOG.mecha_missile.upgrades.some(u => u.id === 'mecha_wasp'));
    assert.ok(TOWER_CATALOG.mecha_missile.upgrades.some(u => u.id === 'mecha_radar'));

    assert.ok(TOWER_CATALOG.mecha_heavy, 'Heavy Mecha exists');
    assert.ok(TOWER_CATALOG.mecha_heavy.upgrades.some(u => u.id === 'mecha_oil'));
    assert.ok(TOWER_CATALOG.mecha_heavy.upgrades.some(u => u.id === 'mecha_concussive'));
});

test('Solaris & Ignis hero registration, companion spawning and stats', () => {
    const g = game();
    const ws = g.connect();

    g.send(ws, {
        type: 'REGISTER_PLAYER',
        name: 'PlayerSolaris',
        heroName: 'Solaris & Ignis',
        stats: { str: 10, dex: 12, con: 14, int: 18, wis: 14, cha: 10 },
        skills: ['sunray_lance', 'solar_flare', 'solar_overdrive'],
        sen: 10
    });

    const player = g.state.players['PlayerSolaris'];
    assert.ok(player, 'Solaris player is registered');
    assert.equal(player.heroKey, 'solaris');
    assert.equal(player.range, 4, 'Solaris has base range 4');
    assert.equal(player.speed, 2, 'Solaris has base speed 2');

    // Check Ignis companion spawned in soldiers
    const ignis = (g.state.soldiers || []).find(s => s.isElemental && s.ownerId === player.id);
    assert.ok(ignis, 'Ignis companion was spawned in soldiers');
    assert.equal(ignis.hp, 120);
    assert.equal(ignis.blockLimit, 2);
    assert.equal(ignis.dmg, 10);
});

test('Solaris sunray_lance strips shield and applies burning', () => {
    const g = game();
    const ws = g.connect();

    g.send(ws, {
        type: 'REGISTER_PLAYER',
        name: 'PSolaris',
        heroName: 'Солярис и Игнис',
        stats: { str: 10, dex: 10, con: 10, int: 18, wis: 10, cha: 10 },
        skills: ['sunray_lance', 'solar_flare', 'dawn_aegis'],
        sen: 10
    });

    const hero = g.state.players['PSolaris'];
    hero.x = 2; hero.y = 2;

    const enemy = g.enemy(1, 4, 2);
    enemy.hp = 100;
    enemy.maxHp = 100;
    enemy.shieldHp = 30;

    g.send(ws, {
        type: 'PLAYER_ACTION',
        ability: 'spell_sunray_lance',
        targetId: enemy.id,
        dice: 5
    });

    assert.equal(enemy.shieldHp, 0, 'Shield was stripped by Sunray Lance');
    assert.ok(enemy.burnTurns > 0, 'Enemy is now burning');
    assert.ok(enemy.hp < 100, 'Enemy took magic damage');
});

test('Solaris ultimate Supernova deals true damage and creates magma pools', () => {
    const g = game();
    const ws = g.connect();

    g.send(ws, {
        type: 'REGISTER_PLAYER',
        name: 'PSolaris2',
        heroName: 'Solaris & Ignis',
        stats: { str: 10, dex: 10, con: 10, int: 16, wis: 10, cha: 10 },
        skills: ['sunray_lance', 'purifying_pyre', 'dawn_aegis'],
        sen: 10
    });

    const hero = g.state.players['PSolaris2'];
    hero.x = 3; hero.y = 3;

    const enemy = g.enemy(1, 4, 3);
    enemy.hp = 300;
    enemy.maxHp = 300;
    enemy.armor = 50;

    g.send(ws, {
        type: 'PLAYER_ACTION',
        ability: 'ultimate',
        targetId: enemy.id,
        dice: 1
    });

    // Supernova deals 190 pure fire damage directly
    assert.equal(enemy.hp, 110, 'Enemy took 190 pure damage (300 -> 110)');
    assert.ok(g.state.magmaPuddles && g.state.magmaPuddles.length > 0, 'Magma pool was created by Supernova');
});

test('Burning status prevents enemy regeneration', () => {
    let hpSet = 0;
    const enemy = {
        name: 'Troll',
        hp: 30,
        maxHp: 100,
        burnTurns: 2,
        lastDamageRound: 0,
        traits: { regeneration: { percent: 10, delay: 1 } }
    };
    const state = { enemies: [enemy], roundCounter: 5 };
    const engine = createEnemyTraitsEngine({
        getState: () => state,
        getData: () => GAME_DATA,
        createEnemy: () => {},
        damageDefender: () => {},
        deathDefender: () => {},
        log: () => {},
        setHp: (u, hp) => { u.hp = hp; hpSet = hp; }
    });

    engine.recovery();
    assert.equal(enemy.hp, 30, 'Enemy with burnTurns > 0 did not regenerate HP');

    // Remove burning
    enemy.burnTurns = 0;
    engine.recovery();
    assert.equal(enemy.hp, 40, 'Enemy without burning regenerated +10 HP (30 -> 40)');
});

test('Flame Mecha attacks apply burning and create magma vents', () => {
    const enemy = { id: 1, name: 'Goblin', x: 3, y: 3, hp: 100, maxHp: 100, reward: 5 };
    const grid = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ type: 'road' })));
    grid[3][2] = { type: 'mecha_flame', upgrades: ['mecha_magma', 'mecha_inferno'], initiative: 9 };
    const state = {
        grid,
        gridWidth: 16,
        gridHeight: 16,
        enemies: [enemy],
        roundCounter: 1,
        gold: 100
    };
    const tc = createTowerCombat({
        getState: () => state,
        getData: () => ({ towers: TOWER_CATALOG }),
        damageEnemy: (e, d) => { e.hp -= d; },
        resolveEnemyDeath: () => {},
        removeDeadEnemies: () => {},
        findShortestPath: () => null,
        logAction: () => {},
        logDebug: () => {}
    });

    tc.fireRound(0, 0);
    assert.ok(enemy.burnTurns >= 2, 'Enemy gained burning status from Flame Mecha');
    assert.ok(state.magmaPuddles && state.magmaPuddles.some(p => p.x === 3 && p.y === 3), 'Magma pool vented on impact cell');
});

test('Missile Mecha fires Wasp missiles prioritizing flying enemies', () => {
    const groundEnemy = { id: 1, name: 'Ground Bandit', x: 3, y: 3, hp: 100, maxHp: 100, reward: 5, isFlying: false };
    const flyingEnemy = { id: 2, name: 'Crow', x: 4, y: 3, hp: 60, maxHp: 60, reward: 5, isFlying: true };
    const grid = Array.from({ length: 16 }, () => Array.from({ length: 16 }, () => ({ type: 'road' })));
    grid[3][2] = { type: 'mecha_missile', upgrades: ['mecha_wasp', 'mecha_radar'], initiative: 10 };
    const state = {
        grid,
        gridWidth: 16,
        gridHeight: 16,
        enemies: [groundEnemy, flyingEnemy],
        roundCounter: 1,
        gold: 100
    };

    const tc = createTowerCombat({
        getState: () => state,
        getData: () => ({ towers: TOWER_CATALOG }),
        damageEnemy: (e, d) => { e.hp -= d; },
        resolveEnemyDeath: () => {},
        removeDeadEnemies: () => {},
        findShortestPath: () => null,
        logAction: () => {},
        logDebug: () => {}
    });

    tc.fireRound(0, 0);
    // Flying enemy should have taken 40 true damage from Wasp missile
    assert.ok(flyingEnemy.hp <= 20, 'Flying enemy was prioritized and hit by Wasp missile');
});
