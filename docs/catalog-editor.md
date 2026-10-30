# Enemy and wave catalog

Open `/catalog-editor.html` separately from the GM dashboard. Enemy and wave edits use an editor role and do not claim the GM connection. Save them explicitly with **Save catalog**.

## Enemies

Select an enemy, edit its name, short map label, color, stats and description. Built-in IDs cannot be deleted. Duplicate an enemy to make a custom definition, then adjust it using already supported fields. A description alone does not implement new behavior.

Flying, ranged attacks, mini-boss status and hits against all defenders in a cell are flags. Configurable traits include regeneration, energy shield, berserk, commander aura, healing, summoning and death explosion. Each trait has its own parameters. Copies retain these traits.

Some mechanics remain tied to the original enemy type: goblin rider dismount, wildling pack acceleration and the executioner's special behavior, for example. Duplicating the definition does not necessarily duplicate an ID-specific mechanic. Summoned descendants cannot summon recursively. Removing a type referenced by waves, summoners or pending spawns is restricted.

## Waves

A wave has a unique number, title, description and ordered groups. Each group names an enemy type, count and `offsetDelay` in wave turns. Delay 0 starts the group at launch; 1 on the next Wave Turn; 2 on the second. Each group releases one enemy per available spawn point per turn until its count is reached. Groups may overlap. Remaining enemies stay in the saved reinforcement queue and prevent early wave completion.

The catalog allows 1–100 enemy types, 1–200 waves, 1–30 groups per wave and no more than 500 enemies per wave. Group counts range from 1 to 200 and delay from 0 to 100. Validation rejects a complete save if any referenced type or numeric field is invalid.

## Persistence and conflicts

`gamecatalog.json` contains `{version:1, revision, catalog:{enemies,presetWaves}}`. It replaces the entire built-in enemy/wave catalog at startup. Heroes and tower rules are separate. Saving writes a temporary file before replacing the catalog. A stale editor revision cannot overwrite a newer save; reload the latest version after preserving useful draft text.

New spawns use the latest definitions. Enemies already on the map keep their current parameters. Connected clients receive updated definitions. Saving clears the relevant player rollback history. Invalid catalog files fail startup rather than silently falling back to different content.

## Tower preview limitation

The **Towers** tab is a local prototype/design editor. **Save local preview** writes to the browser's `kr_tower_catalog_custom` local storage. It does not persist tower combat parameters to the server, implement new abilities or synchronize those edits to players. Treat this tab as a planning aid. Use `public/gamedata.js`, `public/tower-catalog-data.js`, `tower-combat.js` and `tower-abilities.js` to implement actual tower changes, then validate them with the relevant tests.

Back up server catalog files and browser drafts separately. A new browser or device will not have the local draft.
