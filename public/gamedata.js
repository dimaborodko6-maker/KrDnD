// =========================================================================
// КОРОВЛЕВСКАЯ ЭНЦИКЛОПЕДИЯ KINGDOM RUSH (ПОЛНЫЙ БАЛАНС ГЕРОЕВ, ВРАГОВ И БАШЕН)
// =========================================================================

const GAME_DATA = {
    // 👤 БЕСТИАРИЙ ГЕРОЕВ
    heroes: {
        gerald: {
            heroName: "Gerald Lightbringer", description: "A melee paladin tank who holds enemies back with his shield.", baseSpeed: 2, baseRange: 1, blockLimit: 2,
            skills: [
                { id: 'inspire', name: 'Inspire Courage', cooldown: 3, desc: 'Active: +40% armor and a Charisma bonus for allies (5 mana) [CD: 3 rounds]' },
                { id: 'retribution', name: 'Shield of Retribution', cooldown: 3, desc: 'Active: +30% armor and Wisdom-based damage reflection (6 mana) [CD: 3 rounds]' },
                { id: 'fated', name: 'Fated Survivor', cooldown: 0, desc: 'Passive: Constitution-based death prevention and healing (0 mana)' },
                { id: 'steel', name: 'Hardened Steel', cooldown: 0, desc: 'Passive: +30% Dexterity-based shield block chance (0 mana)' },
                { id: 'vigor', name: 'Battle Vigor', cooldown: 0, desc: 'Passive: Constitution-based HP regeneration while blocking (0 mana)' }
            ],
            ultimate: { id: 'ultimate_gerald', name: 'Divine Blade', cooldown: 5, desc: 'Ultimate: Calls down a punishing blade for 200 true damage [CD: 5 rounds]' }
        },
        zefira: {
            heroName: "Zefira (Mage Archer)", description: "A long-range energy mage with area damage and slows.", baseSpeed: 4, baseRange: 4, blockLimit: 1,
            skills: [
                { id: 'hammer', name: 'Dazzling Hammer', cooldown: 3, desc: 'Active: An energy hammer deals d12+INT magic damage and stuns (5 mana) [CD: 3 rounds]' },
                { id: 'blades', name: 'Shielding Blades', cooldown: 4, desc: 'Active: Whirling blades grant +30% resistances and deal d8 magic damage (4 mana) [CD: 4 rounds]' },
                { id: 'blink', name: 'Astral Blink', cooldown: 2, desc: 'Active: Teleport 4 cells and gain a Dexterity-based buff for 2 turns (3 mana) [CD: 2 rounds]' },
                { id: 'aura', name: 'Weakening Aura', cooldown: 0, desc: 'Passive: Reduces all enemies\' magic resistance within range by 30% (0 mana)' },
                { id: 'proficiency', name: 'Spell Proficiency', cooldown: 0, desc: 'Passive: Basic shots have a 20% critical hit chance (0 mana)' }
            ],
            ultimate: { id: 'ultimate_zefira', name: 'Ethereal Spears', cooldown: 5, desc: 'Ultimate: A rain of energy spears deals 210 damage! [CD: 5 rounds]' }
        },
        malik: {
            heroName: "Malik Hammerfury", description: "A powerful berserker with area attacks and a huge health pool.", baseSpeed: 2, baseRange: 1, blockLimit: 2,
            skills: [
                { id: 'unbreakable', name: 'Unbreakable Shield', cooldown: 3, desc: 'Active: Gains a shield worth 4% of maximum HP per enemy (4 mana) [CD: 3 rounds]' },
                { id: 'earthquake', name: 'Earthquake Smash', cooldown: 3, desc: 'Active: Leaps into a crowd, dealing d10+STR damage and stunning enemies (6 mana) [CD: 3 rounds]' },
                { id: 'obliterate', name: 'Obliterate Hammer', cooldown: 2, desc: 'Active: Knocks a target back 2 cells. Double damage if HP <80% (5 mana) [CD: 2 rounds]' },
                { id: 'joehammer', name: 'Foehammer Strike', cooldown: 0, desc: 'Passive: Malik\'s basic attack deals 50% damage to other enemies in the target\'s cell (0 mana)' },
                { id: 'lonewulf', name: 'Lone Wulf', cooldown: 0, desc: 'Passive: +25% damage when no heroes are in adjacent cells (0 mana)' }
            ],
            ultimate: { id: 'ultimate_malik', name: 'Hammernado', cooldown: 5, desc: 'Ultimate: Spins his hammer, dealing 180 physical damage over 3 turns! [CD: 5 rounds]' }
        },
        bolin: {
            heroName: "Bolin (Dwarven Demolitionist)", description: "A long-range artillery expert who lays minefields and bypasses enemy armor.", baseSpeed: 3, baseRange: 5, blockLimit: 1,
            skills: [
                { id: 'mortar', name: 'Smoke Mortar', cooldown: 3, desc: 'Active: A fragmentation bomb deals d10 physical damage and slows enemies (5 mana) [CD: 3 rounds]' },
                { id: 'mines', name: 'Mine Field', cooldown: 3, desc: 'Active: Mines an adjacent road cell. Deals d12 explosive damage (4 mana) [CD: 3 rounds]' },
                { id: 'slayer', name: 'Giant Slayer', cooldown: 0, desc: 'Passive: Bolin\'s basic attacks deal bonus damage equal to 2% of the target\'s current HP (0 mana)' },
                { id: 'rounds', name: 'Sharpened Rounds', cooldown: 0, desc: 'Passive: Bolin\'s heavy rounds ignore 25% of enemy armor (0 mana)' },
                { id: 'explosive', name: 'Explosive Rounds', cooldown: 0, desc: 'Passive: Every fifth shot explodes for d10 bonus area damage (0 mana)' }
            ],
            ultimate: { id: 'ultimate_bolin', name: 'Suppressive Fire', cooldown: 5, desc: 'Ultimate: Fires 8 shells at random targets! [CD: 5 rounds]' }
        },
        connor: {
            heroName: "Connor (Raging Templar)", description: "A frenzied melee knight who inflicts bleeding and revives through the Grail.", baseSpeed: 2, baseRange: 1, blockLimit: 2,
            skills: [
                { id: 'slash', name: 'Arterial Slash', cooldown: 2, desc: 'Active: A strike deals d8 physical damage and inflicts bleeding for 2 turns (5 mana) [CD: 2 rounds]' },
                { id: 'connor_retribution', name: 'Templar Retribution', cooldown: 3, desc: 'Active: Connor parries the next enemy attack and counters for d12 damage (6 mana) [CD: 3 rounds]' },
                { id: 'shatter', name: 'Earthshatter', cooldown: 3, desc: 'Active: Splits the ground, dealing d10 physical damage to 3 targets in a line (5 mana) [CD: 3 rounds]' },
                { id: 'battleborn', name: 'Battleborn Fury', cooldown: 0, desc: 'Passive: Connor deals 40% more ability damage when his HP falls below 40% (0 mana)' },
                { id: 'grail', name: 'Holy Grail', cooldown: 0, desc: 'Passive: Once per session, Connor instantly revives with 70% HP after dying (0 mana)' }
            ],
            ultimate: { id: 'ultimate_connor', name: 'Templar Rage', cooldown: 5, desc: 'Ultimate: Enters a frenzy for 2 rounds, gaining immunity to all damage! [CD: 5 rounds]' }
        },
        illiana: {
            heroName: "Illiana and Sparky", description: "A flying duo. Illiana fires physical shots, then her dragon Sparky follows with magic!", baseSpeed: 4, baseRange: 4, blockLimit: 1,
            skills: [
                { id: 'tag', name: 'Tag, You are it!', cooldown: 2, desc: 'Active: Sparky breathes fire for d8 true damage and reduces armor by 25% (4 mana) [CD: 2 rounds]' },
                { id: 'glitter', name: 'Glitter Bomb', cooldown: 3, desc: 'Active: A blinding bomb deals d10 magic damage and stuns enemies (5 mana) [CD: 3 rounds]' },
                { id: 'prey', name: 'Easy Prey', cooldown: 2, desc: 'Active: The dragon dives at a stunned enemy for critical d12+DEX physical damage (4 mana) [CD: 2 rounds]' },
                { id: 'nimbleness', name: 'Elvish Nimbleness', cooldown: 0, desc: 'Passive: Illiana has a 40% chance to completely dodge any melee attack (0 mana)' },
                { id: 'bliss', name: 'Airborne Bliss', cooldown: 0, desc: 'Passive: While airborne, Illiana\'s basic shots deal 100% more base damage (0 mana)' }
            ],
            ultimate: { id: 'ultimate_illiana', name: 'Sparky, Incinerate!', cooldown: 5, desc: 'Ultimate: The dragon burns a strip of road, dealing 85 true damage to anyone stepping on it! [CD: 5 rounds]' }
        },
        torghar: {
            heroName: "Torghar the Unbreakable", description: "A super-heavy juggernaut. 90 HP, 55% armor, flat damage reduction (-3), thorns and a block limit of 3 enemies.", baseSpeed: 2, baseRange: 1, blockLimit: 3,
            skills: [
                { id: 'shield_wall', name: 'Shield Wall', cooldown: 3, desc: 'Active: +25% armor (up to 80%) and a +15 HP barrier for 2 rounds (5 mana) [CD: 3 rounds]' },
                { id: 'shield_slam', name: 'Shield Slam', cooldown: 2, desc: 'Active: d8+STR physical damage, taunt and a 1-turn stun (4 mana) [CD: 2 rounds]' },
                { id: 'ground_tremor', name: 'Ground Tremor', cooldown: 3, desc: 'Active: An earth tremor deals d6+STR physical damage within 1 cell and slows for 2 rounds (5 mana) [CD: 3 rounds]' },
                { id: 'flat_reduction', name: 'Iron Skin', cooldown: 0, desc: 'Passive: Flat damage reduction: takes 3 less damage from every attack before armor (0 mana)' },
                { id: 'spiked_plate', name: 'Spiked Plate', cooldown: 0, desc: 'Passive: Spiked armor reflects 3 piercing damage to any melee attacker (0 mana)' }
            ],
            ultimate: { id: 'ultimate_torghar', name: 'Undying Bastion', cooldown: 5, desc: 'Ultimate: Full damage immunity for 1 round, block limit +2 (up to 5) and taunts all enemies within 2 cells [CD: 5 rounds]' }
        },
        ratchet: {
            heroName: "Ratchet (Combat Medic)", description: "A field healer and technician. Uses lasers and nanites to heal heroes, soldiers and golems, repair armor and revive allies.", baseSpeed: 3, baseRange: 3, blockLimit: 1,
            skills: [
                { id: 'surgical_laser', name: 'Surgical Laser', cooldown: 2, desc: 'Active: Heals an ally for d8+INT (removes poison/bleeding) OR deals d8+INT true energy damage to an enemy (range 3, 5 mana) [CD: 2 rounds]' },
                { id: 'nanite_cloud', name: 'Nanite Cloud', cooldown: 3, desc: 'Active: A nanite cloud heals all allies within 2 cells for +5 HP/round for 3 rounds (6 mana) [CD: 3 rounds]' },
                { id: 'ambulance_rush', name: 'Ambulance Rush', cooldown: 3, desc: 'Active: Dashes up to 4 cells to a wounded ally, granting a +10 HP shield and stunning enemies along the path (5 mana) [CD: 3 rounds]' },
                { id: 'triage_aura', name: 'Triage Aura', cooldown: 0, desc: 'Passive: At the start of the round, automatically restores 4 HP to the most wounded ally/soldier/golem within 2 cells (0 mana)' },
                { id: 'construct_repair', name: 'Construct Repair', cooldown: 0, desc: 'Passive: Doubles all healing applied to garrison soldiers and stone golems (0 mana)' }
            ],
            ultimate: { id: 'ultimate_ratchet', name: 'Spark Reboot', cooldown: 5, desc: 'Ultimate: Instantly revives a fallen ally with 50% HP (or restores 100% HP and grants +30% armor to a living ally and Ratchet)! [CD: 5 rounds]' }
        }
    },
    // 👾 АВТОМАТИЧЕСКИЙ БЕСТИАРИЙ ВРАГОВ
    enemies: {
        bandit: { 
            name: "Bandit", shortName: "Bndt", color: "#2e7d32", initiative: 12,
            hp: 40, maxHp: 40, speed: 1, armor: 0, magicRes: 0, isFlying: false, reward: 5, 
            isRanged: false, meleeDmg: 3, description: "Melee (damage 3, initiative 12)."
        },
        goblin: {
            name: "Goblin", shortName: "Gobl", color: "#388e3c", initiative: 14,
            hp: 20, maxHp: 20, speed: 2, armor: 0, magicRes: 0, isFlying: false, reward: 4, 
            isRanged: false, meleeDmg: 3, description: "A fast, fragile goblin (speed 2, damage 2–3, initiative 14)."
        },
        wulf: {
            name: "Wulf", shortName: "Wolf", color: "#8d6e63", initiative: 16,
            hp: 35, maxHp: 35, speed: 2, armor: 0, magicRes: 0, isFlying: false, reward: 7, 
            isRanged: false, meleeDmg: 3, dodgeChance: 25, description: "A swift predator. Speed 2, initiative 16, 25% dodge chance!"
        },
        orc_warrior: {
            name: "Orc Warrior", shortName: "OrcW", color: "#4caf50", initiative: 7,
            hp: 120, maxHp: 120, speed: 1, armor: 25, magicRes: 0, isFlying: false, reward: 16, 
            isRanged: false, meleeDmg: 10, description: "A hulking brute (120 HP, 25% armor, damage 10, initiative 7)."
        },
        orc_shaman: {
            name: "Orc Shaman", shortName: "Sham", color: "#009688", initiative: 9,
            hp: 65, maxHp: 65, speed: 1, armor: 0, magicRes: 50, isFlying: false, reward: 15, 
            isRanged: true, range: 4, rangedDmg: 5, meleeDmg: 4, healPower: 15,
            description: "An orc healer (50% magic resistance, initiative 9). Uses magic attacks and heals allies for 15 HP."
        },
        crowcaller: {
            name: "Crowcaller", shortName: "Call", color: "#673ab7", initiative: 8,
            hp: 160, maxHp: 160, speed: 1, armor: 0, magicRes: 40, isFlying: false, reward: 37, 
            isRanged: true, range: 1, rangedDmg: 9, meleeDmg: 4,
            description: "A dark mage (160 HP, 40% magic resistance, initiative 8). Summons Crows while not blocked!"
        },
        blackguard: { 
            name: "Blackguard", shortName: "Grd", color: "#795548", initiative: 10,
            hp: 60, maxHp: 60, speed: 1, armor: 25, magicRes: 0, isFlying: false, reward: 8, 
            isRanged: false, meleeDmg: 5, description: "Melee (damage 5, 25% armor, initiative 10)."
        },
        shadow_archer: { 
            name: "Shadow Archer", shortName: "Arch", color: "#ff9800", initiative: 11,
            hp: 60, maxHp: 60, speed: 1, armor: 0, magicRes: 25, isFlying: false, reward: 9, 
            isRanged: true, range: 2, rangedDmg: 6, meleeDmg: 2,
            description: "Ranged: 6 damage (range 2–4, initiative 11, 25% magic resistance). Melee: 2 damage."
        },
        shadow_blade: { 
            name: "Shadow Blade", shortName: "Blde", color: "#9c27b0", initiative: 15,
            hp: 50, maxHp: 50, speed: 2, armor: 0, magicRes: 0, isFlying: false, reward: 8, 
            isRanged: false, meleeDmg: 4, description: "A cunning infiltrator. Speed 2, damage 4, initiative 15."
        },
        crow: { 
            name: "Crow", shortName: "Crow", color: "#37474f", initiative: 15,
            hp: 20, maxHp: 20, speed: 2, armor: 0, magicRes: 0, isFlying: true, reward: 4, 
            isRanged: false, meleeDmg: 2, description: "A flying harbinger of misfortune. Speed 2, damage 2, initiative 15."
        },
        worg: {
            name: "Worg", shortName: "Worg", color: "#6d4c41", initiative: 17,
            hp: 70, maxHp: 70, armor: 0, magicRes: 30, speed: 2, isFlying: false, reward: 18,
            isRanged: false, meleeDmg: 10, dodgeChance: 25, livesTaken: 1,
            description: "A fierce predator (70 HP, 30% magic resistance, speed 2, damage 10, 25% dodge, initiative 17)."
        },
        orc_wildling: {
            name: "Orc Wildling", shortName: "Wild", color: "#33691e", initiative: 13,
            hp: 150, maxHp: 150, armor: 40, magicRes: 0, speed: 1, baseSpeed: 1, isFlying: false, reward: 17,
            isRanged: false, meleeDmg: 8, livesTaken: 1,
            description: "An armored wildling (150 HP, 40% armor, damage 8). Accelerates to speed 2 near a pack of worgs/riders!"
        },
        headhunter: {
            name: "Headhunter", shortName: "Hunt", color: "#bf360c", initiative: 8,
            hp: 280, maxHp: 280, armor: 35, magicRes: 0, speed: 1, isFlying: false, reward: 41,
            isRanged: false, meleeDmg: 22, executeThreshold: 0.25, livesTaken: 1,
            description: "A merciless executioner (280 HP, 35% armor, damage 22, initiative 8). Executes targets at <=25% HP!"
        },
        goblin_rider: {
            name: "Goblin Rider", shortName: "Ride", color: "#558b2f", initiative: 16,
            hp: 80, maxHp: 80, armor: 0, magicRes: 30, speed: 2, isFlying: false, reward: 20,
            isRanged: false, meleeDmg: 10, livesTaken: 1,
            description: "A swift rider (80 HP, 30% magic resistance, speed 2, damage 10). On death, dismounts into a regular goblin!"
        },
        ogre: {
            name: "Ogre (Mini-Boss)", shortName: "Ogre", color: "#b71c1c", initiative: 5,
            hp: 480, maxHp: 480, armor: 0, magicRes: 0, speed: 1, isFlying: false, reward: 83,
            isRanged: false, meleeDmg: 35, isMiniBoss: true, aoeCleave: true, livesTaken: 2,
            description: "A devastating mini-boss (480 HP, damage 35, cleaves all defenders in the cell, immune to polymorph/instant kills, costs the base 2 lives)!"
        }
    },

    // 🏰 ОФИЦИАЛЬНАЯ ЛИНЕЙКА БАШЕН KINGDOM RUSH (С ВЕТВЛЕНИЕМ НА 4 УРОВНЕ)
    towers: {
        // Королевские Лучники -> 4 ур: Лесные Следопыты (Ranger Hideout) ИЛИ Гарнизон Мушкетёров (Musketeer Garrison)
        archer_1: { 
            name: "Royal Archers I", cost: 70,  range: 3, minDamage: 4,  maxDamage: 7,  dmgType: 'phys', initiative: 16, color: "#a1887f", shortName: "🏹I", next: 'archer_2',
            description: "High rate of fire (initiative 16), range 3 cells. Physical damage 4–7. Attacks ground and flying enemies."
        },
        archer_2: { 
            name: "Royal Archers II", cost: 100, range: 4, minDamage: 8,  maxDamage: 14, dmgType: 'phys', initiative: 17, color: "#8d6e63", shortName: "🏹II", next: 'archer_3',
            description: "Increased range (4 cells) and accuracy (initiative 17). Physical damage 8–14."
        },
        archer_3: { 
            name: "Royal Archers III", cost: 150, range: 4, minDamage: 15, maxDamage: 24, dmgType: 'phys', initiative: 18, color: "#6d4c41", shortName: "🏹III", next: ['archer_ranger', 'archer_musketeer'],
            description: "Long-range veterans (4 cells, initiative 18). Physical damage 15–24. Unlocks level IV specializations."
        },
        archer_ranger: { 
            name: "Forest Rangers IV", cost: 230, range: 5, minDamage: 18, maxDamage: 28, dmgType: 'phys', initiative: 14, color: "#2e7d32", shortName: "🍃IV", next: null,
            description: "Long range (5 cells, initiative 14). Poison Arrows and Stunning Roots available.",
            upgrades: [
                { id: 'ranger_poison', name: 'Poison Arrows', cost: 150, icon: '🌿', desc: 'Poison damage over time (6 damage per turn, ignores armor) for 2 turns.' },
                { id: 'ranger_roots', name: 'Stunning Roots', cost: 140, icon: '⚡', desc: 'Every 3 rounds, a ranger attack entangles and stuns the target for 1 turn.' }
            ]
        },
        archer_musketeer: { 
            name: "Musketeer Garrison IV", cost: 250, range: 6, minDamage: 35, maxDamage: 65, dmgType: 'phys', initiative: 7, color: "#bf360c", shortName: "🎯IV", next: null,
            description: "Sniper range (6 cells) and devastating single-target damage (35–65, initiative 7). Explosive Rounds and Sniper Shot available.",
            upgrades: [
                { id: 'musketeer_shrapnel', name: 'Explosive Rounds', cost: 180, icon: '💣', desc: 'Reduces the primary target\'s armor by 35 percentage points and splashes 30% of base damage onto adjacent cells.' },
                { id: 'musketeer_sniper', name: 'Sniper Shot', cost: 160, icon: '🎯', desc: 'When ready: 35% chance, with a 3-round cooldown. Instantly kills normal enemies with maximum HP up to 150; tougher normal enemies take triple base damage. Bosses take base damage 150, then armor applies.' }
            ]
        },
        
        // Башни Магов -> 4 ур: Архимаг Тайн (Arcane Wizard) ИЛИ Чародей (Sorcerer Mage)
        mage_1: { 
            name: "Mage Tower I", cost: 100, range: 2, minDamage: 8,  maxDamage: 12, dmgType: 'magic', initiative: 12, color: "#5c6bc0", shortName: "🔮I", next: 'mage_2',
            description: "Magic bolts (initiative 12). Range 2 cells, damage 8–12. Ignores physical armor!"
        },
        mage_2: { 
            name: "Mage Tower II", cost: 160, range: 3, minDamage: 16, maxDamage: 24, dmgType: 'magic', initiative: 13, color: "#3f51b5", shortName: "🔮II", next: 'mage_3',
            description: "Empowered spells (initiative 13). Range 3 cells, magic damage 16–24."
        },
        mage_3: { 
            name: "Mage Tower III", cost: 240, range: 3, minDamage: 28, maxDamage: 42, dmgType: 'magic', initiative: 14, color: "#303f9f", shortName: "🔮III", next: ['mage_arcane', 'mage_sorcerer'],
            description: "Concentrated magic (initiative 14). Range 3 cells, magic damage 28–42. Unlocks level IV choices."
        },
        mage_arcane: { 
            name: "Arcane Wizard IV", cost: 300, range: 4, minDamage: 45, maxDamage: 80, dmgType: 'magic', initiative: 8, color: "#4a148c", shortName: "✨IV", next: null,
            description: "Pure disintegration magic (45–80 damage, initiative 8). Destabilization and Arcane Verdict available.",
            upgrades: [
                { id: 'arcane_teleport', name: 'Destabilization', cost: 200, icon: '🌀', desc: 'Every 5 rounds, teleports the enemy closest to the Castle within range back 2 steps along its path to a spawn. Without a valid path, the cooldown is not spent.' },
                { id: 'arcane_death', name: 'Arcane Verdict', cost: 180, icon: '💀', desc: 'Every 5 rounds, selects the first living enemy within range. Normal enemies with maximum HP up to 200 die instantly; bosses take 150 damage. Tougher normal enemies consume the cooldown without being executed.' }
            ]
        },
        mage_sorcerer: { 
            name: "Sorcerer Mage IV", cost: 280, range: 3, minDamage: 32, maxDamage: 55, dmgType: 'magic', initiative: 17, color: "#e91e63", shortName: "🧿IV", next: null,
            description: "Rapid corruption spells (initiative 17). Sheep polymorph and Stone Golem summoning available.",
            upgrades: [
                { id: 'sorcerer_polymorph', name: 'Polymorph', cost: 180, icon: '🐑', desc: '30% chance to turn an enemy into a sheep for 2 turns (-40% HP, 0 armor, no attacks).' },
                { id: 'sorcerer_golem', name: 'Stone Golem', cost: 220, icon: '🪨', desc: 'Summons a powerful golem tank onto the road to hold enemies.' }
            ]
        },

        // Бомбарды / Артиллерия -> 4 ур: Большая Берта (BFG 500k) ИЛИ Башня Тесла (Tesla x104)
        bombard_1: { 
            name: "Bombard I", cost: 125, range: 2, minDamage: 10, maxDamage: 20, dmgType: 'phys', initiative: 10, noAir: true, color: "#d84315", shortName: "💣I", next: 'bombard_2',
            description: "Heavy cannon (initiative 10). Range 2 cells, damage 10–20. Cannot hit flying enemies!"
        },
        bombard_2: { 
            name: "Bombard II", cost: 220, range: 2, minDamage: 22, maxDamage: 40, dmgType: 'phys', initiative: 11, noAir: true, color: "#bf360c", shortName: "💣II", next: 'bombard_3',
            description: "Siege mortar (initiative 11). Range 2 cells, physical damage 22–40."
        },
        bombard_3: { 
            name: "Bombard III (Mortar)", cost: 320, range: 3, minDamage: 38, maxDamage: 65, dmgType: 'phys', initiative: 12, noAir: true, color: "#870000", shortName: "💣III", next: ['bombard_bertha', 'bombard_tesla'],
            description: "Devastating volley (38–65 damage, range 3 cells, initiative 12). Unlocks level IV choices."
        },
        bombard_bertha: { 
            name: "Big Bertha IV (BFG 500k)", cost: 400, range: 3, minDamage: 60, maxDamage: 110, dmgType: 'phys', initiative: 6, noAir: true, color: "#3e2723", shortName: "💥IV", next: null,
            description: "Doomsday cannon (60–110 damage, initiative 6). Napalm Volley and Homing Missiles available.",
            upgrades: [
                { id: 'bertha_napalm', name: 'Napalm Volley', cost: 220, icon: '🔥', desc: 'Leaves a burning pool in the target cell (10 true DoT for 2 turns to anyone entering).' },
                { id: 'bertha_missiles', name: 'Homing Missiles', cost: 190, icon: '🚀', desc: 'Every 2 rounds, a long-range missile deals 50 explosive damage to the enemy closest to the Castle.' }
            ]
        },
        bombard_tesla: { 
            name: "Tesla Tower IV (Tesla x104)", cost: 375, range: 3, minDamage: 40, maxDamage: 75, dmgType: 'magic', initiative: 19, noAir: false, color: "#00b0ff", shortName: "⚡IV", next: null,
            description: "Electrical discharges (initiative 19)! Hits ground and air. Static Discharge and Storm Field available.",
            upgrades: [
                { id: 'tesla_overcharge', name: 'Static Discharge', cost: 200, icon: '⚡', desc: 'Upgraded chain lightning hits up to 4 additional enemies for 30 damage each, with a 30% stun chance per target. It bypasses armor and magic resistance; shields still absorb damage.' },
                { id: 'tesla_field', name: 'Storm Field', cost: 170, icon: '🌩️', desc: 'Passive aura: at the start of the turn, deals 15 magic damage to all enemies in adjacent cells.' }
            ]
        },

        // Казармы -> 4 ур: Святой Орден Паладинов (Holy Order) ИЛИ Зал Варваров (Barbarian Hall)
        barracks_1: { 
            name: "Militia Barracks I", cost: 70, range: 2, initiative: 12,
            soldierCount: 3, soldierHp: 40, soldierArmor: 20, soldierDmg: 3, respawnTurns: 2,
            isBarracks: true, dmgType: 'phys', color: "#546e7a", shortName: "🛡️I", next: 'barracks_2',
            description: "3 militiamen: 40 HP, 20% armor, 3 physical damage (initiative 12). Holds enemies on the road."
        },
        barracks_2: { 
            name: "Infantry Barracks II", cost: 110, range: 2, initiative: 14,
            soldierCount: 3, soldierHp: 65, soldierArmor: 35, soldierDmg: 5, respawnTurns: 2,
            isBarracks: true, dmgType: 'phys', color: "#455a64", shortName: "🛡️II", next: 'barracks_3',
            description: "3 infantrymen: 65 HP, 35% armor, 5 physical damage (initiative 14). A reliable defensive line."
        },
        barracks_3: { 
            name: "Knight Barracks III", cost: 160, range: 3, initiative: 16,
            soldierCount: 3, soldierHp: 90, soldierArmor: 50, soldierDmg: 8, respawnTurns: 2,
            isBarracks: true, dmgType: 'phys', color: "#37474f", shortName: "🛡️III", next: ['barracks_paladins', 'barracks_barbarians'],
            description: "3 armored knights: 90 HP, 50% armor, 8 physical damage (initiative 16). Unlocks level IV choices."
        },
        barracks_paladins: { 
            name: "Holy Paladin Order IV", cost: 230, range: 3, initiative: 18,
            soldierCount: 3, soldierHp: 150, soldierArmor: 65, soldierDmg: 12, respawnTurns: 2,
            isBarracks: true, dmgType: 'phys', color: "#ffd700", shortName: "⚜️IV", next: null,
            description: "3 paladins: 150 HP, 65% armor, 12 damage (initiative 18). Divine Grace and Holy Shield available.",
            upgrades: [
                { id: 'paladin_grace', name: 'Divine Grace', cost: 160, icon: '✨', desc: 'When a paladin\'s HP falls below 50%, restores 50% of maximum HP once every 3 rounds.' },
                { id: 'paladin_shield', name: 'Holy Shield', cost: 140, icon: '🛡️', desc: '40% chance to block 100% of incoming melee damage.' }
            ]
        },
        barracks_barbarians: { 
            name: "Barbarian Hall IV", cost: 230, range: 3, initiative: 18,
            soldierCount: 3, soldierHp: 130, soldierArmor: 25, soldierDmg: 20, respawnTurns: 1,
            isBarracks: true, dmgType: 'phys', color: "#d50000", shortName: "🪓IV", next: null,
            description: "3 fierce barbarians: 130 HP, 25% armor, 20 damage, 1-turn respawn (initiative 18). Axe Throw and Bloodlust available.",
            upgrades: [
                { id: 'barbarian_axes', name: 'Axe Throw', cost: 150, icon: '🪓', desc: 'Barbarians throw tomahawks at flying enemies within 2 cells (15 physical damage).' },
                { id: 'barbarian_bloodlust', name: 'Bloodlust', cost: 170, icon: '🩸', desc: 'On killing an enemy, the barbarian restores 30 HP and gains +5 damage until the wave ends.' }
            ]
        },
    },

    // 🌊 СЦЕНАРИИ ВОЛН КАМПАНИИ KINGDOM RUSH
    presetWaves: [
        {
            waveNum: 1,
            title: "Wave 1: Bandit Scouts",
            desc: "The first band of lightly armed bandits tries to break through to the Citadel.",
            enemies: [
                { type: 'bandit', count: 4, offsetDelay: 0 }
            ]
        },
        {
            waveNum: 2,
            title: "Wave 2: Shadow Infiltrators",
            desc: "Fast Shadow Blades and archers attack from the flanks.",
            enemies: [
                { type: 'bandit', count: 3, offsetDelay: 0 },
                { type: 'shadow_blade', count: 2, offsetDelay: 1 },
                { type: 'shadow_archer', count: 2, offsetDelay: 2 }
            ]
        },
        {
            waveNum: 3,
            title: "Wave 3: Blackguards and Crows",
            desc: "Armored guards advance under cover of a flock of flying crows.",
            enemies: [
                { type: 'crow', count: 4, offsetDelay: 0 },
                { type: 'blackguard', count: 3, offsetDelay: 1 },
                { type: 'shadow_archer', count: 2, offsetDelay: 2 }
            ]
        },
        {
            waveNum: 4,
            title: "Wave 4: Assault Column",
            desc: "A dense formation of Blackguards and Shadow Blades.",
            enemies: [
                { type: 'blackguard', count: 5, offsetDelay: 0 },
                { type: 'shadow_blade', count: 3, offsetDelay: 1 },
                { type: 'crow', count: 3, offsetDelay: 2 }
            ]
        },
        {
            waveNum: 5,
            title: "Wave 5: Goblin and Wolf Raid",
            desc: "Fast goblin riders and a pack of dodging wolves attack at speed!",
            enemies: [
                { type: 'goblin', count: 6, offsetDelay: 0 },
                { type: 'wulf', count: 4, offsetDelay: 1 },
                { type: 'bandit', count: 3, offsetDelay: 2 }
            ]
        },
        {
            waveNum: 6,
            title: "Wave 6: Orc Vanguard and Shamans",
            desc: "Powerful Orc Warriors protected by Orc Shamans' healing auras.",
            enemies: [
                { type: 'orc_warrior', count: 3, offsetDelay: 0 },
                { type: 'orc_shaman', count: 2, offsetDelay: 1 },
                { type: 'wulf', count: 3, offsetDelay: 2 }
            ]
        },
        {
            waveNum: 7,
            title: "Wave 7: Dark Summoning and the Crowcaller",
            desc: "A deadly sorcerer summons endless flocks of crows under the protection of guards!",
            enemies: [
                { type: 'crowcaller', count: 1, offsetDelay: 0 },
                { type: 'orc_warrior', count: 4, offsetDelay: 1 },
                { type: 'orc_shaman', count: 2, offsetDelay: 1 },
                { type: 'crow', count: 4, offsetDelay: 2 }
            ]
        }
    ]
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = GAME_DATA;
} else {
    window.GAME_DATA = GAME_DATA;
}
