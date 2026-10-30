'use strict';
const ACTIVATED_EVENT_RULES = require('./public/activated-event-rules');

module.exports = function createCombatEngine({
    getState, getData, getModifier,
    applyIncomingDamage, applyDeathOrSurvival, setCombatHp,
    mobTraits, towerCombat, createEnemy,
    resolveEnemyDeath, removeDeadEnemies,
    findShortestPath, triggerMinesAt, resolveCastleArrival,
    refreshHeroBlocks, resetWaveBonuses,
    spawnPendingEnemies, processDwarvenMinesIncome, processPriestessHealPrayer,
    logAction, logDebug, broadcastState,
    random = () => Math.random(), activatedEvents = null
}) {

function selectBlockingHero(players, isAvailable) {
    let chosen;
    let bestHealth = -Infinity;
    for (const player of Object.values(players)) {
        if (!isAvailable(player)) continue;
        const armor = Math.min(100, Math.max(0, player.armor || 0));
        const effectiveHealth = armor === 100 ? Infinity : player.hp / (1 - armor / 100);
        // Strict comparison preserves player order for equal values, including Infinity.
        if (effectiveHealth > bestHealth) {
            chosen = player;
            bestHealth = effectiveHealth;
        }
    }
    return chosen;
}

function moveEnemies() {
    const gameState = getState();
    const GAME_DATA = getData();

    gameState.phase = 'wave';
    gameState.recentCombatFx = [];
    broadcastState();
    gameState.phase = 'wave';
    broadcastState();
    
    let gw = gameState.gridWidth || 16;
    let gh = gameState.gridHeight || 16;
    let castleX = gw - 1, castleY = gh - 1;
    for(let y=0; y<gh; y++) {
        for(let x=0; x<gw; x++) { if(gameState.grid[y][x].type === 'castle') { castleX = x; castleY = y; break; } }
    }

    gameState.roundCounter = (gameState.roundCounter || 0) + 1;
    spawnPendingEnemies();

    // --- РАСЧЁТ ИНИЦИАТИВЫ D&D 5e ДЛЯ РАУНДА ---
    logDebug('INITIATIVE_START', `========================================================`);
    logDebug('INITIATIVE_START', `=== 🎲 ROUND #${gameState.roundCounter} BEGINS (D&D 5e INITIATIVE SYSTEM) ===`);
    logDebug('INITIATIVE_START', `========================================================`);

    // Бросок инициативы героев (d20 + DEX mod)
    Object.values(gameState.players).forEach(p => {
        let d20 = Math.floor(random() * 20) + 1;
        let dexMod = Math.floor(((p.stats?.dex || 10) - 10) / 2);
        p.initiative = d20 + dexMod;
        logDebug('INITIATIVE_ROLL', `Hero [${p.heroName || p.name}]: d20(${d20}) + DEX_MOD(${dexMod}) = Initiative ${p.initiative}`);
    });

    // Инициатива солдат казарм (10 + level * 2)
    (gameState.soldiers || []).forEach(s => {
        let lvl = 1;
        if (s.towerType && s.towerType.includes('_2')) lvl = 2;
        if (s.towerType && s.towerType.includes('_3')) lvl = 3;
        if (s.towerType && (s.towerType.includes('paladins') || s.towerType.includes('barbarians'))) lvl = 4;
        s.initiative = 10 + lvl * 2;
        logDebug('INITIATIVE_ROLL', `Garrison [${s.name || 'Soldier'}] (#${s.id}): Base 10 + Level(${lvl})*2 = Initiative ${s.initiative}`);
    });

    // ТАКТИЧЕСКИЙ ТИКТАК: При каждом ходе волны уменьшаем перезарядку способностей героев и регенерируем
    Object.values(gameState.players).forEach(p => {
        // Очищаем список заблокированных врагов от тех, кто уже погиб или от кого отошёл герой
        refreshHeroBlocks(p);

        // Автоматически уменьшаем таймеры перезарядки у игрока
        if (!p.cooldowns) p.cooldowns = {};
        Object.keys(p.cooldowns).forEach(skillId => {
            if (p.cooldowns[skillId] > 0) {
                p.cooldowns[skillId]--;
            }
        });
        
        if (p.deathTimer > 0) {
            p.deathTimer--;
            if (p.deathTimer === 0) {
                p.hp = p.maxHp; p.mana = p.maxMana; p.x = castleX; p.y = castleY;
                logAction(Date.now(), `✨ REVIVAL: ${p.heroName} recovered at the Citadel camp and is ready for battle!`);
            } else {
                logAction(Date.now(), `⏳ RESERVE: Weakened ${p.heroName} is recovering. Turns until revival: ${p.deathTimer}`);
            }
        } else if (p.hp > 0) {
            // Пассивка Джеральда Battle Vigor
            if (p.skills.includes("vigor")) {
                let conMod = getModifier(p.stats.con);
                let healAmount = Math.max(1, 2 + conMod);
                let oldHp = p.hp; setCombatHp(p, Math.min(p.maxHp, p.hp + healAmount));
                if (p.hp > oldHp) logAction(Date.now(), `🌿 PASSIVE: Battle Vigor restored ${p.heroName} +${p.hp - oldHp} HP.`);
            }

            // Рэтчет: Пассивка Triage Aura (исцеление самого раненого союзника/солдата/голема в радиусе 2 кл. на 4 HP)
            if (p.skills.includes("triage_aura") && (p.heroKey === 'ratchet' || p.heroName.includes("Ratchet"))) {
                let triageCandidates = [];
                // 1. Другие живые игроки
                Object.values(gameState.players).forEach(otherP => {
                    if (otherP.hp > 0 && otherP.deathTimer === 0 && otherP.hp < otherP.maxHp) {
                        let d = Math.hypot(p.x - otherP.x, p.y - otherP.y);
                        if (d <= 2.05) {
                            triageCandidates.push({
                                type: 'player', ref: otherP, name: otherP.heroName || otherP.name,
                                missingHp: otherP.maxHp - otherP.hp, x: otherP.x, y: otherP.y, isConstruct: false
                            });
                        }
                    }
                });
                // 2. Солдаты гарнизона и големы
                (gameState.soldiers || []).forEach(s => {
                    if (s.hp > 0 && s.respawnTimer === 0 && s.hp < s.maxHp) {
                        let d = Math.hypot(p.x - s.x, p.y - s.y);
                        if (d <= 2.05) {
                            triageCandidates.push({
                                type: 'soldier', ref: s, name: s.name || (s.isGolem ? 'Stone Golem' : 'Soldier'),
                                missingHp: s.maxHp - s.hp, x: s.x, y: s.y, isConstruct: true
                            });
                        }
                    }
                });

                if (triageCandidates.length > 0) {
                    triageCandidates.sort((a, b) => b.missingHp - a.missingHp);
                    let bestTarget = triageCandidates[0];
                    let healAmt = 4;
                    if (bestTarget.isConstruct && p.skills.includes("construct_repair")) {
                        healAmt *= 2; // Construct Repair удваивает исцеление конструктов/солдат
                    }
                    let oldH = bestTarget.ref.hp;
                    setCombatHp(bestTarget.ref, Math.min(bestTarget.ref.maxHp, bestTarget.ref.hp + healAmt));
                    let actualHealed = bestTarget.ref.hp - oldH;
                    if (actualHealed > 0) {
                        logAction(Date.now(), `💉 TRIAGE [Triage Aura]: Ratchet automatically healed [${bestTarget.name}] for +${actualHealed} HP (HP: ${bestTarget.ref.hp}/${bestTarget.ref.maxHp})!`);
                        logDebug('TRIAGE_HEAL', `Ratchet triage healed [${bestTarget.name}] for +${actualHealed} HP [${bestTarget.ref.hp}/${bestTarget.ref.maxHp}]`);
                    }
                }
            }

            // Рэтчет: Активный бафф Nanite Cloud (+5 HP/раунд союзникам в радиусе 2 кл.)
            if (p.naniteCloudRounds && p.naniteCloudRounds > 0) {
                p.naniteCloudRounds--;
                let naniteTargets = [];
                // Игроки
                Object.values(gameState.players).forEach(otherP => {
                    if (otherP.hp > 0 && otherP.deathTimer === 0 && otherP.hp < otherP.maxHp) {
                        let d = Math.hypot(p.x - otherP.x, p.y - otherP.y);
                        if (d <= 2.05) {
                            let oldH = otherP.hp;
                            setCombatHp(otherP, Math.min(otherP.maxHp, otherP.hp + 5));
                            naniteTargets.push(`${otherP.heroName} (+${otherP.hp - oldH})`);
                        }
                    }
                });
                // Солдаты и големы
                (gameState.soldiers || []).forEach(s => {
                    if (s.hp > 0 && s.respawnTimer === 0 && s.hp < s.maxHp) {
                        let d = Math.hypot(p.x - s.x, p.y - s.y);
                        if (d <= 2.05) {
                            let nHeal = p.skills.includes("construct_repair") ? 10 : 5;
                            let oldH = s.hp;
                            setCombatHp(s, Math.min(s.maxHp, s.hp + nHeal));
                            naniteTargets.push(`${s.name || 'Soldier'} (+${s.hp - oldH})`);
                        }
                    }
                });

                if (naniteTargets.length > 0) {
                    logAction(Date.now(), `🧪 NANITES [Nanite Cloud]: Ratchet's microbot cloud healed allies: ${naniteTargets.join(', ')}! (Rounds remaining: ${p.naniteCloudRounds})`);
                    logDebug('NANITE_REGEN', `Ratchet nanite cloud tick: ${naniteTargets.join(', ')}`);
                }
            }

            // РЕГЕНЕРАЦИЯ ПРИ ПОКОЕ (ОТДЫХ ВНЕ БОЯ): если герой не ходил, не атаковал и никого не держит в блоке
            let isResting = (!p.hasMovedThisRound && !p.hasAttackedThisRound && p.blockedEnemyIds.length === 0);
            if (isResting) {
                let conMod = getModifier(p.stats.con);
                let intMod = Math.floor((p.stats.int - 10) / 2);
                let hpRestHeal = Math.max(3, 4 + conMod);
                let manaRestHeal = Math.max(2, 3 + intMod);

                let oldH = p.hp;
                let oldM = p.mana;
                setCombatHp(p, Math.min(p.maxHp, p.hp + hpRestHeal));
                p.mana = Math.min(p.maxMana, p.mana + manaRestHeal);

                let gainedHp = p.hp - oldH;
                let gainedMana = p.mana - oldM;
                if (gainedHp > 0 || gainedMana > 0) {
                    logAction(Date.now(), `☕ REST: ${p.heroName} spent the round resting (+${gainedHp} HP, +${gainedMana} Mana).`);
                }
            }
        }

        // Сбрасываем флаги действий раунда для нового хода
        p.hasMovedThisRound = false; 
        p.hasAttackedThisRound = false;
        p.isReady = false;
        delete p.disengaged;
    });

    // ТАКТИЧЕСКИЙ ТИКТАК СОЛДАТ КАЗАРМ: Сброс блокировок погибших врагов и возрождение павших
    if (!gameState.soldiers) gameState.soldiers = [];
    gameState.soldiers.forEach(s => {
        s.blockedEnemyIds = (s.blockedEnemyIds || []).filter(eid => {
            let en = gameState.enemies.find(e => e.id === eid && e.hp > 0);
            return en && Math.max(Math.abs(s.x - en.x), Math.abs(s.y - en.y)) <= 1;
        });
        if (s.respawnTimer > 0) {
            s.respawnTimer--;
            if (s.respawnTimer === 0) {
                s.hp = s.maxHp;
                let [tx, ty] = s.towerKey.split(',').map(Number);
                let tCell = gameState.grid[ty] && gameState.grid[ty][tx];
                if (tCell && tCell.rallyPoint) {
                    s.x = tCell.rallyPoint.x;
                    s.y = tCell.rallyPoint.y;
                }
                logAction(Date.now(), `🛡️ REINFORCEMENT: A garrison soldier recovered in the barracks and moved to (${s.x}, ${s.y})!`);
            } else {
                logAction(Date.now(), `⏳ RESERVE: Militiaman is recovering. Turns remaining: ${s.respawnTimer}`);
            }
        }
    });

    activatedEvents?.beginRound();

    // --- ФАЗА ПЕРИОДИЧЕСКОГО УРОНА (DoT) И СТАТУСОВ ---
    gameState.enemies.forEach(enemy => {
        // 1. Кровотечение
        if (enemy.hp > 0 && enemy.bleedTurns > 0) {
            let bDmg = (enemy.bleedDmg && enemy.bleedDmg > 0) ? enemy.bleedDmg : 3;
            let oldHp = enemy.hp;
            mobTraits.damage(enemy,bDmg);
            enemy.bleedTurns--;
            logAction(Date.now(), `🩸 BLEEDING: [${enemy.name}] (#${enemy.id}) is bleeding, losing ${bDmg} HP (remaining ${enemy.hp}/${enemy.maxHp}, turns: ${enemy.bleedTurns}).`);
            logDebug('BLEED_TICK', `Enemy [${enemy.name}] (#${enemy.id}) at (${enemy.x}, ${enemy.y}) lost ${bDmg} HP to bleeding (HP: ${oldHp} -> ${enemy.hp}, effect turns remaining: ${enemy.bleedTurns})`);
            if (enemy.hp <= 0) {
                gameState.gold += enemy.reward;
                logAction(Date.now(), `💀 BLEEDING: [${enemy.name}] bled out and fell! Treasury +${enemy.reward}💰.`);
                logDebug('BLEED_DEATH', `Enemy [${enemy.name}] (#${enemy.id}) died from bleeding (+${enemy.reward}💰)`);
                Object.values(gameState.players).forEach(p => { p.blockedEnemyIds = (p.blockedEnemyIds || []).filter(id => id !== enemy.id); });
                (gameState.soldiers || []).forEach(s => { s.blockedEnemyIds = (s.blockedEnemyIds || []).filter(id => id !== enemy.id); });
            }
        }

        // 2. Яд Следопытов
        if (enemy.hp > 0 && enemy.poisonTurns > 0) {
            let pDmg = enemy.poisonDmg || 6;
            let oldHp = enemy.hp;
            mobTraits.damage(enemy,pDmg);
            enemy.poisonTurns--;
            logAction(Date.now(), `🌿 POISON: [${enemy.name}] (#${enemy.id}) is poisoned, taking ${pDmg} true damage (HP: ${enemy.hp}/${enemy.maxHp}, turns: ${enemy.poisonTurns}).`);
            logDebug('POISON_TICK', `Enemy [${enemy.name}] (#${enemy.id}) lost ${pDmg} HP to poison (HP: ${oldHp} -> ${enemy.hp}, remaining: ${enemy.poisonTurns})`);
            if (enemy.hp <= 0) {
                gameState.gold += enemy.reward;
                logAction(Date.now(), `💀 [${enemy.name}] died from poison! Treasury +${enemy.reward}💰.`);
                logDebug('POISON_DEATH', `Enemy [${enemy.name}] (#${enemy.id}) died from poison (+${enemy.reward}💰)`);
                Object.values(gameState.players).forEach(p => { p.blockedEnemyIds = (p.blockedEnemyIds || []).filter(id => id !== enemy.id); });
                (gameState.soldiers || []).forEach(s => { s.blockedEnemyIds = (s.blockedEnemyIds || []).filter(id => id !== enemy.id); });
            }
        }

        // 3. Полиморф (снятие эффекта овцы по окончании таймера)
        if (enemy.polymorphTurns > 0) {
            enemy.polymorphTurns--;
            if (enemy.polymorphTurns === 0) {
                enemy.isPolymorphed = false;
                if (enemy.oldArmor !== undefined) enemy.armor = enemy.oldArmor;
                logAction(Date.now(), `🐑 DISPEL: [${enemy.name}] (#${enemy.id}) returned to its true form!`);
                logDebug('SORCERER_POLYMORPH_END', `[${enemy.name}] (#${enemy.id}) is no longer a sheep`);
            }
        }
    });

    // 4. Горящие лужи напалма Большой Берты
    if (gameState.napalmPuddles && gameState.napalmPuddles.length > 0) {
        gameState.napalmPuddles.forEach(puddle => {
            gameState.enemies.filter(e => e.hp > 0 && e.x === puddle.x && e.y === puddle.y).forEach(enemy => {
                let nDmg = puddle.dmg || 10;
                mobTraits.damage(enemy,nDmg);
                logAction(Date.now(), `🔥 NAPALM: [${enemy.name}] burned in a napalm pool at (${puddle.x}, ${puddle.y}) (-${nDmg} HP)!`);
                logDebug('NAPALM_BURN', `Enemy [${enemy.name}] (#${enemy.id}) took ${nDmg} napalm damage [HP: ${enemy.hp}]`);
                if (enemy.hp <= 0) {
                    gameState.gold += enemy.reward;
                    logAction(Date.now(), `💀 NAPALM: [${enemy.name}] burned to death in a napalm pool! Treasury +${enemy.reward}💰.`);
                    Object.values(gameState.players).forEach(p => { p.blockedEnemyIds = (p.blockedEnemyIds || []).filter(id => id !== enemy.id); });
                    (gameState.soldiers || []).forEach(s => { s.blockedEnemyIds = (s.blockedEnemyIds || []).filter(id => id !== enemy.id); });
                }
            });
            puddle.turns--;
        });
        gameState.napalmPuddles = gameState.napalmPuddles.filter(p => p.turns > 0);
    }

    // 5. Ядовитые трясины Некроманта (15 чистого DoT + статус отравления)
    if (gameState.poisonPuddles && gameState.poisonPuddles.length > 0) {
        gameState.poisonPuddles.forEach(puddle => {
            gameState.enemies.filter(e => e.hp > 0 && e.x === puddle.x && e.y === puddle.y).forEach(enemy => {
                let pDmg = puddle.dmg || 15;
                mobTraits.damage(enemy, pDmg);
                enemy.poisonTurns = Math.max(enemy.poisonTurns || 0, 2);
                enemy.poisonDmg = pDmg;
                logAction(Date.now(), `☠️ TOXIC MIRE: [${enemy.name}] is sinking in corrosive sludge at (${puddle.x}, ${puddle.y}) (-${pDmg} true damage)!`);
                logDebug('POISON_MIRE_TICK', `Enemy [${enemy.name}] (#${enemy.id}) took ${pDmg} mire damage [HP: ${enemy.hp}]`);
                if (enemy.hp <= 0) {
                    gameState.gold += enemy.reward;
                    logAction(Date.now(), `💀 MIRE: [${enemy.name}] dissolved in toxic sludge! Treasury +${enemy.reward}💰.`);
                    Object.values(gameState.players).forEach(p => { p.blockedEnemyIds = (p.blockedEnemyIds || []).filter(id => id !== enemy.id); });
                    (gameState.soldiers || []).forEach(s => { s.blockedEnemyIds = (s.blockedEnemyIds || []).filter(id => id !== enemy.id); });
                }
            });
            puddle.turns--;
        });
        gameState.poisonPuddles = gameState.poisonPuddles.filter(p => p.turns > 0);
    }

    removeDeadEnemies();
    mobTraits.recovery();

    // Фазы башен: один обход карты, прежний порядок инициативы и клеток.
    towerCombat.fireRound(castleX, castleY);

    logDebug('INITIATIVE_PHASE', `>>> ENTERING PHASE 4: MOVEMENT AND MELEE <<<`);

    // ПРОВЕРКА НЕИСТОВСТВА ОРКОВ-ДИКАРЕЙ (ORC_FRENZY)
    gameState.enemies.forEach(e => {
        if (e.type === 'orc_wildling' && e.hp > 0) {
            let hasPackNearby = gameState.enemies.some(other => 
                other.id !== e.id && other.hp > 0 &&
                (other.type === 'worg' || other.type === 'goblin_rider') &&
                Math.max(Math.abs(other.x - e.x), Math.abs(other.y - e.y)) <= 3
            );
            if (hasPackNearby) {
                e.speed = 2;
                logAction(Date.now(), `🐺 PACK FRENZY: [${e.name}] sensed nearby worgs and accelerated to speed 2!`);
                logDebug('ORC_FRENZY', `Orc Wildling (#${e.id}) at (${e.x}, ${e.y}) accelerated to 2 (pack within 3 cells)`);
            } else {
                e.speed = e.baseSpeed || 1;
            }
        }
    });

    // ПОШАГОВЫЙ СПУСК ВРАГОВ ПО РЕЛЬСАМ ДОРОГИ
    gameState.enemies.forEach(enemy => {

        if (enemy.eventStructure) return;
        if (enemy.eventKind === 'goldenGoblin') {
            const held = [...Object.values(gameState.players), ...(gameState.soldiers || [])].some(unit =>
                unit.hp > 0 && !(unit.deathTimer > 0) && !(unit.respawnTimer > 0) &&
                (unit.blockedEnemyIds || []).includes(enemy.id) && Math.max(Math.abs(unit.x - enemy.x), Math.abs(unit.y - enemy.y)) <= 1);
            if (!held) activatedEvents?.moveSpecial(enemy);
            return;
        }
        if (resolveCastleArrival(enemy)) return;
        // Оглушённый или погибший враг пропускает ход
        if (enemy.hp <= 0 || enemy.stunTurns > 0) return;

        // ПРОВЕРКА 1: Прикован ли враг к бою (уже заблокирован живым героем или солдатом в радиусе <= 1)?
        let isAlreadyHeldByHero = Object.values(gameState.players).some(p => 
            p.hp > 0 && p.deathTimer === 0 &&
            (p.blockedEnemyIds || []).includes(enemy.id) &&
            Math.max(Math.abs(p.x - enemy.x), Math.abs(p.y - enemy.y)) <= 1
        );
        let isAlreadyHeldBySoldier = (gameState.soldiers || []).some(s => 
            s.hp > 0 && s.respawnTimer === 0 &&
            (s.blockedEnemyIds || []).includes(enemy.id) &&
            Math.max(Math.abs(s.x - enemy.x), Math.abs(s.y - enemy.y)) <= 1
        );

        if (!enemy.isFlying && (isAlreadyHeldByHero || isAlreadyHeldBySoldier)) {
            // Враг УЖЕ заблокирован в ближнем бою! Он прикован к месту и не делает шагов!
            logDebug('MOVE_STEP', `Enemy [${enemy.name}] (#${enemy.id}, HP: ${enemy.hp}) at (${enemy.x}, ${enemy.y}) is HELD in combat (${isAlreadyHeldByHero ? 'hero' : 'soldier'}). Movement skipped.`);
            return;
        }

        // Замедленный враг двигается со скоростью 1
        let speedRemaining = enemy.slowTurns > 0 ? 1 : enemy.speed + mobTraits.speedBonus(enemy);
        while (speedRemaining > 0) {
            let pathToCastle = findShortestPath(enemy.x, enemy.y, 'castle');
            if (!pathToCastle || pathToCastle.length <= 1) break;

            let nextCell = pathToCastle[1]; 
            let fromX = enemy.x, fromY = enemy.y;

            // Проверка наступания в лужу напалма Большой Берты
            let puddleOnNext = (gameState.napalmPuddles || []).find(p => p.x === nextCell.x && p.y === nextCell.y);
            if (puddleOnNext) {
                let nDmg = puddleOnNext.dmg || 10;
                mobTraits.damage(enemy,nDmg);
                logAction(Date.now(), `🔥 NAPALM: [${enemy.name}] stepped into a burning pool at (${nextCell.x}, ${nextCell.y}) (-${nDmg} HP)!`);
                logDebug('NAPALM_STEP', `Enemy [${enemy.name}] (#${enemy.id}) stepped into napalm at (${nextCell.x}, ${nextCell.y}) [HP: ${enemy.hp}]`);
                if (enemy.hp <= 0) {
                    gameState.gold += enemy.reward;
                    logAction(Date.now(), `💀 NAPALM: [${enemy.name}] burned to death in a napalm pool! Treasury +${enemy.reward}💰.`);
                    resolveEnemyDeath(enemy);
                    speedRemaining = 0;
                    break;
                }
            }

            // Проверка наступания в ядовитую трясину Некроманта
            let poisonPuddleOnNext = (gameState.poisonPuddles || []).find(p => p.x === nextCell.x && p.y === nextCell.y);
            if (poisonPuddleOnNext) {
                let pDmg = poisonPuddleOnNext.dmg || 15;
                mobTraits.damage(enemy, pDmg);
                enemy.poisonTurns = Math.max(enemy.poisonTurns || 0, 2);
                enemy.poisonDmg = pDmg;
                logAction(Date.now(), `☠️ TOXIC MIRE: [${enemy.name}] stepped into corrosive mire at (${nextCell.x}, ${nextCell.y}) (-${pDmg} HP, poisoned)!`);
                logDebug('POISON_MIRE_STEP', `Enemy [${enemy.name}] (#${enemy.id}) stepped into mire at (${nextCell.x}, ${nextCell.y}) [HP: ${enemy.hp}]`);
                if (enemy.hp <= 0) {
                    gameState.gold += enemy.reward;
                    logAction(Date.now(), `💀 MIRE: [${enemy.name}] died in toxic mire! Treasury +${enemy.reward}💰.`);
                    resolveEnemyDeath(enemy);
                    speedRemaining = 0;
                    break;
                }
            }

            // СУММИРОВАНИЕ ЛИМИТОВ БЛОКА: ищем защитника (на nextCell или на смежной клетке дороги)
            if (!enemy.isFlying) {
                // 1. Герой непосредственно на nextCell
                let directHero = selectBlockingHero(gameState.players, p => 
                    p.x === nextCell.x && p.y === nextCell.y && p.hp > 0 && p.deathTimer === 0 &&
                    (p.blockedEnemyIds || []).length < (p.blockLimit ?? 1)
                );
                if (directHero) {
                    enemy.x = nextCell.x;
                    enemy.y = nextCell.y;
                    triggerMinesAt(enemy.x, enemy.y);
                    if (enemy.hp <= 0 || resolveCastleArrival(enemy)) break;
                    if (!directHero.blockedEnemyIds) directHero.blockedEnemyIds = [];
                    directHero.blockedEnemyIds.push(enemy.id);
                    logAction(Date.now(), `🛡️ BLOCK: [${enemy.name}] was stopped by hero ${directHero.heroName} at cell (${enemy.x}, ${enemy.y}) (block ${directHero.blockedEnemyIds.length}/${directHero.blockLimit})!`);
                    logDebug('MOVE_STEP', `Enemy [${enemy.name}] (#${enemy.id}) (${fromX}, ${fromY}) -> (${enemy.x}, ${enemy.y}) [BLOCKED by hero ${directHero.heroName}]`);
                    speedRemaining = 0;
                    break;
                }

                // 2. Солдат / Голем непосредственно на nextCell
                let directSoldier = (gameState.soldiers || []).find(s => 
                    s.x === nextCell.x && s.y === nextCell.y && s.hp > 0 && s.respawnTimer === 0 &&
                    (!s.blockedEnemyIds || s.blockedEnemyIds.length < (s.isGolem ? 3 : (s.blockLimit ?? 1)))
                );
                if (directSoldier) {
                    enemy.x = nextCell.x;
                    enemy.y = nextCell.y;
                    triggerMinesAt(enemy.x, enemy.y);
                    if (enemy.hp <= 0 || resolveCastleArrival(enemy)) break;
                    if (!directSoldier.blockedEnemyIds) directSoldier.blockedEnemyIds = [];
                    directSoldier.blockedEnemyIds.push(enemy.id);
                    let sMaxBlock = directSoldier.isGolem ? 3 : (directSoldier.blockLimit ?? 1);
                    let sLabel = directSoldier.name || (directSoldier.isGolem ? 'Stone Golem' : 'Garrison Soldier');
                    logAction(Date.now(), `🛡️ BLOCK: ${sLabel} formed a living wall and stopped [${enemy.name}] at cell (${enemy.x}, ${enemy.y}) (block ${directSoldier.blockedEnemyIds.length}/${sMaxBlock})!`);
                    logDebug('MOVE_STEP', `Enemy [${enemy.name}] (#${enemy.id}) (${fromX}, ${fromY}) -> (${enemy.x}, ${enemy.y}) [BLOCKED: ${sLabel}]`);
                    speedRemaining = 0;
                    break;
                }

                // 3. Перехват героем на смежной полосе дороги (радиус Чебышёва <= 1)
                let adjacentHero = selectBlockingHero(gameState.players, p => 
                    p.hp > 0 && p.deathTimer === 0 &&
                    Math.max(Math.abs(p.x - nextCell.x), Math.abs(p.y - nextCell.y)) <= 1 &&
                    (p.blockedEnemyIds || []).length < (p.blockLimit ?? 1)
                );
                if (adjacentHero) {
                    enemy.x = nextCell.x;
                    enemy.y = nextCell.y;
                    triggerMinesAt(enemy.x, enemy.y);
                    if (enemy.hp <= 0 || resolveCastleArrival(enemy)) break;
                    if (!adjacentHero.blockedEnemyIds) adjacentHero.blockedEnemyIds = [];
                    adjacentHero.blockedEnemyIds.push(enemy.id);
                    logAction(Date.now(), `🛡️ INTERCEPT: [${enemy.name}] tried to bypass the formation but was intercepted by hero ${adjacentHero.heroName} at cell (${enemy.x}, ${enemy.y}) (block ${adjacentHero.blockedEnemyIds.length}/${adjacentHero.blockLimit})!`);
                    logDebug('MOVE_STEP', `Enemy [${enemy.name}] (#${enemy.id}) (${fromX}, ${fromY}) -> (${enemy.x}, ${enemy.y}) [INTERCEPTED by hero ${adjacentHero.heroName}]`);
                    speedRemaining = 0;
                    break;
                }

                // 4. Перехват солдатом / големом на смежной полосе дороги (радиус Чебышёва <= 1)
                let adjacentSoldier = (gameState.soldiers || []).find(s => 
                    s.hp > 0 && s.respawnTimer === 0 &&
                    Math.max(Math.abs(s.x - nextCell.x), Math.abs(s.y - nextCell.y)) <= 1 &&
                    (!s.blockedEnemyIds || s.blockedEnemyIds.length < (s.isGolem ? 3 : (s.blockLimit ?? 1)))
                );
                if (adjacentSoldier) {
                    enemy.x = nextCell.x;
                    enemy.y = nextCell.y;
                    triggerMinesAt(enemy.x, enemy.y);
                    if (enemy.hp <= 0 || resolveCastleArrival(enemy)) break;
                    if (!adjacentSoldier.blockedEnemyIds) adjacentSoldier.blockedEnemyIds = [];
                    adjacentSoldier.blockedEnemyIds.push(enemy.id);
                    let sMaxBlock = adjacentSoldier.isGolem ? 3 : (adjacentSoldier.blockLimit ?? 1);
                    let sLabel = adjacentSoldier.name || (adjacentSoldier.isGolem ? 'Stone Golem' : 'Garrison Soldier');
                    logAction(Date.now(), `🛡️ INTERCEPT: ${sLabel} intercepted [${enemy.name}] on the adjacent road lane (${enemy.x}, ${enemy.y}) (block ${adjacentSoldier.blockedEnemyIds.length}/${sMaxBlock})!`);
                    logDebug('MOVE_STEP', `Enemy [${enemy.name}] (#${enemy.id}) (${fromX}, ${fromY}) -> (${enemy.x}, ${enemy.y}) [INTERCEPTED: ${sLabel}]`);
                    speedRemaining = 0;
                    break;
                }
            }

            enemy.x = nextCell.x;
            enemy.y = nextCell.y;
            triggerMinesAt(enemy.x, enemy.y);
            if (enemy.hp <= 0 || resolveCastleArrival(enemy)) break;
            speedRemaining--;
            logDebug('MOVE_STEP', `Enemy [${enemy.name}] (#${enemy.id}) free step (${fromX}, ${fromY}) -> (${enemy.x}, ${enemy.y})`);


        }
    });

    // Обычный враг выбирает одного защитника на весь раунд; только cleave бьёт всех.
    const meleeAssignments = new Map();
    for (const enemy of gameState.enemies) {
        const inContact = unit => unit.hp > 0 && !(unit.deathTimer > 0) && !(unit.respawnTimer > 0) &&
            ((unit.blockedEnemyIds || []).includes(enemy.id) || (unit.x === enemy.x && unit.y === enemy.y));
        const candidates = [...Object.values(gameState.players).filter(inContact),
            ...(enemy.isFlying ? [] : (gameState.soldiers || []).filter(inContact))];
        const held = candidates.filter(unit => (unit.blockedEnemyIds || []).includes(enemy.id));
        const pool = held.length ? held : candidates;
        const chosen = pool.find(unit => unit.name === enemy.lastAttackerId) || pool[0];
        meleeAssignments.set(enemy.id, enemy.aoeCleave ? candidates : chosen ? [chosen] : []);
    }

    activatedEvents?.enemyRound();

    // ФАЗА УРОНА ВРАГОВ ПО ГЕРОЯМ
    gameState.enemies.forEach(enemy => {
        if (enemy.eventKind) return;
        if (enemy.hp <= 0 || enemy.stunTurns > 0) return;
        if (enemy.isPolymorphed || (enemy.polymorphTurns && enemy.polymorphTurns > 0)) {
            logDebug('SHEEP_BLEAT', `Enemy [${enemy.name}] (#${enemy.id}) is a sheep, bleating and unable to attack`);
            return;
        }

        // --- 1. РЕЖИМ БЛИЖНЕГО БОЯ ---
        const assigned = meleeAssignments.get(enemy.id) || [];
        const targetsToHit = assigned.filter(unit => gameState.players[unit.name] === unit);
        if (targetsToHit.length > 0) {
            for (let target of targetsToHit) {
                if (enemy.hp <= 0) break;

                // ПРОВЕРКА НЕУЯЗВИМОСТИ КОННОРА / ТОРГАРА
                let isInvulnerable = (target.invulnerableRounds && target.invulnerableRounds > 0);
                if (isInvulnerable) {
                    logAction(Date.now(), `🛡️ INVULNERABLE: [${enemy.name}] tries to hit ${target.heroName}, but the defenses are impenetrable!`);
                    logDebug('ENEMY_ATK', `[${enemy.name}] (#${enemy.id}) at (${enemy.x}, ${enemy.y}) attacked ${target.heroName} [INVULNERABLE]`);
                    continue;
                }

                if (target.parryRounds > 0) {
                    applyIncomingDamage(target, enemy.meleeDmg || 3, { attacker: enemy, melee: true });
                    continue;
                }

                // КАЗНЬ ОХОТНИКА ЗА ГОЛОВАМИ (HEADHUNTER_EXECUTE)
                let executeLimit = enemy.executeThreshold || (enemy.type === 'headhunter' ? 0.25 : 0);
                if (executeLimit > 0 && (target.hp / target.maxHp <= executeLimit)) {
                    logAction(Date.now(), `🪓 EXECUTE [Headhunter Execute]: [${enemy.name}] delivers a finishing blow and executes wounded ${target.heroName}!`);
                    logDebug('HEADHUNTER_EXECUTE', `Headhunter (#${enemy.id}) executed ${target.heroName} [HP: ${target.hp}/${target.maxHp}]`);
                    setCombatHp(target, 0);
                    applyDeathOrSurvival(target);
                    continue;
                }

                // Пассивка Иллианы: Elvish Nimbleness (40% шанс уклониться в ближнем бою)
                if (target.skills.includes("nimbleness") && random() < 0.40) {
                    logAction(Date.now(), `🍃 DODGE: Illiana nimbly evaded the attack from [${enemy.name}]!`);
                    logDebug('ENEMY_ATK', `[${enemy.name}] (#${enemy.id}) attacked Illiana [DODGED]`);
                    continue;
                }

                // Пассивка Джеральда: Hardened Steel (блок щитом от ловкости)
                if (target.skills.includes("steel")) {
                    let dexMod = getModifier(target.stats.dex);
                    if (random() * 100 < (30 + (dexMod * 5))) {
                        logAction(Date.now(), `🛡️ SHIELD BLOCK: ${target.heroName} blocked the melee attack from [${enemy.name}]!`);
                        logDebug('ENEMY_ATK', `[${enemy.name}] (#${enemy.id}) attacked ${target.heroName} [SHIELD BLOCK]`);
                        continue;
                    }
                }

                let baseEnemyDmg = enemy.meleeDmg || (enemy.name.includes("Guard") ? 5 : enemy.name.includes("Blade") ? 4 : 3);
                if (enemy.hasDisadvantage) {
                    enemy.hasDisadvantage = false;
                    baseEnemyDmg = Math.max(1, Math.round(baseEnemyDmg * 0.5));
                    logAction(Date.now(), `☀️ DISADVANTAGE: Blinded by the Smiting Ray, the attack from [${enemy.name}] is weakened by 50%!`);
                }
                if (enemy.name.includes("Archer")) {
                    baseEnemyDmg = 2; // В упор лучник бьет кинжалом
                    logAction(Date.now(), `⚔️ POINT BLANK: [${enemy.name}] drew a dagger and wounded ${target.heroName} for ${baseEnemyDmg} at point blank!`);
                }

                const isTorghar = target.heroKey === 'torghar';

                // 3. Пассивка Торгара: Spiked Plate (возврат 3 пронзающего урона в ближнем бою)
                if (isTorghar && target.skills.includes("spiked_plate")) {
                    let thornsDmg = 3;
                    mobTraits.damage(enemy,thornsDmg);
                    logAction(Date.now(), `🌵 THORNS [Spiked Plate]: Torghar's armor thorns wounded [${enemy.name}] for ${thornsDmg} piercing damage!`);
                    logDebug('THORNS_HIT', `Torghar Spiked Plate hit [${enemy.name}] (#${enemy.id}) for ${thornsDmg} dmg [Enemy HP: ${enemy.hp}]`);
                    if (enemy.hp <= 0) {
                        gameState.gold += enemy.reward;
                        logAction(Date.now(), `💀 [${enemy.name}] was impaled on Torghar's thorns! Treasury +${enemy.reward}💰.`);
                        logDebug('TOWER_KILL', `Enemy [${enemy.name}] (#${enemy.id}) killed by Torghar thorns (+${enemy.reward}💰)`);
                        resolveEnemyDeath(enemy);
                        gameState.enemies = gameState.enemies.filter(e => e.id !== enemy.id);
                        return;
                    }
                }

                const oldHp = target.hp;
                baseEnemyDmg = applyIncomingDamage(target, baseEnemyDmg, { attacker: enemy, melee: true });
                if (baseEnemyDmg > 0) {
                    logAction(Date.now(), `🩸 [Enemy]: [${enemy.name}] deals ${target.heroName} ${baseEnemyDmg} melee damage.`, { type: 'playerHp', pName: target.name, oldHp });
                }

                logDebug('ENEMY_ATK', `[${enemy.name}] (#${enemy.id}) at (${enemy.x}, ${enemy.y}) attacked at point blank ${target.heroName}: damage=${baseEnemyDmg}, HP: ${oldHp} -> ${target.hp}`);

                applyDeathOrSurvival(target);
            }
            return; // Завершение фазы ближней атаки врага
        }

        if (assigned.length > 0) return; // Враг занят солдатом и не стреляет вторым действием.

        // --- 2. РЕЖИМ ДАЛЬНЕГО БОЯ (ТЕНЕВЫЕ ЛУЧНИКИ И ШАМАНЫ) ---
        // Стреляют РОВНО В ОДНОГО героя на дистанции от 2 до range клеток
        if (enemy.isRanged) {
            let enemyRange = enemy.range || 4;
            let rangedTargets = Object.values(gameState.players).filter(p => {
                if (p.hp <= 0 || p.deathTimer > 0) return false;
                let d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
                return d >= 1.5 && d <= (enemyRange + 0.5);
            });

            if (rangedTargets.length > 0) {
                let rTargetReason = "lowestHp";
                let rTarget = rangedTargets.find(p => p.name === enemy.lastAttackerId);
                if (rTarget) {
                    rTargetReason = "lastAttackerId (aggro)";
                } else {
                    rangedTargets.sort((a, b) => a.hp - b.hp);
                    rTarget = rangedTargets[0];
                }

                // ПРОВЕРКА НЕУЯЗВИМОСТИ КОННОРА
                if (rTarget.invulnerableRounds && rTarget.invulnerableRounds > 0) {
                    logAction(Date.now(), `🛡️ INVULNERABLE: The shot from [${enemy.name}] bounced off the impenetrable armor of ${rTarget.heroName}!`);
                    logDebug('ENEMY_ATK', `[${enemy.name}] (#${enemy.id}) ranged shot at ${rTarget.heroName} [INVULNERABLE]`);
                    return;
                }

                const oldHp = rTarget.hp;
                const enemyDmg = applyIncomingDamage(rTarget, enemy.rangedDmg || 6, { attacker: enemy });
                if (enemyDmg > 0) {
                    logAction(Date.now(), `🏹 SHOT: [${enemy.name}] wounded ${rTarget.heroName} for ${enemyDmg} damage! (HP: ${rTarget.hp}/${rTarget.maxHp})`, { type: 'playerHp', pName: rTarget.name, oldHp });
                }

                logDebug('ENEMY_ATK', `[${enemy.name}] (#${enemy.id}) ranged shot at ${rTarget.heroName} (${rTargetReason}): damage=${enemyDmg}, HP: ${oldHp} -> ${rTarget.hp}`);

                applyDeathOrSurvival(rTarget);
            }
        }
    });

    // ФАЗА СХВАТКИ СОЛДАТ КАЗАРМ С ВРАГАМИ
    (gameState.soldiers || []).forEach(soldier => {
        if (soldier.hp <= 0 || soldier.respawnTimer > 0) return;

        let [tx, ty] = (soldier.towerKey || "").split(',').map(Number);
        let sCell = (tx !== undefined && ty !== undefined && gameState.grid[ty]) ? gameState.grid[ty][tx] : null;
        let sUpgrades = (sCell && sCell.upgrades) ? sCell.upgrades : [];

        towerCombat.beforeSoldierCombat(soldier, sUpgrades);

        let engagedEnemies = gameState.enemies.filter(enemy => 
            enemy.hp > 0 &&
            ((soldier.blockedEnemyIds && soldier.blockedEnemyIds.includes(enemy.id)) || (enemy.x === soldier.x && enemy.y === soldier.y && !enemy.isFlying))
        );

        engagedEnemies.forEach(enemy => {
            if (enemy.eventKind) return;
            if (soldier.hp <= 0 || enemy.hp <= 0 || enemy.stunTurns > 0 || !(meleeAssignments.get(enemy.id) || []).includes(soldier)) return;
            if (enemy.isPolymorphed || (enemy.polymorphTurns && enemy.polymorphTurns > 0)) {
                logDebug('SHEEP_BLEAT', `Enemy [${enemy.name}] (#${enemy.id}) is a sheep, bleating and unable to attack a soldier`);
                return;
            }

            if (enemy.aoeCleave) {
                logDebug('OGRE_CLEAVE', `Ogre (#${enemy.id}) hit soldier with cleave (#${soldier.id}) at (${soldier.x}, ${soldier.y})`);
            }

            // КАЗНЬ ОХОТНИКА ЗА ГОЛОВАМИ ПО СОЛДАТАМ (HEADHUNTER_EXECUTE)
            let executeLimit = enemy.executeThreshold || (enemy.type === 'headhunter' ? 0.25 : 0);
            if (executeLimit > 0 && (soldier.hp / soldier.maxHp <= executeLimit)) {
                setCombatHp(soldier, 0);
                logAction(Date.now(), `🪓 EXECUTE [Headhunter Execute]: [${enemy.name}] beheaded a garrison soldier!`);
                logDebug('HEADHUNTER_EXECUTE', `Headhunter (#${enemy.id}) executed soldier (#${soldier.id}) [HP: ${soldier.hp}/${soldier.maxHp}]`);
                let proto = GAME_DATA.towers[soldier.towerType] || { respawnTurns: 2 };
                soldier.respawnTimer = proto.respawnTurns || 2;
                soldier.blockedEnemyIds = [];
                return;
            }

            let baseEnemyDmg = enemy.meleeDmg || 3;
            if (enemy.name && enemy.name.includes("Archer")) baseEnemyDmg = 2;
            if (enemy.hasDisadvantage) {
                enemy.hasDisadvantage = false;
                baseEnemyDmg = Math.max(1, Math.round(baseEnemyDmg * 0.5));
                logAction(Date.now(), `☀️ DISADVANTAGE: Blinded by the Smiting Ray, the attack from [${enemy.name}] is weakened by 50%!`);
            }

            let actualDmg = 0;

            const isShieldBlocked = towerCombat.blocksSoldierHit(soldier, sUpgrades, enemy);

            if (!isShieldBlocked) {
                actualDmg = applyIncomingDamage(soldier, baseEnemyDmg, { attacker: enemy, melee: true });
                logAction(Date.now(), `⚔️ CLASH: [${enemy.name}] attacked a garrison soldier for ${actualDmg} physical damage (armor: ${soldier.armor}%). HP: ${soldier.hp}/${soldier.maxHp}`);
            }

            if (soldier.hp <= 0) {
                if (soldier.isSkeleton) {
                    soldier.blockedEnemyIds = [];
                    logAction(Date.now(), `💀 DUST: ${soldier.name} crumbled to dust!`);
                } else {
                    let proto = GAME_DATA.towers[soldier.towerType] || { respawnTurns: 2 };
                    soldier.respawnTimer = proto.respawnTurns || 2;
                    soldier.blockedEnemyIds = [];
                    logAction(Date.now(), `💀 FALLEN WARRIOR: A garrison soldier fell in battle! Respawns in ${soldier.respawnTimer} turns.`);
                }
            }
        });

        // Ответный удар солдата, если он выжил
        if (soldier.hp > 0 && engagedEnemies.length > 0) {
            let targetEnemy = engagedEnemies[0];
            if (targetEnemy && targetEnemy.hp > 0) {
                if (targetEnemy.dodgeChance && random() * 100 < targetEnemy.dodgeChance) {
                    logAction(Date.now(), `💨 DODGE: [${targetEnemy.name}] dodged a garrison soldier's attack!`);
                    logDebug('ENEMY_DODGE', `[${targetEnemy.name}] (#${targetEnemy.id}) dodged soldier's attack (#${soldier.id})`);
                } else {
                    let sDmg = soldier.dmg || 3;
                    let targetArmor = Math.min(100, (targetEnemy.armor || 0) + ACTIVATED_EVENT_RULES.auraBonus(gameState, targetEnemy, 'armor'));
                    let calculatedDmg = Math.max(1, Math.round(sDmg * ((100 - targetArmor) / 100)));
                    mobTraits.damage(targetEnemy,calculatedDmg);
                    logAction(Date.now(), `🗡️ SOLDIER STRIKE: A garrison soldier hit [${targetEnemy.name}] ${calculatedDmg} physical damage!`);

                    if (targetEnemy.hp <= 0) {
                        gameState.gold += targetEnemy.reward;
                        logAction(Date.now(), `💀 [${targetEnemy.name}] was destroyed by a garrison soldier! Treasury +${targetEnemy.reward}💰.`);

                        towerCombat.onSoldierKill(soldier, sUpgrades);

                        resolveEnemyDeath(targetEnemy);
                        gameState.enemies = gameState.enemies.filter(e => e.id !== targetEnemy.id);
                    }
                }
            }
        }
    });

    // Настраиваемые способности любых типов мобов.
    mobTraits.abilities();

    // Снимаем один ход с таймеров статусов врагов
    gameState.enemies.forEach(enemy => {
        if (enemy.stunTurns > 0) enemy.stunTurns--;
        if (enemy.slowTurns > 0) enemy.slowTurns--;
    });

    // Защитные эффекты действуют весь ход врагов, затем теряют один раунд.
    Object.values(gameState.players).forEach(p => {
        // Автоматически уменьшаем таймеры неуязвимости (ульта Коннора и Торгара)
        if (p.invulnerableRounds && p.invulnerableRounds > 0) {
            p.invulnerableRounds--;
            if (p.invulnerableRounds === 0) {
                if (p.heroKey === 'torghar' || p.heroName.includes("Torghar")) {
                    p.blockLimit = p.blockLimitBeforeUltimate ?? 3;
                    delete p.blockLimitBeforeUltimate;
                    refreshHeroBlocks(p);
                    logAction(Date.now(), `🛡️ Ultimate effect [Undying Bastion] on ${p.heroName} ended (block limit: ${p.blockLimit}).`);
                } else {
                    logAction(Date.now(), `🛡️ Invulnerability effect [Templar Rage] on ${p.heroName} has ended.`);
                }
            }
        }

        // Таймер Стены Щитов Торгара (Shield Wall)
        if (p.shieldWallRounds && p.shieldWallRounds > 0) {
            p.shieldWallRounds--;
            if (p.shieldWallRounds === 0) {
                p.armor = Math.max(0, (p.armor || 0) - (p.shieldWallArmorBonus ?? 25));
                delete p.shieldWallArmorBonus;
                logAction(Date.now(), `🛡️ SHIELD WALL: Effect [Shield Wall] on ${p.heroName} ended (armor reduced to ${p.armor}%).`);
                logDebug('SHIELD_WALL_EXPIRE', `${p.heroName} Shield Wall expired, armor=${p.armor}%`);
            }
        }

        if (p.speedBonusRounds > 0 && --p.speedBonusRounds === 0) p.speedBonus = 0;
        if (p.parryRounds > 0 && --p.parryRounds === 0) p.parryDamage = 0;
    });

    // Пассивные эффекты башен в конце хода волны
    processDwarvenMinesIncome();
    processPriestessHealPrayer();

    // Снятие 1 хода с баффов урона башен
    let ghGrid = gameState.gridHeight || 16, gwGrid = gameState.gridWidth || 16;
    for (let by = 0; by < ghGrid; by++) {
        for (let bx = 0; bx < gwGrid; bx++) {
            let c = gameState.grid[by] && gameState.grid[by][bx];
            if (c && c.damageBuffTurns > 0) {
                c.damageBuffTurns--;
                if (c.damageBuffTurns <= 0) c.damageBuffMultiplier = 1;
            }
        }
    }

    // Удаление погибших скелетов
        // Return dwarves to mine if no enemies within 1 cell
    (gameState.soldiers || []).forEach(s => {
        if (s.towerType && s.towerType.startsWith('dwarf_') && !s.inMine && s.hp > 0 && s.respawnTimer === 0) {
            let [tx, ty] = s.towerKey.split(',').map(Number);
            let hasNearbyEnemy = gameState.enemies.some(e => e.hp > 0 && Math.max(Math.abs(s.x - e.x), Math.abs(s.y - e.y)) <= 1);
            if (!hasNearbyEnemy) {
                s.inMine = true;
                s.x = tx;
                s.y = ty;
                s.blockedEnemyIds = [];
                logAction(Date.now(), `⛏️ RETURN TO MINE: The road is clear! Dwarf returned to the mine at (${tx}, ${ty}) to extract ore.`);
            }
        }
    });

    // Удаление погибших скелетов
    gameState.soldiers = (gameState.soldiers || []).filter(s => !s.isSkeleton || s.hp > 0);

    gameState.enemies = gameState.enemies.filter(e => e.hp > 0);
    logAction(Date.now(), "🚶 Wave turn completed. It is now the Heroes' turn.");
    
    activatedEvents?.endRound();
    gameState.phase = 'player';
    if (!gameState.enemies.some(enemy => enemy.eventKind !== 'goldenGoblin') && !(gameState.pendingSpawns || []).length) {
        resetWaveBonuses();
        logAction(Date.now(), `🎉 WAVE CLEARED: All enemies on the map have been defeated! The team can prepare for the next wave.`);
    }

    broadcastState();
}

return { moveEnemies };
};
