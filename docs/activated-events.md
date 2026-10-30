# Activated combat events

The GM can configure eight combat events from the dashboard during Play, independently of a prepared scene. Named presets can also be saved under **Activated event presets** in Scene Preparation. A preset stores settings and map positions; live heroes, banner bearers, lightning targets and saving throw results are chosen again at activation. Existing scene-condition events remain separate.

## Using events

Choose an event or scene preset, adjust its settings, select targets or cells, review the affected area and confirm. Frost requires a pass/fail result for every selected living hero after players roll Constitution saves at the table; the app does not roll these saves. Cancelling the form does not affect the game.

Active durations and warning areas are visible to players. The GM can end an ongoing event early. Ending an event grants no kill reward and does not remove ordinary reinforcements it already summoned. Server snapshots are authoritative; invalid commands are rejected without partial effects. Event state and timers are saved with the party and restored by supported world rollback.

## Event rules and defaults

| Event | Default configuration | Behavior |
| --- | --- | --- |
| Frost | DC 12; 10 magic damage; slow for 2 player phases | Select heroes and enter pass/fail results. Failed saves take damage and their available movement is capped at 1 cell. Passed saves have no effect. Slowing affects the current and following player phase; it does not grant another move if movement was already used. |
| Golden goblin | 20 HP; speed 2; 50 G reward; lifetime 5 rounds | A harmless, attackable enemy wanders randomly across grass, road and spawn cells. It does not attack or damage the castle. Hero or tower kills award 50 G once. Expiry and GM removal award nothing. |
| Sandstorm | Radius 2; 3 rounds; 5 physical damage each round; all creatures | Select a fixed circular area. Living heroes, soldiers, summons and enemy creatures inside take damage on the next wave turns. Player towers, event structures and the castle are not damaged by the storm. |
| Goblin tower | 80 HP; 0 armor; range 3; 5 physical damage; one goblin every 5 rounds; living summon cap 8 | Place on empty grass and select a road/spawn cell connected to the castle for reinforcements. Each enemy phase it attacks the nearest living hero in range. The first goblin arrives after five wave turns. Summons yield 0 G by default and remain after the tower is destroyed. |
| Bombardment | Radius 1; 15 physical damage; delay 1 round | Mark 1–20 impact centers. Warning areas appear immediately; damage resolves on the next wave turn. A creature in overlapping impact areas is hit once by this activation. |
| Ritual totem | 40 HP; countdown 3 rounds; three goblins; summon reward 0 G | Place on empty grass and select a connected reinforcement cell. Destroy the totem before its enemy-phase countdown completes to cancel the one-time reinforcement. Successful completion consumes the totem. |
| Warlord banner | Radius 2; duration 3 rounds; damage bonus 20% | Select a living non-structure enemy bearer. Choose damage %, armor percentage points or speed cells; recommended defaults are 20%, 20 points and 1 cell respectively. Only the highest active event bonus of each type applies. A fallen, stunned or transformed bearer stops supplying the aura. |
| Chain lightning | 10 magic damage; up to 4 targets; jump radius 2; all sides | Choose a living first target. Each jump selects the nearest eligible unhit creature, with stable tie-breaking. Choose instant resolution or a one-round warning. Delayed lightning resolves from the current target positions. |

Physical damage respects armor; magic damage respects magic resistance where the target has it; true damage bypasses those reductions. Existing shields and hero survival mechanics still apply. Event-created structures are attackable enemy targets. Durations count GM wave turns, never wall-clock time or individual hero actions. Preparation pauses combat progression and cannot activate a new combat event.

## Timing and objects

On a wave turn, event area damage and delayed strikes resolve after defender restoration and before normal tower fire. Goblin tower attacks and structure reinforcement actions resolve in the enemy phase, so destroying a structure before then prevents that action. Event expiry is processed at the end of the round.

Goblin towers and ritual totems occupy grass without changing the underlying map terrain or tower roster. They do not move toward the castle. Their reinforcement cell must reach the castle along ordinary orthogonal road connections. Event-specific creatures are runtime instances; they do not change the saved enemy catalog or become permanent catalog entries.

Copying the current map into Scene Preparation preserves named presets, but omits live event objects and their timers. Opening another scene or resetting the party clears the previous scene's active events. Existing scene libraries without presets remain compatible and load an empty preset list.

## Data and commands

`scene.eventPresets` contains up to 100 entries `{id,title,kind,...settings}` with unique IDs. Settings use the shared `public/activated-event-rules.js` definition and validate against the scene geometry. Presets contain no live target IDs or saving throw results. Removed custom reinforcement types may remain readable in an older library, but must be repaired before saving or opening it.

The GM sends `MASTER_ACTIVATE_EVENT` with `config,requestId`, or `MASTER_FINISH_EVENT` with `id,requestId`; `EVENT_RESULT` acknowledges the request. Live state is held in `gameState.activeEvents`; timers use absolute round numbers. See [WebSocket commands](websocket.md) and [GM controls](master-controls.md).
