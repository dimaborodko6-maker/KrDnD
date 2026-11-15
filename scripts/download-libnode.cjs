'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const libnodeDir = path.join(root, 'android', 'app', 'libnode');
const zipFile = path.join(root, 'android', 'app', 'libnode.zip');
const downloadUrl = 'https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip';

function downloadFile(url, dest, cb) {
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return downloadFile(res.headers.location, dest, cb);
        }
        if (res.statusCode !== 200) {
            return cb(new Error('HTTP status ' + res.statusCode));
        }
        res.pipe(file);
        file.on('finish', () => file.close(cb));
    }).on('error', (err) => {
        fs.unlink(dest, () => {});
        cb(err);
    });
}

function ensureLibnode(callback) {
    const checkHeader = path.join(libnodeDir, 'include', 'node', 'node.h');
    if (fs.existsSync(checkHeader)) {
        console.log('libnode is already downloaded.');
        if (callback) callback();
        return;
    }

    console.log('Downloading libnode prebuilt Android binaries from ' + downloadUrl + '...');
    fs.mkdirSync(libnodeDir, { recursive: true });

    downloadFile(downloadUrl, zipFile, (err) => {
        if (err) {
            console.error('Failed to download libnode:', err.message);
            process.exit(1);
        }
        console.log('Extracting libnode...');
        try {
            execSync(`tar -xf "${zipFile}" -C "${libnodeDir}"`, { stdio: 'inherit' });
            if (fs.existsSync(zipFile)) fs.unlinkSync(zipFile);
            console.log('✅ libnode extracted successfully to ' + libnodeDir);
            if (callback) callback();
        } catch (extractErr) {
            console.error('Extraction error:', extractErr.message);
            process.exit(1);
        }
    });
}

if (require.main === module) {
    ensureLibnode();
}

module.exports = { ensureLibnode };
