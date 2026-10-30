'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareData } = require('../scripts/start.cjs');
const { translate, migrate } = require('../scripts/migrate-english.cjs');

test('starter installation preserves existing catalogs, scenes and the save file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-release-'));
    const save = path.join(dir, 'save.json');
    const catalog = path.join(dir, 'gamecatalog.json'), scenes = path.join(dir, 'scenes.json');
    fs.writeFileSync(save, '{"existing":true}');
    try {
        prepareData({ KR_SAVE_FILE: save });
        assert.equal(JSON.parse(fs.readFileSync(catalog)).catalog.enemies.bandit.name, 'Bandit');
        assert.equal(JSON.parse(fs.readFileSync(scenes)).scenes[0].id, 'roadside-defense');
        fs.writeFileSync(catalog, 'CUSTOM_CATALOG'); fs.writeFileSync(scenes, 'CUSTOM_SCENES');
        prepareData({ KR_SAVE_FILE: save });
        assert.equal(fs.readFileSync(catalog, 'utf8'), 'CUSTOM_CATALOG');
        assert.equal(fs.readFileSync(scenes, 'utf8'), 'CUSTOM_SCENES');
        assert.equal(fs.readFileSync(save, 'utf8'), '{"existing":true}');
    } finally { for (const file of [save, catalog, scenes]) if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); }
});
test('migration translates built-in hero identity without renaming the player or changing mechanics', () => {
    const source = { players: { 'Гоблин': { name: 'Гоблин', heroName: 'Джеральд Светоносный', hp: 37, skills: ['fated'] } }, enemies: [{ name: 'Гоблин', type: 'goblin', hp: 20, lastAttackerId: 'Гоблин' }], demolishVote: { initiator: 'Гоблин' } };
    const result = translate(source);
    assert.equal(result.players['Гоблин'].name, 'Гоблин');
    assert.equal(result.players['Гоблин'].heroName, 'Gerald Lightbringer');
    assert.equal(result.players['Гоблин'].hp, 37);
    assert.deepEqual(result.players['Гоблин'].skills, ['fated']);
    assert.equal(result.enemies[0].name, 'Goblin');
    assert.equal(result.enemies[0].type, 'goblin');
    assert.equal(result.enemies[0].lastAttackerId, 'Гоблин');
    assert.equal(result.demolishVote.initiator, 'Гоблин');
    assert.equal(source.players['Гоблин'].heroName, 'Джеральд Светоносный');
});
test('migration refuses to overwrite either the original or an existing output', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-migrate-'));
    const input = path.join(dir, 'input.json'), output = path.join(dir, 'output.json');
    const raw = '{"heroName":"Джеральд Светоносный","hp":31}';
    try {
        fs.writeFileSync(input, raw);
        migrate(input, output);
        assert.equal(JSON.parse(fs.readFileSync(output)).heroName, 'Gerald Lightbringer');
        assert.throws(() => migrate(input, output), { code: 'EEXIST' });
        assert.throws(() => migrate(input, input), /different output/);
        assert.equal(fs.readFileSync(input, 'utf8'), raw);
    } finally { for (const file of [input, output]) if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); }
});
