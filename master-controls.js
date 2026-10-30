'use strict';

// Все изменения выполняются над актуальным миром; проверка группы предшествует записи.
const labels = {
    MASTER_CLEAR_ENEMIES: 'Clear enemies', MASTER_MANAGE_ENEMIES: 'Edit enemies',
    MASTER_RESTORE_HEROES: 'Restore heroes', MASTER_CANCEL_SPAWNS: 'Cancel reinforcements'
};
const negativeFields = ['bleedTurns', 'poisonTurns', 'paralysisTurns', 'paralyzeTurns', 'stunTurns', 'slowTurns'];
function cleanse(unit) {
    delete unit.frostSlowUntilRound;
    negativeFields.forEach(field => { if (field in unit) unit[field] = 0; });
    if (unit.isPolymorphed || unit.polymorphTurns > 0) {
        unit.isPolymorphed = false; unit.polymorphTurns = 0;
        if (unit.oldArmor !== undefined) unit.armor = unit.oldArmor;
    }
}
function execute(state, msg, { data, refreshBlocks }) {
    const fail = text => { throw new Error(text); };
    const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
    const removeLinks = () => {
        const ids = new Set(state.enemies.map(e => e.id));
        [...Object.values(state.players), ...(state.soldiers || [])].forEach(unit => {
            unit.blockedEnemyIds = (unit.blockedEnemyIds || []).filter(id => ids.has(id));
        });
        Object.values(state.players).forEach(refreshBlocks);
    };
    if (msg.type === 'MASTER_CLEAR_ENEMIES') {
        if (typeof msg.includePending !== 'boolean') fail('Specify whether to cancel reinforcements');
        const count = state.enemies.length;
        state.enemies = [];
        const pending = msg.includePending ? (state.pendingSpawns || []).length : 0;
        if (msg.includePending) state.pendingSpawns = [];
        removeLinks();
        return `Enemies removed: ${count}; reinforcements canceled: ${pending}. No rewards or death effects.`;
    }
    if (msg.type === 'MASTER_CANCEL_SPAWNS') {
        if (msg.all !== true && (typeof msg.group !== 'string' || !state.pendingSpawns.some(e => spawnKey(e) === msg.group))) fail('This reinforcement group is no longer available');
        const before = state.pendingSpawns.length;
        state.pendingSpawns = msg.all === true ? [] : state.pendingSpawns.filter(e => spawnKey(e) !== msg.group);
        return `Reinforcements canceled: ${before - state.pendingSpawns.length}.`;
    }
    if (msg.type === 'MASTER_RESTORE_HEROES') {
        const names = msg.playerNames;
        if (!Array.isArray(names) || !names.length || names.length > 100 || new Set(names).size !== names.length || names.some(name => typeof name !== 'string' || !Object.hasOwn(state.players, name))) fail('Select existing heroes');
        const options = msg.options;
        const allowed = ['hp', 'mana', 'revive', 'cleanse', 'cooldowns', 'action', 'movement', 'waveUses'];
        if (!options || typeof options !== 'object' || Array.isArray(options) || !Object.keys(options).length || Object.entries(options).some(([key, value]) => !allowed.includes(key) || typeof value !== 'boolean')) fail('Invalid restoration parameters');
        if (msg.ability !== undefined && (options.cooldowns !== true || names.some(name => {
            const hero = state.players[name];
            return msg.ability !== 'ultimate' && !(data.heroes[hero.heroKey]?.skills || []).some(skill => 'spell_' + skill.id === msg.ability && skill.cooldown > 0 && hero.skills.includes(skill.id));
        }))) fail('This ability is not available to the hero');
        names.forEach(name => {
            const hero = state.players[name];
            const dead = hero.hp <= 0 || hero.deathTimer > 0;
            if (options.revive && dead) { hero.hp = hero.maxHp; hero.deathTimer = 0; }
            if (options.hp && (!dead || options.revive)) hero.hp = hero.maxHp;
            if (options.mana) hero.mana = hero.maxMana;
            if (options.cleanse) cleanse(hero);
            if (options.cooldowns) {
                if (msg.ability) { hero.cooldowns ||= {}; hero.cooldowns[msg.ability] = 0; }
                else hero.cooldowns = {};
            }
            if (options.action) { hero.hasAttackedThisRound = false; hero.isReady = false; }
            if (options.movement) { hero.hasMovedThisRound = false; hero.isReady = false; }
            if (options.waveUses) {
                hero.fatedUsedThisWave = false;
                hero.bolinShotCount = 0;
                if (hero.grailConsumed) { if (!hero.skills.includes('grail')) hero.skills.push('grail'); hero.grailConsumed = false; }
            }
            refreshBlocks(hero);
        });
        const fields = { hp:'health', mana:'mana', revive:'revival', cleanse:'remove negative effects', cooldowns:'cooldowns', action:'action', movement:'movement', waveUses:'once-per-session abilities' };
        const abilityName = msg.ability && (msg.ability === 'ultimate' ? 'ultimate' : data.heroes[state.players[names[0]].heroKey].skills.find(skill => 'spell_' + skill.id === msg.ability)?.name);
        return `Restored: ${names.map(name => state.players[name].heroName).join(', ')}. ${Object.keys(options).filter(key => options[key]).map(key => fields[key]).join(', ')}${abilityName ? ' · ' + abilityName : ''}.`;
    }
    if (msg.type === 'MASTER_MANAGE_ENEMIES') {
        if (!Array.isArray(msg.ids) || !msg.ids.length || msg.ids.length > 5000 || new Set(msg.ids).size !== msg.ids.length || msg.ids.some(id => !Number.isSafeInteger(id))) fail('Select enemies');
        const ids = new Set(msg.ids), units = state.enemies.filter(e => ids.has(e.id));
        if (units.length !== ids.size) fail('Some selected enemies are no longer present. Update your selection.');
        if (!['remove', 'heal', 'hp', 'move', 'cleanse', 'effect'].includes(msg.action)) fail('Unknown action');
        if (msg.action === 'hp' && (!integer(msg.hp, 1, 1000000) || units.some(e => msg.hp > e.maxHp))) fail('HP must be between 1 and each enemy\'s maximum; use the separate command to remove enemies');
        if (msg.action === 'move' && (!integer(msg.x, 0, state.gridWidth - 1) || !integer(msg.y, 0, state.gridHeight - 1))) fail('Cell is outside the map');
        if (msg.action === 'move' && units.some(unit => unit.eventStructure)) fail('Event structures cannot be relocated');
        const effects = { stun: ['stunTurns'], slow: ['slowTurns'], bleed: ['bleedTurns', 'bleedDmg'], poison: ['poisonTurns', 'poisonDmg'] };
        if (msg.action === 'effect' && (!Object.hasOwn(effects, msg.effect) || !integer(msg.turns, 0, 100) || !integer(msg.power, 1, 1000000))) fail('Invalid effect');
        if (msg.action === 'remove') state.enemies = state.enemies.filter(e => !ids.has(e.id));
        else units.forEach(unit => {
            if (msg.action === 'heal') unit.hp = unit.maxHp;
            if (msg.action === 'hp') unit.hp = msg.hp;
            if (msg.action === 'move') { unit.x = msg.x; unit.y = msg.y; }
            if (msg.action === 'cleanse') cleanse(unit);
            if (msg.action === 'effect') {
                const [timer, power] = effects[msg.effect];
                unit[timer] = msg.turns;
                if (power) unit[power] = msg.power;
            }
        });
        if (['remove', 'move'].includes(msg.action)) {
            // Перенесённые враги покидают прежние схватки, включая блокировки гарнизонов.
            if (msg.action === 'move') [...Object.values(state.players), ...(state.soldiers || [])].forEach(unit => {
                unit.blockedEnemyIds = (unit.blockedEnemyIds || []).filter(id => !ids.has(id));
            });
            removeLinks();
        }
        const actionName = { remove:'remove without reward', heal:'healing', hp:'change HP', move:'relocation', cleanse:'remove negative effects', effect:'effect' };
        const effectName = { stun:'stun', slow:'slow', bleed:'bleeding', poison:'poison' };
        return `Enemies: ${units.length}; ${actionName[msg.action]}${msg.action === 'effect' ? ' · ' + effectName[msg.effect] + ' · turns: ' + msg.turns : ''}.`;
    }
    fail('Unknown management command');
}
function spawnKey(entry) { return JSON.stringify([entry.type, entry.round, entry.x, entry.y]); }
module.exports = { labels, execute, spawnKey };
