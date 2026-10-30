'use strict';

/**
 * КАТАЛОГ БАШЕН И ВЕТОК РАЗВИТИЯ ДЛЯ ПРЕДМАТЧЕВОГО ВЫБОРА (TOWER DRAFT)
 * Включает:
 * - ⛏️ Аванпост Дворфов (1 прямая линия I ➔ IV, шахта с золотом, броня до 20%, стан, порох)
 * - 💀 Башня Некроманта (1 прямая линия I ➔ IV, МАГИЧЕСКИЙ урон, скелеты до 7, лужа яда)
 * - 🔮 Королевский Маг (I ➔ III ➔ Развилка на Придворного Мага и Жрицу Света, МАГИЧЕСКИЙ урон)
 * - 🏹 Лучники (Развилка на Следопыта и Мушкетера)
 * - 🧙 Маги королевства (Развилка на Чародея и Архимага)
 * - 💣 Бомбарды (Развилка на Берту и Теслу)
 * - 🛡️ Казармы королевства (Развилка на Паладинов и Варваров)
 * 
 * Поддерживает флаг hiddenFromPlayers для скрытия мастером.
 */

const TOWER_DRAFT_CATALOG = (() => {
    const DAMAGE_TYPES = {
        phys: { name: 'Physical', icon: '⚔️', color: '#ffb74d' },
        magic: { name: 'MAGIC', icon: '🔮', color: '#c084fc' },
        pure: { name: 'True', icon: '✨', color: '#f43f5e' }
    };

    const ARCHETYPES = {
        barracks: { id: 'barracks', name: 'Barracks / Infantry', icon: '🛡️', desc: 'Holds enemies and defends positions' },
        magic: { id: 'magic', name: 'Magic towers', icon: '🔮', desc: 'Magic damage that bypasses physical armor' },
        archers: { id: 'archers', name: 'Ranged towers', icon: '🏹', desc: 'High range and rate of fire' },
        artillery: { id: 'artillery', name: 'Artillery', icon: '💣', desc: 'Area splash damage against groups' }
    };

    const TOWERS = [
    {
        "id": "dwarf_outpost",
        "name": "Dwarven Outpost",
        "subtitle": "Dwarven Outpost (Mines and Infantry)",
        "archetype": "barracks",
        "icon": "⛏️🛡️",
        "cost": 70,
        "baseCost": 70,
        "range": 2,
        "progressionType": "single",
        "progressionLabel": "1 direct line (I ➔ IV)",
        "dmgType": "phys",
        "damageRange": "4 – 18",
        "hpRange": "40 – 150",
        "armorRange": "5% – 20%",
        "passiveGold": "4 / 7 / 10 / 15 G/turn",
        "initiative": 12,
        "targets": "Ground (3 soldiers)",
        "hiddenFromPlayers": false,
        "description": "Sturdy dwarven miners. Mine gold while no enemies are within range (4/7/10/15 G per turn). Each level increases HP (40➔150) and physical armor (up to 20%).",
        "levels": [
            {
                "lvl": "I",
                "name": "Dwarven Outpost I",
                "cost": 70,
                "range": 2,
                "initiative": 12,
                "soldierHp": 40,
                "soldierArmor": 5,
                "soldierDmg": 4,
                "soldierCount": 3,
                "respawnTurns": 2,
                "goldPerRound": 4
            },
            {
                "lvl": "II",
                "name": "Dwarven Infantry II",
                "cost": 65,
                "range": 2,
                "initiative": 13,
                "soldierHp": 65,
                "soldierArmor": 10,
                "soldierDmg": 7,
                "soldierCount": 3,
                "respawnTurns": 2,
                "goldPerRound": 7
            },
            {
                "lvl": "III",
                "name": "Dwarven Clan Guards III",
                "cost": 100,
                "range": 2,
                "initiative": 14,
                "soldierHp": 100,
                "soldierArmor": 15,
                "soldierDmg": 12,
                "soldierCount": 3,
                "respawnTurns": 2,
                "goldPerRound": 10
            },
            {
                "lvl": "IV",
                "name": "Dwarven Mountain Stronghold IV",
                "cost": 235,
                "range": 3,
                "initiative": 15,
                "soldierHp": 150,
                "soldierArmor": 20,
                "soldierDmg": 18,
                "soldierCount": 3,
                "respawnTurns": 2,
                "goldPerRound": 15
            }
        ],
        "effects": [
            {
                "name": "Deep Vein (Level IV)",
                "icon": "💰",
                "cost": 120,
                "tag": "Economy",
                "cooldown": 0,
                "desc": "Miners have a 25% chance to mine double gold per turn (30 G), and a 5% chance to mine triple (45 G)."
            },
            {
                "name": "Surprise Appearance (Level IV)",
                "icon": "⚡",
                "cost": 130,
                "tag": "Stun",
                "cooldown": 4,
                "desc": "When leaving the mine, a dwarf surprises and stuns 1 enemy for the next wave turn."
            },
            {
                "name": "Dwarven Powder Keg (Level IV)",
                "icon": "🧨",
                "cost": 150,
                "tag": "Fire splash",
                "cooldown": 3,
                "desc": "Throws a powder keg at held enemies: 20–35 area fire damage and a 1-turn stun."
            }
        ]
    },
    {
        "id": "necro_tower",
        "name": "Necromancer Tower",
        "subtitle": "Tower of Necromancy (Dark Magic)",
        "archetype": "magic",
        "icon": "💀🔮",
        "cost": 100,
        "baseCost": 100,
        "range": 3,
        "progressionType": "single",
        "progressionLabel": "1 direct line (I ➔ IV)",
        "dmgType": "magic",
        "damageRange": "8 – 58 (Magic)",
        "hpRange": "Skeletons: 20 – 55 HP",
        "armorRange": "Skeletons: 0% – 30%",
        "passiveGold": "Skeleton limit: 2–7",
        "initiative": 10,
        "targets": "Ground and air",
        "hiddenFromPlayers": false,
        "description": "A dark tower dealing MAGIC damage (8–58). Ignores enemy physical armor. Raises skeletons from nearby fallen enemies onto the road to block breakthroughs.",
        "levels": [
            {
                "lvl": "I",
                "name": "Necromancer Tower I",
                "cost": 100,
                "range": 3,
                "initiative": 10,
                "minDmg": 8,
                "maxDmg": 12,
                "dmgType": "magic",
                "skeletonLimit": 2
            },
            {
                "lvl": "II",
                "name": "Necromancer Tower II",
                "cost": 100,
                "range": 3,
                "initiative": 10,
                "minDmg": 15,
                "maxDmg": 23,
                "dmgType": "magic",
                "skeletonLimit": 3
            },
            {
                "lvl": "III",
                "name": "Necromancer Tower III",
                "cost": 140,
                "range": 3,
                "initiative": 11,
                "minDmg": 25,
                "maxDmg": 39,
                "dmgType": "magic",
                "skeletonLimit": 4
            },
            {
                "lvl": "IV",
                "name": "Archnecromancer Ziggurat IV",
                "cost": 180,
                "range": 3,
                "initiative": 12,
                "minDmg": 38,
                "maxDmg": 58,
                "dmgType": "magic",
                "skeletonLimit": 7
            }
        ],
        "effects": [
            {
                "name": "Toxic Mire (Level IV)",
                "icon": "☠️",
                "cost": 150,
                "tag": "True DoT",
                "cooldown": 6,
                "desc": "Every 6 rounds, floods a road cell with toxic sludge for 3 turns. Deals 15 true damage to everyone standing on it (map marker and poison icon)."
            },
            {
                "name": "Extra Shovels (Level IV)",
                "icon": "🦴",
                "cost": 130,
                "tag": "Summon undead",
                "cooldown": 0,
                "desc": "Allows the necromancer to maintain up to 7 skeletons on the map at once."
            },
            {
                "name": "Bone Knight (Level IV)",
                "icon": "⚔️",
                "cost": 160,
                "tag": "Heavy guard",
                "cooldown": 0,
                "desc": "The first skeleton is summoned as an armored Knight: 55 HP, 30% armor, blocks up to 2 enemies, 12 damage."
            }
        ]
    },
    {
        "id": "royal_mage",
        "name": "Royal Mage",
        "subtitle": "Royal Spellcaster (Level IV Branch)",
        "archetype": "magic",
        "icon": "✨🧙‍♂️",
        "cost": 100,
        "baseCost": 100,
        "range": 3,
        "progressionType": "branch",
        "progressionLabel": "Branches at level IV",
        "dmgType": "magic",
        "damageRange": "10 – 80 (Magic)",
        "initiative": 12,
        "targets": "Ground and air",
        "hiddenFromPlayers": false,
        "description": "The crown's magic tower. Deals MAGIC damage (10–80). Level IV branches into the destructive Court Mage or the healing Priestess of Light.",
        "levels": [
            {
                "lvl": "I",
                "name": "Royal Mage I",
                "cost": 100,
                "range": 3,
                "initiative": 12,
                "minDmg": 10,
                "maxDmg": 18,
                "dmgType": "magic"
            },
            {
                "lvl": "II",
                "name": "Royal Mage II",
                "cost": 100,
                "range": 3,
                "initiative": 13,
                "minDmg": 22,
                "maxDmg": 34,
                "dmgType": "magic"
            },
            {
                "lvl": "III",
                "name": "Royal Mage III",
                "cost": 140,
                "range": 3,
                "initiative": 14,
                "minDmg": 36,
                "maxDmg": 54,
                "dmgType": "magic"
            },
            {
                "lvl": "IV.A",
                "branchName": "Court Mage",
                "name": "Court Mage IV",
                "cost": 175,
                "range": 4,
                "initiative": 16,
                "minDmg": 50,
                "maxDmg": 80,
                "dmgType": "magic"
            },
            {
                "lvl": "IV.B",
                "branchName": "Priestess of Light",
                "name": "Priestess of Light Sanctuary IV",
                "cost": 130,
                "range": 3,
                "initiative": 12,
                "minDmg": 24,
                "maxDmg": 38,
                "dmgType": "magic"
            }
        ],
        "effects": [
            {
                "name": "Old Spellbook (Court Mage)",
                "icon": "📖",
                "cost": 150,
                "tag": "Triple volley",
                "cooldown": 5,
                "desc": "Every 5 turns, makes 3 consecutive magic attacks in one wave turn."
            },
            {
                "name": "Magic Resonance (Court Mage)",
                "icon": "🔮",
                "cost": 140,
                "tag": "Damage aura",
                "cooldown": 4,
                "desc": "Increases all allied towers' damage within attack range by +25% for 2 turns."
            },
            {
                "name": "Healing Prayer (Priestess of Light)",
                "icon": "💖",
                "cost": 130,
                "tag": "Group healing",
                "cooldown": 1,
                "desc": "At the end of each round, restores 1d4+3 HP to all living allies within 2 cells (does not heal skeletons)."
            },
            {
                "name": "Cleansing Blessing (Priestess of Light)",
                "icon": "🌿",
                "cost": 120,
                "tag": "Remove debuffs",
                "cooldown": 3,
                "desc": "Removes poison, stun, bleeding and slow from all allied soldiers and heroes."
            },
            {
                "name": "Smiting Ray (Priestess of Light)",
                "icon": "☀️",
                "cost": 140,
                "tag": "Attack control",
                "cooldown": 2,
                "desc": "Hits a blocked enemy for 20 magic damage and gives its next attack disadvantage."
            }
        ]
    },
    {
        "id": "archer_tower",
        "name": "Kingdom Archers",
        "subtitle": "Royal Marksmen (Ranger / Musketeer)",
        "archetype": "archers",
        "icon": "🏹🎯",
        "cost": 70,
        "baseCost": 70,
        "range": 3,
        "progressionType": "branch",
        "progressionLabel": "Branches at level IV",
        "dmgType": "phys",
        "damageRange": "4 – 65 physical",
        "initiative": 16,
        "targets": "Ground and air",
        "hiddenFromPlayers": false,
        "description": "A basic rapid-fire tower. Deals physical damage at long range. Level IV branches: Ranger (poison and entangling roots) or Musketeer (armor penetration and sniper instant kills).",
        "levels": [
            {
                "lvl": "I",
                "name": "Royal Archers I",
                "cost": 70,
                "range": 3,
                "initiative": 16,
                "minDmg": 4,
                "maxDmg": 7,
                "dmgType": "phys"
            },
            {
                "lvl": "II",
                "name": "Royal Archers II",
                "cost": 100,
                "range": 4,
                "initiative": 17,
                "minDmg": 8,
                "maxDmg": 14,
                "dmgType": "phys"
            },
            {
                "lvl": "III",
                "name": "Royal Archers III",
                "cost": 150,
                "range": 4,
                "initiative": 18,
                "minDmg": 15,
                "maxDmg": 24,
                "dmgType": "phys"
            },
            {
                "lvl": "IV.A",
                "branchName": "Ranger",
                "name": "Forest Rangers IV",
                "cost": 230,
                "range": 5,
                "initiative": 14,
                "minDmg": 18,
                "maxDmg": 28,
                "dmgType": "phys"
            },
            {
                "lvl": "IV.B",
                "branchName": "Musketeer",
                "name": "Musketeer Garrison IV",
                "cost": 250,
                "range": 6,
                "initiative": 7,
                "minDmg": 35,
                "maxDmg": 65,
                "dmgType": "phys"
            }
        ],
        "effects": [
            {
                "name": "Poison Arrows (Rangers)",
                "icon": "🌿",
                "cost": 150,
                "tag": "Damage over time",
                "cooldown": 0,
                "desc": "Poison damage over time (6 true damage per turn, ignores armor) for 2 turns."
            },
            {
                "name": "Stunning Roots (Rangers)",
                "icon": "⚡",
                "cost": 140,
                "tag": "Stun",
                "cooldown": 3,
                "desc": "Every 3 rounds, a ranger attack entangles and stuns the target for 1 turn."
            },
            {
                "name": "Explosive Rounds (Musketeers)",
                "icon": "💣",
                "cost": 180,
                "tag": "Armor penetration",
                "cooldown": 0,
                "desc": "Musketeer rounds reduce the primary target's armor by 35 percentage points and splash 30% of base damage onto adjacent cells."
            },
            {
                "name": "Sniper Shot (Musketeers)",
                "icon": "🎯",
                "cost": 160,
                "tag": "Instant kill / Critical",
                "cooldown": 3,
                "desc": "When ready: 35% chance, with a 3-round cooldown. Instantly kills normal enemies with maximum HP up to 150; tougher normal enemies take triple base damage. Bosses take base damage 150, then armor applies."
            }
        ]
    },
    {
        "id": "mage_tower",
        "name": "Mage Guild",
        "subtitle": "Mage Guild (Archmage / Sorcerer)",
        "archetype": "magic",
        "icon": "🧙‍♂️⚡",
        "cost": 100,
        "baseCost": 100,
        "range": 2,
        "progressionType": "branch",
        "progressionLabel": "Branches at level IV",
        "dmgType": "magic",
        "damageRange": "8 – 80 magic",
        "initiative": 12,
        "targets": "Ground and air",
        "hiddenFromPlayers": false,
        "description": "A basic magic tower. Bypasses enemy physical armor. Level IV branches: Arcane Wizard (long-range disintegration) or Sorcerer (sheep polymorph and golem summoning).",
        "levels": [
            {
                "lvl": "I",
                "name": "Mage Tower I",
                "cost": 100,
                "range": 2,
                "initiative": 12,
                "minDmg": 8,
                "maxDmg": 12,
                "dmgType": "magic"
            },
            {
                "lvl": "II",
                "name": "Mage Tower II",
                "cost": 160,
                "range": 3,
                "initiative": 13,
                "minDmg": 16,
                "maxDmg": 24,
                "dmgType": "magic"
            },
            {
                "lvl": "III",
                "name": "Mage Tower III",
                "cost": 240,
                "range": 3,
                "initiative": 14,
                "minDmg": 28,
                "maxDmg": 42,
                "dmgType": "magic"
            },
            {
                "lvl": "IV.A",
                "branchName": "Archmage",
                "name": "Arcane Wizard IV (Arcane)",
                "cost": 300,
                "range": 4,
                "initiative": 8,
                "minDmg": 45,
                "maxDmg": 80,
                "dmgType": "magic"
            },
            {
                "lvl": "IV.B",
                "branchName": "Sorcerer",
                "name": "Sorcerer IV",
                "cost": 280,
                "range": 3,
                "initiative": 17,
                "minDmg": 32,
                "maxDmg": 55,
                "dmgType": "magic"
            }
        ],
        "effects": [
            {
                "name": "Destabilization (Archmage)",
                "icon": "🌀",
                "cost": 200,
                "tag": "Teleport",
                "cooldown": 0,
                "desc": "Every 5 rounds, teleports the enemy closest to the Castle within range back 2 steps along its path to a spawn. Without a valid path, the cooldown is not spent."
            },
            {
                "name": "Arcane Verdict (Archmage)",
                "icon": "💀",
                "cost": 180,
                "tag": "Execute",
                "cooldown": 3,
                "desc": "Every 5 rounds, selects the first living enemy within range. Normal enemies with maximum HP up to 200 die instantly; bosses take 150 damage. Tougher normal enemies consume the cooldown without being executed."
            },
            {
                "name": "Polymorph (Sorcerer)",
                "icon": "🐑",
                "cost": 180,
                "tag": "Sheep",
                "cooldown": 5,
                "desc": "30% chance to turn an enemy into a sheep for 2 turns (-40% HP, 0 armor, no attacks)."
            },
            {
                "name": "Stone Golem (Sorcerer)",
                "icon": "🪨",
                "cost": 220,
                "tag": "Summon tank",
                "cooldown": 0,
                "desc": "Summons a powerful golem tank onto the road to hold enemies."
            }
        ]
    },
    {
        "id": "bombard_tower",
        "name": "Royal Artillery",
        "subtitle": "Heavy Artillery (Bertha / Tesla)",
        "archetype": "artillery",
        "icon": "💣⚡",
        "cost": 125,
        "baseCost": 125,
        "range": 2,
        "progressionType": "branch",
        "progressionLabel": "Branches at level IV",
        "dmgType": "phys",
        "damageRange": "10 – 110 splash",
        "initiative": 10,
        "targets": "Ground (Tesla also hits air)",
        "hiddenFromPlayers": false,
        "description": "A heavy mortar with area splash damage. Level IV branches: Big Bertha (super-heavy explosives and napalm) or Tesla Tower (chain lightning hitting up to 4 targets).",
        "levels": [
            {
                "lvl": "I",
                "name": "Bombard I",
                "cost": 125,
                "range": 2,
                "initiative": 10,
                "minDmg": 10,
                "maxDmg": 20,
                "dmgType": "phys"
            },
            {
                "lvl": "II",
                "name": "Bombard II",
                "cost": 220,
                "range": 2,
                "initiative": 11,
                "minDmg": 22,
                "maxDmg": 40,
                "dmgType": "phys"
            },
            {
                "lvl": "III",
                "name": "Bombard III (Mortar)",
                "cost": 320,
                "range": 3,
                "initiative": 12,
                "minDmg": 38,
                "maxDmg": 65,
                "dmgType": "phys"
            },
            {
                "lvl": "IV.A",
                "branchName": "Big Bertha",
                "name": "Big Bertha IV (BFG 500k)",
                "cost": 400,
                "range": 3,
                "initiative": 6,
                "minDmg": 60,
                "maxDmg": 110,
                "dmgType": "phys"
            },
            {
                "lvl": "IV.B",
                "branchName": "Tesla Tower",
                "name": "Tesla Tower IV (Tesla x104)",
                "cost": 375,
                "range": 3,
                "initiative": 19,
                "minDmg": 40,
                "maxDmg": 75,
                "dmgType": "magic"
            }
        ],
        "effects": [
            {
                "name": "Napalm Volley (Bertha)",
                "icon": "🔥",
                "cost": 220,
                "tag": "Fire DoT",
                "cooldown": 2,
                "desc": "Leaves a burning pool in the target cell (10 true DoT for 2 turns to anyone entering)."
            },
            {
                "name": "Homing Missiles (Bertha)",
                "icon": "🚀",
                "cost": 190,
                "tag": "Long-range volley",
                "cooldown": 2,
                "desc": "Every 2 rounds, a long-range missile deals 50 explosive damage to the enemy closest to the Castle."
            },
            {
                "name": "Static Discharge (Tesla)",
                "icon": "⚡",
                "cost": 200,
                "tag": "Chain lightning",
                "cooldown": 0,
                "desc": "Upgraded chain lightning hits up to 4 additional enemies for 30 damage each, with a 30% stun chance per target. It bypasses armor and magic resistance; shields still absorb damage."
            },
            {
                "name": "Storm Field (Tesla)",
                "icon": "🌩️",
                "cost": 170,
                "tag": "Damage aura",
                "cooldown": 0,
                "desc": "Passive aura: at the start of the turn, deals 15 magic damage to all enemies in adjacent cells."
            }
        ]
    },
    {
        "id": "barracks_tower",
        "name": "Kingdom Barracks",
        "subtitle": "Kingdom Barracks (Paladins / Barbarians)",
        "archetype": "barracks",
        "icon": "🛡️⚔️",
        "cost": 70,
        "baseCost": 70,
        "range": 2,
        "progressionType": "branch",
        "progressionLabel": "Branches at level IV",
        "dmgType": "phys",
        "damageRange": "3 – 20 physical",
        "hpRange": "40 – 150 HP",
        "armorRange": "20% – 65%",
        "passiveGold": "3 warriors on the road",
        "initiative": 12,
        "targets": "Ground (3 soldiers)",
        "hiddenFromPlayers": false,
        "description": "A basic guard garrison. Holds up to 3 enemies on the road. Level IV branches: Holy Paladin Order (150 HP, 65% armor, holy shield) or Barbarian Hall (anti-air axes and bloodlust).",
        "levels": [
            {
                "lvl": "I",
                "name": "Militia Barracks I",
                "cost": 70,
                "range": 2,
                "initiative": 12,
                "soldierHp": 40,
                "soldierArmor": 20,
                "soldierDmg": 3,
                "soldierCount": 3,
                "respawnTurns": 2
            },
            {
                "lvl": "II",
                "name": "Infantry Barracks II",
                "cost": 110,
                "range": 2,
                "initiative": 14,
                "soldierHp": 65,
                "soldierArmor": 35,
                "soldierDmg": 5,
                "soldierCount": 3,
                "respawnTurns": 2
            },
            {
                "lvl": "III",
                "name": "Knight Barracks III",
                "cost": 160,
                "range": 3,
                "initiative": 16,
                "soldierHp": 90,
                "soldierArmor": 50,
                "soldierDmg": 8,
                "soldierCount": 3,
                "respawnTurns": 2
            },
            {
                "lvl": "IV.A",
                "branchName": "Paladins",
                "name": "Holy Paladin Order IV",
                "cost": 230,
                "range": 3,
                "initiative": 18,
                "soldierHp": 150,
                "soldierArmor": 65,
                "soldierDmg": 12,
                "soldierCount": 3,
                "respawnTurns": 2
            },
            {
                "lvl": "IV.B",
                "branchName": "Barbarians",
                "name": "Barbarian Hall IV",
                "cost": 230,
                "range": 3,
                "initiative": 18,
                "soldierHp": 130,
                "soldierArmor": 25,
                "soldierDmg": 20,
                "soldierCount": 3,
                "respawnTurns": 1
            }
        ],
        "effects": [
            {
                "name": "Divine Grace (Paladins)",
                "icon": "✨",
                "cost": 160,
                "tag": "Self-healing",
                "cooldown": 3,
                "desc": "When a paladin's HP falls below 50%, restores 50% of maximum HP once every 3 rounds."
            },
            {
                "name": "Holy Shield (Paladins)",
                "icon": "🛡️",
                "cost": 140,
                "tag": "Damage block",
                "cooldown": 0,
                "desc": "40% chance to block 100% of incoming melee damage."
            },
            {
                "name": "Axe Throw (Barbarians)",
                "icon": "🪓",
                "cost": 150,
                "tag": "Anti-air",
                "cooldown": 0,
                "desc": "Barbarians throw tomahawks at flying enemies within 2 cells (15 physical damage)."
            },
            {
                "name": "Bloodlust (Barbarians)",
                "icon": "🩸",
                "cost": 170,
                "tag": "Buff",
                "cooldown": 0,
                "desc": "On killing an enemy, the barbarian restores 30 HP and gains +5 damage until the wave ends."
            }
        ]
    }
];

    const PRESETS = [
        {
            id: 'preset_balanced',
            name: '⚖️ Balanced',
            desc: 'Classic setup: Archers, Mages, Bombards, Barracks and Dwarven Outpost for early gold.',
            towers: ['archer_tower', 'mage_tower', 'bombard_tower', 'barracks_tower', 'dwarf_outpost']
        },
        {
            id: 'preset_magic_undead',
            name: '💀 Magic Necropolis',
            desc: 'Necromancer Towers, Royal Mage, Mage Guild, Archers and Dwarves.',
            towers: ['necro_tower', 'royal_mage', 'mage_tower', 'archer_tower', 'dwarf_outpost']
        },
        {
            id: 'preset_dwarven_gold',
            name: '⛏️ Gold Rush',
            desc: 'An economy preset with Dwarves, Artillery and Royal Mage with Priestess of Light.',
            towers: ['dwarf_outpost', 'royal_mage', 'bombard_tower', 'barracks_tower', 'archer_tower']
        }
    ];

    /**
     * Бросок симуляции кубиков D&D
     */
    function rollDiceExpression(diceStr) {
        const match = String(diceStr).match(/(\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
        if (!match) return { total: 0, rolls: [], bonus: 0, text: diceStr };
        const count = parseInt(match[1], 10);
        const sides = parseInt(match[2], 10);
        const sign = match[3] === '-' ? -1 : 1;
        const bonus = match[4] ? parseInt(match[4], 10) * sign : 0;
        const rolls = [];
        let sum = 0;
        for (let i = 0; i < count; i++) {
            const r = Math.floor(Math.random() * sides) + 1;
            rolls.push(r);
            sum += r;
        }
        const total = Math.max(1, sum + bonus);
        const isCrit = count === 1 && rolls[0] === sides;
        return {
            total,
            rolls,
            sides,
            bonus,
            isCrit,
            formula: diceStr,
            breakdown: count > 1 ? `[${rolls.join('+')}]${bonus !== 0 ? (bonus > 0 ? '+' + bonus : bonus) : ''} = ${total}` : `${total}`
        };
    }

    return {
        DAMAGE_TYPES,
        ARCHETYPES,
        TOWERS,
        PRESETS,
        getTowerById: id => TOWERS.find(t => t.id === id),
        getArchetypeList: () => Object.values(ARCHETYPES),
        rollDiceExpression
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TOWER_DRAFT_CATALOG;
} else {
    window.TOWER_DRAFT_CATALOG = TOWER_DRAFT_CATALOG;
}
