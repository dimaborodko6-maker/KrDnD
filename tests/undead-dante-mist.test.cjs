'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./helpers/game-harness.cjs');
const rules = require('../public/battle-ability-rules.js');
const eventRules = require('../public/activated-event-rules.js');
const createEvents = require('../activated-events.js');

test('dante hero: registration, range, abilities and ultimate', () => {
    const g = game();
    const ws = g.connect();

    // Register Dante
    g.send(ws, {
        type: 'REGISTER_PLAYER',
        name: 'PlayerDante',
        heroName: 'Dante the Inquisitor',
        stats: { str: 10, dex: 16, con: 12, int: 10, wis: 14, cha: 10 },
        skills: ['silver_bullet', 'consecrated_ground', 'undead_bane'],
        sen: 13
    });

    const player = g.state.players['PlayerDante'];
    assert.ok(player, 'Dante registered');
    assert.equal(player.heroKey, 'dante');
    assert.equal(player.range, 3);
    assert.equal(player.speed, 3);
    assert.equal(player.blockLimit, 1);
    player.x = 3; player.y = 3;

    // 1. Silver Bullet (pure damage ignoring armor)
    const armoredEnemy = g.enemy(1, 5, 3);
    armoredEnemy.hp = 100;
    armoredEnemy.maxHp = 100;
    armoredEnemy.armor = 50; // 50% armor
    armoredEnemy.magicRes = 0;

    g.send(ws, {
        type: 'PLAYER_ACTION',
        ability: 'spell_silver_bullet',
        targetId: armoredEnemy.id,
        dice: 6
    });

    // dexMod for 16 is 3. base = dice(6) + dexMod(3) + 4 = 13 true damage. Armor ignored!
    assert.equal(armoredEnemy.hp, 87, 'Silver Bullet deals 13 true damage ignoring 50% armor (100 -> 87)');
    assert.equal(player.hasAttackedThisRound, true);

    // Reset action for test
    player.hasAttackedThisRound = false;
    player.cooldowns = {};

    // 2. Ultimate: Beacon of Light deals 180 true damage in radius 2 around player
    const nearEnemy1 = g.enemy(2, 4, 3);
    nearEnemy1.hp = 200; nearEnemy1.armor = 30; nearEnemy1.magicRes = 30;
    const nearEnemy2 = g.enemy(3, 3, 5);
    nearEnemy2.hp = 200; nearEnemy2.armor = 0; nearEnemy2.magicRes = 0;
    const distantEnemy = g.enemy(4, 7, 7);
    distantEnemy.hp = 200;

    g.send(ws, {
        type: 'PLAYER_ACTION',
        ability: 'ultimate',
        targetId: nearEnemy1.id,
        dice: 1
    });

    assert.equal(nearEnemy1.hp, 20, 'Near enemy 1 takes 180 true damage (200 -> 20)');
    assert.equal(nearEnemy2.hp, 20, 'Near enemy 2 takes 180 true damage (200 -> 20)');
    assert.equal(distantEnemy.hp, 200, 'Distant enemy outside radius 2 takes no damage');
});

test('necroticMist activated event damages heroes inside area and expires after duration', () => {
    let state = {
        gamePeriod: 'game',
        roundCounter: 0,
        players: {
            dante: { hp: 100, maxHp: 100, x: 2, y: 2 },
            outsideHero: { hp: 100, maxHp: 100, x: 6, y: 6 }
        },
        enemies: [],
        soldiers: [],
        grid: Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ type: 'empty' })))
    };
    for (let x = 0; x < 8; x++) state.grid[7][x] = { type: x === 7 ? 'castle' : 'road' };

    let sequence = 0;
    const data = { enemies: { goblin: { hp: 20, speed: 2, reward: 3 } } };
    const logs = [];
    const ctx = {
        getState: () => state,
        getData: () => data,
        createEnemy: (type, x, y) => ({ id: ++sequence, type, x, y, hp: 20, maxHp: 20, reward: 3, traits: {} }),
        damage: (unit, amount) => { unit.hp = Math.max(0, unit.hp - amount); },
        removeDeadEnemies: () => { state.enemies = state.enemies.filter(u => u.hp > 0); },
        refreshBlocks: () => {},
        log: text => logs.push(text),
        random: () => 0
    };

    const events = createEvents(ctx);
    const tick = () => {
        state.roundCounter++;
        events.beginRound();
        events.enemyRound();
        events.endRound();
    };

    // Activate Necrotic Mist at (2, 2) with radius 2, duration 2, damage 8
    events.activate({ kind: 'necroticMist', x: 2, y: 2, radius: 2, duration: 2, damage: 8 });
    assert.equal(state.activeEvents.length, 1);
    assert.equal(state.players.dante.hp, 100);

    tick();
    assert.equal(state.players.dante.hp, 92, 'Dante inside the mist takes 8 damage');
    assert.equal(state.players.outsideHero.hp, 100, 'Hero outside the mist takes 0 damage');

    tick();
    assert.equal(state.players.dante.hp, 84, 'Dante takes another 8 damage');
    assert.equal(state.activeEvents.length, 0, 'Event expires after 2 rounds');

    tick();
    assert.equal(state.players.dante.hp, 84, 'No further damage after event expired');
});

test('new undead enemies: skeleton_warrior, ghoul, necromancer are valid in catalog', () => {
    const data = require('../public/gamedata.js');
    assert.ok(data.enemies.skeleton_warrior, 'skeleton_warrior exists in gamedata');
    assert.ok(data.enemies.ghoul, 'ghoul exists in gamedata');
    assert.ok(data.enemies.necromancer, 'necromancer exists in gamedata');

    assert.equal(data.enemies.skeleton_warrior.reward, 8);
    assert.equal(data.enemies.skeleton_warrior.armor, 20);
    assert.ok(data.enemies.skeleton_warrior.traits.shield);

    assert.equal(data.enemies.ghoul.reward, 18);
    assert.equal(data.enemies.ghoul.speed, 2);
    assert.ok(data.enemies.ghoul.traits.berserk);

    assert.equal(data.enemies.necromancer.reward, 41);
    assert.equal(data.enemies.necromancer.traits.summoning.type, 'skeleton_warrior');
});
