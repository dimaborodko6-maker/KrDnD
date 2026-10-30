# WebSocket protocol reference

HTTP and WebSocket share the same host and port. Clients choose `ws://` for HTTP or `wss://` for HTTPS. There is no authentication handshake; a role name is self-declared. This protocol assumes trusted clients and is not a public matchmaking/service API.

## Registration and state

```json
{"type":"REGISTER_MASTER"}
```

```json
{
  "type":"REGISTER_PLAYER",
  "name":"Player 1",
  "heroName":"Gerald Lightbringer",
  "sen":10,
  "stats":{"str":15,"dex":15,"con":15,"int":15,"wis":15,"cha":12},
  "skills":["fated","steel","vigor"]
}
```

The ability scores spend 27 points above six starting scores of 10. Existing names reconnect to an existing world character. New hero keys are derived from the supplied display name; do not substitute an untranslated name.

The main outgoing envelope is `{type:'STATE_UPDATE',state}`. This is a snapshot, not a delta. `log` is the public chronicle projection with `id` and `text`. GM state includes `playerHistory` metadata `{id,playerName,label,round}` without snapshots. New-command errors return `{type:'COMMAND_ERROR',message}`. Some legacy commands still reject silently or write to the chronicle. Removal can send `{type:'KICKED',message}`.

Role changes on an already registered connection are restricted; use separate connections for GM, player and editors. Role checks and field validation vary across commands and are not a claim of authenticated authorization.

## Player commands

| Type | Fields / behavior |
| --- | --- |
| `MOVE_HERO` | `x,y`; GM may additionally specify `playerName` |
| `SET_TOWER_TYPE` | Base `towerType`, boolean `enabled`; Preparation only |
| `PLAYER_ACTION` | `ability,targetId,dice` |
| `BUILD_TOWER` | `x,y,towerType` |
| `UPGRADE_TOWER` | `x,y,targetType` |
| `BUY_TOWER_UPGRADE` | `x,y,upgradeId` |
| `SET_RALLY_POINT` | `towerX,towerY,rallyX,rallyY` |
| `REQUEST_DEMOLISH` | `x,y` |
| `VOTE_DEMOLISH` | `vote` boolean |
| `CANCEL_DEMOLISH` | Cancel current request |
| `TOGGLE_READY`, `END_TURN` | Toggle readiness, rather than unconditionally setting it |
| `PLAYER_LEAVE` | `name`; remove the character |
| `PROPOSE_TOWER_ROSTER`, `VOTE_TOWER_ROSTER`, `CANCEL_TOWER_ROSTER_VOTE` | Roster vote; verify current field names in `server.js` and `public/tower-roster-ui.js` before writing another client |

`ability` uses `attack`, `spell_<id>` or `ultimate`. The primary roll is supplied by the client in the existing implementation. Cell targets use `cell_<x>_<y>`, such as `cell_5_2` for Blink or mines. No-target abilities use `targetId:-1`; the server uses the hero's area rather than adding a stale enemy ID. Preview selection is local and is not broadcast. The state includes `mines` and `pendingSpawns`.

`gamePeriod` is `preparation` or `game`, independent of turn `phase`. Preparation actual movement restores resources and availability, including revival; current-cell clicks do not. Normal restrictions return in Play. Demolition refunds all recorded investment during Preparation and rounded 60% of current tower cost during Play. Roster types include all their upgrade branches in one slot, with a maximum of five base types.

## GM commands

| Type | Fields / purpose |
| --- | --- |
| `MASTER_RESIZE_MAP` | `width,height` |
| `MASTER_SET_GAME_PERIOD` | `gamePeriod:'preparation'` or `'game'` |
| `MASTER_EDIT_CELL` | `x,y,cellType` |
| `MASTER_RESET_SESSION` | `clearTowers` controls whether towers are removed |
| `MASTER_RESET_FULL` | Clear the battlefield |
| `MASTER_START_PRESET_WAVE` | Zero-based `waveIndex` |
| `MASTER_SPAWN_ENEMY` | `enemyType,x,y,count`; count defaults to 1, range 1–20 |
| `MASTER_ERASE_ENEMY` | `x,y` |
| `MASTER_CLEAR_ENEMIES` | Required boolean `includePending` |
| `MASTER_MANAGE_ENEMIES` | `ids,action`; actions: heal, hp (`hp`), remove, move (`x,y`), cleanse, effect (`effect,turns,power`) |
| `MASTER_RESTORE_HEROES` | `playerNames,options`; boolean hp/mana/revive/cleanse/cooldowns/action/movement/waveUses; optional `ability` for one CD |
| `MASTER_CANCEL_SPAWNS` | `all:true` or `group` containing JSON `[type,round,x,y]` |
| `MASTER_UNDO_INTERVENTION` | `id` from `state.masterUndo` |
| `MASTER_MOVE_ENEMIES` | Advance combat; rejected during Preparation |
| `MASTER_GOD_EDIT` | `field,value`, optional `pName` |
| `MASTER_ADD_GOLD` | Integer `amount`, −1,000,000 to 1,000,000; no negative final treasury |
| `MASTER_EDIT_HERO` | `playerName,values` |
| `MASTER_ROLLBACK_PLAYER` | `historyId` |
| `MASTER_UNDO_ACTION` | Legacy partial undo using `logId` |
| `MASTER_KICK_PLAYER` | `playerName` |
| `MASTER_FORCE_DEMOLISH` | Complete current demolition |
| `MASTER_FORCE_SET_ROSTER` | Force roster approval; inspect current handler fields |
| `MASTER_SET_TOWER`, `MASTER_CHANGE_TOWER_LEVEL` | Inspect sender and handler for current tower fields |
| `CLEAR_DEBUG_LOG` | Clear the on-screen technical journal |

Enemy effect types are `stun,slow,bleed,poison`; turns 0–100, power 1–1,000,000 where used. HP edits cannot remove units: use remove. Bulk commands validate all targets before applying. Removal does not award rewards or trigger death effects.

Hero values accept numeric `hp,maxHp,mana,maxMana,armor,speed,range,blockLimit,deathTimer,godDamageOverride`; boolean `hasMovedThisRound,hasAttackedThisRound,isReady`; and `stats` with integer scores 1–30. `godDamageOverride:null` removes a forced value. This command does not recalculate HP/MP maxima from scores. One invalid field rejects the complete edit.

`masterUndo` exposes only `{id,label}` to the GM; the snapshot is not transmitted and is deleted when loading a save. It expires at the next world change. Player history is capped at 30 snapshots / 16 MiB within the current history segment. World changes by the GM, character creation/removal and a new round clear the relevant history; reconnection does not. Snapshots are not included in saves.

## Catalog, scenes and adventures

Register `REGISTER_EDITOR` for enemy/wave editing. Use `EDITOR_GET_CATALOG` and `EDITOR_SAVE_CATALOG` with `revision,catalog`. Replies include `CATALOG_STATE`; connected gameplay/preparation clients receive `CATALOG_UPDATE`.

Register `REGISTER_SCENE_EDITOR` for preparation. `SCENE_GET_LIBRARY`, `SCENE_CAPTURE`, `SCENE_SAVE` (`scene,revision`), `SCENE_DELETE` (`sceneId,revision`), `ADVENTURE_SAVE` (`adventure,revision`) and `ADVENTURE_DELETE` (`adventureId,revision`) manage the shared library. Replies include `SCENE_LIBRARY` and `SCENE_CAPTURED`. GM library summaries omit full templates when not requested through the preparation editor role.

Live scene commands include `MASTER_ACTIVATE_SCENE`, `MASTER_SAVE_NOTE`, `MASTER_DELETE_NOTE`, `MASTER_REVEAL_NOTE`, `MASTER_SCENE_COUNTER`, `MASTER_SCENE_GOAL`, `MASTER_SCENE_EVENT`, `MASTER_SCENE_OUTCOME`, `MASTER_CARD_USED`, `MASTER_BOSS_PHASE`, `MASTER_START_ADVENTURE`, `MASTER_ADVENTURE_NEXT`, `MASTER_ADVENTURE_GOTO` and `MASTER_ADVENTURE_FINISH`. Use the sender in `public/master-scenes.js`, `public/master-planning.js` and the corresponding handler as the definitive parameter contract; these commands also carry scene/plan version information to reject stale edits.

Revealed player notes include only ID, coordinates, title and public text. GM secrets/checks and private cards are omitted. The active scenario's public projection differs from the GM projection. The test suite covers those omissions; role self-registration still means a reachable untrusted client can request a privileged role.

Combat HP events are managed by `combat-events.js` and rendered by `public/combat-text.js`. Do not infer game state from the animation stream: snapshots remain authoritative. Browser diagnostics POST to `/api/client-logs` and are written locally with server diagnostics.
