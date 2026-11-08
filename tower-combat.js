'use strict';

const { towers: towerAbilities, soldiers: soldierAbilities } = require('./tower-abilities');
const EVENT_RULES = require('./public/activated-event-rules');

const PHASES = [
    { min: 16, max: 99, name: 'PHASE 1: HIGH INITIATIVE (>= 16)' },
    { min: 9, max: 15, name: 'PHASE 2: MEDIUM INITIATIVE (9..15)' },
    { min: 0, max: 8, name: 'PHASE 3: LOW INITIATIVE (<= 8)' }
];

const distanceSquared = (x, y, target) => (x - target.x) ** 2 + (y - target.y) ** 2;
const inRange = (x, y, target, range) => range >= 0 && distanceSquared(x, y, target) <= range * range;

// Читаем мир через getState: загрузка и откат могут заменить объект целиком.
module.exports = function createTowerCombat({
    getState, getData, damageEnemy, resolveEnemyDeath, removeDeadEnemies,
    findShortestPath, logAction, logDebug, random = Math.random, now = Date.now,
    setHp = (unit, hp) => { unit.hp = hp; }
}) {
    const action = message => logAction(now(), message);

    function context(state, castleX, castleY) {
        return {
            state, castleX, castleY, random, action, debug: logDebug, inRange, setHp,
            findShortestPath, removeDead: removeDeadEnemies,
            damage(enemy, raw, type = 'pure', armorPiercing = 0) {
                let amount = raw;
                if (type !== 'pure') {
                    const armor = Math.min(100, (enemy.armor || 0) + EVENT_RULES.auraBonus(state, enemy, 'armor'));
                    const resist = type === 'magic' ? (enemy.magicRes || 0) :
                        (armorPiercing ? Math.max(0, armor - armorPiercing) : armor);
                    amount = Math.max(1, Math.round(raw * ((100 - resist) / 100)));
                }
                if (enemy.crownMarkTurns > 0) {
                    amount = Math.round(amount * 1.25);
                }
                damageEnemy(enemy, amount);
                return amount;
            },
            reward(enemy, message, debugMessage) {
                state.gold += enemy.reward;
                action(message);
                if (debugMessage) logDebug('TOWER_KILL', debugMessage);
            },
            remove(enemy) {
                resolveEnemyDeath(enemy);
                state.enemies = state.enemies.filter(other => other.id !== enemy.id);
            },
            closestEnemy(predicate = () => true) {
                let best, bestDistance = Infinity;
                for (const enemy of state.enemies) {
                    if (enemy.hp <= 0 || !predicate(enemy)) continue;
                    const distance = distanceSquared(castleX, castleY, enemy);
                    // Строгое сравнение сохраняет первую цель при равном расстоянии.
                    if (distance < bestDistance) { best = enemy; bestDistance = distance; }
                }
                return best;
            }
        };
    }

function getTowerEffectiveRange(state, x, y, proto) {
    let range = proto.range || 0;
    if (proto.isBarracks) return range;
    if (state && state.grid) {
        const gh = state.gridHeight || state.grid.length;
        const gw = state.gridWidth || state.grid[0].length;
        let falconerFound = false;
        for (let fy = 0; fy < gh && !falconerFound; fy++) {
            for (let fx = 0; fx < gw && !falconerFound; fx++) {
                const fCell = state.grid[fy]?.[fx];
                if (fCell && fCell.type === 'crossbow_4' && (fCell.upgrades || []).includes('crossbow_falconer')) {
                    if (distanceSquared(x, y, { x: fx, y: fy }) <= 16) { // radius 4
                        falconerFound = true;
                    }
                }
            }
        }
        if (falconerFound) range += 1;
        const curCell = state.grid[y]?.[x];
        if (curCell && curCell.type === 'mecha_missile' && (curCell.upgrades || []).includes('mecha_radar')) range += 1;
    }
    return range;
}

    function fireTower(ctx) {
        const { state, cell, proto, x, y, initiative } = ctx;
        const abilities = towerAbilities[cell.type];
        abilities?.beforeAttack?.(ctx);
        // Пассивка могла убить или переместить врага, поэтому ищем цель после неё.
        const effectiveRange = getTowerEffectiveRange(state, x, y, proto);
        ctx.effectiveRange = effectiveRange;
        const target = state.enemies.find(enemy => enemy.hp > 0 &&
            !(proto.noAir && enemy.isFlying) && inRange(x, y, enemy, effectiveRange));
        if (!target) return;

        let baseDamage = proto.damage || 10;
        if (proto.minDamage !== undefined && proto.maxDamage !== undefined) {
            baseDamage = Math.floor(random() * (proto.maxDamage - proto.minDamage + 1)) + proto.minDamage;
        }
        if (cell.damageBuffMultiplier && cell.damageBuffTurns > 0) {
            baseDamage = Math.round(baseDamage * cell.damageBuffMultiplier);
        }
        ctx.shot = { target, impactX: target.x, impactY: target.y, baseDamage, instantKill: false, armorPiercing: 0 };
        abilities?.modifyShot?.(ctx);
        const shot = ctx.shot;
        if (shot.instantKill) {
            setHp(target, 0);
            action(`🎯 SNIPER SHOT: Musketeer at (${x}, ${y}) eliminated with a lethal headshot [${target.name}]!`);
            logDebug('MUSKETEER_SNIPER_KILL', `Musketeer instantly killed [${target.name}] (#${target.id})`);
        } else {
            const damage = ctx.damage(target, shot.baseDamage, proto.dmgType === 'magic' ? 'magic' : 'phys', shot.armorPiercing);
            const typeLabel = proto.dmgType === 'magic' ? 'magic' : 'physical';
            action(`🏹 VOLLEY [Init. ${initiative}]: [${proto.name}] at (${x}, ${y}) hit [${target.name}] for ${damage} ${typeLabel} damage (base: ${shot.baseDamage})!`);
            logDebug('TOWER_SHOT', `[${proto.name}] (Init. ${initiative}) at (${x}, ${y}) -> [${target.name}] (#${target.id}) Damage: ${damage} ${typeLabel} (HP: ${target.hp}/${target.maxHp})`);
        }
        abilities?.afterAttack?.(ctx);
        if (target.hp <= 0) {
            ctx.reward(target,
                `💀 ELIMINATION: [${target.name}] was destroyed by defensive fire! Treasury increased: +${target.reward}💰.`,
                `Enemy [${target.name}] (#${target.id}) killed by tower [${proto.name}] (+${target.reward}💰)`);
            ctx.remove(target);
        }
    }

    function fireRound(castleX, castleY) {
        const state = getState(), definitions = getData().towers;
        const groups = PHASES.map(() => []);
        // Один обход карты; внутри фазы сохраняется порядок строк и столбцов.
        for (let y = 0; y < (state.gridHeight || 16); y++) {
            for (let x = 0; x < (state.gridWidth || 16); x++) {
                const cell = state.grid[y][x], proto = definitions[cell?.type];
                if (!proto || proto.isBarracks) continue;
                const initiative = proto.initiative || 10;
                const phase = PHASES.findIndex(({ min, max }) => initiative >= min && initiative <= max);
                if (phase !== -1) groups[phase].push({ cell, proto, x, y, initiative });
            }
        }
        const shared = context(state, castleX, castleY);
        for (let i = 0; i < PHASES.length; i++) {
            const { min, max, name } = PHASES[i];
            logDebug('INITIATIVE_PHASE', `>>> ENTERING PHASE: ${name} (Initiative: ${min}..${max}) <<<`);
            for (const tower of groups[i]) fireTower({ ...shared, ...tower, upgrades: tower.cell.upgrades || [] });
        }
    }

    function soldierContext(soldier, upgrades) {
        return { ...context(getState()), soldier, upgrades };
    }

    return {
        fireRound,
        beforeSoldierCombat(soldier, upgrades) {
            soldierAbilities[soldier.towerType]?.beforeCombat?.(soldierContext(soldier, upgrades));
        },
        blocksSoldierHit(soldier, upgrades, enemy) {
            return soldierAbilities[soldier.towerType]?.blocksHit?.(soldierContext(soldier, upgrades), enemy) || false;
        },
        onSoldierKill(soldier, upgrades) {
            soldierAbilities[soldier.towerType]?.onKill?.(soldierContext(soldier, upgrades));
        }
    };
};
