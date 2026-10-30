'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function prepareData(env = process.env) {
    const save = env.KR_SAVE_FILE || path.join(root, 'gamestate_save.json');
    const destinations = {
        'gamecatalog.json': env.KR_CATALOG_FILE || path.join(path.dirname(save), 'gamecatalog.json'),
        'scenes.json': env.KR_SCENES_FILE || path.join(path.dirname(save), 'scenes.json')
    };
    fs.mkdirSync(path.dirname(save), { recursive: true });
    for (const [name, destination] of Object.entries(destinations)) {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        try {
            fs.copyFileSync(path.join(root, 'defaults', name), destination, fs.constants.COPYFILE_EXCL);
            console.log('Created starter data: ' + destination);
        } catch (error) {
            if (error.code !== 'EEXIST') throw error;
        }
    }
}
if (require.main === module) {
    if (Number(process.versions.node.split('.')[0]) !== 24) {
        console.error('This release is tested with Node.js 24 LTS. Install Node.js 24 and try again.');
        process.exitCode = 1;
    } else {
        prepareData();
        require('../server.js');
    }
}
module.exports = { prepareData };
