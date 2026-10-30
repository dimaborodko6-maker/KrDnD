# Architecture and development

Node.js/CommonJS, Express and `ws`; ordinary HTML/CSS/JavaScript with no frontend build. HTTP and WebSocket share one port. A process owns one in-memory world, with JSON persistence rather than a database.

## Sources of truth

| Area | Files |
| --- | --- |
| World, commands, round flow, persistence | `server.js` |
| Heroes, original enemies, waves and towers | `public/gamedata.js` |
| Additional authoritative tower definitions | `public/tower-catalog-data.js` |
| Persistent enemy/wave override | `gamecatalog.json`, validated by `game-catalog.js` |
| Enemy traits | `public/enemy-traits.js`, `enemy-traits-engine.js` |
| Tower fire and unique abilities | `tower-combat.js`, `tower-abilities.js` |
| Shared roster and targeting rules | `public/tower-rules.js`, `public/battle-ability-rules.js` |
| Scene templates, cards and plans | `scene-library.js`, `public/scenario-rules.js` |
| Live scenario automation | `scene-director.js` |
| GM bulk intervention commands | `master-controls.js` |
| Statuses, contours, combat text | `public/unit-statuses.js`, `map-range-contours.js`, `combat-text.js` |
| Diagnostics | `game-logger.js`, `public/diagnostics.js` |
| First-start installation data | `defaults/`, seeded by `scripts/start.cjs` |

The server merges additional tower definitions into GAME_DATA outside the Node test context. `/gamedata.js` is a dynamic response with the current catalog. A saved `gamecatalog.json` overrides the entire built-in enemy/wave catalog; it does not include heroes or tower combat rules. Choose deliberately which layer to modify.

Authoritative tower rules and the local tower design preview are separate. `public/tower-draft-catalog.js` and the tower editor's local storage are not a server balance database.

## Invariants

- Grid coordinates are zero based: `grid[y][x]`.
- Combat and command validation remain on the server. Client previews must match shared geometry.
- A rollback can replace the world object. Read it through `getState()` for each operation rather than capturing a stale reference.
- Keep persistent/undoable state inside the world and its entities.
- Apply ordinary enemy damage through the trait engine (`mobTraits.damage()` or ability context damage), so shields, death effects, rewards and dismounts remain correct.
- Do not rename IDs without reviewing waves, summoning, scenes and saved instances.
- Hero display names are still inspected by some existing rules. English names and migration must stay consistent until an explicit ID-based refactor is implemented.
- Do not “fix” numeric mechanics to match an old tooltip without a separate balance decision. The actual timing/threshold reference is [tower-combat.md](tower-combat.md).

## Checks

```powershell
npm ci --ignore-scripts
npm run check
```

The suite covers mechanics, role restrictions, atomic commands, saves, rollback, editor validation, scenes, adventures and UI behavior. Tests use temporary files or in-memory harnesses; they do not require a user's live save. There is no configured general-purpose style linter.

Use targeted tests during development, then run the full check after executable changes. For UI changes also inspect the actual browser, including long English labels, small viewports, invalid actions and disconnected states. Test names/comments and Unicode fixtures retained from the source may be Russian; executable product text is English.

## Isolated manual session

```powershell
$env:PORT = '3101'
$env:KR_SAVE_FILE = 'C:\Games\Kr6DnD-test\gamestate_save.json'
$env:KR_LOG_FILE = 'C:\Games\Kr6DnD-test\game.log'
npm start
```

The launcher creates missing data directories and copies starter catalog/library files only if missing. Use a separate browser profile if its cached hero belongs to a different test. Check GM and player sync, movement, tower building, ability use, a wave round, scene editing and restart recovery. Do not use a real campaign file as scratch data.

## Documentation

Update the relevant English manual with behavior changes. `docs/playing-guide.md` is the editable source for `public/guide.html`; the HTML is the shipped standalone manual. The initial rendering helper is outside the product in the preparation workspace. When maintaining the guide elsewhere, render the Markdown with a trusted renderer or edit both representations consistently.

Use the task template in [task-template.md](task-template.md). Release packaging and recovery are in [release.md](release.md).
