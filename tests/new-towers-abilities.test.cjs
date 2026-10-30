const { test } = require('node:test');
const assert = require('node:assert/strict');
const { game, data } = require('./helpers/game-harness.cjs');
const catalogData = require('../public/tower-catalog-data.js');

const towersWithNew = {
    ...data.towers,
    ...catalogData.TOWERS
};

test('Некромант: поднимает скелетов при смерти врагов в радиусе и соблюдает лимиты', () => {
    const g = game({ gamePeriod: 'game', towers: towersWithNew });
    // Строим некроманта 1 уровня на (4, 1), дальность 3
    g.tower('necro_1', 4, 1);
    const towerCell = g.state.grid[1][4];
    assert.equal(towerCell.type, 'necro_1');

    // Враг погибает на дороге (4, 2) в радиусе 1 от башни
    const en1 = g.enemy(101, 4, 2, { hp: 0 });
    g.resolveEnemyDeath(en1);

    // Должен появиться 1 скелет
    let skeletons = (g.state.soldiers || []).filter(s => s.isSkeleton && s.hp > 0);
    assert.equal(skeletons.length, 1);
    assert.equal(skeletons[0].hp, 25);
    assert.equal(skeletons[0].name, 'Skeleton');

    // Второй враг погибает в радиусе
    const en2 = g.enemy(102, 4, 2, { hp: 0 });
    g.resolveEnemyDeath(en2);
    // Третий враг погибает в радиусе (на 1 ур лимит = 2, поэтому 3-й не должен подняться)
    const en3 = g.enemy(103, 4, 2, { hp: 0 });
    g.resolveEnemyDeath(en3);

    skeletons = (g.state.soldiers || []).filter(s => s.isSkeleton && s.hp > 0);
    assert.equal(skeletons.length, 2, 'Лимит на 1 уровне не превышает 2 скелетов');
});

test('Некромант IV уровня: Костяной Рыцарь и расширение до 7 лопат', () => {
    const g = game({ gamePeriod: 'game', towers: towersWithNew });
    g.tower('necro_4', 4, 1);
    const cell = g.state.grid[1][4];
    cell.upgrades = ['necro_extra_shovels', 'necro_bone_knight'];

    // Первый павший враг призывает Костяного Рыцаря
    const enInit = g.enemy(201, 4, 2, { hp: 0 });
    g.resolveEnemyDeath(enInit);
    let soldiers = (g.state.soldiers || []).filter(s => s.isSkeleton);
    assert.equal(soldiers.length, 1);
    assert.equal(soldiers[0].isBoneKnight, true);
    assert.equal(soldiers[0].hp, 55);
    assert.equal(soldiers[0].armor, 30);
    assert.equal(soldiers[0].dmg, 12);
    assert.equal(soldiers[0].blockLimit, 2);

    // Следующие враги поднимают обычных скелетов вплоть до лимита 7
    for (let i = 202; i <= 210; i++) {
        const e = g.enemy(i, 4, 2, { hp: 0 });
        g.resolveEnemyDeath(e);
    }
    soldiers = (g.state.soldiers || []).filter(s => s.isSkeleton && s.hp > 0);
    assert.equal(soldiers.length, 7, 'Лимит лопат расширен до 7 скелетов');
});

test('Некромант IV: ядовитая трясина наносит чистый урон и травит врагов', () => {
    const g = game({ gamePeriod: 'game', towers: towersWithNew });
    g.tower('necro_4', 4, 1);
    g.state.grid[1][4].upgrades = ['necro_poison_mire'];
    g.state.roundCounter = 10;

    // Враг в радиусе башни
    const en = g.enemy(301, 4, 2, { hp: 100 });
    g.fireTowers();

    assert.ok(g.state.poisonPuddles && g.state.poisonPuddles.length > 0, 'Создана ядовитая трясина');
    assert.equal(g.state.poisonPuddles[0].x, 4);
    assert.equal(g.state.poisonPuddles[0].y, 2);
    assert.equal(g.state.poisonPuddles[0].turns, 3);

    // Ход волны: DoT от трясины
    const oldHp = en.hp;
    g.moveEnemies();
    assert.ok(en.hp < oldHp, 'Враг получил урон от трясины');
    assert.ok(en.poisonTurns > 0, 'Враг получил статус яда');
});

test('Дворфы: шахта приносит доход при отсутствии врагов и блокируется врагами в радиусе', () => {
    const g = game({ gamePeriod: 'game', towers: towersWithNew });
    g.tower('dwarf_1', 4, 1); // доход +4 G
    g.state.gold = 100;
    g.state.enemies = []; // врагов нет

    g.moveEnemies();
    assert.equal(g.state.gold, 104, 'Шахта принесла +4 золота');

    // Появляется враг в радиусе башни (дальность 2)
    g.enemy(401, 4, 2, { hp: 50 });
    g.moveEnemies();
    assert.equal(g.state.gold, 104, 'Шахта заблокирована врагом и не приносит золото');
});

test('Дворфы IV: Глубинная жила может умножать доход', () => {
    const g = game({ gamePeriod: 'game', towers: towersWithNew });
    g.tower('dwarf_4', 4, 1);
    g.state.grid[1][4].upgrades = ['dwarf_deep_mine'];
    g.state.gold = 100;
    g.state.enemies = [];

    // Базовый доход 15
    g.moveEnemies();
    assert.ok(g.state.gold >= 115, 'Доход шахты начислен');
});

test('Дворфы IV: Бочонок пороха и Внезапное появление оглушают врагов', () => {
    const g = game({ gamePeriod: 'game', towers: towersWithNew });
    g.tower('dwarf_4', 4, 1);
    g.state.grid[1][4].upgrades = ['dwarf_surprise_strike', 'dwarf_blast_keg'];
    g.state.roundCounter = 10;

    // Солдат дворфов на (4, 2)
    const dwarfSoldier = g.state.soldiers.find(s => s.towerType === 'dwarf_4');
    assert.ok(dwarfSoldier, 'Отряд дворфов создан');
    dwarfSoldier.x = 4;
    dwarfSoldier.y = 2;

    const en = g.enemy(501, 4, 2, { hp: 100 });
    dwarfSoldier.blockedEnemyIds = [en.id];

    g.moveEnemies();
    assert.ok(en.stunTurns > 0, 'Враг оглушён');
});

test('Придворный Маг: Резонанс увеличивает урон башен, Старая книга даёт 3 залпа', () => {
    const g = game({ gamePeriod: 'game', towers: towersWithNew });
    g.tower('mage_court', 4, 1);
    g.state.grid[1][4].upgrades = ['court_resonance', 'court_old_tome'];
    g.state.roundCounter = 10;

    const en = g.enemy(601, 4, 2, { hp: 500, maxHp: 500 });
    g.fireTowers();

    // Резонанс наложил бафф
    assert.equal(g.state.grid[1][4].damageBuffMultiplier, 1.25);
    // Враг получил урон от нескольких залпов книги
    assert.ok(en.hp < 350, 'Враг получил значительный суммарный урон от тройного залпа');
});

test('Жрица Света: Молитва исцеления лечит союзников (но не скелетов)', () => {
    const g = game({ gamePeriod: 'game', towers: towersWithNew });
    g.tower('mage_priestess', 4, 1);
    g.state.grid[1][4].upgrades = ['priestess_heal_prayer'];

    const { hero } = g.player();
    hero.x = 4;
    hero.y = 2;
    hero.hp = 10; // Ранен

    // Создаем скелета рядом
    g.state.soldiers.push({
        id: 'skel_test',
        x: 4,
        y: 2,
        hp: 10,
        maxHp: 25,
        isSkeleton: true,
        respawnTimer: 0
    });

    g.moveEnemies();

    assert.ok(hero.hp > 10, 'Герой исцелен Молитвой исцеления');
    const skel = g.state.soldiers.find(s => s.id === 'skel_test');
    assert.equal(skel.hp, 10, 'Скелеты НЕ лечатся Молитвой исцеления Жрицы Света');
});

test('Жрица Света: Карающий луч и Очищающее благословение', () => {
    const g = game({ gamePeriod: 'game', towers: towersWithNew });
    g.tower('mage_priestess', 4, 1);
    g.state.grid[1][4].upgrades = ['priestess_cleanse', 'priestess_radiant_smite'];
    g.state.roundCounter = 10;

    const { hero } = g.player();
    hero.x = 4;
    hero.y = 2;
    hero.poisonTurns = 2; // Дебафф яда

    const en = g.enemy(701, 4, 2, { hp: 100 });
    hero.blockedEnemyIds = [en.id];

    g.fireTowers();

    // Cleanse снял яд
    assert.equal(hero.poisonTurns, 0, 'Яд снят очищающим благословением');
    // Radiant smite нанес урон и дал помеху
    assert.ok(en.hp < 100, 'Враг получил урон от Карающего луча');
    assert.equal(en.hasDisadvantage, true, 'Враг получил помеху на атаку');
});
