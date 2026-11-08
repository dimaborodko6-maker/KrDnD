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

        // ==================== 🏹 КОРОЛЕВСКИЕ ЛУЧНИКИ (РАЗВИЛКА НА IV УРОВНЕ) ====================
        royal_archer_1: {
            name: "Royal Archers I",
            cost: 70,
            range: 3,
            minDamage: 4,
            maxDamage: 7,
            dmgType: 'phys',
            initiative: 16,
            color: "#8d6e63",
            shortName: "👑🏹I",
            next: 'royal_archer_2',
            progressionType: 'branch',
            description: "Disciplined crown archers (initiative 16, range 3). Physical damage 4–7. Attacks ground and air."
        },
        royal_archer_2: {
            name: "Royal Archers II",
            cost: 100,
            range: 4,
            minDamage: 8,
            maxDamage: 14,
            dmgType: 'phys',
            initiative: 17,
            color: "#6d4c41",
            shortName: "👑🏹II",
            next: 'royal_archer_3',
            progressionType: 'branch',
            description: "Experienced longbowmen (initiative 17, range 4). Physical damage 8–14."
        },
        royal_archer_3: {
            name: "Royal Archers III",
            cost: 150,
            range: 4,
            minDamage: 15,
            maxDamage: 24,
            dmgType: 'phys',
            initiative: 18,
            color: "#5d4037",
            shortName: "👑🏹III",
            next: ['archer_sharpshooter', 'archer_volley'],
            progressionType: 'branch',
            description: "Crown marksmen veterans (initiative 18, range 4). Level IV branches: Crown Sharpshooters or Golden Arbalests."
        },
        archer_sharpshooter: {
            name: "Crown Sharpshooters IV",
            cost: 230,
            range: 5,
            minDamage: 30,
            maxDamage: 45,
            dmgType: 'phys',
            initiative: 19,
            color: "#3e2723",
            shortName: "🎯IV",
            next: null,
            progressionType: 'branch',
            description: "Extreme range (5 cells, initiative 19). Physical damage 30–45. Crown Mark and Eagle Eye Snipe available.",
            upgrades: [
                {
                    id: 'sharpshooter_mark',
                    name: 'Crown Mark',
                    cost: 150,
                    icon: '🎯',
                    cooldown: 3,
                    desc: 'Every 3 rounds, marks the strongest enemy in range for 2 turns (+25% damage from all attacks).'
                },
                {
                    id: 'sharpshooter_snipe',
                    name: 'Eagle Eye Snipe',
                    cost: 160,
                    icon: '🦅',
                    cooldown: 3,
                    desc: 'Every 3 rounds, fires an armor-piercing shot (+50% damage, ignores 50% armor) and grounds flying targets.'
                }
            ]
        },
        archer_volley: {
            name: "Golden Arbalests IV",
            cost: 240,
            range: 4,
            minDamage: 22,
            maxDamage: 34,
            dmgType: 'phys',
            initiative: 17,
            color: "#ffb300",
            shortName: "📯IV",
            next: null,
            progressionType: 'branch',
            description: "Rapid arbalest battery (initiative 17, range 4). Physical damage 22–34. Royal Volley and Armor-Piercing Bolts available.",
            upgrades: [
                {
                    id: 'volley_hail',
                    name: 'Royal Volley',
                    cost: 150,
                    icon: '🌧️',
                    cooldown: 4,
                    desc: 'Every 4 rounds, releases a hail of 5 arrows hitting random enemies in range for 16 physical damage each.'
                },
                {
                    id: 'volley_heavy_bolts',
                    name: 'Armor-Piercing Bolts',
                    cost: 140,
                    icon: '📌',
                    desc: 'Attacks ignore 30% armor and slow the target by 1 cell for 1 round.'
                }
            ]
        },

        // ==================== 🛡️ КОРОЛЕВСКАЯ КАЗАРМА (РАЗВИЛКА НА IV УРОВНЕ) ====================
        royal_barracks_1: {
            name: "Royal Barracks I",
            cost: 75,
            range: 2,
            initiative: 12,
            soldierCount: 3,
            soldierHp: 45,
            soldierArmor: 25,
            soldierDmg: 4,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#455a64",
            shortName: "👑🛡️I",
            next: 'royal_barracks_2',
            progressionType: 'branch',
            description: "3 Crown Guards: 45 HP, 25% armor, 4 physical damage. Holds enemies on the road."
        },
        royal_barracks_2: {
            name: "Royal Barracks II",
            cost: 110,
            range: 2,
            initiative: 13,
            soldierCount: 3,
            soldierHp: 75,
            soldierArmor: 40,
            soldierDmg: 6,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#37474f",
            shortName: "👑🛡️II",
            next: 'royal_barracks_3',
            progressionType: 'branch',
            description: "3 Crown Sergeants: 75 HP, 40% armor, 6 physical damage."
        },
        royal_barracks_3: {
            name: "Royal Barracks III",
            cost: 150,
            range: 2,
            initiative: 14,
            soldierCount: 3,
            soldierHp: 110,
            soldierArmor: 50,
            soldierDmg: 9,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#263238",
            shortName: "👑🛡️III",
            next: ['barracks_royal_guard', 'barracks_royal_champions'],
            progressionType: 'branch',
            description: "3 Crown Veterans: 110 HP, 50% armor, 9 physical damage. Level IV branches: Royal Lion Guard or Royal Champions."
        },
        barracks_royal_guard: {
            name: "Royal Lion Guard IV",
            cost: 220,
            range: 2,
            initiative: 14,
            soldierCount: 3,
            soldierHp: 180,
            soldierArmor: 65,
            soldierDmg: 12,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#ffd54f",
            shortName: "🦁IV",
            next: null,
            progressionType: 'branch',
            description: "3 Royal Lion Guards: 180 HP, 65% armor, 12 damage. Shield Wall, Challenge of Honor and For the King! available.",
            upgrades: [
                {
                    id: 'guard_shield_wall',
                    name: 'Shield Wall',
                    cost: 150,
                    icon: '🛡️',
                    desc: 'Passive: When 2+ guards are alive in the unit, armor increases to 80%.'
                },
                {
                    id: 'guard_taunt',
                    name: 'Challenge of Honor',
                    cost: 140,
                    icon: '⚔️',
                    cooldown: 3,
                    desc: 'Every 3 rounds, a guard taunts the blocked enemy, completely parrying their attack.'
                },
                {
                    id: 'guard_for_the_king',
                    name: 'For the King!',
                    cost: 130,
                    icon: '👑',
                    desc: 'Passive: When a guard falls, allied towers within range 2 gain +30% damage for 1 round, and surviving guards heal 25 HP.'
                }
            ]
        },
        barracks_royal_champions: {
            name: "Royal Champions IV",
            cost: 230,
            range: 2,
            initiative: 15,
            soldierCount: 3,
            soldierHp: 130,
            soldierArmor: 35,
            soldierDmg: 18,
            respawnTurns: 2,
            isBarracks: true,
            dmgType: 'phys',
            color: "#00897b",
            shortName: "⚔️IV",
            next: null,
            progressionType: 'branch',
            description: "3 Royal Champions: 130 HP, 35% armor, 18 damage. Parry and Riposte, and Punishing Strike available.",
            upgrades: [
                {
                    id: 'champions_riposte',
                    name: 'Parry and Riposte',
                    cost: 150,
                    icon: '🤺',
                    desc: 'Passive: 25% chance to parry incoming physical attack and counter-attack for 15 damage.'
                },
                {
                    id: 'champions_punishing_strike',
                    name: 'Punishing Strike',
                    cost: 140,
                    icon: '⚡',
                    cooldown: 3,
                    desc: 'Every 3 rounds, strikes the blocked enemy for 36 damage and stuns them for 1 turn.'
                }
            ]
        },

        // ==================== 🪨 КОРОЛЕВСКАЯ КАТАПУЛЬТА (РАЗВИЛКА НА IV УРОВНЕ) ====================
        royal_catapult_1: {
            name: "Royal Catapult I",
            cost: 120,
            range: 3,
            minDamage: 12,
            maxDamage: 20,
            dmgType: 'phys',
            initiative: 9,
            noAir: true,
            color: "#8d6e63",
            shortName: "👑🪨I",
            next: 'royal_catapult_2',
            progressionType: 'branch',
            description: "Field catapult (initiative 9, range 3). Physical splash damage 12–20. Cannot hit flying enemies!"
        },
        royal_catapult_2: {
            name: "Royal Catapult II",
            cost: 160,
            range: 3,
            minDamage: 24,
            maxDamage: 40,
            dmgType: 'phys',
            initiative: 10,
            noAir: true,
            color: "#795548",
            shortName: "👑🪨II",
            next: 'royal_catapult_3',
            progressionType: 'branch',
            description: "Reinforced royal onager (initiative 10, range 3). Physical splash damage 24–40."
        },
        royal_catapult_3: {
            name: "Royal Catapult III",
            cost: 240,
            range: 4,
            minDamage: 45,
            maxDamage: 70,
            dmgType: 'phys',
            initiative: 11,
            noAir: true,
            color: "#5d4037",
            shortName: "👑🪨III",
            next: ['catapult_trebuchet', 'catapult_royal_ballista'],
            progressionType: 'branch',
            description: "Heavy siege catapult (initiative 11, range 4). Physical splash damage 45–70. Level IV branches: Crown Trebuchet or Heavy Crown Ballista."
        },
        catapult_trebuchet: {
            name: "Crown Trebuchet IV",
            cost: 260,
            range: 5,
            minDamage: 65,
            maxDamage: 105,
            dmgType: 'phys',
            initiative: 10,
            noAir: true,
            color: "#4e342e",
            shortName: "🏰IV",
            next: null,
            progressionType: 'branch',
            description: "Extreme range siege engine (5 cells, initiative 10). Physical splash damage 65–105. Monolithic Boulder and Burning Pitch Pots available.",
            upgrades: [
                {
                    id: 'trebuchet_boulder',
                    name: 'Monolithic Boulder',
                    cost: 160,
                    icon: '🪨',
                    desc: 'Passive: Expands splash impact; 35% chance to stun enemies caught in splash for 1 turn.'
                },
                {
                    id: 'trebuchet_burning_pitch',
                    name: 'Burning Pitch Pots',
                    cost: 150,
                    icon: '🛢️',
                    cooldown: 4,
                    desc: 'Every 4 rounds, covers target cell in burning pitch for 2 turns (15 fire DoT, prevents regeneration).'
                }
            ]
        },
        catapult_royal_ballista: {
            name: "Heavy Crown Ballista IV",
            cost: 240,
            range: 4,
            minDamage: 55,
            maxDamage: 85,
            dmgType: 'phys',
            initiative: 12,
            color: "#37474f",
            shortName: "🏹IV",
            next: null,
            progressionType: 'branch',
            description: "Heavy ballista (initiative 12, range 4). Physical damage 55–85. Attacks ground and air! Flak Harpoon and Piercing Bolt available.",
            upgrades: [
                {
                    id: 'ballista_anti_air',
                    name: 'Flak Harpoon',
                    cost: 140,
                    icon: '🦅',
                    desc: 'Passive: Deals +30% damage to flying enemies and grounds them for 1 turn.'
                },
                {
                    id: 'ballista_pierce',
                    name: 'Piercing Bolt',
                    cost: 150,
                    icon: '📌',
                    desc: 'Passive: Bolt pierces through primary target, dealing 60% damage to the enemy behind it.'
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
        },

        // ==================== 🤖 BATTLE-MECHA T-200 ====================
        mecha_1: {
            name: "Battle-Mecha T-200 I",
            cost: 125,
            range: 3,
            minDamage: 25,
            maxDamage: 45,
            dmgType: 'phys',
            initiative: 7,
            color: "#c67d0a",
            shortName: "🤖I",
            next: 'mecha_2',
            progressionType: 'branch',
            description: "Heavy walking dreadnought. Kinetic shell with area splash (25–45 damage, range 3)."
        },
        mecha_2: {
            name: "Battle-Mecha T-200 II",
            cost: 155,
            range: 3,
            minDamage: 45,
            maxDamage: 75,
            dmgType: 'phys',
            initiative: 8,
            color: "#b26a00",
            shortName: "🤖II",
            next: 'mecha_3',
            progressionType: 'branch',
            description: "Reinforced chassis and rotary cannon. Deals 45–75 kinetic splash damage."
        },
        mecha_3: {
            name: "Battle-Mecha T-200 III",
            cost: 185,
            range: 3,
            minDamage: 70,
            maxDamage: 110,
            dmgType: 'phys',
            initiative: 8,
            color: "#995200",
            shortName: "🤖III",
            next: ['mecha_flame', 'mecha_missile', 'mecha_heavy'],
            progressionType: 'branch',
            description: "Siege walker dealing 70–110 splash damage. Level IV branches: Flame Mecha, Missile Mecha, or Heavy Mecha."
        },
        mecha_flame: {
            name: "Flame-Mecha T-200 IV",
            cost: 220,
            range: 3,
            minDamage: 65,
            maxDamage: 95,
            dmgType: 'magic',
            initiative: 9,
            color: "#d84315",
            shortName: "🔥IV",
            next: null,
            progressionType: 'branch',
            description: "Incinerator mecha. All attacks deal area fire damage (65–95) and ignite enemies with burning.",
            upgrades: [
                {
                    id: 'mecha_magma',
                    name: 'Magma Vent',
                    cost: 150,
                    icon: '🌋',
                    desc: 'Vents molten magma onto impact ground for 2 rounds, burning enemies for 15 fire damage.'
                },
                {
                    id: 'mecha_inferno',
                    name: 'Thermite Fuel',
                    cost: 120,
                    icon: '🔥',
                    desc: 'Burning duration increased to 3 turns, and burning targets suffer -20% armor.'
                }
            ]
        },
        mecha_missile: {
            name: "Missile-Mecha T-200 IV",
            cost: 220,
            range: 4,
            minDamage: 60,
            maxDamage: 100,
            dmgType: 'phys',
            initiative: 10,
            color: "#455a64",
            shortName: "🚀IV",
            next: null,
            progressionType: 'branch',
            description: "Long-range rocket platform (60–100 splash, range 4). Guided Wasp missiles target aerial threats.",
            upgrades: [
                {
                    id: 'mecha_wasp',
                    name: 'Wasp Missiles',
                    cost: 140,
                    icon: '🚀',
                    desc: 'Fires 2 guided missiles per round dealing 40 true damage, prioritizing flying enemies.'
                },
                {
                    id: 'mecha_radar',
                    name: 'Targeting Radar',
                    cost: 110,
                    icon: '📡',
                    desc: 'Increases tower range to 5 and ensures missiles never miss and bypass aerial evasion.'
                }
            ]
        },
        mecha_heavy: {
            name: "Heavy-Mecha T-200 IV",
            cost: 220,
            range: 3,
            minDamage: 90,
            maxDamage: 140,
            dmgType: 'phys',
            initiative: 8,
            color: "#37474f",
            shortName: "🦾IV",
            next: null,
            progressionType: 'branch',
            description: "Massive kinetic dreadnought dealing colossal splash (90–140). Dumps slowing oil slicks and delivers concussive blows.",
            upgrades: [
                {
                    id: 'mecha_oil',
                    name: 'Oil Slick',
                    cost: 120,
                    icon: '🛢️',
                    desc: 'Deploys an oil puddle around target cell for 2 rounds, slowing enemies by 50%.'
                },
                {
                    id: 'mecha_concussive',
                    name: 'Concussive Shockwave',
                    cost: 130,
                    icon: '💥',
                    desc: 'Shell impacts have a 35% chance to stun enemies for 1 turn and knock them back 1 cell.'
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
