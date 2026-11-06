'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const TOWER_CATALOG_DATA = require('../public/tower-catalog-data.js');
const TOWER_DRAFT_CATALOG = require('../public/tower-draft-catalog.js');
const { towers: baseTowers } = require('../public/gamedata.js');
const rules = require('../public/tower-rules.js');

test('каталог башен содержит все 10 согласованных семейств', () => {
    const all = TOWER_DRAFT_CATALOG.TOWERS;
    assert.equal(all.length, 10);
    const ids = all.map(t => t.id);
    assert.ok(ids.includes('dwarf_outpost'), 'Dwarven Outpost');
    assert.ok(ids.includes('necro_tower'), 'Necromancer Tower');
    assert.ok(ids.includes('royal_mage'), 'Royal Mage');
    assert.ok(ids.includes('archer_tower'), 'Лучники');
    assert.ok(ids.includes('mage_tower'), 'Маги');
    assert.ok(ids.includes('bombard_tower'), 'Бомбарды');
    assert.ok(ids.includes('barracks_tower'), 'Казармы');
    assert.ok(ids.includes('crossbow_tower'), 'Crossbow Fort');
    assert.ok(ids.includes('dwaarp_tower'), 'DWAARP');
    assert.ok(ids.includes('templar_tower'), 'Knights Templar');
});

test('дворфы, некромант, арбалеты, dwaarp и тамплиеры имеют прямую линию (single), остальные — развилку (branch)', () => {
    const dwarf = TOWER_DRAFT_CATALOG.getTowerById('dwarf_outpost');
    const necro = TOWER_DRAFT_CATALOG.getTowerById('necro_tower');
    const royal = TOWER_DRAFT_CATALOG.getTowerById('royal_mage');
    const crossbow = TOWER_DRAFT_CATALOG.getTowerById('crossbow_tower');
    const dwaarp = TOWER_DRAFT_CATALOG.getTowerById('dwaarp_tower');
    const templar = TOWER_DRAFT_CATALOG.getTowerById('templar_tower');
    
    assert.equal(dwarf.progressionType, 'single');
    assert.equal(dwarf.levels.length, 4);
    assert.equal(necro.progressionType, 'single');
    assert.equal(necro.levels.length, 4);
    assert.equal(crossbow.progressionType, 'single');
    assert.equal(crossbow.levels.length, 4);
    assert.equal(dwaarp.progressionType, 'single');
    assert.equal(dwaarp.levels.length, 4);
    assert.equal(templar.progressionType, 'single');
    assert.equal(templar.levels.length, 4);
    assert.equal(royal.progressionType, 'branch');
    assert.equal(royal.levels.length, 5); // I, II, III, IV.А, IV.Б
});

test('казармы содержат параметры солдат гарнизона, а маги и лучники — нет', () => {
    const dwarf = TOWER_DRAFT_CATALOG.getTowerById('dwarf_outpost');
    const royal = TOWER_DRAFT_CATALOG.getTowerById('royal_mage');
    const barracks = TOWER_DRAFT_CATALOG.getTowerById('barracks_tower');
    const templar = TOWER_DRAFT_CATALOG.getTowerById('templar_tower');
    
    assert.equal(dwarf.archetype, 'barracks');
    assert.ok(dwarf.levels[0].soldierHp > 0);
    assert.ok(dwarf.levels[0].soldierArmor >= 0);
    assert.ok(dwarf.levels[0].soldierDmg > 0);

    assert.equal(barracks.archetype, 'barracks');
    assert.ok(barracks.levels[0].soldierHp > 0);

    assert.equal(templar.archetype, 'barracks');
    assert.ok(templar.levels[0].soldierHp > 0);
    assert.ok(templar.levels[0].soldierArmor >= 0);
    assert.ok(templar.levels[0].soldierDmg > 0);

    assert.equal(royal.archetype, 'magic');
    assert.equal(royal.levels[0].soldierHp, undefined);
    assert.equal(royal.levels[0].soldierArmor, undefined);
    assert.ok(royal.levels[0].minDmg > 0);
    assert.ok(royal.levels[0].maxDmg > 0);
});

test('способности IV уровня имеют перезарядку (КД), стоимость и описание', () => {
    const dwarf = TOWER_DRAFT_CATALOG.getTowerById('dwarf_outpost');
    const surprise = dwarf.effects.find(e => e.name.includes('Surprise Appearance'));
    assert.ok(surprise);
    assert.equal(surprise.cooldown, 4);
    assert.ok(surprise.cost > 0);

    const keg = dwarf.effects.find(e => e.name.includes('Powder'));
    assert.ok(keg);
    assert.equal(keg.cooldown, 3);

    const necro = TOWER_DRAFT_CATALOG.getTowerById('necro_tower');
    const mire = necro.effects.find(e => e.name.includes('Mire'));
    assert.ok(mire);
    assert.equal(mire.cooldown, 6);

    const royal = TOWER_DRAFT_CATALOG.getTowerById('royal_mage');
    const tome = royal.effects.find(e => e.name.includes('Spellbook'));
    assert.ok(tome);
    assert.equal(tome.cooldown, 5);

    const crossbow = TOWER_DRAFT_CATALOG.getTowerById('crossbow_tower');
    const barrage = crossbow.effects.find(e => e.name.includes('Crossbow Barrage'));
    assert.ok(barrage);
    assert.equal(barrage.cooldown, 3);
    assert.ok(barrage.cost > 0);

    const dwaarp = TOWER_DRAFT_CATALOG.getTowerById('dwaarp_tower');
    const drill = dwaarp.effects.find(e => e.name.includes('Core Drill'));
    assert.ok(drill);
    assert.equal(drill.cooldown, 4);
    assert.ok(drill.cost > 0);

    const templar = TOWER_DRAFT_CATALOG.getTowerById('templar_tower');
    const grail = templar.effects.find(e => e.name.includes('Holy Grail'));
    assert.ok(grail);
    assert.ok(grail.cost > 0);
});

test('скрытие башни мастером отсекает её от видимого каталога игроков', () => {
    const all = TOWER_CATALOG_DATA.getAllTowers(baseTowers);
    assert.ok(all.dwarf_1);
    
    // По умолчанию дворфы видимы
    all.dwarf_1.hiddenFromPlayers = false;
    let visible = TOWER_CATALOG_DATA.getPlayerVisibleTowers(all);
    assert.ok(visible.dwarf_1);

    // Мастер скрывает дворфов
    all.dwarf_1.hiddenFromPlayers = true;
    visible = TOWER_CATALOG_DATA.getPlayerVisibleTowers(all);
    assert.equal(visible.dwarf_1, undefined);
    
    // Возвращаем флаг
    all.dwarf_1.hiddenFromPlayers = false;
});
