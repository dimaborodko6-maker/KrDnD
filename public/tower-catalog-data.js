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
