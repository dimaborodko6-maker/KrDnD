# Adding or changing entities

Start with an existing working definition and find its tests by ID. Keep a backup of persistent catalog/library files and use an isolated party. Do not modify the player's save or logs merely to test code.

## Enemy using existing mechanics

Choose the layer: built-in `public/gamedata.js` or saved `gamecatalog.json`. A saved catalog replaces all built-in enemies/waves, so a new built-in type must also be present in that saved catalog. Use lowercase IDs with letters, numbers and underscores, beginning with a letter. Supply name, shortName, color, HP, speed and supported combat fields. Copying does not transfer all ID-specific behavior.

Use the supported trait schema from `public/enemy-traits.js`. Summoning must reference a valid type. A custom description is not executable. The example `docs/examples/enemy-and-wave.json` is a valid copyable fragment, not a full importable game catalog.

For new balance, establish the intended budget and validate it. The English release did not apply the source README's theoretical balance tables as new live values. For historical design equations see [balance-reference.md](balance-reference.md); actual code and existing tests take precedence for current behavior.

## Wave

Add a unique `waveNum`, title, description and groups `{type,count,offsetDelay}`. Delay is in GM wave turns, not seconds. Existing pending spawns keep the wave active until processed. Reference IDs must exist in the authoritative catalog. Run `npm run check:content` and the catalog/scenario tests.

## New enemy trait

Extend the shared schema/validation and editor metadata, implement the server trait engine, show its status where appropriate, then test defenses, effect timing, death, removal, persistence and rollback. Avoid adding an extra death reward path. Ordinary damage must respect shields and the established cleanup sequence.

## Tower or upgrade

Define authoritative data in `public/gamedata.js` or `public/tower-catalog-data.js`, link branches through `next` and identify the base family. Add server calculation in `tower-combat.js`, `tower-abilities.js` or the existing purchase handler as appropriate. A new type must work with roster selection, construction, upgrades, rally points if applicable, demolition and saves.

The draft catalog and browser-local tower editor are descriptive prototypes. Editing those alone does not implement a tower rule. Verify the final tooltip against the engine and run tower, roster, UI and content checks.

## Hero or hero ability

Update shared data, the hero selection list in `public/player-logic.js`, server execution and `public/battle-ability-rules.js` targeting. Test legal/illegal targets, no-target area abilities, mana, cooldowns, action availability, death and restoration. Some legacy calculations inspect hero display names; review them before changing a name. Keep IDs stable.

## Scene and narrative content

Use Scene Preparation and Session Plan for supported templates, notes, objectives and events. A note's written success/failure text is GM guidance rather than automatic mechanics. Keep secrets in the hidden fields and test player payloads. Validate routes for combat scenes and referenced catalog IDs before opening them.

Before delivery, run the full project check and describe which data layer changed, which behavior was verified and which manual checks remain.
