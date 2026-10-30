'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let count = 0;
function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', 'logs', 'backups', '.git'].includes(entry.name)) continue;
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(file);
        else if (/\.(js|cjs)$/.test(file)) {
            new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
            count++;
        } else if (/\.html$/.test(file)) {
            const html = fs.readFileSync(file, 'utf8');
            for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
                if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
                new vm.Script(match[2], { filename: file + ':inline' });
                count++;
            }
        }
    }
}
try { scan(root); console.log('Syntax OK: ' + count + ' scripts, including inline HTML scripts.'); }
catch (error) { console.error(error); process.exitCode = 1; }
