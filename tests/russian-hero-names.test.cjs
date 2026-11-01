'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game } = require('./helpers/game-harness.cjs');

test('русские имена героев корректно определяют heroKey и урон ультимейта', () => {
    const g = game();
    const ws = g.connect();

    // Test Gerald with Russian name
    const geraldPlayer = {
        name: 'PlayerGerald',
        heroName: 'Джеральд Светоносный',
        stats: { str: 20, dex: 14, con: 16, int: 10, wis: 10, cha: 10 },
        skills: ['steel', 'fated', 'retribution'],
        sen: 10
    };
    g.send(ws, { type: 'REGISTER_PLAYER', ...geraldPlayer });
    const hero = g.state.players['PlayerGerald'];
    assert.ok(hero, 'Герой зарегистрирован');
    assert.equal(hero.heroKey, 'gerald', 'Ключ героя определился как gerald');
    hero.x = 4; hero.y = 2;

    // Test enemy and Gerald ultimate
    const enemy = g.enemy(1, hero.x + 1, hero.y);
    enemy.hp = 300;
    enemy.maxHp = 300;
    enemy.magicRes = 0;
    enemy.armor = 0;

    g.send(ws, {
        type: 'PLAYER_ACTION',
        ability: 'ultimate',
        targetId: enemy.id,
        dice: 1
    });

    assert.equal(enemy.hp, 100, 'Ультимейт Джеральда наносит ровно 200 чистого урона (300 -> 100)');
});

test('русские имена всех героев распознаются сервером', () => {
    const testCases = [
        { name: 'Джеральд Светоносный', expected: 'gerald', skills: ['steel'] },
        { name: 'Зефира (Маг-лучник)', expected: 'zefira', skills: ['hammer'] },
        { name: 'Малик Ярость Молота', expected: 'malik', skills: ['joehammer'] },
        { name: 'Болин (Подрывник)', expected: 'bolin', skills: ['rounds'] },
        { name: 'Коннор (Тамплиер)', expected: 'connor', skills: ['slash'] },
        { name: 'Иллиана и Спарки', expected: 'illiana', skills: ['bliss'] },
        { name: 'Торгар Несокрушимый', expected: 'torghar', skills: ['shield_wall'] },
        { name: 'Рэтчет (Боевой медик)', expected: 'ratchet', skills: ['triage_aura'] }
    ];

    for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        const g = game();
        const ws = g.connect();
        g.send(ws, {
            type: 'REGISTER_PLAYER',
            name: 'P_' + i,
            heroName: tc.name,
            stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
            skills: tc.skills,
            sen: 10
        });
        const player = g.state.players['P_' + i];
        assert.ok(player, 'Игрок зарегистрирован: ' + tc.name);
        assert.equal(player.heroKey, tc.expected, `Для ${tc.name} ожидался ключ ${tc.expected}`);
    }
});
