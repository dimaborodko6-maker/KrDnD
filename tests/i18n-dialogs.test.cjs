'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const i18n = require('../public/i18n');

test('hero creation validation alerts use the selected language', () => {
    const source = fs.readFileSync(require.resolve('../public/player-logic.js'), 'utf8');
    const match = source.match(/window\.finishCharacterCreation = function\(\) \{([\s\S]*?)\n\};/);
    assert.ok(match, 'finishCharacterCreation handler exists');

    const messages = [];
    const context = {
        window: {},
        character: { stats: { str: 14, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, skills: [] },
        alert: message => messages.push(message),
        _tr: message => i18n.t(message, 'ru')
    };
    vm.runInNewContext(`window.finishCharacterCreation = function() {${match[1]}\n}; window.finishCharacterCreation();`, context);

    assert.deepEqual(messages, ['Распределите ровно 27 очков характеристик.']);
});
