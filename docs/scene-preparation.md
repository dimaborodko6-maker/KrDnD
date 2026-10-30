# Scene preparation and GM notes

Open `/scene-editor.html` in its own tab. It uses a preparation connection while the live party continues. A draft is not applied to the party until the GM opens the saved scene.

1. Create a new scene or copy the current map. A capture includes map setup and enemies by type/count/position; heroes and temporary enemy HP/effects are not template content.
2. Set title, kind, GM description, victory notes, starting gold and base health.
3. Edit an 8×8 to 40×40 map. Shrinking discards draft objects outside the new bounds after confirmation.
4. Select up to five tower families. Every prebuilt tower must belong to that roster.
5. Place enemy groups, add copied catalog waves and arrange their order.
6. Add notes, objectives, counters, events and GM cards, then save.

Combat drafts can be saved before their routes are complete. To open one, every spawn must reach the castle along an unbroken road with edge connections; ground enemies must stand on a connected route. Conversation/exploration scenes do not need the combat path. References to removed custom enemies must be fixed before launch.

Limits include 100 scenes, 100 placement groups and 500 placed enemies per scene, 200 scene waves and 200 notes. The library file is limited to 32 MiB.

## Opening a scene

On the GM dashboard choose a saved scene and **Open scene**. This replaces the map, towers, enemies, starting treasury and base HP; clears old mines, hazards, pending spawns, votes, chronicle and rollback history; resets wave to 1 and round to 0; and enters Preparation.

Heroes remain, move to the first spawn and recover HP, mana and availability. Temporary combat bonuses, barriers and block links clear. Permanent build and parameters stay. Garrisons and purchased golems are recreated. The GM then enables Play and launches the selected scene wave. A scene can have no waves and use pre-placed enemies or manual spawning.

Editing a library template never patches an active scene in place. Reopening it repeats the replacement/recovery operation. Deleting a template does not delete a scene already active in the party; templates referenced by an adventure plan must be removed from that plan first.

## Notes and visibility

A note contains title, coordinates, player text, GM secret, a skill/save check, DC 1–40 and success/failure guidance. Checks are reminders and do not roll or apply consequences automatically.

All notes begin hidden. Revealing transmits only ID, coordinates, title and player text. The GM's secret, check, DC and result guidance are omitted from player messages. Hiding a note removes its revealed player text. Editing a revealed live note updates what players see. Live note changes do not update the library template; capture the map to save a new template.

## Storage

`scenes.json`, or `KR_SCENES_FILE`, stores scene templates and adventures as version 1 with a shared revision. Writes replace the file atomically after a temporary write. Stale revisions cannot overwrite newer edits. An invalid library prevents startup rather than being replaced with an empty library.

Disconnected drafts remain in the current window, but reloading or closing can lose them. Preserve important draft text before loading the server version. Active scene progress and revealed notes are in `gamestate_save.json`. Back up save, catalog and library together while stopped.

See [scenario-and-adventure.md](scenario-and-adventure.md) for automation and branching.

## Activated event presets

The **Activated event presets** panel saves named configurations for eight combat events alongside the map. Use the event selector and typed fields to set damage, timing, radius and positions; Bombardment supports multiple impact cells. Goblin towers and ritual totems also require a reinforcement road/spawn cell connected to the castle. Live heroes, enemy bearers, lightning targets and saving throw results are selected on the dashboard when activated. Old scenes default to no presets. Copying a live map keeps presets but omits temporary event creatures and objects. See [activated combat events](activated-events.md).
