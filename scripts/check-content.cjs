'use strict';

// Только чтение: используем серверные валидаторы, не импортируем server.js.
const fs = require('node:fs');
const path = require('node:path');
const { validateCatalog, createCatalogStore } = require('../game-catalog');
const data = require('../public/gamedata.js');
const root = path.resolve(__dirname, '..');
const builtinIds = Object.keys(data.enemies);

function report(catalog, label) {
    console.log(`OK ${label}: enemies — ${Object.keys(catalog.enemies).length}, waves — ${catalog.presetWaves.length}`);
}

try {
    const builtin = validateCatalog({ enemies:data.enemies, presetWaves:data.presetWaves }, builtinIds);
    report(builtin, 'public/gamedata.js');

    // Пример — фрагмент для копирования, не файл сохранённого каталога.
    // Его волны проверяем отдельно: образец можно уже перенести в исходные данные.
    const exampleFile = path.join(root, 'docs', 'examples', 'enemy-and-wave.json');
    const example = JSON.parse(fs.readFileSync(exampleFile, 'utf8'));
    report(validateCatalog({
        enemies:{ ...builtin.enemies, ...example.enemies },
        presetWaves:example.presetWaves
    }, builtinIds), 'docs/examples/enemy-and-wave.json (with built-in enemies)');

    const saveFile = process.env.KR_SAVE_FILE || path.join(root, 'gamestate_save.json');
    const defaultFile = process.env.KR_CATALOG_FILE || path.join(path.dirname(saveFile), 'gamecatalog.json');
    const requestedFiles = process.argv.slice(2);
    const sourceOnly = requestedFiles.length === 1 && requestedFiles[0] === '--source-only';
    if (!sourceOnly && requestedFiles.some(arg => arg.startsWith('--'))) {
        throw new Error('Provide complete catalog paths or the --source-only flag');
    }
    const files = sourceOnly ? [] : requestedFiles.length ? requestedFiles : fs.existsSync(defaultFile) ? [defaultFile] : [];
    for (const file of files) {
        if (!fs.existsSync(file)) throw new Error('Catalog file not found: ' + file);
        // Конструктор только читает; save() здесь не вызывается.
        const { catalog, revision } = createCatalogStore(structuredClone(data), file).read();
        report(catalog, `${file} (revision ${revision})`);
    }
    if (sourceOnly) console.log('Checked built-in definitions and the example only; session catalog skipped.');
    else if (!files.length) console.log('No session catalog found; the server uses built-in definitions.');
} catch (error) {
    console.error('Content validation error: ' + error.message);
    process.exitCode = 1;
}
