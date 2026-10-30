# Historical balance design model

The source README included the following design equations. They are retained here as an English design reference. They are **not a verified specification of every live value** and were not applied as a rebalance in this edition. In particular, a theoretical clear-wave bonus is not proof that the server awards it. Check code and tests before using a design number as a product claim.

## Enemy difficulty

One combat round is one wave tick. Suggested road length was about 12–16 cells (reference 14). Exposure under a tower was approximated as `(2R+1)/V`, where R is range and V speed.

```text
effectiveResistance = 0.6 × Armor/100 + 0.4 × MagicResistance/100
EHP = HP / (1 - effectiveResistance) / (1 - Dodge)
Survival = (EHP/40) × V^0.75
Attack = effectiveDamage/3
CR = Survival^0.60 × Attack^0.40 × traitModifier
Bounty = max(1, round(CR × 4.5))
```

Reference enemy: bandit, 40 HP, no defense, speed 1, melee damage 3, CR 1. Ranged damage was weighted ×1.25; cleave ×1.75; execution at threshold ≥25% ×1.33. The design suggested flying ×1.25, base damage ≥2 ×1.25, added summon difficulty over three rounds, healing contribution `healPower/12` and added difficulty for a dismounted descendant. Trait contributions need an explicitly defined aggregation before extending this model.

| Enemy | Historical calculated CR | Suggested bounty |
| --- | --- | --- |
| Goblin | 0.9 | 4 |
| Bandit | 1.0 | 5 |
| Crow | 1.0 | 5 |
| Wulf | 1.7 | 8 |
| Shadow Blade | 2.2 | 10 |
| Blackguard | 2.3 | 11 |
| Shadow Archer | 2.9 | 13 |
| Orc Shaman | 4.6 | 21 |
| Orc Warrior | 5.1 | 23 |
| Worg | 6.4 | 29 |
| Goblin Rider | 6.6 | 30 |
| Orc Wildling | 9.4 | 42 |
| Crowcaller | 10.7 | 48 |
| Headhunter | 22.0 | 99 |
| Ogre | 33.5 | 150 |

## Towers and heroes

```text
averageDamage = (minDamage + maxDamage)/2
attackTowerPower = averageDamage × sqrt(Range/3)
                   × damageTypeMultiplier × initiativeMultiplier × targetMultiplier
barracksPower = soldierCount × soldierDamage + 0.15 × soldierCount × soldierEHP
cumulativeCost ≈ 8.5 × Power^1.12
heroPower = heroEHP/10 + 15 × blockLimit + averageDPR
heroEHP = maxHP/(1 - Armor/100) + Shield
averageDPR = diceDamage + statModifier + UltimateDamage/5 + HealPerRound × 1.5
```

Suggested damage multipliers: physical 1, magic 1.15. Initiative groups: high 1.10, middle 1, low 0.92. Target weights: ground+air 1.15, ground-only 0.90, splash 1.65, up-to-four-target lightning 2.00. The source's hero-power estimate was roughly 65–85 for a new hero and about 220 for three heroes; it is a design estimate, not a measured release guarantee.

## Campaign economy model

The theoretical target CR curve was `12,18,26,38,55,80,120`. Proposed gold per wave was `CR × 4.5`, plus `ClearBonus(w)=60+20w`, starting at 300 gold. Its table accumulated to 2,851 gold after seven waves. Suggested validation was a ±10% wave budget and power/cost around 0.08–0.12 for levels I–III.

This edition preserves the supplied actual enemy catalog, waves and numbers. Before adopting a new economy, compare the proposed formulas with current code, decide which conflicting behavior is intended, then update implementation, tests and documentation together.
