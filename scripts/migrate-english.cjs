'use strict';
const fs = require('node:fs');
const path = require('node:path');
const dictionary = require('../localization/ru-en.json');
function translate(value, trail = [], playerIdentities = new Set(Object.keys(value?.players || {}))) {
    if (typeof value === 'string') {
        // Player identity is a storage key; translating a player's chosen name would break references.
        if (trail[0] === 'players' && trail.at(-1) === 'name') return value;
        const displayFields = ['heroName', 'name', 'shortName', 'description', 'desc', 'title', 'text'];
        if (playerIdentities.has(value) && !displayFields.includes(trail.at(-1))) return value;
        return Object.hasOwn(dictionary, value) ? dictionary[value] : value;
    }
    if (Array.isArray(value)) return value.map((item, i) => translate(item, [...trail, i], playerIdentities));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translate(item, [...trail, key], playerIdentities)]));
    return value;
}
function migrate(input, output) {
    if (!input || !output) throw new Error('Usage: npm run migrate:english -- old.json new-english.json');
    if (path.resolve(input) === path.resolve(output)) throw new Error('Use a different output path. The input is never overwritten.');
    const result = translate(JSON.parse(fs.readFileSync(input, 'utf8')));
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    return result;
}
if (require.main === module) {
    try { migrate(...process.argv.slice(2)); console.log('English copy written. Original file preserved. Custom text and old log messages may still need translation.'); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { translate, migrate };
