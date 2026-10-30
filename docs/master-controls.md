# GM dashboard controls

The battlefield is the main working area. The map header contains readiness, zoom and **Wave Turn**. **Map only** hides the inspector and preparation panels; use it again to restore them. The inspector tabs are Object, Team, Enemies and Wave. Narrow screens place panels after the map.

## Heroes

Select a hero on the map or in Team. Inspect health, mana, armor, speed, blocking, ability scores, action availability and selected abilities. Radius previews share the player's range/target module and do not apply the ability. Esc cancels a preview or relocation tool.

**Restore team** or a hero's **Restore…** dialog can independently restore health, mana, revival, negative effects, cooldowns, action and movement. Once-used abilities have their own option. Healing alone does not revive a fallen hero. Restore commands preserve position, build and maximum values unless the selected restoration specifically changes a temporary state.

The parameter editor applies one command. Ability scores must be 1–30; HP and MP cannot exceed their maxima. HP/MP maxima are separate from CON/INT. A blank forced-damage field means the ordinary attack calculation.

## Enemies

Search by name/ID and filter by type, injury, negative effects, proximity to castle or selected cell. Select matches, all visible members of a type, individual checkboxes, or a rectangle defined by two map corners. Selection remains when a filter changes; check the selected count.

Bulk operations support healing, relocation to a common cell, removing negative effects, deletion, stun, slow, poison and bleeding. Effect duration 0 removes that effect. Poison and bleeding also require damage per turn. Editing HP accepts 1 through the unit's maximum; removal is separate.

**Clear enemies** can optionally cancel pending reinforcements. These removals award no gold and trigger no death effects. Other units and resources stay intact. If reinforcements are not canceled, they may still spawn later.

## Spawns, waves and undo

Spawn an individual group of 1–20 from the catalog, then choose a cell. The tool sends one group for that click. Favorites are stored in the browser. The Wave panel shows group composition, delays and pending spawn coordinates. Cancel one group or all pending reinforcements there.

Launching a wave adds to the current enemies. Preparation blocks Wave Turn; switch the game period to Play explicitly. Player readiness never automatically advances a turn.

**Undo intervention** covers the last supported clear, bulk enemy operation, hero restoration or reinforcement cancellation, until the next world change. Viewing panels does not consume it. Spawn, old map-edit tools, full resets and other operations are not an unlimited undo stack. Restarting loses snapshots.

Player rollback restores the full world before a selected action, including subsequent actions by other players, treasury, effects and action availability. It is confined to the available current-round history. World changes by the GM and a new round invalidate it.

Session resets are distinct from restoration. Read the confirmation carefully and keep a stopped-server backup before clearing a party or the full map.

## Activated combat events

Use the dashboard's activated events panel during Play to configure Frost, Golden goblin, Sandstorm, Goblin tower, Bombardment, Ritual totem, Warlord banner or Chain lightning. Select an active scene's named preset to reuse prepared settings. Live targets and physical-dice saving throw results are selected at activation. Review warning areas and timers; ongoing events can be ended early without rewards. See [event rules, defaults and timing](activated-events.md).
