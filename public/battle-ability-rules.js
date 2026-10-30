'use strict';

// Геометрия применения общая для сервера и личного предпросмотра игрока.
const BATTLE_ABILITY_RULES = (() => {
    const disengage = { key: 'disengage', name: 'Disengage', cooldown: 0, desc: 'Use your action to move without provoking retreat attacks for the rest of this round. Costs no mana; movement is still required.' };
    const centeredAttacks = ['slash', 'shatter', 'earthquake', 'blades', 'ground_tremor'];
    const selfBuffs = ['shield_wall', 'retribution', 'unbreakable', 'connor_retribution'];
    const targetAreas = ['mortar', 'glitter', 'hammer', 'tag'];
    function definition(ability, heroKey, player = {}) {
        const key = (ability || '').replace('spell_', '');
        const rule = (selection, shape, radius = 0, tone = 'attack', metric = 'chebyshev') => ({ selection, shape, radius, tone, metric });
        if (!ability) return rule('none', 'none');
        if (ability === 'disengage') return rule('none', 'self', 0, 'support');
        if (centeredAttacks.includes(key) || (ability === 'ultimate' && heroKey === 'malik')) return rule('none', 'aoe_around_player', 1);
        if (key === 'nanite_cloud') return rule('none', 'nanites', 2, 'heal', 'euclidean');
        if (key === 'inspire') return rule('none', 'all_allies', Infinity, 'support');
        if (selfBuffs.includes(key) || (ability === 'ultimate' && heroKey === 'connor')) return rule('none', 'self', key === 'unbreakable' ? 3 : 0, 'support');
        if (ability === 'ultimate' && heroKey === 'torghar') return rule('none', 'taunt', 2, 'mixed');
        if (key === 'blink') return rule('cell', 'blink', 0, 'support');
        if (key === 'mines') return rule('cell', 'mine');
        if (key === 'ambulance_rush') return rule('unit', 'rush', 0, 'heal');
        if (ability === 'ultimate' && heroKey === 'ratchet') return rule('unit', 'reboot', 0, 'heal');
        if (targetAreas.includes(key) || (ability === 'ultimate' && ['zefira', 'bolin', 'illiana'].includes(heroKey))) return rule('unit', 'aoe_around_target', 1);
        if (ability === 'attack' && (player.skills || []).includes('joehammer')) return rule('unit', 'cell');
        return rule('unit', 'single', 0, key === 'surgical_laser' ? 'mixed' : 'attack');
    }

    function contains(area, point) {
        const dx = point.x - area.x, dy = point.y - area.y;
        return (area.metric === 'euclidean' ? Math.hypot(dx, dy) : Math.max(Math.abs(dx), Math.abs(dy))) <= area.radius + 0.05;
    }

    function application(state, playerId, ability, targetId = '') {
        const me = state?.players?.[playerId];
        const spec = definition(ability, me?.heroKey, me);
        const effects = [], areas = [];
        const result = { ...spec, effects, areas };
        if (!me || me.hp <= 0 || !ability) return result;
        const key = ability.replace('spell_', '');
        const enemies = (state.enemies || []).filter(unit => unit.hp > 0);
        const players = Object.entries(state.players || {}).map(([id, unit]) => ({ kind: 'player', id, unit }));
        const soldiers = (state.soldiers || []).filter(unit => unit.hp > 0 && unit.respawnTimer === 0).map(unit => ({ kind: 'soldier', id: String(unit.id), unit }));
        const allies = [...players.filter(({ unit }) => unit.hp > 0), ...soldiers];
        const add = (kind, id, unit, tone) => {
            if (unit && !effects.some(effect => effect.kind === kind && effect.id === String(id) && effect.tone === tone))
                effects.push({ kind, id: String(id), x: unit.x, y: unit.y, tone });
        };
        const self = tone => add('player', playerId, me, tone);
        const area = (center, radius, tone = spec.tone, metric = spec.metric) => {
            const zone = { x: center.x, y: center.y, radius, metric, tone };
            areas.push(zone); return zone;
        };
        const attackArea = zone => enemies.filter(unit => contains(zone, unit)).forEach(unit => add('enemy', unit.id, unit, 'attack'));
        if (spec.shape === 'aoe_around_player') {
            attackArea(area(me, spec.radius));
            if (key === 'blades' && playerHasNormalDamage(me)) self('support');
            return result;
        }
        if (spec.shape === 'nanites' || spec.shape === 'all_allies') {
            const zone = area(me, spec.radius);
            (spec.shape === 'all_allies' ? players.filter(({ unit }) => unit.hp > 0) : allies).filter(({ unit }) => contains(zone, unit))
                .forEach(({ kind, id, unit }) => add(kind, id, unit, spec.tone));
            return result;
        }
        if (spec.shape === 'self' || spec.shape === 'taunt') {
            const zone = area(me, spec.radius);
            self('support');
            if (spec.shape === 'taunt') attackArea(zone);
            return result;
        }
        const id = String(targetId);
        const ally = id.startsWith('self_') ? { kind: 'player', id: playerId, unit: me } :
            id.startsWith('player_') ? players.find(entry => entry.id === id.slice(7)) :
            id.startsWith('soldier_') ? soldiers.find(entry => entry.id === id.slice(8)) : null;
        const enemy = enemies.find(unit => String(unit.id) === id);
        const match = /^cell_(\d+)_(\d+)$/.exec(id);
        const cell = match && state.grid?.[Number(match[2])]?.[Number(match[1])];
        if (spec.selection === 'cell') {
            if (!cell) return result;
            const zone = area(cell, 0, spec.shape === 'mine' ? 'attack' : 'support');
            if (spec.shape === 'mine') enemies.filter(unit => !unit.isFlying && contains(zone, unit)).forEach(unit => add('enemy', unit.id, unit, 'attack'));
            else self('support');
            return result;
        }
        if (ally) {
            add(ally.kind, ally.id, ally.unit, spec.tone === 'mixed' ? 'heal' : spec.tone);
            area(ally.unit, 0, 'heal');
            if (spec.shape === 'reboot' && !(ally.unit.deathTimer > 0)) self('heal');
            if (spec.shape === 'rush') {
                self('support');
                const length = Math.hypot(me.x - ally.unit.x, me.y - ally.unit.y);
                enemies.filter(unit => length > 0 && Math.hypot(unit.x - me.x, unit.y - me.y) +
                    Math.hypot(unit.x - ally.unit.x, unit.y - ally.unit.y) <= length + 0.8)
                    .forEach(unit => { add('enemy', unit.id, unit, 'attack'); area(unit, 0, 'attack'); });
            }
            return result;
        }
        if (!enemy) return result;
        const explosive = ability === 'attack' && me.heroKey === 'bolin' && (me.skills || []).includes('explosive') &&
            Math.hypot(me.x - enemy.x, me.y - enemy.y) > 1.05 && ((me.bolinShotCount || 0) + 1) % 5 === 0;
        if (spec.shape === 'aoe_around_target' || (spec.shape !== 'cell' && explosive)) attackArea(area(enemy, 1, 'attack'));
        else if (spec.shape === 'cell') attackArea(area(enemy, 0, 'attack'));
        else { add('enemy', enemy.id, enemy, 'attack'); area(enemy, 0, 'attack'); }
        return result;
    }
    function playerHasNormalDamage(player) { return player.godDamageOverride === undefined || player.godDamageOverride === null; }
function rangeInfo(abilityKey, heroObj) {
    if (!heroObj || !abilityKey) return null;
    let hKey = heroObj.heroKey || 'gerald';
    let isRangedHero = ['zefira', 'bolin', 'illiana', 'ratchet'].includes(hKey);
    const spec = definition(abilityKey, hKey, heroObj);
    if (spec.selection === 'none') return { range: spec.radius, metric: spec.metric };

    if (abilityKey === 'attack') {
        return {
            range: heroObj.range || (hKey === 'ratchet' ? 3 : (isRangedHero ? 4 : 1)),
            metric: isRangedHero ? 'euclidean' : 'chebyshev'
        };
    }
    if (abilityKey === 'ultimate') {
        if (hKey === 'torghar') {
            return { range: 2, metric: 'chebyshev' };
        }
        if (hKey === 'ratchet') {
            return { range: Infinity, metric: 'euclidean' };
        }
        return {
            range: Math.max(heroObj.range || 1, isRangedHero ? 4 : 1),
            metric: 'chebyshev'
        };
    }

    let cleanKey = abilityKey.startsWith('spell_') ? abilityKey.substring(6) : abilityKey;
    const euclideanSkills = ['hammer', 'mortar', 'tag', 'glitter', 'prey', 'surgical_laser', 'nanite_cloud', 'ambulance_rush'];
    const skillRanges = {
        'hammer': 4,
        'blades': 1,
        'blink': 4,
        'unbreakable': 1,
        'earthquake': 2,
        'obliterate': 1,
        'mortar': 5,
        'mines': 1,
        'slash': 1,
        'connor_retribution': 1,
        'shatter': 2,
        'tag': 4,
        'glitter': 4,
        'prey': 4,
        'inspire': 2,
        'retribution': 2,
        // Torghar
        'shield_wall': 1,
        'shield_slam': 1,
        'ground_tremor': 1,
        // Ratchet
        'surgical_laser': 3,
        'nanite_cloud': 2,
        'ambulance_rush': 4
    };

    let metric = euclideanSkills.includes(cleanKey) ? 'euclidean' : 'chebyshev';
    const fixedRange = ['blink', 'mines', 'surgical_laser', 'nanite_cloud', 'ambulance_rush'].includes(cleanKey);
    let range = fixedRange ? skillRanges[cleanKey] : Math.max(skillRanges[cleanKey] || 1, heroObj.range || 1);
    return { range, metric };
}

function manaCost(ability) {
    if (!ability) return 0;
    const key = ability.replace('spell_', '');
    if (ability === 'attack' || ability === 'ultimate' || ability === 'disengage') return 0;
    if (key === 'blink') return 3;
    if (['blades', 'unbreakable', 'mines', 'tag', 'prey', 'shield_slam'].includes(key)) return 4;
    if (['retribution', 'earthquake', 'connor_retribution', 'nanite_cloud'].includes(key)) return 6;
    return 5;
}

function availableTargets(state, playerId, abilityKey, heroKey = state?.players?.[playerId]?.heroKey || 'gerald') {
    const me = state?.players?.[playerId];
    if (!abilityKey || !me || me.hp <= 0) return [];
    const key = abilityKey.replace('spell_', '');
    const hKey = heroKey;
    const info = rangeInfo(abilityKey, { ...me, heroKey: hKey });
    const inRange = unit => (info.metric === 'euclidean'
        ? Math.hypot(me.x - unit.x, me.y - unit.y)
        : Math.max(Math.abs(me.x - unit.x), Math.abs(me.y - unit.y))) <= info.range + 0.05;
    const unitTarget = (id, unit, name, kind) => ({ id: String(id), x: unit.x, y: unit.y, name, kind,
        detail: '(' + unit.x + ', ' + unit.y + ') · HP ' + unit.hp + (unit.maxHp ? '/' + unit.maxHp : '') });
    if (definition(abilityKey, hKey, me).selection === 'none') return [];
    if (key === 'blink' || key === 'mines') {
        const targets = [];
        for (const row of state.grid) for (const cell of row) {
            const legal = (key === 'blink' ? ['empty', 'road', 'spawn', 'castle'] : ['road', 'spawn', 'castle']).includes(cell.type);
            if (legal && inRange(cell)) targets.push({ id: 'cell_' + cell.x + '_' + cell.y, x: cell.x, y: cell.y,
                name: 'Cell (' + cell.x + ', ' + cell.y + ')', detail: key === 'blink' ? 'Teleport' : 'Place mine', kind: 'cell' });
        }
        return targets;
    }
    const targets = [];
    const reboot = abilityKey === 'ultimate' && hKey === 'ratchet';
    if (hKey === 'ratchet' && (['surgical_laser', 'ambulance_rush'].includes(key) || reboot)) {
        for (const [name, ally] of Object.entries(state.players)) {
            if ((reboot || ally.hp > 0) && inRange(ally)) targets.push(unitTarget(name === playerId ? 'self_' + name : 'player_' + name,
                ally, (ally.hp <= 0 ? '🪦 ' : '👤 ') + (ally.heroName || name) + ' · ' + name, 'ally'));
        }
        if (!reboot) for (const soldier of state.soldiers || []) {
            if (soldier.hp > 0 && soldier.respawnTimer === 0 && inRange(soldier)) {
                targets.push(unitTarget('soldier_' + soldier.id, soldier, soldier.isGolem ? 'Golem' : 'Soldier', 'ally'));
            }
        }
    }
    if (!reboot && key !== 'ambulance_rush') for (const enemy of state.enemies || []) {
        const blocked = (me.blockedEneplayerIds || []).includes(enemy.id) && Math.max(Math.abs(me.x - enemy.x), Math.abs(me.y - enemy.y)) <= 1;
        if (enemy.hp > 0 && (inRange(enemy) || blocked)) targets.push(unitTarget(enemy.id, enemy, enemy.name, 'enemy'));
    }
    return targets;
}

    return { disengage, definition, application, contains, rangeInfo, manaCost, availableTargets };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = BATTLE_ABILITY_RULES;
else window.BATTLE_ABILITY_RULES = BATTLE_ABILITY_RULES;
