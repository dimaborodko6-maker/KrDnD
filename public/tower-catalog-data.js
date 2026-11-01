'use strict';

/**
 * КАТАЛОГ НОВЫХ БАШЕН И ВЕТОК РАЗВИТИЯ
 * Спецификация согласована:
 * - Дворфы: 1 прямая линия (I ➔ IV), шахта с пассивным доходом, броня до 20%, урон в ближнем бою.
 * - Некромант: 1 прямая линия (I ➔ IV), магический урон, призыв скелетов, ядовитая трясина.
 * - Королевский Маг: Развилка на IV уровне на Придворного Мага (AoE/тройная атака) и Жрицу Света (хил живых 1d4+3).
 * - Поддержка флага hiddenFromPlayers для скрытия башни мастером.
 */

const TOWER_CATALOG_DATA = (() => {
    const TOWERS = {
        // ==================== ⛏️ АВАНПОСТ ДВОРФОВ (1 ПРЯМАЯ ЛИНИЯ) ====================
        dwarf_1: {
            name: "Dwarven Outpost I",
            cost: 70,
            range: 2,
            initiative: 12,
            soldierCount: 3,
            soldierHp: 40,
            soldierArmor: 5,
            soldierDmg: 4,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#8d6e63",
            shortName: "⛏️I",
            next: 'dwarf_2',
            progressionType: 'single', // 1 прямая линия
            goldPerRound: 4,
            description: "3 miners: 40 HP, 5% armor, 4 damage. Mines +4 G per turn while no enemies are within range."
        },
        dwarf_2: {
            name: "Dwarven Infantry II",
            cost: 65,
            range: 2,
            initiative: 13,
            soldierCount: 3,
            soldierHp: 65,
            soldierArmor: 10,
            soldierDmg: 7,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#795548",
            shortName: "⛏️II",
            next: 'dwarf_3',
            progressionType: 'single',
            goldPerRound: 7,
            description: "3 infantrymen: 65 HP, 10% armor, 7 damage. Mines +7 G per turn while no enemies are within range."
        },
        dwarf_3: {
            name: "Dwarven Clan Guards III",
            cost: 100,
            range: 2,
            initiative: 14,
            soldierCount: 3,
            soldierHp: 100,
            soldierArmor: 15,
            soldierDmg: 12,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#5d4037",
            shortName: "⛏️III",
            next: 'dwarf_4',
            progressionType: 'single',
            goldPerRound: 10,
            description: "3 guards: 100 HP, 15% armor, 12 damage. Mines +10 G per turn while no enemies are within range."
        },
        dwarf_4: {
            name: "Dwarven Mountain Stronghold IV",
            cost: 235,
            range: 3,
            initiative: 15,
            soldierCount: 3,
            soldierHp: 150,
            soldierArmor: 20,
            soldierDmg: 18,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#3e2723",
            shortName: "⛏️IV",
            next: null,
            progressionType: 'single',
            goldPerRound: 15,
            description: "3 veterans: 150 HP, 20% armor, 18 damage. Mine produces +15 G per turn. Vein, stun and powder upgrades available.",
            upgrades: [
                {
                    id: 'dwarf_deep_mine',
                    name: 'Deep Vein',
                    cost: 120,
                    icon: '💰',
                    desc: '25% chance to mine double gold per turn (30 G), 5% chance to mine triple (45 G).'
                },
                {
                    id: 'dwarf_surprise_strike',
                    name: 'Surprise Appearance',
                    cost: 130,
                    icon: '⚡',
                    cooldown: 4,
                    desc: 'When leaving the mine, a dwarf surprises an enemy and stuns it for the next wave turn.'
                },
                {
                    id: 'dwarf_blast_keg',
                    name: 'Dwarven Powder Keg',
                    cost: 150,
                    icon: '🧨',
                    cooldown: 3,
                    desc: 'Throws a keg at blocked enemies: 20–35 fire damage and a 1-turn stun.'
                }
            ]
        },

        // ==================== 💀 БАШНЯ НЕКРОМАНТА (1 ПРЯМАЯ ЛИНИЯ) ====================
        necro_1: {
            name: "Necromancer Tower I",
            cost: 100,
            range: 3,
            minDamage: 8,
            maxDamage: 12,
            dmgType: 'magic',
            initiative: 10,
            color: "#6a1b9a",
            shortName: "💀I",
            next: 'necro_2',
            progressionType: 'single',
            skeletonLimit: 2,
            description: "Magic beam (8–12). Raises up to 2 skeletons from fallen enemies onto the road."
        },
        necro_2: {
            name: "Necromancer Tower II",
            cost: 100,
            range: 3,
            minDamage: 15,
            maxDamage: 23,
            dmgType: 'magic',
            initiative: 10,
            color: "#4a148c",
            shortName: "💀II",
            next: 'necro_3',
            progressionType: 'single',
            skeletonLimit: 3,
            description: "Magic beam (15–23). Raises up to 3 skeletons from fallen enemies."
        },
        necro_3: {
            name: "Necromancer Tower III",
            cost: 140,
            range: 3,
            minDamage: 25,
            maxDamage: 39,
            dmgType: 'magic',
            initiative: 11,
            color: "#311b92",
            shortName: "💀III",
            next: 'necro_4',
            progressionType: 'single',
            skeletonLimit: 4,
            description: "Magic beam (25–39). Raises up to 4 skeletons from fallen enemies."
        },
        necro_4: {
            name: "Archnecromancer Ziggurat IV",
            cost: 180,
            range: 3,
            minDamage: 38,
            maxDamage: 58,
            dmgType: 'magic',
            initiative: 12,
            color: "#1a0033",
            shortName: "💀IV",
            next: null,
            progressionType: 'single',
            skeletonLimit: 4,
            description: "Magic beam (38–58). Toxic Mire, a limit of 7 skeletons and Bone Knight available.",
            upgrades: [
                {
                    id: 'necro_poison_mire',
                    name: 'Toxic Mire',
                    cost: 150,
                    icon: '☠️',
                    cooldown: 6,
                    desc: 'Every 6 rounds, poisons a road cell for 3 turns. Deals 15 true DoT damage to everyone on it.'
                },
                {
                    id: 'necro_extra_shovels',
                    name: 'Extra Shovels',
                    cost: 130,
                    icon: '🦴',
                    desc: 'Increases the undead limit to 7 simultaneous skeletons.'
                },
                {
                    id: 'necro_bone_knight',
                    name: 'Bone Knight',
                    cost: 160,
                    icon: '⚔️',
                    desc: 'The first skeleton is summoned as a heavy Knight (55 HP, 30% armor, blocks 2 enemies, 12 damage).'
                }
            ]
        },

        // ==================== 🔮 КОРОЛЕВСКИЙ МАГ (РАЗВИЛКА НА IV УРОВНЕ) ====================
        royal_mage_1: {
            name: "Royal Mage I",
            cost: 100,
            range: 3,
            minDamage: 10,
            maxDamage: 18,
            dmgType: 'magic',
            initiative: 12,
            color: "#3f51b5",
            shortName: "✨I",
            next: 'royal_mage_2',
            progressionType: 'branch', // Развилка на IV
            description: "Magic bolts (10–18, range 3). Bypasses physical armor."
        },
        royal_mage_2: {
            name: "Royal Mage II",
            cost: 100,
            range: 3,
            minDamage: 22,
            maxDamage: 34,
            dmgType: 'magic',
            initiative: 13,
            color: "#303f9f",
            shortName: "✨II",
            next: 'royal_mage_3',
            progressionType: 'branch',
            description: "Magic bolts (22–34, range 3)."
        },
        royal_mage_3: {
            name: "Royal Mage III",
            cost: 140,
            range: 3,
            minDamage: 36,
            maxDamage: 54,
            dmgType: 'magic',
            initiative: 14,
            color: "#1a237e",
            shortName: "✨III",
            next: ['mage_court', 'mage_priestess'],
            progressionType: 'branch',
            description: "Magic bolts (36–54). Level IV branches: Court Mage or Priestess of Light."
        },
        mage_court: {
            name: "Court Mage IV",
            cost: 175,
            range: 4,
            minDamage: 50,
            maxDamage: 80,
            dmgType: 'magic',
            initiative: 16,
            color: "#7b1fa2",
            shortName: "🧙‍♂️IV",
            next: null,
            progressionType: 'branch',
            description: "Long-range magic damage (50–80, range 4). Triple attack and tower damage aura available.",
            upgrades: [
                {
                    id: 'court_old_tome',
                    name: 'Old Spellbook',
                    cost: 150,
                    icon: '📖',
                    cooldown: 5,
                    desc: 'Every 5 turns, makes 3 consecutive attacks in one wave turn.'
                },
                {
                    id: 'court_resonance',
                    name: 'Magic Resonance',
                    cost: 140,
                    icon: '🔮',
                    cooldown: 4,
                    desc: 'Increases the damage of all allied towers within range by +25% for 2 turns.'
                }
            ]
        },
        mage_priestess: {
            name: "Priestess of Light Sanctuary IV",
            cost: 130,
            range: 3,
            minDamage: 24,
            maxDamage: 38,
            dmgType: 'magic',
            initiative: 12,
            color: "#fff9c4",
            shortName: "🕊️IV",
            next: null,
            progressionType: 'branch',
            description: "Magic light (24–38). Heals living allies, removes debuffs and smites blocked enemies.",
            upgrades: [
                {
                    id: 'priestess_heal_prayer',
                    name: 'Healing Prayer',
                    cost: 130,
                    icon: '💖',
                    desc: 'At the end of each round, restores 1d4+3 HP to all living allies within 2 cells (does not heal skeletons).'
                },
                {
                    id: 'priestess_cleanse',
                    name: 'Cleansing Blessing',
                    cost: 120,
                    icon: '🌿',
                    cooldown: 3,
                    desc: 'Removes poison, stun, bleeding and slow from all allies within range.'
                },
                {
                    id: 'priestess_radiant_smite',
                    name: 'Smiting Ray',
                    cost: 140,
                    icon: '☀️',
                    cooldown: 2,
                    desc: 'When an enemy is blocked, hits it for 20 magic damage and gives its next attack disadvantage.'
                }
            ]
        },

        // ==================== 🏹 CROSSBOW FORT (1 DIRECT LINE) ====================
        crossbow_1: {
            name: "Crossbow Post I",
            cost: 70,
            range: 3,
            minDamage: 4,
            maxDamage: 7,
            dmgType: 'phys',
            initiative: 18,
            color: "#8d6e63",
            shortName: "🏹X1",
            next: 'crossbow_2',
            progressionType: 'single',
            description: "High-speed ballista (initiative 18). Range 3 cells, physical damage 4–7. Hits ground and flying enemies."
        },
        crossbow_2: {
            name: "Heavy Ballista II",
            cost: 100,
            range: 4,
            minDamage: 8,
            maxDamage: 14,
            dmgType: 'phys',
            initiative: 19,
            color: "#6d4c41",
            shortName: "🏹X2",
            next: 'crossbow_3',
            progressionType: 'single',
            description: "Heavy arbalest battery (initiative 19). Range 4 cells, physical damage 8–14."
        },
        crossbow_3: {
            name: "Arbalest Battery III",
            cost: 150,
            range: 4,
            minDamage: 15,
            maxDamage: 24,
            dmgType: 'phys',
            initiative: 19,
            color: "#4e342e",
            shortName: "🏹X3",
            next: 'crossbow_4',
            progressionType: 'single',
            description: "Repeating heavy crossbow battery (initiative 19, range 4 cells). Physical damage 15–24. Unlocks level IV fortification."
        },
        crossbow_4: {
            name: "Crossbow Fort IV",
            cost: 230,
            range: 5,
            minDamage: 20,
            maxDamage: 30,
            dmgType: 'phys',
            initiative: 20,
            color: "#3e2723",
            shortName: "🏰X4",
            next: null,
            progressionType: 'single',
            description: "Elite ballista fortress (initiative 20, range 5). Rapid fire (20–30 damage). Barrage and Falconer upgrades available.",
            upgrades: [
                {
                    id: 'crossbow_barrage',
                    name: 'Crossbow Barrage',
                    cost: 160,
                    icon: '🏹',
                    cooldown: 3,
                    desc: 'Every 3 rounds, fires a rapid burst of 2 additional bolts at the target.'
                },
                {
                    id: 'crossbow_falconer',
                    name: 'Falconer',
                    cost: 180,
                    icon: '🦅',
                    desc: 'A trained scouting falcon increases the attack range of all allied shooting and magic towers within 4 cells by +1 cell.'
                }
            ]
        },

        // ==================== 🌋 DWAARP SEISMIC ENGINE (1 DIRECT LINE) ====================
        dwaarp_1: {
            name: "Mining Drill I",
            cost: 125,
            range: 2,
            minDamage: 10,
            maxDamage: 20,
            dmgType: 'phys',
            initiative: 8,
            noAir: true,
            color: "#d84315",
            shortName: "🌋I",
            next: 'dwaarp_2',
            progressionType: 'single',
            description: "Heavy seismic drill (initiative 8, range 2 cells). Ground shockwaves deal 10–20 physical damage to all ground enemies in range."
        },
        dwaarp_2: {
            name: "Steam Crusher II",
            cost: 220,
            range: 2,
            minDamage: 22,
            maxDamage: 40,
            dmgType: 'phys',
            initiative: 7,
            noAir: true,
            color: "#bf360c",
            shortName: "🌋II",
            next: 'dwaarp_3',
            progressionType: 'single',
            description: "Steam-powered seismic crusher (initiative 7, range 2 cells). Ground shockwaves deal 22–40 physical damage to all ground enemies in range."
        },
        dwaarp_3: {
            name: "Magma Engine III",
            cost: 320,
            range: 2,
            minDamage: 38,
            maxDamage: 65,
            dmgType: 'phys',
            initiative: 7,
            noAir: true,
            color: "#870000",
            shortName: "🌋III",
            next: 'dwaarp_4',
            progressionType: 'single',
            description: "Deep-crust magma engine (initiative 7, range 2 cells). Ground shockwaves deal 38–65 physical damage to all ground enemies in range."
        },
        dwaarp_4: {
            name: "DWAARP Seismic Engine IV",
            cost: 400,
            range: 2,
            minDamage: 60,
            maxDamage: 100,
            dmgType: 'phys',
            initiative: 6,
            noAir: true,
            color: "#3e2723",
            shortName: "🌋IV",
            next: null,
            progressionType: 'single',
            description: "Ultimate Dwarven seismic weapon (initiative 6, range 2 cells). Shockwaves deal 60–100 physical damage to all ground enemies. Core Drill and Furnace Blast available.",
            upgrades: [
                {
                    id: 'dwaarp_drill',
                    name: 'Core Drill',
                    cost: 240,
                    icon: '⛏️',
                    cooldown: 4,
                    desc: 'Every 4 rounds, drills into the strongest ground enemy in range: instantly eliminates normal enemies; deals 180 true damage to bosses.'
                },
                {
                    id: 'dwaarp_furnace',
                    name: 'Furnace Blast',
                    cost: 190,
                    icon: '🔥',
                    cooldown: 3,
                    desc: 'Every 3 rounds, vents superheated magma onto adjacent road cells, dealing 10 fire damage for 2 turns to passing enemies.'
                }
            ]
        },

        // ==================== ⚔️ KNIGHTS TEMPLAR (1 DIRECT LINE) ====================
        templar_1: {
            name: "Templar Novices I",
            cost: 70,
            range: 2,
            initiative: 12,
            soldierCount: 3,
            soldierHp: 45,
            soldierArmor: 25,
            soldierDmg: 4,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#c62828",
            shortName: "⚔️T1",
            next: 'templar_2',
            progressionType: 'single',
            description: "3 templar novices: 45 HP, 25% armor, 4 physical damage (initiative 12). Dedicated defenders of the realm."
        },
        templar_2: {
            name: "Crusader Barracks II",
            cost: 110,
            range: 2,
            initiative: 14,
            soldierCount: 3,
            soldierHp: 70,
            soldierArmor: 35,
            soldierDmg: 6,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#b71c1c",
            shortName: "⚔️T2",
            next: 'templar_3',
            progressionType: 'single',
            description: "3 crusaders: 70 HP, 35% armor, 6 physical damage (initiative 14). Sturdy defensive frontline."
        },
        templar_3: {
            name: "Knight Chapter III",
            cost: 160,
            range: 3,
            initiative: 16,
            soldierCount: 3,
            soldierHp: 100,
            soldierArmor: 45,
            soldierDmg: 10,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#880e4f",
            shortName: "⚔️T3",
            next: 'templar_4',
            progressionType: 'single',
            description: "3 chapter knights: 100 HP, 45% armor, 10 physical damage (initiative 16). Unlocks Knights Templar."
        },
        templar_4: {
            name: "Knights Templar IV",
            cost: 230,
            range: 3,
            initiative: 18,
            soldierCount: 3,
            soldierHp: 140,
            soldierArmor: 50,
            soldierDmg: 16,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#d32f2f",
            shortName: "⚔️T4",
            next: null,
            progressionType: 'single',
            description: "3 elite Knights Templar: 140 HP, 50% armor, 16 damage (initiative 18). Arterial Strike, Holy Grail and Toughness upgrades available.",
            upgrades: [
                {
                    id: 'templar_arterial',
                    name: 'Arterial Strike',
                    cost: 160,
                    icon: '🩸',
                    desc: 'Templar attacks have a 30% chance to deal double damage and inflict bleeding for 2 turns (6 physical DoT per turn).'
                },
                {
                    id: 'templar_grail',
                    name: 'Holy Grail',
                    cost: 180,
                    icon: '🏆',
                    desc: 'When a Templar suffers a fatal blow, there is a 40% chance divine grace revives him immediately with 50% maximum HP.'
                },
                {
                    id: 'templar_toughness',
                    name: 'Toughness',
                    cost: 140,
                    icon: '🛡️',
                    desc: 'Increases the maximum HP of all 3 Templars by +30 (up to 170 HP).'
                }
            ]
        }
    };

    /**
     * Возвращает полный объединенный каталог башен
     */
    function getAllTowers(baseTowers = {}) {
        return { ...baseTowers, ...TOWERS };
    }

    /**
     * Возвращает список башен, видимых игрокам (с фильтрацией hiddenFromPlayers)
     */
    function getPlayerVisibleTowers(allTowers) {
        const res = {};
        for (const [key, tower] of Object.entries(allTowers)) {
            if (!tower.hiddenFromPlayers) {
                res[key] = tower;
            }
        }
        return res;
    }

    return {
        TOWERS,
        getAllTowers,
        getPlayerVisibleTowers
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TOWER_CATALOG_DATA;
} else {
    window.TOWER_CATALOG_DATA = TOWER_CATALOG_DATA;
    if (window.GAME_DATA && window.GAME_DATA.towers) {
        Object.assign(window.GAME_DATA.towers, TOWER_CATALOG_DATA.TOWERS);
    }
}
