'use strict';
const EVENT_RULES = require('./public/activated-event-rules');

const BATTLE_ABILITY_RULES = require('./public/battle-ability-rules.js');

module.exports = function createHeroActions(deps) {
    const {
        getState,
        getData,
        getModifier,
        setCombatHp,
        mobTraits,
        removeDeadEnemies,
        findShortestPath,
        triggerMinesAt,
        restorePreparationHero,
        logAction,
        logDebug,
        broadcastState,
        random = () => Math.random()
    } = deps;

function castAbility(playerName, abilityType, targetEnemyId, diceRoll) {
    const gameState = getState();
    const GAME_DATA = getData();
    const player = gameState.players[playerName];
    if (!player) return;
    if (player.deathTimer > 0 || player.hp <= 0) { logAction(Date.now(), `❌ ${player.heroName} has fallen and is waiting to respawn!`); broadcastState(); return; }
    if (player.hasAttackedThisRound) { logAction(Date.now(), `❌ Unavailable: You have already used an action this round!`); broadcastState(); return; }

    if (abilityType === 'disengage') {
        player.disengaged = true;
        player.hasAttackedThisRound = true;
        player.isReady = false;
        logAction(Date.now(), `💨 DISENGAGE: ${player.heroName} can move without provoking retreat attacks this round.`);
        broadcastState(); return;
    }

    // Инициализируем объект cooldowns у игрока, если его нет
    if (!player.cooldowns) player.cooldowns = {};

    // ПРОВЕРКА БЛОКИРОВКИ НА СЕРВЕРЕ: Проверяем, не на перезарядке ли приём
    if (player.cooldowns[abilityType] && player.cooldowns[abilityType] > 0) {
        logAction(Date.now(), `❌ Error: Ability [${abilityType}] is still on cooldown! Turns remaining: ${player.cooldowns[abilityType]}`);
        broadcastState(); return;
    }

    // Определяем системное имя героя для подгрузки данных
    let hKey = player.heroKey || "gerald";
    if (player.heroName.indexOf("Zefira") > -1) hKey = "zefira";
    if (player.heroName.indexOf("Malik") > -1) hKey = "malik";
    if (player.heroName.indexOf("Bolin") > -1) hKey = "bolin";
    if (player.heroName.indexOf("Connor") > -1) hKey = "connor";
    if (player.heroName.indexOf("Illiana") > -1) hKey = "illiana";
    if (player.heroName.indexOf("Torghar") > -1) hKey = "torghar";
    if (player.heroName.indexOf("Ratchet") > -1) hKey = "ratchet";

    const heroProto = GAME_DATA.heroes[hKey];
    let strMod = getModifier(player.stats.str);
    let dexMod = getModifier(player.stats.dex);
    let intMod = getModifier(player.stats.int);

    let cleanKey = abilityType.startsWith('spell_') ? abilityType.substring(6) : abilityType;
    const abilityDefinition = BATTLE_ABILITY_RULES.definition(abilityType, hKey, player);
    if (abilityType.startsWith('spell_') && (!player.skills.includes(cleanKey) || !heroProto.skills.some(s => s.id === cleanKey && s.cooldown > 0))) {
        logAction(Date.now(), '❌ This ability was not selected for your hero.'); broadcastState(); return;
    }

    // Телепортация и установка мины выбирают клетку, а не существующего врага.
    if (cleanKey === 'blink' || cleanKey === 'mines') {
        const match = typeof targetEnemyId === 'string' && /^cell_(\d+)_(\d+)$/.exec(targetEnemyId);
        const x = match ? Number(match[1]) : -1, y = match ? Number(match[2]) : -1;
        const cell = gameState.grid[y]?.[x];
        const distance = Math.max(Math.abs(player.x - x), Math.abs(player.y - y));
        const isBlink = cleanKey === 'blink';
        const legalCell = cell && (isBlink ? ['empty', 'road', 'spawn', 'castle'].includes(cell.type) : ['road', 'spawn', 'castle'].includes(cell.type));
        const manaCost = isBlink ? 3 : 4;
        if (!legalCell || distance > (isBlink ? 4 : 1) || player.mana < manaCost) {
            logAction(Date.now(), '❌ Select an available cell within ability range and check your mana.'); broadcastState(); return;
        }
        player.mana -= manaCost;
        player.cooldowns[abilityType] = heroProto.skills.find(s => s.id === cleanKey).cooldown;
        player.hasAttackedThisRound = true;
        player.isReady = false;
        if (isBlink) {
            player.x = x; player.y = y;
            player.blockedEnemyIds = [];
            player.speedBonus = Math.max(1, dexMod);
            player.speedBonusRounds = 2;
            player.shieldHp = (player.shieldHp || 0) + Math.max(2, 4 + dexMod);
            if (gameState.gamePeriod === 'preparation' && distance > 0) restorePreparationHero(player);
            logAction(Date.now(), `✨ ASTRAL BLINK: Zefira teleported to (${x}, ${y}) and gained +${player.speedBonus} speed for 2 rounds!`);
        } else {
            if (!gameState.mines) gameState.mines = [];
            gameState.mines.push({ x, y, ownerName: player.name, damage: Math.max(1, diceRoll + dexMod) });
            logAction(Date.now(), `💣 MINE FIELD: Bolin mined cell (${x}, ${y})!`);
            triggerMinesAt(x, y);
        }
        broadcastState(); return;
    }

    // --- 1. ОБРАБОТКА САМОБАФФОВ И УТИЛИТАРНЫХ СПОСОБНОСТЕЙ (БЕЗ ВРАЖЕСКОЙ ЦЕЛИ) ---
    // Shield Wall, Inspire Courage, Shield of Retribution, Unbreakable Shield, Astral Blink, Undying Bastion
    if (['shield_wall', 'inspire', 'retribution', 'unbreakable', 'connor_retribution'].includes(cleanKey) ||
        (abilityType === 'ultimate' && ['torghar', 'connor'].includes(hKey))) {
        
        let manaCost = 5;
        let cooldownVal = 3;
        if (cleanKey === 'connor_retribution') manaCost = 6;
        if (cleanKey === 'retribution') { manaCost = 6; cooldownVal = 3; }
        if (cleanKey === 'unbreakable') manaCost = 4;
        if (abilityType === 'ultimate') { manaCost = 0; cooldownVal = 5; }

        if (player.mana < manaCost) {
            logAction(Date.now(), `❌ Mana: ${player.heroName} does not have enough mana for [${cleanKey}] (requires ${manaCost}, available ${player.mana}).`);
            broadcastState(); return;
        }

        player.mana -= manaCost;
        player.cooldowns[abilityType] = cooldownVal;
        player.hasAttackedThisRound = true;
        player.isReady = false;

        if (cleanKey === 'shield_wall') {
            const previousArmor = player.armor ?? 55;
            player.armor = Math.min(80, previousArmor + 25);
            player.shieldWallArmorBonus = player.armor - previousArmor;
            player.shieldHp = (player.shieldHp || 0) + 15;
            player.shieldWallRounds = 2;
            logAction(Date.now(), `🛡️ SHIELD WALL [Shield Wall]: Torghar raised his defenses! Armor increased to ${player.armor}% and gained a +15 HP barrier for 2 rounds!`);
            logDebug('SHIELD_WALL', `${player.heroName} activated Shield Wall: armor=${player.armor}%, shieldHp=${player.shieldHp}`);
        } else if (abilityType === 'ultimate' && hKey === 'torghar') {
            player.invulnerableRounds = 1;
            player.blockLimitBeforeUltimate = player.blockLimit;
            player.blockLimit += 2;
            // Taunt all enemies in radius 2
            let tauntedEnemies = [];
            gameState.enemies.forEach(en => {
                if (en.hp > 0 && Math.max(Math.abs(player.x - en.x), Math.abs(player.y - en.y)) <= 2) {
                    en.lastAttackerId = player.name;
                    tauntedEnemies.push(en.name);
                }
            });
            logAction(Date.now(), `⚡ ULTIMATE [Undying Bastion]: Torghar became a living fortress! FULL DAMAGE IMMUNITY for 1 round, block limit increased to 5, enemies taunted: ${tauntedEnemies.join(', ') || 'none'}!`);
            logDebug('UNDYING_BASTION', `Torghar cast Undying Bastion: invulnerable=1 round, blockLimit=5, taunted=${tauntedEnemies.length}`);
        } else if (abilityType === 'ultimate' && hKey === 'connor') {
            player.invulnerableRounds = 2;
            logAction(Date.now(), '⚡ TEMPLAR RAGE: Connor is invulnerable for 2 full enemy turns!');
        } else if (cleanKey === 'connor_retribution') {
            player.parryDamage = Math.max(1, diceRoll + strMod);
            player.parryRounds = 1;
            logAction(Date.now(), '⚔️ TEMPLAR RETRIBUTION: Connor is ready to parry the next melee attack and counterattack!');
        } else if (cleanKey === 'inspire') {
            let chaMod = getModifier(player.stats.cha);
            let buffHp = Math.max(2, 5 + chaMod);
            Object.values(gameState.players).forEach(p => {
                if (p.hp > 0) p.shieldHp = (p.shieldHp || 0) + buffHp;
            });
            logAction(Date.now(), `✨ AURA [Inspire Courage]: ${player.heroName} inspires the party! All defenders gain a protective barrier with +${buffHp} durability!`);
        } else if (cleanKey === 'retribution') {
            let wisMod = getModifier(player.stats.wis);
            player.retributionShield = Math.max(3, 8 + wisMod);
            logAction(Date.now(), `✨ RETRIBUTION SHIELD [Shield of Retribution]: ${player.heroName} surrounds themselves with a holy barrier absorbing ${player.retributionShield} damage and reflecting it to enemies!`);
        } else if (cleanKey === 'unbreakable') {
            let nearbyEnemies = gameState.enemies.filter(e => e.hp > 0 && Math.max(Math.abs(player.x - e.x), Math.abs(player.y - e.y)) <= 3).length;
            let shieldAmount = Math.round(player.maxHp * 0.04 * Math.max(1, nearbyEnemies));
            player.shieldHp = (player.shieldHp || 0) + shieldAmount;
            logAction(Date.now(), `✨ UNBREAKABLE SHIELD [Unbreakable Shield]: Malik absorbed the strength of ${nearbyEnemies} enemies, gaining a barrier with +${shieldAmount} durability!`);
        }

        broadcastState();
        return;
    }

    // --- 2. ОБРАБОТКА ИСЦЕЛЕНИЙ И СПОСОБНОСТЕЙ ПО СОЮЗНИКАМ РЭТЧЕТА ---
    let isTargetAlly = typeof targetEnemyId === 'string' && (targetEnemyId.startsWith('player_') || targetEnemyId.startsWith('soldier_') || targetEnemyId.startsWith('self_'));
    if (isTargetAlly || (abilityType === 'ultimate' && hKey === 'ratchet') || (cleanKey === 'nanite_cloud' && hKey === 'ratchet')) {
        let isReboot = (abilityType === 'ultimate' && hKey === 'ratchet');
        let manaCost = isReboot ? 0 : (cleanKey === 'nanite_cloud' ? 6 : 5);
        let cooldownVal = isReboot ? 5 : (cleanKey === 'surgical_laser' ? 2 : 3);

        if (player.mana < manaCost) {
            logAction(Date.now(), `❌ Mana: ${player.heroName} does not have enough mana for [${cleanKey}] (requires ${manaCost}, available ${player.mana}).`);
            broadcastState(); return;
        }

        // 2A. Ультимейт Рэтчета: Spark Reboot
        if (isReboot) {
            let allyTarget = null;
            if (typeof targetEnemyId === 'string' && targetEnemyId.startsWith('player_')) {
                let targetName = targetEnemyId.replace('player_', '');
                allyTarget = gameState.players[targetName];
            }

            player.cooldowns['ultimate'] = cooldownVal;
            player.hasAttackedThisRound = true;
            player.isReady = false;

            if (allyTarget && allyTarget.deathTimer > 0) {
                // Воскрешение павшего союзника с 50% HP
                allyTarget.deathTimer = 0;
                setCombatHp(allyTarget, Math.round(allyTarget.maxHp * 0.5));
                allyTarget.mana = Math.round(allyTarget.maxMana * 0.5);
                logAction(Date.now(), `⚡ REVIVAL [Spark Reboot]: Ratchet used a defibrillator to revive fallen ${allyTarget.heroName}! HP: ${allyTarget.hp}/${allyTarget.maxHp}, Mana: ${allyTarget.mana}/${allyTarget.maxMana}!`);
                logDebug('HERO_REVIVE', `Ratchet revived ${allyTarget.heroName} with 50% HP/Mana [${allyTarget.hp}/${allyTarget.maxHp}]`);
            } else {
                // Исцеление союзника (или себя) на 100% HP и +30% брони
                let targetToHeal = allyTarget || player;
                setCombatHp(targetToHeal, targetToHeal.maxHp);
                targetToHeal.armor = Math.min(80, (targetToHeal.armor || 0) + 30);
                if (targetToHeal.name !== player.name) {
                    setCombatHp(player, player.maxHp);
                    player.armor = Math.min(80, (player.armor || 35) + 30);
                }
                logAction(Date.now(), `⚡ REBOOT [Spark Reboot]: Ratchet triggered a full systems overdrive! ${targetToHeal.heroName} and Ratchet recovered 100% HP and gained +30% armor!`);
                logDebug('SPARK_REBOOT', `Ratchet cast Spark Reboot overdrive on ${targetToHeal.heroName} and self [100% HP, +30% armor]`);
            }
            broadcastState();
            return;
        }

        // 2B. Nanite Cloud
        if (cleanKey === 'nanite_cloud') {
            player.mana -= manaCost;
            player.cooldowns[abilityType] = cooldownVal;
            player.hasAttackedThisRound = true;
            player.isReady = false;
            player.naniteCloudRounds = 3;

            // Initial burst heal
            let healedAllies = [];
            Object.values(gameState.players).forEach(p => {
                if (p.hp > 0 && Math.hypot(player.x - p.x, player.y - p.y) <= 2.05) {
                    let oldH = p.hp; setCombatHp(p, Math.min(p.maxHp, p.hp + 5));
                    healedAllies.push(`${p.heroName} (+${p.hp - oldH})`);
                }
            });
            (gameState.soldiers || []).forEach(s => {
                if (s.hp > 0 && s.respawnTimer === 0 && Math.hypot(player.x - s.x, player.y - s.y) <= 2.05) {
                    let nAmt = player.skills.includes("construct_repair") ? 10 : 5;
                    let oldH = s.hp; setCombatHp(s, Math.min(s.maxHp, s.hp + nAmt));
                    healedAllies.push(`${s.name || 'Soldier'} (+${s.hp - oldH})`);
                }
            });

            logAction(Date.now(), `🧪 NANITE CLOUD [Nanite Cloud]: Ratchet sprayed nanites within 2 cells (+5 HP/round for 3 rounds)! Healed: ${healedAllies.join(', ') || 'no one'}.`);
            logDebug('NANITE_CLOUD', `Ratchet cast Nanite Cloud: ${healedAllies.join(', ')}`);
            broadcastState();
            return;
        }

        // 2C. Ambulance Rush (рывок к союзнику, щит +10, оглушение врагов на пути)
        if (cleanKey === 'ambulance_rush') {
            let targetUnit = null;
            if (targetEnemyId.startsWith('player_')) {
                let pName = targetEnemyId.replace('player_', '');
                targetUnit = gameState.players[pName];
            } else if (targetEnemyId.startsWith('soldier_')) {
                let sId = targetEnemyId.replace('soldier_', '');
                targetUnit = (gameState.soldiers || []).find(s => String(s.id) === sId);
            } else if (targetEnemyId.startsWith('self_')) {
                targetUnit = player;
            }

            if (!targetUnit) {
                logAction(Date.now(), `❌ Error: Ambulance Rush target not found!`);
                broadcastState(); return;
            }

            let dist = Math.hypot(player.x - targetUnit.x, player.y - targetUnit.y);
            if (dist > 4.05) {
                logAction(Date.now(), `❌ Too far! Ambulance Rush range: 4 cells.`);
                broadcastState(); return;
            }

            player.mana -= manaCost;
            player.cooldowns[abilityType] = cooldownVal;
            player.hasAttackedThisRound = true;
            player.isReady = false;

            // Move Ratchet adjacent or to target cell
            let startX = player.x, startY = player.y;
            player.x = targetUnit.x;
            player.y = targetUnit.y;

            // Grant +10 shield to target and self
            targetUnit.shieldHp = (targetUnit.shieldHp || 0) + 10;
            player.shieldHp = (player.shieldHp || 0) + 10;

            // Stun enemies along path
            let stunnedEnemies = [];
            gameState.enemies.forEach(en => {
                if (en.hp > 0) {
                    let dToStart = Math.hypot(en.x - startX, en.y - startY);
                    let dToEnd = Math.hypot(en.x - player.x, en.y - player.y);
                    let lineDist = Math.hypot(player.x - startX, player.y - startY);
                    if (lineDist > 0 && (dToStart + dToEnd <= lineDist + 0.8)) {
                        en.stunTurns = Math.max(en.stunTurns || 0, 1);
                        stunnedEnemies.push(en.name);
                    }
                }
            });

            logAction(Date.now(), `🚑 AMBULANCE RUSH [Ambulance Rush]: Ratchet rushed to [${targetUnit.heroName || targetUnit.name || 'ally'}], giving both a +10 HP shield${stunnedEnemies.length > 0 ? ' and stunning along the way: ' + stunnedEnemies.join(', ') : ''}!`);
            logDebug('AMBULANCE_RUSH', `Ratchet rushed to (${player.x}, ${player.y}), shield +10, stunned: ${stunnedEnemies.join(', ')}`);
            if (gameState.gamePeriod === 'preparation' && (startX !== player.x || startY !== player.y)) restorePreparationHero(player);
            broadcastState();
            return;
        }

        // 2D. Surgical Laser (ally heal & cleanse)
        if (cleanKey === 'surgical_laser') {
            let targetUnit = null;
            let isConstruct = false;
            if (targetEnemyId.startsWith('player_')) {
                let pName = targetEnemyId.replace('player_', '');
                targetUnit = gameState.players[pName];
            } else if (targetEnemyId.startsWith('soldier_')) {
                let sId = targetEnemyId.replace('soldier_', '');
                targetUnit = (gameState.soldiers || []).find(s => String(s.id) === sId);
                isConstruct = true;
            } else if (targetEnemyId.startsWith('self_')) {
                targetUnit = player;
            }

            if (!targetUnit) {
                logAction(Date.now(), `❌ Error: Surgical Laser ally not found!`);
                broadcastState(); return;
            }

            let dist = Math.hypot(player.x - targetUnit.x, player.y - targetUnit.y);
            if (dist > 3.05) {
                logAction(Date.now(), `❌ Too far! Surgical Laser range: 3 cells.`);
                broadcastState(); return;
            }

            player.mana -= manaCost;
            player.cooldowns[abilityType] = cooldownVal;
            player.hasAttackedThisRound = true;
            player.isReady = false;

            let healRoll = diceRoll + intMod;
            if (isConstruct && player.skills.includes("construct_repair")) {
                healRoll *= 2; // Construct Repair doubles healing on soldiers and golems
            }

            let oldH = targetUnit.hp;
            setCombatHp(targetUnit, Math.min(targetUnit.maxHp, targetUnit.hp + healRoll));
            let healedAmt = targetUnit.hp - oldH;

            // Cleanse bleed or poison
            let cleansed = "";
            if (targetUnit.bleedTurns && targetUnit.bleedTurns > 0) {
                targetUnit.bleedTurns = 0; cleansed += " [Bleeding removed]";
            }
            if (targetUnit.poisonTurns && targetUnit.poisonTurns > 0) {
                targetUnit.poisonTurns = 0; cleansed += " [Poison removed]";
            }

            logAction(Date.now(), `🔬 SURGICAL LASER [Surgical Laser]: Ratchet healed [${targetUnit.heroName || targetUnit.name || 'ally'}] with a laser beam for +${healedAmt} HP (HP: ${targetUnit.hp}/${targetUnit.maxHp})${cleansed}!`);
            logDebug('SURGICAL_LASER_HEAL', `Ratchet healed [${targetUnit.heroName || targetUnit.name}] for +${healedAmt} HP [${targetUnit.hp}/${targetUnit.maxHp}]`);
            broadcastState();
            return;
        }
    }

    // --- 3. АТАКА ВРАГОВ (СТАНДАРТНАЯ ЦЕЛЬ ВРАГ) ---
    let numericEnemyId = parseInt(targetEnemyId);
    const selfCenteredAttack = abilityDefinition.selection === 'none' && abilityDefinition.shape === 'aoe_around_player';
    const enemy = selfCenteredAttack ? { id: null, x: player.x, y: player.y, hp: 0 } : gameState.enemies.find(e => e.id === numericEnemyId && e.hp > 0);
    if (!enemy) {
        logAction(Date.now(), `❌ ERROR: The target no longer exists on the map.`);
        broadcastState(); return;
    }

    // Определяем эффективную дальность способности
    let effectiveRange = player.range || 1;
    if (abilityType.startsWith('spell_')) {
        let sId = cleanKey;
        const abilityRanges = {
            'shatter': 2,
            'earthquake': 2,
            'hammer': 4,
            'mortar': 5,
            'tag': 4,
            'glitter': 4,
            'prey': 4,
            'blink': 4,
            'mines': 1,
            'slash': 1,
            'blades': 1,
            'obliterate': 1,
            'connor_retribution': 1,
            'inspire': 2,
            'retribution': 2,
            'unbreakable': 3,
            // Torghar
            'shield_slam': 1,
            'ground_tremor': 1,
            // Ratchet
            'surgical_laser': 3,
            'nanite_cloud': 2,
            'ambulance_rush': 4
        };
        if (abilityRanges[sId]) {
            effectiveRange = Math.max(effectiveRange, abilityRanges[sId]);
        }
    } else if (abilityType === 'ultimate') {
        if (["Zefira", "Bolin", "Illiana"].some(n => player.heroName.includes(n))) {
            effectiveRange = Math.max(effectiveRange, 4);
        }
        if (hKey === 'ratchet') effectiveRange = 4;
        if (hKey === 'torghar') effectiveRange = 2;
    }

    // Проверка досягаемости по Чебышёву / Евклиду
    let euclideanDist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    let chebyshevDist = Math.max(Math.abs(player.x - enemy.x), Math.abs(player.y - enemy.y));
    let isBlockedMeleeTarget = (player.blockedEnemyIds || []).includes(enemy.id) && chebyshevDist <= 1;

    let isEuclideanSkill = ['hammer', 'mortar', 'tag', 'glitter', 'prey', 'surgical_laser', 'nanite_cloud', 'ambulance_rush'].includes(cleanKey) ||
                           (abilityType === 'attack' && ['zefira', 'bolin', 'illiana', 'ratchet'].includes(hKey));

    let checkDist = isEuclideanSkill ? euclideanDist : chebyshevDist;

    if (!isBlockedMeleeTarget && checkDist > (effectiveRange + 0.05)) {
        logAction(Date.now(), `❌ Range: ${player.heroName} cannot reach [${enemy.name}] (distance: ${Math.round(checkDist * 10) / 10}, range: ${effectiveRange})!`);
        logDebug('CAST_FAIL', `${player.heroName} cannot reach [${enemy.name}] (#${enemy.id}): dist=${checkDist} > effectiveRange=${effectiveRange}`);
        broadcastState(); return;
    }

    logDebug('CAST_START', `${player.heroName} [${playerName}] uses [${abilityType}] from (${player.x}, ${player.y}) against [${enemy.name}] (#${enemy.id}) at (${enemy.x}, ${enemy.y})`, { diceRoll, effectiveRange, checkDist, isBlocked: isBlockedMeleeTarget });

    let isGodDamage = (player.godDamageOverride !== undefined && player.godDamageOverride !== null);

    // --- 4. ОПРЕДЕЛЕНИЕ ОБЛАСТИ ПОРАЖЕНИЯ (TARGET AREA) ---
    let areaType = 'single';
    let aoeRadius = 1;
    let skillId = abilityType.startsWith('spell_') ? cleanKey : null;
    let skillProto = skillId && heroProto ? heroProto.skills.find(s => s.id === skillId) : null;
    let explosiveDamage = 0;
    if (abilityType === 'attack' && hKey === 'bolin' && player.skills.includes('explosive') && euclideanDist > 1.05) {
        player.bolinShotCount = (player.bolinShotCount || 0) + 1;
        if (player.bolinShotCount % 5 === 0) explosiveDamage = Math.floor(random() * 10) + 1;
    }

    if (abilityType === 'ultimate') {
        if (player.heroName.includes("Malik")) {
            areaType = 'aoe_around_player';
        } else if (player.heroName.includes("Bolin") || player.heroName.includes("Zefira") || player.heroName.includes("Illiana")) {
            areaType = 'aoe_around_target';
        } else {
            areaType = 'single';
        }
    } else if (abilityType === 'attack' && player.skills.includes('joehammer')) {
        areaType = 'cell';
    } else if (explosiveDamage > 0) {
        areaType = 'aoe_around_target';
    } else if (skillId) {
        // Рассекающие / круговые атаки ближнего боя бьют вокруг героя (радиус 1 Чебышёва вокруг игрока)
        if (['slash', 'shatter', 'earthquake', 'blades', 'ground_tremor'].includes(skillId)) {
            areaType = 'aoe_around_player';
        } 
        // Дальнобойные площадные и взрывные способности бьют квадратом 3х3 (радиус 1) вокруг целевой клетки дороги!
        else if (['mortar', 'mines', 'glitter', 'hammer', 'tag'].includes(skillId)) {
            areaType = 'aoe_around_target';
        } else {
            areaType = 'single';
        }
    }

    // Собираем список всех живых целей в зоне поражения
    let targets = [];
    let centerPt = (areaType === 'aoe_around_player') ? { x: player.x, y: player.y } : { x: enemy.x, y: enemy.y };
    if (areaType === 'aoe_around_target' || areaType === 'aoe_around_player') {
        targets = gameState.enemies.filter(e => e.hp > 0 && Math.max(Math.abs(e.x - centerPt.x), Math.abs(e.y - centerPt.y)) <= aoeRadius);
    } else if (areaType === 'cell') {
        targets = gameState.enemies.filter(e => e.hp > 0 && e.x === enemy.x && e.y === enemy.y);
    } else {
        targets = [enemy];
    }
    if (!targets.some(t => t.id === enemy.id) && enemy.hp > 0) {
        targets.unshift(enemy);
    }

    let filterAudit = gameState.enemies.map(e => ({
        id: e.id, name: e.name, pos: `(${e.x},${e.y})`, hp: e.hp,
        chebyshev: Math.max(Math.abs(e.x - centerPt.x), Math.abs(e.y - centerPt.y)),
        inZone: targets.some(t => t.id === e.id)
    }));
    logDebug('CAST_FILTER', `Area [${areaType}] around (${centerPt.x}, ${centerPt.y}): affected ${targets.length} of ${gameState.enemies.length} enemies`, { center: centerPt, targets: filterAudit });

    // --- 5. ПРОВЕРКА МАНЫ И КД ДЛЯ АТАКУЮЩИХ СПОСОБНОСТЕЙ И УЛЬТОВ ---
    if (skillId) {
        let manaCost = 5;
        if (skillId === 'blades' || skillId === 'unbreakable' || skillId === 'mines' || skillId === 'tag' || skillId === 'prey' || skillId === 'shield_slam') manaCost = 4;
        if (skillId === 'blink') manaCost = 3;
        if (skillId === 'retribution' || skillId === 'earthquake' || skillId === 'connor_retribution') manaCost = 6;

        if (player.mana < manaCost) {
            logAction(Date.now(), `❌ Mana: ${player.heroName} does not have enough mana for [${skillProto ? skillProto.name : skillId}] (requires ${manaCost}, available ${player.mana}).`);
            broadcastState(); return;
        }
        player.mana -= manaCost;
        if (skillProto) player.cooldowns[abilityType] = skillProto.cooldown;
    } else if (abilityType === 'ultimate') {
        if (heroProto && heroProto.ultimate) player.cooldowns['ultimate'] = heroProto.ultimate.cooldown;
    }

    // --- 6. РАСЧЁТ БАЗОВОГО УРОНА И ТИПА УРОНА ---
    let dmgType = 'phys';
    let baseDamage = 0;
    let sparkyBaseDamage = 0;
    let abilityTitle = "";
    let statusEffectNote = "";

    if (isGodDamage) {
        dmgType = 'pure';
        baseDamage = player.godDamageOverride;
        abilityTitle = `✨ DIVINE STRIKE (fixed ${baseDamage})`;
    } else if (abilityType === 'ultimate') {
        if (player.heroName.includes("Gerald")) {
            dmgType = 'pure'; baseDamage = 200; abilityTitle = `⚡ ULTIMATE [Divine Blade]`;
        } else if (player.heroName.includes("Zefira")) {
            dmgType = 'magic'; baseDamage = 210; abilityTitle = `⚡ ULTIMATE [Ethereal Spears]`;
        } else if (player.heroName.includes("Malik")) {
            dmgType = 'phys'; baseDamage = 180; abilityTitle = `⚡ ULTIMATE [Hammernado]`;
        } else if (player.heroName.includes("Bolin")) {
            dmgType = 'phys'; baseDamage = 200; abilityTitle = `⚡ ULTIMATE [Suppressive Fire]`;
        } else if (player.heroName.includes("Connor")) {
            dmgType = 'phys'; baseDamage = 250; player.invulnerableRounds = 2;
            abilityTitle = `⚡ ULTIMATE [Templar Rage]`;
            statusEffectNote = ` Connor gained FULL INVULNERABILITY for 2 rounds!`;
        } else if (player.heroName.includes("Illiana")) {
            dmgType = 'pure'; baseDamage = 185; abilityTitle = `⚡ ULTIMATE [Sparky, Incinerate!]`;
        }
    } else if (abilityType === 'attack') {
        let isRangedHero = ["Zefira", "Bolin", "Illiana", "Ratchet"].some(name => player.heroName.includes(name));

        if (isRangedHero && euclideanDist <= 1.05 && !player.heroName.includes("Ratchet")) {
            dmgType = 'phys';
            baseDamage = diceRoll + 2 + Math.min(strMod, dexMod);
            abilityTitle = `⚔️ POINT-BLANK DISADVANTAGE (d${diceRoll})`;
        } else if (isRangedHero && (euclideanDist > 1.05 || player.heroName.includes("Ratchet"))) {
            if (player.heroName.includes("Ratchet")) {
                dmgType = 'pure';
                baseDamage = diceRoll + 3 + intMod;
                abilityTitle = `⚡ RATCHET'S ENERGY STUNNER (d${diceRoll}+3+${intMod})`;
            } else if (player.heroName.includes("Bolin")) {
                dmgType = 'phys';
                baseDamage = diceRoll + 6 + dexMod;
                abilityTitle = `🏹 RANGED BARRAGE (d${diceRoll}+6+${dexMod})`;
            } else if (player.heroName.includes("Illiana")) {
                dmgType = 'phys';
                baseDamage = diceRoll + 6 + dexMod;
                let blissBonus = player.skills.includes('bliss') ? 2 : 1;
                baseDamage = baseDamage * blissBonus;
                let sparkyRoll = Math.floor(random() * 6) + 1;
                sparkyBaseDamage = sparkyRoll + 3 + Math.floor((player.stats.int - 10) / 2);
                abilityTitle = `🏹 DOUBLE TEAM (Arrow + Sparky d${sparkyRoll})`;
            } else {
                dmgType = 'magic';
                baseDamage = diceRoll + 6 + dexMod;
                if (player.skills.includes('proficiency') && random() < 0.20) {
                    baseDamage = Math.round(baseDamage * 1.5);
                    abilityTitle = `💥 ZEFIRA'S CRITICAL SHOT (d${diceRoll}+6+${dexMod})`;
                } else {
                    abilityTitle = `🏹 ZEFIRA'S RANGED SHOT (d${diceRoll}+6+${dexMod})`;
                }
            }
        } else {
            // Ближний бой: проверка уклонения варга / волка
            if ((enemy.dodgeChance && random() * 100 < enemy.dodgeChance) || (enemy.type === 'wulf' && random() * 100 < 30)) {
                logAction(Date.now(), `💨 DODGE: [${enemy.name}] dodged the melee attack from ${player.heroName}!`);
                logDebug('ENEMY_DODGE', `[${enemy.name}] (#${enemy.id}) dodged the melee attack from ${player.heroName}`);
                player.hasAttackedThisRound = true;
                player.isReady = false;
                broadcastState();
                return;
            }
            dmgType = 'phys';
            baseDamage = diceRoll + 4 + strMod;
            if (player.skills.includes('lonewulf')) {
                let alliesNear = Object.values(gameState.players).some(p => p.name !== player.name && p.hp > 0 && Math.max(Math.abs(player.x - p.x), Math.abs(player.y - p.y)) <= 1);
                if (!alliesNear) baseDamage = Math.round(baseDamage * 1.25);
            }
            abilityTitle = `⚔️ MELEE (d${diceRoll}+4+${strMod})`;
        }
    } else if (skillId) {
        let statMod = intMod;
        if (['earthquake', 'obliterate', 'slash', 'connor_retribution', 'shatter', 'shield_slam', 'ground_tremor'].includes(skillId)) {
            dmgType = 'phys'; statMod = strMod;
        } else if (['mortar', 'mines', 'prey'].includes(skillId)) {
            dmgType = 'phys'; statMod = dexMod;
        } else if (skillId === 'tag' || skillId === 'surgical_laser') {
            dmgType = 'pure'; statMod = intMod;
        } else {
            dmgType = 'magic'; statMod = intMod;
        }

        baseDamage = Math.max(1, diceRoll + statMod);

        if (player.skills.includes('battleborn') && player.hp < (player.maxHp * 0.4)) {
            baseDamage = Math.round(baseDamage * 1.4);
        }
        if (skillId === 'obliterate' && player.hp < (player.maxHp * 0.8)) {
            baseDamage = baseDamage * 2;
        }
        if (skillId === 'prey' && (enemy.stunTurns > 0)) {
            baseDamage = Math.round(baseDamage * 1.5);
        }
        if (skillId === 'blades') {
            player.shieldHp = (player.shieldHp || 0) + 4;
        }

        abilityTitle = `✨ ABILITY [${skillProto ? skillProto.name : skillId}] (d${diceRoll}+${statMod})`;
        if (skillId === 'slash') statusEffectNote = " [Bleeding: 3 damage/turn for 2 turns]";
        if (skillId === 'hammer' || skillId === 'earthquake' || skillId === 'glitter' || skillId === 'shield_slam') statusEffectNote = " [Stunned for 1 turn]";
        if (skillId === 'mortar' || skillId === 'ground_tremor') statusEffectNote = " [Slowed for 2 turns]";
        if (skillId === 'tag') statusEffectNote = " [Armor reduced by 25%]";
        if (skillId === 'shield_slam') {
            enemy.lastAttackerId = player.name; // Провокация
            statusEffectNote += " [Taunted by Torghar]";
        }
    }

    // --- 7. НАНЕСЕНИЕ УРОНА И НАЛОЖЕНИЕ СТАТУСОВ НА ВСЕ ЦЕЛИ В ЗОНЕ ПОРАЖЕНИЯ ---
    let totalKills = 0;
    let totalGoldGained = 0;
    let targetDetails = [];
    let oldEnemyHp = enemy.hp;
    let oldGold = gameState.gold;

    targets.forEach(t => {
        let calcDmg = 0;
        let resist = 0;
        let armor = 0;
        if (dmgType === 'pure') {
            calcDmg = baseDamage;
        } else if (dmgType === 'magic') {
            resist = t.magicRes || 0;
            if (player.skills.includes('aura')) resist = Math.max(0, resist - 30);
            calcDmg = Math.max(1, Math.round(baseDamage * ((100 - resist) / 100)));
        } else {
            armor = Math.min(100, (t.armor || 0) + EVENT_RULES.auraBonus(gameState, t, 'armor'));
            if (player.heroName.includes("Bolin") && player.skills.includes('rounds')) {
                armor = Math.max(0, armor - 25);
            }
            calcDmg = Math.max(1, Math.round(baseDamage * ((100 - armor) / 100)));
            if (player.heroName.includes("Bolin") && player.skills.includes('slayer')) {
                calcDmg += Math.max(1, Math.round(t.hp * 0.02));
            }
        }

        if (sparkyBaseDamage > 0) {
            let sResist = t.magicRes || 0;
            let sDmg = Math.max(1, Math.round(sparkyBaseDamage * ((100 - sResist) / 100)));
            calcDmg += sDmg;
        }

        if (abilityType === 'attack' && player.skills.includes('joehammer') && t.id !== enemy.id) {
            calcDmg = Math.max(1, Math.round(calcDmg * 0.5));
        }
        if (explosiveDamage > 0) {
            if (t.id !== enemy.id) calcDmg = 0;
            calcDmg += Math.max(1, Math.round(explosiveDamage * (100 - Math.min(100, (t.armor || 0) + EVENT_RULES.auraBonus(gameState, t, 'armor'))) / 100));
        }

        mobTraits.damage(t,calcDmg);
        t.lastAttackerId = player.name;

        if (skillId === 'slash') {
            t.bleedTurns = 2;
            t.bleedDmg = 3;
        }
        if (skillId === 'hammer' || skillId === 'earthquake' || skillId === 'glitter' || skillId === 'shield_slam') {
            t.stunTurns = Math.max(t.stunTurns || 0, 1);
        }
        if (skillId === 'mortar' || skillId === 'ground_tremor') {
            t.slowTurns = Math.max(t.slowTurns || 0, 2);
        }
        if (skillId === 'tag') {
            t.armor = Math.max(0, t.armor - 25);
        }

        logDebug('CAST_HIT', `Hit on [${t.name}] (#${t.id}) at (${t.x}, ${t.y}): base=${baseDamage}, armor=${armor}, resist=${resist}, damage=${calcDmg}, HP: ${t.hp + calcDmg} -> ${t.hp}`, {
            statuses: { bleedTurns: t.bleedTurns, stunTurns: t.stunTurns, slowTurns: t.slowTurns, armor: t.armor }
        });

        if (t.hp <= 0) {
            totalKills++;
            gameState.gold += t.reward;
            totalGoldGained += t.reward;
            targetDetails.push(`[${t.name}]: -${calcDmg} HP 💀 (+${t.reward}💰)`);
        } else {
            targetDetails.push(`[${t.name}]: -${calcDmg} HP (remaining ${t.hp})`);
        }
    });

    if (skillId === 'obliterate' && enemy.hp > 0 && !enemy.eventStructure) {
        const pathBack = findShortestPath(enemy.x, enemy.y, 'spawn');
        if (pathBack && pathBack.length > 1) {
            const destination = pathBack[Math.min(2, pathBack.length - 1)];
            enemy.x = destination.x; enemy.y = destination.y;
            for (const unit of [...Object.values(gameState.players), ...(gameState.soldiers || [])]) {
                unit.blockedEnemyIds = (unit.blockedEnemyIds || []).filter(id => id !== enemy.id);
            }
            logAction(Date.now(), `🔨 KNOCKBACK: [${enemy.name}] knocked back to (${enemy.x}, ${enemy.y})!`);
            triggerMinesAt(enemy.x, enemy.y);
        }
    }

    player.hasAttackedThisRound = true;
    player.isReady = false;
    player.godDamageOverride = null;

    // --- 8. СОСТАВЛЕНИЕ ЗАПИСИ В ХРОНИКУ ---
    let typeLabel = (dmgType === 'pure') ? 'true' : (dmgType === 'magic' ? 'magic' : 'physical');
    let areaDesc = (areaType === 'cell') ? `at cell (${enemy.x}, ${enemy.y})` :
                   (areaType === 'aoe_around_target' || areaType === 'aoe_around_player') ? `in area (${targets.length} targets)` :
                   `at [${enemy.name}]`;

    let logMessage = `${abilityTitle}: ${player.heroName} attacks ${areaDesc} (${typeLabel} damage)${statusEffectNote}. ` + targetDetails.join(', ');
    if (totalKills > 0) {
        logMessage += `. ⚰️ Total defeated: ${totalKills} monsters! (+${totalGoldGained}💰 to treasury).`;
    }

    let actionId = Date.now() + random();
    let undoData = selfCenteredAttack ? null : { type: 'enemyHp', enemyId: enemy.id, oldHp: oldEnemyHp, oldGold: oldGold };

    // --- 9. ОЧИСТКА БЛОКОВ И МЁРТВЫХ ВРАГОВ ---
    let deadEnemyIds = gameState.enemies.filter(e => e.hp <= 0).map(e => e.id);
    if (deadEnemyIds.length > 0) {
        Object.values(gameState.players).forEach(p => {
            p.blockedEnemyIds = (p.blockedEnemyIds || []).filter(id => !deadEnemyIds.includes(id));
        });
        (gameState.soldiers || []).forEach(s => {
            s.blockedEnemyIds = (s.blockedEnemyIds || []).filter(id => !deadEnemyIds.includes(id));
        });
    }

    removeDeadEnemies();

    logAction(actionId, logMessage, undoData);
    broadcastState();
}

    return { castAbility };
};
