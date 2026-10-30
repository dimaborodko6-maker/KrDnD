'use strict';
const fs = require('node:fs');
const ENEMY_TRAITS = require('./public/enemy-traits.js');
const copy = value => JSON.parse(JSON.stringify(value));
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const numberFields = {
    hp:[1,1000000], speed:[1,40], initiative:[0,100], armor:[0,100], magicRes:[0,100],
    reward:[0,1000000], meleeDmg:[1,1000000], rangedDmg:[1,1000000], range:[1,40],
    livesTaken:[1,100], dodgeChance:[0,100], healPower:[1,1000000]
};
const booleanFields = ['isFlying','isRanged','isMiniBoss','aoeCleave'];
function integer(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${label}: an integer from ${min} to ${max}`);
    return value;
}
function text(value, max, label, required = true) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${label}: ${required ? 'non-empty ' : ''}text up to ${max} characters`);
    return value.trim();
}
function validateCatalog(input, builtinIds) {
    if (!isObject(input) || !isObject(input.enemies) || !Array.isArray(input.presetWaves)) throw new Error('An enemy catalog and wave list are required');
    const ids = Object.keys(input.enemies);
    if (ids.length < 1 || ids.length > 100) throw new Error('The catalog must contain 1 to 100 enemy types');
    for (const id of builtinIds) if (!Object.hasOwn(input.enemies,id)) throw new Error('Cannot remove a built-in type: ' + id);
    const enemies = {};
    for (const id of ids) {
        if (!/^[a-z][a-z0-9_]{0,49}$/.test(id) || ['constructor','prototype'].includes(id)) throw new Error('Invalid enemy ID');
        const source = input.enemies[id];
        if (!isObject(source)) throw new Error('Invalid enemy: ' + id);
        const mob = { name:text(source.name,100,'Enemy name'), shortName:text(source.shortName,12,'Short name'),
            description:text(source.description ?? '',2000,'Description',false) };
        if (typeof source.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(source.color)) throw new Error('Color must use #RRGGBB format');
        mob.color = source.color;
        const defaults = { initiative:10, armor:0, magicRes:0, reward:0, meleeDmg:3, rangedDmg:6, range:4, livesTaken:1, dodgeChance:0, healPower:25 };
        for (const [field,[min,max]] of Object.entries(numberFields)) mob[field] = integer(source[field] === undefined ? defaults[field] : source[field],min,max,mob.name + ': ' + field);
        for (const field of booleanFields) {
            if (source[field] !== undefined && typeof source[field] !== 'boolean') throw new Error('Invalid flag: ' + field);
            mob[field] = source[field] ?? false;
        }
        const execute = source.executeThreshold === undefined ? 0 : source.executeThreshold;
        if (!Number.isFinite(execute) || execute < 0 || execute > 1) throw new Error('Execute threshold must be between 0 and 100%');
        mob.executeThreshold = execute;
        mob.traits = ENEMY_TRAITS.normalize(source.traits,id,mob.healPower);
        mob.maxHp = mob.hp; mob.baseSpeed = mob.speed;
        enemies[id] = mob;
    }
    for (const mob of Object.values(enemies)) {
        if (mob.traits.summoning && !Object.hasOwn(enemies,mob.traits.summoning.type)) throw new Error(mob.name + ': summon references an unknown enemy');
    }
    if (!input.presetWaves.length || input.presetWaves.length > 200) throw new Error('The catalog must contain 1 to 200 waves');
    const numbers = new Set();
    const presetWaves = input.presetWaves.map((wave,index) => {
        if (!isObject(wave)) throw new Error('Invalid wave');
        const waveNum = integer(wave.waveNum,1,10000,'Wave number');
        if (numbers.has(waveNum)) throw new Error('Wave numbers must be unique');
        numbers.add(waveNum);
        if (!Array.isArray(wave.enemies) || !wave.enemies.length || wave.enemies.length > 30) throw new Error(`Wave ${index+1}: 1 to 30 groups`);
        let total = 0;
        const groups = wave.enemies.map(group => {
            if (!isObject(group) || typeof group.type !== 'string' || !Object.hasOwn(enemies,group.type)) throw new Error('Wave references an unknown enemy');
            const count = integer(group.count,1,200,'Enemies per group');
            total += count;
            return { type:group.type, count, offsetDelay:integer(group.offsetDelay ?? 0,0,100,'Spawn delay') };
        });
        if (total > 500) throw new Error('No more than 500 enemies per wave');
        return { waveNum, title:text(wave.title,160,'Wave title'), desc:text(wave.desc ?? '',2000,'Wave description',false), enemies:groups };
    });
    return { enemies, presetWaves };
}

function createCatalogStore(gameData, file) {
    const builtinIds = Object.keys(gameData.enemies);
    let revision = 0;
    let catalog = validateCatalog(copy({enemies:gameData.enemies,presetWaves:gameData.presetWaves}),builtinIds);
    function apply() { gameData.enemies = copy(catalog.enemies); gameData.presetWaves = copy(catalog.presetWaves); }
    if (fs.existsSync(file)) {
        const saved = JSON.parse(fs.readFileSync(file,'utf8'));
        if (saved.version !== 1) throw new Error('Unknown catalog version: ' + file);
        revision = integer(saved.revision,0,Number.MAX_SAFE_INTEGER,'Catalog version');
        catalog = validateCatalog(saved.catalog,builtinIds);
    }
    apply();
    return {
        read() { return { revision, catalog:copy(catalog), builtinIds:[...builtinIds] }; },
        save(input, expectedRevision, pendingTypes = []) {
            if (expectedRevision !== revision) throw new Error('The catalog was changed in another window. Load the latest version before saving.');
            const next = validateCatalog(input,builtinIds);
            if (pendingTypes.some(type => !Object.hasOwn(next.enemies,type))) throw new Error('Cannot remove this enemy: it is waiting to spawn or is used by an active summoner');
            const nextRevision = revision + 1;
            const temporary = file + '.tmp';
            try {
                fs.writeFileSync(temporary,JSON.stringify({version:1,revision:nextRevision,catalog:next},null,2),'utf8');
                fs.renameSync(temporary,file);
            } catch (error) {
                try { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); } catch {}
                throw new Error('Could not save the catalog: ' + error.message);
            }
            revision = nextRevision; catalog = next; apply();
            return this.read();
        }
    };
}
module.exports = { createCatalogStore, validateCatalog };
