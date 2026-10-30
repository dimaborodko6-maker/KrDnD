'use strict';

// ═══════════════════════════════════════════════════════════════════════════════
// BALANCE — unified configuration of game constants (magic numbers).
// Extracted from server.js and tower-abilities.js for centralized balancing.
// Works in both Node.js (CommonJS) and browser environments.
// ═══════════════════════════════════════════════════════════════════════════════

const BALANCE = {
    // ─── Heroes: Death & Revival ──────────────────────────────────────────
    hero: {
        respawnTime: 2,              // Turns until hero revival (server.js:619)
        grailRespawnTime: 1,         // Turns until revival with Grail (immediately cleared) (server.js:619)
        grailHealRatio: 0.7,         // Fraction of maxHp restored upon Grail revival (server.js:621)
    },

    // ─── Heroes: Passive Abilities ─────────────────────────────────────────
    heroPassives: {
        // Torghar: Flat reduction of incoming damage
        torgharFlatReduction: 3,     // server.js:240

        // Gerald: Minimum armor threshold
        geraldMinArmor: 30,          // server.js:241

        // Gerald: Battle Vigor (HP regen per round)
        vigorBaseHeal: 2,            // server.js:790 — Math.max(1, 2 + conMod)
        vigorMinHeal: 1,             // server.js:790

        // Ratchet: Triage Aura (auto-heal nearest wounded ally)
        triageAuraHeal: 4,           // server.js:826
        triageAuraRange: 2.05,       // server.js:802,814

        // Ratchet: Nanite Cloud
        naniteCloudHealPerRound: 5,  // server.js:850
        naniteCloudConstructHeal: 10,// server.js:860 (с Construct Repair)
        naniteCloudRange: 2.05,      // server.js:848
        naniteCloudDuration: 3,      // server.js:1771 (раунды)
        naniteCloudManaCost: 6,      // server.js:1722

        // Fated Survivor (survival from lethal damage)
        fatedHpMin: 5,               // server.js:612 — Math.max(5, con * 2)
        fatedHpConMultiplier: 2,     // server.js:612
    },

    // ─── Герои: отдых вне боя ─────────────────────────────────────────────────
    rest: {
        hpBase: 4,                   // server.js:879 — Math.max(3, 4 + conMod)
        hpMin: 3,                    // server.js:879
        manaBase: 3,                 // server.js:880 — Math.max(2, 3 + intMod)
        manaMin: 2,                  // server.js:880
    },

    // ─── Башни: экономика ─────────────────────────────────────────────────────
    tower: {
        refundRatio: 0.6,            // server.js:291 — доля возврата при сносе (в бою)
    },

    // ─── Башни: Arcane Mage (Архимаг) ─────────────────────────────────────────
    arcaneDeath: {
        bossDamageCap: 150,          // tower-abilities.js:26 — урон боссам вместо мгновенного убийства
        instantKillMaxHp: 200,       // tower-abilities.js:33 — maxHp <= 200 для мгновенного убийства
        cooldown: 5,                 // tower-abilities.js:20 — раундов перезарядки
    },

    // ─── Башни: Arcane Teleport (Дестабилизация) ──────────────────────────────
    arcaneTeleport: {
        cooldown: 5,                 // tower-abilities.js:43
        stepBack: 2,                 // tower-abilities.js:48 — на сколько клеток отбросить
    },

    // ─── Башни: Musketeer (Мушкетёр) ─────────────────────────────────────────
    musketeerSniper: {
        bossDamageCap: 150,          // tower-abilities.js:80 — урон боссам вместо ваншота
        instantKillMaxHp: 150,       // tower-abilities.js:83 — maxHp <= 150 для ваншота
        critMultiplier: 3,           // tower-abilities.js:84 — множитель урона для крупных целей
        cooldown: 3,                 // tower-abilities.js:77
        triggerChance: 0.35,         // tower-abilities.js:77
    },
    musketeerShrapnel: {
        armorPiercing: 35,           // tower-abilities.js:86
    },

    // ─── Башни: Tesla (Тесла) ─────────────────────────────────────────────────
    teslaField: {
        damage: 15,                  // tower-abilities.js:10
    },
    teslaChain: {
        baseDamage: 20,              // tower-abilities.js:163
        overchargeDamage: 30,        // tower-abilities.js:163
        baseTargets: 2,              // tower-abilities.js:153
        overchargeTargets: 4,        // tower-abilities.js:153
        chainRange: 2,               // tower-abilities.js:157
        overchargeStunChance: 0.30,  // tower-abilities.js:164
    },

    // ─── Башни: Bertha ────────────────────────────────────────────────────────
    berthaMissiles: {
        damage: 50,                  // tower-abilities.js:64
        fireEveryNRounds: 2,         // tower-abilities.js:61 — каждый 2-й раунд
    },
    berthaNapalm: {
        turns: 2,                    // tower-abilities.js:146
        damage: 10,                  // tower-abilities.js:146
    },

    // ─── Башни: Splash (Артиллерия) ──────────────────────────────────────────
    splash: {
        damageRatio: 0.5,            // tower-abilities.js:91 — доля базового урона
        shrapnelDamageRatio: 0.3,    // tower-abilities.js:91 — доля для шрапнели мушкетёра
    },

    // ─── Башни: Ranger (Следопыт) ─────────────────────────────────────────────
    rangerPoison: {
        turns: 2,                    // tower-abilities.js:116
        damage: 6,                   // tower-abilities.js:116
    },
    rangerRoots: {
        stunTurns: 1,                // tower-abilities.js:121
        triggerEveryNRounds: 3,      // tower-abilities.js:120
    },

    // ─── Башни: Sorcerer (Чародей) ────────────────────────────────────────────
    polymorph: {
        chance: 0.30,                // tower-abilities.js:131
        duration: 2,                 // tower-abilities.js:132
        hpReduction: 0.6,            // tower-abilities.js:134 — 60% от текущих HP
    },

    // ─── Башни: Paladin (Паладин) ─────────────────────────────────────────────
    paladinGrace: {
        hpThreshold: 0.5,            // tower-abilities.js:176 — < 50% HP для активации
        healRatio: 0.5,              // tower-abilities.js:177 — 50% от maxHp
        triggerEveryNRounds: 3,      // tower-abilities.js:176
    },
    paladinShield: {
        blockChance: 0.40,           // tower-abilities.js:185
    },

    // ─── Башни: Barbarian (Варвар) ─────────────────────────────────────────────
    barbarianAxes: {
        damage: 15,                  // tower-abilities.js:200
        range: 2,                    // tower-abilities.js:194 — Chebyshev distance
    },
    barbarianBloodlust: {
        hpHeal: 30,                  // tower-abilities.js:213
        dmgBonus: 5,                 // tower-abilities.js:214
    },

    // ─── Башни: Necromancer (Некромант) ────────────────────────────────────────
    necroPoisonMire: {
        cooldown: 6,                 // tower-abilities.js:222
        puddleTurns: 3,             // tower-abilities.js:227
        puddleDamage: 15,           // tower-abilities.js:227
        poisonTurns: 2,             // tower-abilities.js:228
        poisonDamage: 15,           // tower-abilities.js:229
    },

    // ─── Башни: Court Mage (Придворный Маг) ───────────────────────────────────
    courtResonance: {
        cooldown: 4,                 // tower-abilities.js:239
        damageBuffMultiplier: 1.25,  // tower-abilities.js:250
        buffDuration: 2,             // tower-abilities.js:251
    },
    courtOldTome: {
        cooldown: 5,                 // tower-abilities.js:265
        extraVolleys: 2,             // tower-abilities.js:272 — дополнительных залпов (сверх основного)
    },

    // ─── Башни: Priestess (Жрица Света) ───────────────────────────────────────
    priestessCleanse: {
        cooldown: 3,                 // tower-abilities.js:300
    },
    priestessRadiantSmite: {
        cooldown: 2,                 // tower-abilities.js:334
        damage: 20,                  // tower-abilities.js:342
    },
    priestessHealPrayer: {
        range: 2.85,                 // server.js:700,711
        healDiceSize: 4,             // server.js:701 — 1d4
        healBonus: 3,                // server.js:701 — +3 (итого 1d4+3 = 4..7)
    },

    // ─── Башни: Dwarf (Дворф) ─────────────────────────────────────────────────
    dwarfSurpriseStrike: {
        cooldown: 4,                 // tower-abilities.js:360
        stunTurns: 2,                // tower-abilities.js:366
    },
    dwarfBlastKeg: {
        cooldown: 3,                 // tower-abilities.js:375
        minDamage: 20,               // tower-abilities.js:384
        maxDamage: 35,               // tower-abilities.js:384
        stunTurns: 2,                // tower-abilities.js:386
    },

    // ─── Лимиты истории и логов ───────────────────────────────────────────────
    limits: {
        actionLogMax: 40,            // server.js:177 — максимум записей в actionLogs
        debugLogMax: 200,            // server.js:193 — максимум записей в debugLogs
        rollbackMaxSnapshots: 30,    // server.js:3516 — максимум снимков playerHistory
        rollbackMaxBytes: 16 * 1024 * 1024,  // server.js:3509,3516 — 16 MiB лимит на снимки
    },
};

if (typeof module !== 'undefined' && module.exports) module.exports = BALANCE;
