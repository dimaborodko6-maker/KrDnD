'use strict';

// Хуки вызываются в фиксированном порядке: beforeAttack -> modifyShot -> afterAttack.
// Чистый урон выбран явно: он сохраняет прежний обход брони/сопротивления у пассивок.
function teslaField(ctx) {
    const { state, upgrades, x, y, action, debug } = ctx;
    if (!upgrades.includes('tesla_field')) return;
    const targets = state.enemies.filter(en => en.hp > 0 && Math.max(Math.abs(x - en.x), Math.abs(y - en.y)) <= 1);
    for (const en of targets) {
        ctx.damage(en, 15);
        action(`🌩️ STORM FIELD: Tesla aura at (${x}, ${y}) hit [${en.name}] for 15 magic damage!`);
        debug('TESLA_FIELD', `Tesla aura struck [${en.name}] (#${en.id}) at (${en.x}, ${en.y}) [HP: ${en.hp}]`);
        if (en.hp <= 0) ctx.reward(en, `💀 STORM FIELD: [${en.name}] was incinerated by electricity! Treasury +${en.reward}💰.`);
    }
    ctx.removeDead();
}

function arcanePassives(ctx) {
    const { state, cell, proto, upgrades, x, y, action, debug } = ctx;
    if (upgrades.includes('arcane_death') && state.roundCounter - (cell.lastArcaneDeathRound || -999) >= 5) {
        const target = state.enemies.find(en => en.hp > 0 && !en.eventStructure && ctx.inRange(x, y, en, proto.range));
        if (target) {
            cell.lastArcaneDeathRound = state.roundCounter;
            const killDebug = `Enemy [${target.name}] (#${target.id}) killed by tower [${proto.name}] (+${target.reward}💰)`;
            if (target.isBoss || target.isMiniBoss) {
                ctx.damage(target, 150);
                action(`🛡️ BOSS RESISTANCE: [${target.name}] resisted Arcane Verdict, taking 150 true damage!`);
                debug('BOSS_RESIST', `[${target.name}] (#${target.id}) resisted Archmage annihilation -> 150 damage [HP: ${target.hp}/${target.maxHp}]`);
                if (target.hp <= 0) {
                    ctx.reward(target, `💀 [${target.name}] fell to the Archmage's power! Treasury +${target.reward}💰.`, killDebug);
                    ctx.removeDead();
                }
            } else if ((target.maxHp || 40) <= 200) {
                ctx.setHp(target, 0);
                state.gold += target.reward;
                action(`💀 ARCANE VERDICT: Archmage at (${x}, ${y}) erased [${target.name}] from existence! Treasury +${target.reward}💰.`);
                debug('ARCANE_DEATH', `Archmage annihilated [${target.name}] (#${target.id}) (Cooldown until round #${state.roundCounter + 5})`);
                debug('TOWER_KILL', killDebug);
                ctx.removeDead();
            }
        }
    }
    if (upgrades.includes('arcane_teleport') && state.roundCounter - (cell.lastTeleportRound || -999) >= 5) {
        const target = ctx.closestEnemy(en => !en.eventStructure && ctx.inRange(x, y, en, proto.range));
        if (target) {
            const path = ctx.findShortestPath(target.x, target.y, 'spawn');
            if (path && path.length > 1) {
                const stepBack = path[Math.min(2, path.length - 1)];
                const oldX = target.x, oldY = target.y;
                target.x = stepBack.x; target.y = stepBack.y;
                cell.lastTeleportRound = state.roundCounter;
                action(`🌀 DESTABILIZATION: Archmage at (${x}, ${y}) warped space and knocked [${target.name}] from (${oldX}, ${oldY}) back to (${target.x}, ${target.y})!`);
                debug('ARCANE_TELEPORT', `[${target.name}] (#${target.id}) teleported back from (${oldX}, ${oldY}) at (${target.x}, ${target.y}) (Cooldown until round #${state.roundCounter + 5})`);
            }
        }
    }
}

function berthaMissiles(ctx) {
    const { state, upgrades, x, y, action, debug } = ctx;
    if (!upgrades.includes('bertha_missiles') || state.roundCounter % 2 !== 0) return;
    const target = ctx.closestEnemy();
    if (!target) return;
    const damage = ctx.damage(target, 50);
    action(`🚀 BERTHA MISSILE: A homing missile from (${x}, ${y}) struck vanguard [${target.name}] for ${damage} explosive damage!`);
    debug('BERTHA_MISSILE', `Bertha's missile hit [${target.name}] (#${target.id}) for ${damage} damage [HP: ${target.hp}]`);
    if (target.hp <= 0) {
        ctx.reward(target, `💀 [${target.name}] was destroyed by Bertha's missile! Treasury +${target.reward}💰.`,
            `Enemy [${target.name}] (#${target.id}) killed by Bertha's missile (+${target.reward}💰)`);
        ctx.remove(target);
    }
}

function musketeerShot(ctx) {
    const { state, cell, shot, upgrades, random, action, debug } = ctx;
    const target = shot.target;
    if (!target.eventStructure && upgrades.includes('musketeer_sniper') && state.roundCounter - (cell.lastSniperRound || -999) >= 3 && random() < 0.35) {
        cell.lastSniperRound = state.roundCounter;
        if (target.isBoss || target.isMiniBoss) {
            shot.baseDamage = 150;
            action(`🛡️ BOSS RESISTANCE: [${target.name}] survived the sniper shot, taking a fixed 150 damage!`);
            debug('BOSS_RESIST', `[${target.name}] (#${target.id}) resisted sniper instant kill -> 150 damage`);
        } else if ((target.maxHp || 40) <= 150) shot.instantKill = true;
        else shot.baseDamage *= 3;
    }
    if (upgrades.includes('musketeer_shrapnel')) shot.armorPiercing = 35;
}

function splash(ctx, shrapnel = false) {
    const { state, proto, shot, action, debug } = ctx;
    const raw = Math.round(shot.baseDamage * (shrapnel ? 0.3 : 0.5));
    const targets = state.enemies.filter(en => en.id !== shot.target.id && en.hp > 0 &&
        Math.max(Math.abs(en.x - shot.impactX), Math.abs(en.y - shot.impactY)) <= 1);
    for (const other of targets) {
        const oldHp = other.hp, damage = ctx.damage(other, raw, 'phys');
        if (shrapnel) {
            action(`💥 EXPLOSIVE ROUNDS: Musket shrapnel struck [${other.name}] for ${damage} physical damage!`);
            debug('MUSKETEER_SHRAPNEL_SPLASH', `Shrapnel hit [${other.name}] (#${other.id}) at (${other.x}, ${other.y}) for ${damage} damage (HP: ${oldHp} -> ${other.hp})`);
        } else {
            action(`💥 FRAGMENT BURST: A volley from [${proto.name}] hit [${other.name}] for ${damage} physical damage!`);
            debug('ARTILLERY_SPLASH', `Fragments hit [${other.name}] (#${other.id}) at (${other.x}, ${other.y}) for ${damage} damage (HP: ${oldHp} -> ${other.hp})`);
        }
        if (other.hp <= 0) ctx.reward(other,
            shrapnel ? `💀 [${other.name}] fell to musket shrapnel! Treasury +${other.reward}💰.` :
                `💀 [${other.name}] was torn apart by shell fragments! Treasury +${other.reward}💰.`,
            shrapnel ? `Enemy [${other.name}] (#${other.id}) killed by Musketeer shrapnel (+${other.reward}💰)` :
                `Enemy [${other.name}] (#${other.id}) killed by fragments from tower [${proto.name}] (+${other.reward}💰)`);
    }
    ctx.removeDead();
}

function rangerEffects(ctx) {
    const { state, upgrades, shot: { target }, action, debug } = ctx;
    if (target.hp <= 0) return;
    if (upgrades.includes('ranger_poison')) {
        target.poisonTurns = 2; target.poisonDmg = 6;
        action(`🌿 POISON: Ranger poisoned [${target.name}] with toxic arrows (DoT: 6 for 2 turns)!`);
        debug('RANGER_POISON', `[${target.name}] (#${target.id}) poisoned (2 turns of 6 DoT)`);
    }
    if (upgrades.includes('ranger_roots') && state.roundCounter % 3 === 0) {
        target.stunTurns = Math.max(target.stunTurns || 0, 1);
        action(`⚡ ROOTS: Ranger entangled [${target.name}], stunning for 1 turn!`);
        debug('RANGER_ROOTS', `[${target.name}] (#${target.id}) stunned by roots for 1 turn`);
    }
}

function polymorph(ctx) {
    const { upgrades, shot: { target }, random, action, debug } = ctx;
    if (!upgrades.includes('sorcerer_polymorph') || target.hp <= 0 || target.eventStructure) return;
    if (target.isBoss || target.isMiniBoss) debug('BOSS_RESIST', `[${target.name}] (#${target.id}) is immune to Polymorph`);
    else if (random() < 0.30 && !target.polymorphTurns) {
        target.isPolymorphed = true; target.polymorphTurns = 2;
        target.oldArmor = target.armor !== undefined ? target.armor : 0; target.armor = 0;
        ctx.setHp(target, Math.max(1, Math.round(target.hp * 0.6)));
        target.maxHp = Math.max(1, Math.round(target.maxHp * 0.6));
        action(`🐑 POLYMORPH: Sorcerer at (${ctx.x}, ${ctx.y}) transformed [${target.name}] into a SHEEP for 2 rounds! (-40% HP, 0 armor, attacks disabled)`);
        debug('POLYMORPH', `Enemy [${target.name}] (#${target.id}) transformed into a SHEEP for 2 rounds! HP: ${target.hp}, armor: 0, attacks disabled.`);
    }
}

function berthaAfterAttack(ctx) {
    splash(ctx);
    if (!ctx.upgrades.includes('bertha_napalm')) return;
    const { state, shot: { target }, action, debug } = ctx;
    if (!state.napalmPuddles) state.napalmPuddles = [];
    state.napalmPuddles.push({ x: target.x, y: target.y, turns: 2, dmg: 10 });
    action(`🔥 NAPALM: Bertha's shell ignited a napalm pool at cell (${target.x}, ${target.y})!`);
    debug('BERTHA_NAPALM_SPAWN', `Napalm pool created at (${target.x}, ${target.y}) for 2 rounds`);
}

function teslaChain(ctx) {
    const { state, upgrades, shot: { target }, random, action, debug } = ctx;
    const overcharge = upgrades.includes('tesla_overcharge'), limit = overcharge ? 4 : 2;
    const targets = [];
    // Сохраняем снимок целей до урона, но прекращаем поиск после достижения лимита.
    for (const enemy of state.enemies) {
        if (enemy.id !== target.id && enemy.hp > 0 && ctx.inRange(target.x, target.y, enemy, 2)) {
            targets.push(enemy);
            if (targets.length === limit) break;
        }
    }
    for (const enemy of targets) {
        const damage = ctx.damage(enemy, overcharge ? 30 : 20);
        const stunned = overcharge && random() < 0.30;
        if (stunned) enemy.stunTurns = Math.max(enemy.stunTurns || 0, 1);
        action(`⚡ CHAIN LIGHTNING: Tesla's discharge jumped to [${enemy.name}], dealing ${damage} magic damage${stunned ? ' and stunning!' : '!'}`);
        debug('TESLA_CHAIN', `Tesla's chain lightning hit [${enemy.name}] (#${enemy.id}) for ${damage} damage${stunned ? ' [STUN]' : ''} [HP: ${enemy.hp}/${enemy.maxHp}]`);
        if (enemy.hp <= 0) ctx.reward(enemy,
            `💀 [${enemy.name}] was destroyed by chain lightning! Treasury +${enemy.reward}💰.`,
            `Enemy [${enemy.name}] (#${enemy.id}) killed by Tesla's chain lightning (+${enemy.reward}💰)`);
    }
    ctx.removeDead();
}

function paladinGrace({ state, soldier, upgrades, action, debug, setHp }) {
    if (upgrades.includes('paladin_grace') && soldier.hp > 0 && soldier.hp < soldier.maxHp * 0.5 && state.roundCounter % 3 === 0) {
        const heal = Math.round(soldier.maxHp * 0.5);
        setHp(soldier, Math.min(soldier.maxHp, soldier.hp + heal));
        action(`✨ DIVINE GRACE: Paladin called upon the Light and healed for +${heal} HP (${soldier.hp}/${soldier.maxHp})!`);
        debug('PALADIN_GRACE', `Paladin (#${soldier.id}) healed for ${heal} HP [HP: ${soldier.hp}/${soldier.maxHp}]`);
    }
}

function paladinShield({ soldier, upgrades, random, action, debug }, enemy) {
    if (!upgrades.includes('paladin_shield') || random() >= 0.40) return false;
    action(`🛡️ HOLY SHIELD: Garrison Paladin fully blocked the attack from [${enemy.name}] (0 damage)!`);
    debug('PALADIN_SHIELD', `Paladin (#${soldier.id}) blocked the attack from [${enemy.name}]`);
    return true;
}

function barbarianAxes(ctx) {
    const { state, soldier, upgrades, action, debug } = ctx;
    if (!upgrades.includes('barbarian_axes') || soldier.hp <= 0 || soldier.respawnTimer !== 0) return;
    const near = en => en.hp > 0 && Math.max(Math.abs(soldier.x - en.x), Math.abs(soldier.y - en.y)) <= 2;
    const flying = state.enemies.find(en => en.isFlying && near(en));
    const target = flying || state.enemies.find(en => near(en) &&
        !Object.values(state.players).some(p => p.hp > 0 && (p.blockedEnemyIds || []).includes(en.id)) &&
        !(state.soldiers || []).some(s => s.hp > 0 && (s.blockedEnemyIds || []).includes(en.id)));
    if (!target) return;
    const damage = ctx.damage(target, 15), tag = flying ? 'BARBARIAN_AXE_AIR' : 'BARBARIAN_AXE_GROUND';
    const description = flying ? `flying enemy [${target.name}]` : `[${target.name}]`;
    action(`🪓 AXE THROW: Barbarian at cell (${soldier.x}, ${soldier.y}) threw a tomahawk at ${description}, dealing ${damage} physical damage!`);
    debug(tag, `Barbarian (#${soldier.id}) threw a tomahawk at [${target.name}] (#${target.id}) for ${damage} damage [HP: ${target.hp}]`);
    if (target.hp <= 0) {
        ctx.reward(target, `💀 [${target.name}] was brought down by a barbarian's tomahawk! Treasury +${target.reward}💰.`,
            `Enemy [${target.name}] (#${target.id}) killed by a barbarian's tomahawk (+${target.reward}💰)`);
        ctx.remove(target);
    }
}

function barbarianBloodlust({ soldier, upgrades, action, debug, setHp }) {
    if (!upgrades.includes('barbarian_bloodlust')) return;
    setHp(soldier, Math.min(soldier.maxHp, soldier.hp + 30));
    soldier.dmg = (soldier.dmg || 20) + 5;
    action(`🩸 BLOODLUST: Barbarian revels in enemy blood (+30 HP, +5 damage until the wave ends)!`);
    debug('BARBARIAN_BLOODLUST', `Barbarian (#${soldier.id}) gained a buff: HP=${soldier.hp}/${soldier.maxHp}, Damage=${soldier.dmg}`);
}

function necroPoisonMire(ctx) {
    const { state, cell, proto, upgrades, x, y, action, debug } = ctx;
    if (!upgrades.includes('necro_poison_mire')) return;
    if (state.roundCounter - (cell.lastPoisonMireRound || -999) < 6) return;
    const target = state.enemies.find(en => en.hp > 0 && ctx.inRange(x, y, en, proto.range || 3));
    if (!target) return;
    cell.lastPoisonMireRound = state.roundCounter;
    if (!state.poisonPuddles) state.poisonPuddles = [];
    state.poisonPuddles.push({ x: target.x, y: target.y, turns: 3, dmg: 15 });
    action(`☠️ TOXIC MIRE: Ziggurat at (${x}, ${y}) flooded cell (${target.x}, ${target.y}) with corrosive dark sludge for 3 turns (15 true DoT)!`);
    debug('NECRO_POISON_MIRE', `Toxic mire created at (${target.x}, ${target.y}) for 3 turns by tower at (${x}, ${y})`);
}

function courtResonance(ctx) {
    const { state, cell, proto, upgrades, x, y, action, debug } = ctx;
    if (!upgrades.includes('court_resonance')) return;
    if (state.roundCounter - (cell.lastResonanceRound || -999) < 4) return;
    cell.lastResonanceRound = state.roundCounter;
    const range = proto.range || 4;
    let buffedCount = 0;
    const gh = state.gridHeight || (state.grid ? state.grid.length : 16);
    const gw = state.gridWidth || (state.grid && state.grid[0] ? state.grid[0].length : 16);
    for (let ty = 0; ty < gh; ty++) {
        for (let tx = 0; tx < gw; tx++) {
            const otherCell = state.grid[ty] && state.grid[ty][tx];
            if (!otherCell || !otherCell.type || ['empty', 'road', 'spawn', 'castle', 'slot'].includes(otherCell.type)) continue;
            if (ctx.inRange(x, y, { x: tx, y: ty }, range)) {
                otherCell.damageBuffMultiplier = 1.25;
                otherCell.damageBuffTurns = 2;
                buffedCount++;
            }
        }
    }
    action(`🔮 MAGIC RESONANCE: Court Mage at (${x}, ${y}) amplified magical currents! Nearby towers (${buffedCount} total) gain +25% damage for 2 turns!`);
    debug('COURT_RESONANCE', `Court Mage empowered ${buffedCount} towers within radius ${range}`);
}

function courtOldTome(ctx) {
    const { state, cell, proto, upgrades, x, y, action, debug, inRange, random, damage, reward, remove } = ctx;
    if (!upgrades.includes('court_old_tome')) return;
    if (state.roundCounter - (cell.lastOldTomeRound || -999) < 5) return;
    cell.lastOldTomeRound = state.roundCounter;
    action(`📖 OLD SPELLBOOK: Court Mage at (${x}, ${y}) activated the tome and unleashed an extra spell barrage!`);
    debug('COURT_OLD_TOME', `Court Mage at (${x}, ${y}) activated a triple attack`);

    for (let volley = 1; volley <= 2; volley++) {
        const target = state.enemies.find(enemy => enemy.hp > 0 &&
            !(proto.noAir && enemy.isFlying) && inRange(x, y, enemy, proto.range || 4));
        if (!target) break;

        let baseDamage = proto.damage || 10;
        if (proto.minDamage !== undefined && proto.maxDamage !== undefined) {
            const rnd = random ? random() : Math.random();
            baseDamage = Math.floor(rnd * (proto.maxDamage - proto.minDamage + 1)) + proto.minDamage;
        }
        if (cell.damageBuffMultiplier && cell.damageBuffTurns > 0) {
            baseDamage = Math.round(baseDamage * cell.damageBuffMultiplier);
        }
        const dmgAmount = damage(target, baseDamage, 'magic');
        action(`✨ TOME VOLLEY #${volley}: Court Mage hit [${target.name}] for ${dmgAmount} magic damage!`);
        debug('COURT_OLD_TOME_SHOT', `Tome volley #${volley} -> [${target.name}] (#${target.id}) Damage: ${dmgAmount} (HP: ${target.hp}/${target.maxHp})`);
        if (target.hp <= 0) {
            reward(target, `💀 ELIMINATION: [${target.name}] was incinerated by the tome's spell barrage! Treasury +${target.reward}💰.`,
                `Enemy [${target.name}] (#${target.id}) killed by the Court Mage's tome (+${target.reward}💰)`);
            remove(target);
        }
    }
}

function priestessCleanse(ctx) {
    const { state, cell, proto, upgrades, x, y, action, debug } = ctx;
    if (!upgrades.includes('priestess_cleanse')) return;
    if (state.roundCounter - (cell.lastCleanseRound || -999) < 3) return;
    const range = proto.range || 3;
    let cleansed = [];
    Object.values(state.players || {}).forEach(p => {
        if (p.hp > 0 && ctx.inRange(x, y, p, range)) {
            let had = false;
            if (p.stunTurns > 0) { p.stunTurns = 0; had = true; }
            if (p.poisonTurns > 0) { p.poisonTurns = 0; had = true; }
            if (p.bleedTurns > 0) { p.bleedTurns = 0; had = true; }
            if (p.slowTurns > 0) { p.slowTurns = 0; had = true; }
            if (had) cleansed.push(p.heroName || p.name);
        }
    });
    (state.soldiers || []).forEach(s => {
        if (s.hp > 0 && s.respawnTimer === 0 && !s.isSkeleton && ctx.inRange(x, y, s, range)) {
            let had = false;
            if (s.stunTurns > 0) { s.stunTurns = 0; had = true; }
            if (s.poisonTurns > 0) { s.poisonTurns = 0; had = true; }
            if (s.bleedTurns > 0) { s.bleedTurns = 0; had = true; }
            if (had) cleansed.push(s.name || 'Soldier');
        }
    });
    if (cleansed.length > 0) {
        cell.lastCleanseRound = state.roundCounter;
        action(`🌿 CLEANSING BLESSING: Priestess of Light at (${x}, ${y}) cleansed corruption and poison from: ${cleansed.join(', ')}!`);
        debug('PRIESTESS_CLEANSE', `Cleansed: ${cleansed.join(', ')}`);
    }
}

function priestessRadiantSmite(ctx) {
    const { state, cell, proto, upgrades, x, y, action, debug, inRange, damage, reward, remove } = ctx;
    if (!upgrades.includes('priestess_radiant_smite')) return;
    if (state.roundCounter - (cell.lastRadiantSmiteRound || -999) < 2) return;
    const range = proto.range || 3;
    const target = (state.enemies || []).find(en => en.hp > 0 && inRange(x, y, en, range) && (
        Object.values(state.players || {}).some(p => p.hp > 0 && (p.blockedEnemyIds || []).includes(en.id)) ||
        (state.soldiers || []).some(s => s.hp > 0 && (s.blockedEnemyIds || []).includes(en.id))
    ));
    if (!target) return;
    cell.lastRadiantSmiteRound = state.roundCounter;
    const smiteDmg = damage(target, 20, 'magic');
    target.hasDisadvantage = true;
    action(`☀️ SMITING RAY: Priestess of Light at (${x}, ${y}) smote blocked [${target.name}] for ${smiteDmg} magic damage (attack disadvantage applied)!`);
    debug('PRIESTESS_SMITE', `Smiting Ray struck [${target.name}] (#${target.id}) for ${smiteDmg} damage`);
    if (target.hp <= 0) {
        reward(target, `💀 [${target.name}] was incinerated by a holy ray! Treasury +${target.reward}💰.`, `Enemy [${target.name}] killed by Smiting Ray (+${target.reward}💰)`);
        remove(target);
    }
}

function dwarfSoldierBeforeCombat(ctx) {
    const { state, soldier, upgrades, action, debug, random, damage, removeDead } = ctx;
    let [tx, ty] = (soldier.towerKey || "").split(',').map(Number);
    let cell = (tx !== undefined && ty !== undefined && state.grid && state.grid[ty]) ? state.grid[ty][tx] : null;

    // 1. dwarf_surprise_strike: Внезапное появление (КД 4 раунда)
    if (upgrades.includes('dwarf_surprise_strike') && state.roundCounter - (soldier.lastSurpriseRound || -999) >= 4) {
        const target = (state.enemies || []).find(en => en.hp > 0 && (
            (soldier.blockedEnemyIds || []).includes(en.id) || (en.x === soldier.x && en.y === soldier.y)
        ));
        if (target) {
            soldier.lastSurpriseRound = state.roundCounter;
            target.stunTurns = Math.max(target.stunTurns || 0, 2);
            action(`⚡ SURPRISE ATTACK: Dwarf (#${soldier.id}) attacked from the mine and stunned [${target.name}] for 1 turn!`);
            debug('DWARF_SURPRISE_STRIKE', `Dwarf (#${soldier.id}) stunned [${target.name}] (#${target.id})`);
        }
    }

    // 2. dwarf_blast_keg: Бочонок гномьего пороха (КД 3 раунда)
    if (cell && upgrades.includes('dwarf_blast_keg') && state.roundCounter - (cell.lastBlastKegRound || -999) >= 3) {
        const engaged = (state.enemies || []).filter(en => en.hp > 0 && Math.max(Math.abs(soldier.x - en.x), Math.abs(soldier.y - en.y)) <= 1);
        if (engaged.length > 0) {
            cell.lastBlastKegRound = state.roundCounter;
            action(`🧨 POWDER KEG: Dwarves at cell (${soldier.x}, ${soldier.y}) threw a powder keg into the enemy group!`);
            for (const en of engaged) {
                const rnd = random ? random() : Math.random();
                const dmg = Math.floor(rnd * (35 - 20 + 1)) + 20;
                damage(en, dmg, 'pure');
                en.stunTurns = Math.max(en.stunTurns || 0, 2);
                action(`💥 POWDER EXPLOSION: [${en.name}] took ${dmg} explosive damage and was stunned for 1 turn!`);
                debug('DWARF_BLAST_KEG', `Keg hit [${en.name}] (#${en.id}) for ${dmg} damage [HP: ${en.hp}/${en.maxHp}]`);
                if (en.hp <= 0) {
                    ctx.reward(en, `💀 [${en.name}] was torn apart by a powder charge! Treasury +${en.reward}💰.`, `Enemy [${en.name}] killed by keg (+${en.reward}💰)`);
                }
            }
            if (removeDead) removeDead();
        }
    }
}

module.exports = {
    towers: {
        archer_ranger: { afterAttack: rangerEffects },
        archer_musketeer: { modifyShot: musketeerShot, afterAttack: ctx => { if (ctx.upgrades.includes('musketeer_shrapnel')) splash(ctx, true); } },
        mage_arcane: { beforeAttack: arcanePassives },
        mage_sorcerer: { afterAttack: polymorph },
        bombard_1: { afterAttack: splash },
        bombard_2: { afterAttack: splash },
        bombard_3: { afterAttack: splash },
        bombard_bertha: { beforeAttack: berthaMissiles, afterAttack: berthaAfterAttack },
        bombard_tesla: { beforeAttack: teslaField, afterAttack: teslaChain },
        necro_4: { beforeAttack: necroPoisonMire },
        mage_court: { beforeAttack: courtResonance, afterAttack: courtOldTome },
        mage_priestess: { beforeAttack: priestessCleanse, afterAttack: priestessRadiantSmite }
    },
    soldiers: {
        barracks_paladins: { beforeCombat: paladinGrace, blocksHit: paladinShield },
        barracks_barbarians: { beforeCombat: barbarianAxes, onKill: barbarianBloodlust },
        dwarf_1: { beforeCombat: dwarfSoldierBeforeCombat },
        dwarf_2: { beforeCombat: dwarfSoldierBeforeCombat },
        dwarf_3: { beforeCombat: dwarfSoldierBeforeCombat },
        dwarf_4: { beforeCombat: dwarfSoldierBeforeCombat }
    }
};
