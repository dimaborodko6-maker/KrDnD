'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const assetsDir = path.join(root, 'android', 'app', 'src', 'main', 'assets');
const stagingDir = path.join(root, 'android', '.staging');
const outputZip = path.join(assetsDir, 'nodejs-project.zip');

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const child of fs.readdirSync(src)) {
            copyRecursive(path.join(src, child), path.join(dest, child));
        }
    } else {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

function bundle() {
    console.log('Preparing Android bundle...');
    if (fs.existsSync(stagingDir)) {
        fs.rmSync(stagingDir, { recursive: true, force: true });
    }
    fs.mkdirSync(stagingDir, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });

    // Server source files
    const rootFiles = [
        'server.js',
        'package.json',
        'activated-events.js',
        'balance.js',
        'combat-engine.js',
        'combat-events.js',
        'enemy-traits-engine.js',
        'game-catalog.js',
        'game-logger.js',
        'hero-actions.js',
        'master-controls.js',
        'scene-director.js',
        'scene-library.js',
        'tower-abilities.js',
        'tower-combat.js'
    ];

    for (const file of rootFiles) {
        const srcPath = path.join(root, file);
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, path.join(stagingDir, file));
        }
    }

    // Directories
    copyRecursive(path.join(root, 'public'), path.join(stagingDir, 'public'));
    if (fs.existsSync(path.join(root, 'defaults'))) {
        copyRecursive(path.join(root, 'defaults'), path.join(stagingDir, 'defaults'));
        // Copy starter definitions if not present
        const defaultCatalog = path.join(root, 'defaults', 'gamecatalog.json');
        if (fs.existsSync(defaultCatalog)) {
            fs.copyFileSync(defaultCatalog, path.join(stagingDir, 'gamecatalog.json'));
        }
        const defaultScenes = path.join(root, 'defaults', 'scenes.json');
        if (fs.existsSync(defaultScenes)) {
            fs.copyFileSync(defaultScenes, path.join(stagingDir, 'scenes.json'));
        }
    }

    // node_modules (production)
    const nm = path.join(root, 'node_modules');
    if (fs.existsSync(nm)) {
        console.log('Copying production node_modules...');
        copyRecursive(nm, path.join(stagingDir, 'node_modules'));
    }

    // Create zip
    console.log('Creating zip archive: ' + outputZip);
    if (fs.existsSync(outputZip)) {
        fs.unlinkSync(outputZip);
    }

    execSync(`tar -a -c -f "${outputZip}" -C "${stagingDir}" .`, { stdio: 'inherit' });

    // Cleanup staging
    fs.rmSync(stagingDir, { recursive: true, force: true });
    console.log('✅ Android bundle created successfully: ' + outputZip);
}

if (require.main === module) {
    bundle();
}

module.exports = { bundle };
