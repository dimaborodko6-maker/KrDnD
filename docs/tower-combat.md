# Actual tower combat rules

This reference describes the existing server implementation. The English release changes descriptions, not numeric combat behavior. Several original tooltips disagreed with this behavior. The verified Musketeer, Arcane Wizard and Tesla upgrade descriptions have been updated; this is not a complete balance redesign.

## Modules and sequence

`tower-combat.js` collects attack towers, chooses normal targets and handles standard damage/rewards. `tower-abilities.js` implements unique tower and soldier abilities. `enemy-traits-engine.js` handles enemy shields and traits. `server.js` controls round order, construction, purchases, garrisons and melee combat.

After periodic damage and enemy restoration, tower attacks run in initiative groups 16–99, 9–15 and 0–8. Within each group, scan order is top-to-bottom, left-to-right; there is no further initiative sort. Existing fallback is `initiative || 10`; initiative above 99 falls outside the groups. Barracks soldiers act in the separate melee phase.

For each firing tower: before-attack passives, target selection, base damage roll/modification, normal hit, after-attack effects, then the appropriate reward/death cleanup. Before-attack abilities can operate without a normal target. Ordinary fire chooses the first valid living enemy in the current array, not necessarily the enemy closest to the castle. Missiles and teleport explicitly use castle proximity; ties keep array order.

Do not defer every death until the end of the round. A dismounted goblin can be hit by a later tower in the same round. Area effects snapshot their targets and clean deaths at established points; reward/death handling must remain once per victim.

## Geometry and defenses

Ordinary shots, Arcane target searches and Tesla chaining use a circular radius via squared distance. Shrapnel, Tesla field, axe throws and rally points use the larger coordinate difference (a square/Chebyshev metric).

Physical shots and shrapnel account for armor; magic shots account for magic resistance. Existing rounding and minimum-one behavior are preserved. Musketeer penetration subtracts 35 percentage points of armor from the primary target, floored at zero.

Tesla aura/chain, missiles, axe throws and Arcane boss damage historically bypass ordinary armor/resistance through the internal `pure` mode, even when the log uses the old named damage category. Enemy shields still absorb them. Instant-kill effects retain their existing direct HP behavior.

## Verified ability behavior

| Tower | Existing engine behavior |
| --- | --- |
| Ranger | Poison: 6 for 2 turns, refreshed by hits and ticking from the next wave turn. Roots stun 1 turn on attacks during shared rounds divisible by 3. |
| Musketeer | Explosive Rounds: −35 armor points to the primary target and 30% base-damage shrapnel in adjacent cells. Sniper: 35% chance when ready, cooldown 3 rounds; normal max HP ≤150 is instantly killed, tougher normal targets receive triple base damage, bosses/mini-bosses use base damage 150 then armor. |
| Arcane Wizard | Verdict: every 5 rounds, first living target in range; normal max HP ≤200 dies, bosses/mini-bosses take 150 damage. Tougher normal targets consume readiness without execution. Teleport: every 5 rounds, the closest-to-castle in-range enemy moves back 2 steps along a path toward a spawn; no valid path means no cooldown spent. |
| Sorcerer | 30% post-hit polymorph for 2 turns; zero armor and current/max HP ×0.6. No repeat transformation of an active sheep; bosses/mini-bosses are protected. Golem purchase creates a separate defender. |
| Big Bertha | Shrapnel: 50% base damage in adjacent cells. Napalm: 10 damage for 2 turns in the primary target cell. Missile: 50 damage on every even shared round to the living enemy closest to castle anywhere on the map, including air. |
| Tesla | Field: 15 damage to living adjacent enemies before firing. Base chain: 2 extra targets, 20 each, within radius 2 of the primary target. Upgraded chain: 4 extra targets, 30 each, with 30% stun chance per target. Target array order is preserved. |
| Paladins | Grace heals 50% maximum HP when currently strictly below half HP on every third shared round. Holy Shield has 40% chance to block a melee hit. |
| Battle-Mecha T-200 | Kinetic artillery splash (levels I–III). Tier IV branches into: **Flame Mecha** (all attacks deal area fire damage, apply `burnTurns`, vent Magma pools for 2 rounds, thermite fuel shreds armor), **Missile Mecha** (fires 2 homing Wasp missiles dealing 40 true damage prioritizing aerial targets, Radar Guidance increases range to 5), and **Heavy Mecha** (massive kinetic splash 90–140, dumps slowing Oil Slicks for 2 rounds, Concussive Shockwave has 35% chance to stun and knock targets back 1 cell). |
| Barbarians | Axes: 15 damage within radius 2 of the soldier, preferring air then an unblocked ground target. Bloodlust after a counterattack kill restores 30 HP and adds 5 damage until wave end. |

Cooldown counters, purchases, garrisons and effects remain in game state and survive saves/rollback according to the existing rules. Round-multiple effects follow `roundCounter`, not turns since the upgrade was bought.

For Dwarven, Necromancer and Royal Mage abilities, inspect `public/tower-catalog-data.js`, `tower-abilities.js` and the associated new-tower tests. The tower draft catalog is descriptive/design data; changing its text or numbers does not create a server ability.

## Validation

Run `npm test` or target `node --test tests/tower-combat.test.cjs tests/new-towers-abilities.test.cjs`. `npm run benchmark:towers` measures tower attack phases on synthetic scenes, including logging; it excludes enemy movement, network traffic and browser rendering. It is not a whole-game performance claim.
