'use strict';
const TRAITS = require('./public/enemy-traits.js');

// Все таймеры привязаны к раунду мира, поэтому сохраняются и откатываются вместе с ним.
module.exports = function enemyTraitsEngine({ getState, getData, createEnemy, damageDefender, deathDefender, log,
    setHp = (unit, hp) => { unit.hp = hp; } }) {
    const state = () => getState();
    const round = () => state().roundCounter || 0;
    const near = (a,b,radius) => Math.hypot(a.x-b.x,a.y-b.y) <= radius;
    const active = enemy => enemy.hp > 0 && !(enemy.stunTurns > 0) && !enemy.isPolymorphed;
    function ensure(enemy) {
        // Старые экземпляры получают только прежние способности шамана / заклинателя.
        if (enemy.traits === undefined) {
            enemy.traits = TRAITS.legacy(enemy.type,enemy.healPower);
            if (enemy.traits.healing && enemy.healCd > 0 && enemy.nextHealRound === undefined) enemy.nextHealRound = round()+enemy.healCd+1;
            if (enemy.traits.summoning && enemy.summonCd > 0 && enemy.nextSummonRound === undefined) enemy.nextSummonRound = round()+enemy.summonCd+1;
        }
        if (enemy.traits.shield && enemy.shieldHp === undefined) {
            enemy.shieldHp = Math.max(1,Math.round(enemy.maxHp * enemy.traits.shield.percent / 100));
        }
        return enemy.traits;
    }
    function damage(enemy, amount) {
        if (enemy.hp <= 0) return 0;
        const traits = ensure(enemy);
        amount = Math.max(0,amount);
        if (!amount) return 0;
        enemy.lastDamageRound = round();
        const absorbed = Math.min(amount,Math.max(0,enemy.shieldHp || 0));
        if (absorbed) {
            enemy.shieldHp -= absorbed;
            log(`🛡️ SHIELD: [${enemy.name}] absorbed ${absorbed} damage (durability ${enemy.shieldHp}).`);
        }
        const lost = Math.min(enemy.hp,amount-absorbed);
        setHp(enemy, Math.max(0,enemy.hp-(amount-absorbed)));
        if (enemy.hp > 0 && traits.berserk && !enemy.rageActive && enemy.hp <= enemy.maxHp * traits.berserk.threshold / 100) {
            enemy.rageActive = true;
            log(`🔥 BERSERK: [${enemy.name}] went berserk!`);
        }
        return lost;
    }
    function auraBonus(enemy) {
        if (enemy.isPolymorphed || enemy.hp <= 0) return 0;
        let bonus = 0;
        for (const leader of state().enemies) {
            if (leader === enemy || !active(leader)) continue;
            const aura = ensure(leader).commander;
            if (aura && near(enemy,leader,aura.radius)) bonus = Math.max(bonus,aura.damagePercent);
        }
        return bonus;
    }
    function attackDamage(enemy, amount) {
        const traits = ensure(enemy);
        const rage = enemy.rageActive && !enemy.isPolymorphed ? traits.berserk?.damagePercent || 0 : 0;
        return Math.round(amount * (1+rage/100) * (1+auraBonus(enemy)/100));
    }
    function speedBonus(enemy) { return enemy.rageActive && !enemy.isPolymorphed ? ensure(enemy).berserk?.speedBonus || 0 : 0; }
    function recovery() {
        for (const enemy of state().enemies) {
            const traits = ensure(enemy);
            if (!active(enemy)) continue;
            const elapsed = enemy.lastDamageRound === undefined ? Infinity : round()-enemy.lastDamageRound;
            if (traits.regeneration && elapsed > traits.regeneration.delay && enemy.hp < enemy.maxHp) {
                const before = enemy.hp;
                setHp(enemy, Math.min(enemy.maxHp,enemy.hp+Math.max(1,Math.round(enemy.maxHp*traits.regeneration.percent/100))));
                log(`💚 REGENERATION: [${enemy.name}] recovered ${enemy.hp-before} HP.`);
            }
            if (traits.shield?.recharge && elapsed > traits.shield.rechargeDelay) {
                enemy.shieldHp = Math.max(1,Math.round(enemy.maxHp*traits.shield.percent/100));
            }
        }
    }
    function abilities() {
        // Новые существа начинают действовать со следующего хода волны.
        for (const enemy of [...state().enemies]) {
            const traits = ensure(enemy);
            if (!active(enemy)) continue;
            const heal = traits.healing;
            if (heal && round() >= (enemy.nextHealRound || 0)) {
                const targets = state().enemies.filter(ally => ally.hp > 0 && ally.hp < ally.maxHp &&
                    (heal.healSelf || ally !== enemy) && near(enemy,ally,heal.radius))
                    .sort((a,b) => a.hp/a.maxHp-b.hp/b.maxHp).slice(0,heal.maxTargets);
                if (targets.length) {
                    for (const ally of targets) setHp(ally, Math.min(ally.maxHp,ally.hp+heal.amount));
                    enemy.nextHealRound = round()+heal.interval;
                    log(`🌿 HEALING: [${enemy.name}] healed ${targets.length} targets for ${heal.amount} HP.`);
                }
            }
            const summon = traits.summoning;
            if (summon && !(enemy.summonGeneration > 0) && round() >= (enemy.nextSummonRound || 0)) {
                const engaged = [...Object.values(state().players),...(state().soldiers || [])].some(unit =>
                    unit.hp > 0 && !(unit.deathTimer > 0) && !(unit.respawnTimer > 0) &&
                    (unit.blockedEnemyIds || []).includes(enemy.id));
                if (summon.blockedStops && engaged) continue;
                // Каталог может удалить тип, который остался только в старом экземпляре на карте.
                if (!Object.hasOwn(getData().enemies,summon.type)) continue;
                const alive = state().enemies.filter(unit => unit.hp > 0 && unit.summonedBy === enemy.id).length;
                const count = Math.min(summon.count,summon.maxAlive-alive,500-state().enemies.length);
                if (count <= 0) continue;
                for (let i=0;i<count;i++) {
                    const child = createEnemy(summon.type,enemy.x,enemy.y);
                    child.summonedBy = enemy.id; child.summonGeneration = 1; child.reward = summon.reward;
                    state().enemies.push(child);
                }
                enemy.nextSummonRound = round()+summon.interval;
                log(`🦅 SUMMON: [${enemy.name}] summoned ${count} × ${getData().enemies[summon.type].name}.`);
            }
        }
    }
    function onDeath(enemy) {
        if (!enemy || enemy.hp > 0 || enemy.traitDeathResolved) return;
        enemy.traitDeathResolved = true;
        if (enemy.escapedToCastle || enemy.isPolymorphed) return;
        const explosion = ensure(enemy).deathExplosion;
        if (!explosion) return;
        const defenders = [...Object.values(state().players),...(state().soldiers || [])];
        for (const target of defenders) {
            if (target.hp <= 0 || target.deathTimer > 0 || target.respawnTimer > 0 || !near(target,enemy,explosion.radius)) continue;
            damageDefender(target,explosion.damage);
            if (Object.values(state().players).includes(target)) deathDefender(target);
            else if (target.hp <= 0) {
                target.respawnTimer = getData().towers[target.towerType]?.respawnTurns || 2;
                target.blockedEnemyIds = [];
            }
        }
        log(`💥 DEATH EXPLOSION: [${enemy.name}] — ${explosion.damage} physical damage within radius ${explosion.radius}.`);
    }
    return { ensure, damage, auraBonus, attackDamage, speedBonus, recovery, abilities, onDeath };
};
