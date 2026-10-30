const { test } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../public/tower-rules.js');
const data = require('../public/gamedata.js');

test('тип башни объединяет базовый уровень, все улучшения и развилки', () => {
    assert.deepEqual(rules.getBaseTypes(data.towers), ['archer_1', 'mage_1', 'bombard_1', 'barracks_1']);
    assert.equal(rules.getFamily(data.towers, 'archer_ranger'), 'archer_1');
    assert.equal(rules.getFamily(data.towers, 'archer_musketeer'), 'archer_1');
    assert.equal(rules.getFamily(data.towers, 'mage_3'), 'mage_1');
    assert.equal(rules.getFamily(data.towers, 'unknown'), null);
});

test('новые типы и их улучшения определяются из данных без фиксированного списка', () => {
    const towers = { ...data.towers, ice: { next: ['ice_storm', 'ice_shards'] },
        ice_storm: {}, ice_shards: {}, fire: {} };
    assert.equal(rules.getBaseTypes(towers).length, 6);
    assert.equal(rules.getFamily(towers, 'ice_storm'), 'ice');
    assert.equal(rules.getFamily(towers, 'ice_shards'), 'ice');
    assert.equal(rules.getFamily(towers, 'fire'), 'fire');
    assert.equal(rules.maxTypes, 5);
});
