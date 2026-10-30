'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const i18n = require('../public/i18n');

test('compound translations respect word boundaries and work in both directions', () => {
    assert.equal(i18n.t('Event activated: Golden Goblin', 'ru'), 'Событие активировано: Золотой гоблин');
    assert.equal(i18n.t('Событие активировано: Золотой гоблин', 'en'), 'Event activated: Golden goblin');
    for (const text of ['Goldenrod', 'Goblinhood', 'goldenGoblin', 'my_Goblin_id']) {
        assert.equal(i18n.t(text, 'ru'), text);
    }
    assert.equal(i18n.t('  Ready 2 of 3  ', 'ru'), '  Готово 2 из 3  ');
    assert.equal(i18n.t('Banner bonus: invalid integer', 'ru'), 'Усиление знамени: недопустимое целое число');
});

test('player counts use Russian declension and English singular/plural', () => {
    for (const [count, noun] of [[0, 'игроков'], [1, 'игрок'], [2, 'игрока'], [4, 'игрока'],
        [5, 'игроков'], [11, 'игроков'], [12, 'игроков'], [14, 'игроков'],
        [21, 'игрок'], [22, 'игрока'], [111, 'игроков'], [114, 'игроков']]) {
        const en = `${count} ${count === 1 ? 'player' : 'players'}`;
        const ru = `${count} ${noun}`;
        assert.equal(i18n.t(en, 'ru'), ru);
        assert.equal(i18n.t(ru, 'en'), en);
    }
});

function browser(dictionary = require('../public/i18n-dict')) {
    const callbacks = {};
    const document = { addEventListener: (event, fn) => { callbacks[event] = fn; } };
    const context = { document, require: () => dictionary,
        window: { GAME_DATA: structuredClone(require('../public/gamedata')) } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(require.resolve('../public/i18n'), 'utf8'), context);
    return { api: context.window.KR_I18N, context, callbacks };
}

test('a translated fragment is not translated again and an empty dictionary preserves text', () => {
    const { api } = browser({ en2ru: { Guard: 'Ward', Ward: 'Страж' }, ru2en: {} });
    assert.equal(api.t('Guard & Ward', 'ru'), 'Ward & Страж');
    assert.equal(api.t('Unknown message', 'en'), 'Unknown message');
    assert.equal(browser({ en2ru: {}, ru2en: {} }).api.t('Unknown message', 'ru'), 'Unknown message');
});

test('changing a translated text node keeps the latest value across language switches', () => {
    const { api } = browser();
    const node = { nodeType: 3, nodeValue: 'Round 1' };
    api.translateDOM(node, 'ru');
    assert.equal(node.nodeValue, 'Раунд 1');
    node.nodeValue = 'Round 2';
    api.translateDOM(node, 'ru');
    assert.equal(node.nodeValue, 'Раунд 2');
    api.translateDOM(node, 'en');
    assert.equal(node.nodeValue, 'Round 2');
    api.translateDOM(node, 'ru');
    api.translateDOM(node, 'ru');
    assert.equal(node.nodeValue, 'Раунд 2');
});

test('attributes on an inserted root element translate and retain dynamic updates', () => {
    const { api } = browser();
    const attrs = { title: 'Round 1', placeholder: 'Language', 'aria-label': 'Language' };
    const element = { nodeType: 1, tagName: 'INPUT', querySelectorAll: () => [],
        hasAttribute: key => Object.hasOwn(attrs, key), getAttribute: key => attrs[key],
        setAttribute: (key, value) => { attrs[key] = value; } };
    api.translateDOM(element, 'ru');
    assert.deepEqual(attrs, { title: 'Раунд 1', placeholder: 'Язык', 'aria-label': 'Язык' });
    attrs.title = 'Round 2';
    api.translateDOM(element, 'ru');
    api.translateDOM(element, 'en');
    assert.deepEqual(attrs, { title: 'Round 2', placeholder: 'Language', 'aria-label': 'Language' });
});

test('ultimate abilities and wave text translate and restore without changing mechanics', () => {
    const { api, context } = browser();
    const data = context.window.GAME_DATA;
    const original = structuredClone(data);
    api.applyGameDataLanguage('ru');
    assert.equal(data.heroes.gerald.ultimate.name, 'Божественный клинок');
    assert.notEqual(data.heroes.gerald.ultimate.desc, original.heroes.gerald.ultimate.desc);
    assert.notEqual(data.presetWaves[0].title, original.presetWaves[0].title);
    assert.deepEqual(data.presetWaves[0].enemies, original.presetWaves[0].enemies);
    assert.equal(data.heroes.gerald.ultimate.id, original.heroes.gerald.ultimate.id);
    api.applyGameDataLanguage('en');
    assert.equal(data.heroes.gerald.ultimate.name, original.heroes.gerald.ultimate.name);
    assert.equal(data.heroes.gerald.ultimate.desc, original.heroes.gerald.ultimate.desc);
    assert.equal(data.presetWaves[0].title, original.presetWaves[0].title);
});

test('the home page loads the runtime dictionary and provides a language switch', () => {
    const html = fs.readFileSync(require.resolve('../public/index.html'), 'utf8');
    assert.match(html, /src="i18n-dict\.js"/);
    assert.match(html, /src="i18n\.js"/);
    assert.match(html, /class="lang-switcher-slot"/);
    assert.equal(i18n.t('Host a game', 'ru'), 'Провести игру');
    assert.equal(i18n.t('Спасбросок', 'en'), 'Saving throw');
});

test('tower descriptions preserve numeric mechanics across languages', () => {
    const towers = require('../public/gamedata').towers;
    const reference = require('../localization/ru-en.json');
    const ids = new Set(['musketeer_shrapnel', 'musketeer_sniper', 'arcane_teleport', 'arcane_death', 'tesla_overcharge']);
    let checked = 0;
    for (const tower of Object.values(towers)) {
        for (const ability of tower.upgrades || []) {
            if (!ids.has(ability.id)) continue;
            const english = ability.description || ability.desc;
            const russian = i18n.t(english, 'ru');
            assert.notEqual(russian, english, ability.id);
            assert.deepEqual(russian.match(/\d+/g), english.match(/\d+/g), ability.id);
            assert.equal(reference[russian], english);
            assert.equal(i18n.t(russian, 'en'), english);
            checked++;
        }
    }
    assert.equal(checked, 5);
});

test('observer translates changed text and tooltips without translating code or user input', () => {
    const { api, context, callbacks } = browser();
    let notify;
    let options;
    context.localStorage = { getItem: () => 'ru' };
    context.CustomEvent = class {};
    context.window.dispatchEvent = () => {};
    const body = { nodeType: 1, tagName: 'BODY', querySelectorAll: () => [], hasAttribute: () => false };
    Object.assign(context.document, { body, title: 'Host a game', documentElement: {}, querySelectorAll: () => [] });
    context.MutationObserver = class {
        constructor(fn) { notify = fn; }
        observe(target, settings) { assert.equal(target, body); options = settings; }
    };
    callbacks.DOMContentLoaded();
    assert.equal(options.characterData, true);
    assert.equal(context.document.title, 'Провести игру');
    const node = { nodeType: 3, nodeValue: 'Round 2', parentNode: body };
    notify([{ type: 'characterData', target: node }]);
    assert.equal(node.nodeValue, 'Раунд 2');
    node.nodeValue = 'Round 3';
    notify([{ type: 'characterData', target: node }]);
    api.applyLanguage('en');
    assert.equal(context.document.title, 'Host a game');
    api.translateDOM(node, 'en');
    assert.equal(node.nodeValue, 'Round 3');
    for (const tagName of ['SCRIPT', 'CODE', 'PRE', 'TEXTAREA']) {
        const protectedText = { nodeType: 3, nodeValue: 'Round 1', parentNode: { tagName, parentNode: body } };
        api.translateDOM(protectedText, 'ru');
        assert.equal(protectedText.nodeValue, 'Round 1');
    }
});
