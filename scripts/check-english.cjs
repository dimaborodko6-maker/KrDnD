'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const cyrillic = /[А-Яа-яЁё]/;
function english(value, location) {
    if (typeof value === 'string' && cyrillic.test(value)) throw new Error('Russian text in ' + location + ': ' + value);
    if (Array.isArray(value)) value.forEach((item, i) => english(item, location + '[' + i + ']'));
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) english(item, location + '.' + key);
}
try {
    const data = structuredClone(require('../public/gamedata.js'));
    Object.assign(data.towers, require('../public/tower-catalog-data.js').TOWERS);
    english(data, 'game data');
    english(require('../public/tower-draft-catalog.js'), 'tower previews');
    english(require('../public/enemy-traits.js').definitions, 'enemy traits');
    english(Object.values(require('../localization/ru-en.json')), 'English translations');
    const catalog = require('../defaults/gamecatalog.json');
    english(catalog, 'starter catalog');
    require('../game-catalog.js').validateCatalog(catalog.catalog, Object.keys(data.enemies));
    const library = require('../defaults/scenes.json');
    english(library, 'starter scenes');
    for (const scene of library.scenes) {
        const valid = require('../scene-library.js').validateScene(scene, data);
        require('../scene-library.js').validatePlayable(valid, data);
    }
    for (const name of fs.readdirSync(path.join(root, 'public')).filter(name => name.endsWith('.html'))) {
        const source = fs.readFileSync(path.join(root, 'public', name), 'utf8');
        const visible = source.replace(/<!--[\s\S]*?-->/g, '').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
        if (cyrillic.test(visible)) throw new Error('Russian text in public/' + name);
        if (!/<html\b[^>]*lang="en"/i.test(source)) throw new Error('Missing English language declaration: ' + name);
    }
    console.log('English data, translations, HTML screens and starter content: OK.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
