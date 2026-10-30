const { test } = require('node:test');
const assert = require('node:assert/strict');
const { towers } = require('../public/gamedata.js');
const rules = require('../public/tower-rules.js');
const planner = require('../public/tower-preparation.js');

test('планировщик обходит все встроенные уровни и специализации без потери веток', () => {
    const visited = new Set();
    for (const base of rules.getBaseTypes(towers)) {
        const paths = planner.getPaths(towers, base);
        assert.equal(paths.length, 2);
        for (const path of paths) {
            assert.equal(path.length, 4);
            path.forEach((id, level) => {
                visited.add(id);
                const stats = planner.getStats(towers[id]);
                assert.ok(stats.length > 0);
                assert.ok(stats.every(([, value]) => value != null && !String(value).includes('undefined')));
                assert.equal(planner.getPlanCost(towers, path, level, new Set()),
                    path.slice(0, level + 1).reduce((sum, type) => sum + towers[type].cost, 0));
            });
        }
    }
    assert.equal(visited.size, Object.keys(towers).length);
});

test('стоимость включает только способности выбранной башни; характеристики содержат только выбранный уровень', () => {
    const path = ['mage_1', 'mage_2', 'mage_3', 'mage_sorcerer'];
    const abilities = new Set(['sorcerer_golem', 'arcane_death']);
    assert.equal(planner.getPlanCost(towers, path, 3, abilities), 1000);
    assert.equal(planner.getPlanCost(towers, path, 1, abilities), 260);
    assert.deepEqual(planner.getStats(towers.mage_2).find(([name]) => name === 'Damage'), ['Damage', '16–24']);
    assert.deepEqual(planner.getStats(towers.barracks_paladins).find(([name]) => name === 'Soldier HP'), ['Soldier HP', 150]);
});

test('просмотр нового типа не предполагает четыре уровня и защищён от циклической ссылки', () => {
    const custom = { ice: { cost: 80, next: ['storm', 'shards'] }, storm: { cost: 100 }, shards: { cost: 120, next: 'ice' } };
    assert.deepEqual(planner.getPaths(custom, 'ice'), [['ice', 'storm'], ['ice', 'shards']]);
    assert.deepEqual(planner.getPaths({ fire: { cost: 90 } }, 'fire'), [['fire']]);
    assert.deepEqual(planner.getPaths(custom, 'missing'), []);
});
