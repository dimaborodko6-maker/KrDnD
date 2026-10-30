# Objectives, events, GM cards and session plans

These features are prepared in Scene Preparation and controlled from the live GM dashboard. Combat scene automatic conditions are evaluated during Play. The completed-round counter increases after Wave Turn, not after each hero action. Manual events and GM decisions can also be used during Preparation.

## Counters and objectives

A counter has a title, initial value, target and player visibility. The GM changes it using −1, +1 or Set. Counters can represent villagers, rituals and objects that are not combat units. The app does not independently attack NPC cards or roll their saving throws.

An objective has a title, description, primary/secondary importance and visibility. Conditions can use a GM decision, completed round, counter comparison, base HP, defeated enemy count, enemy HP percentage, a clear battlefield or another objective's state. Choose the condition and its parameters from the editor. Objective references cannot form cycles.

If automatic outcomes are enabled, all primary objectives completed produces full success; all resolved with a mix of completed/failed produces partial success; all failed produces defeat. The GM can select an outcome manually. Ending text is sent to players when the scene is resolved. Plain text written in the general victory-notes field does not create an automatic condition.

## Events

Each event has a condition, GM hint, confirmation flag and 1–10 actions. Actions can spawn a reinforcement group, launch a saved scene wave, change a cell, set/increment a counter, reveal/hide an existing note, change an objective, end the scene or send a message.

By default an eligible event waits for **Apply event**. Inspect the action list, then apply or skip. Clearing the confirmation flag enables automatic application except for a manual GM condition. Events run once. Once waiting for confirmation, an event remains pending even if the condition later changes.

All actions are validated together before application. Missing enemy types, removed notes and out-of-bounds cells reject the event without a partial result. Failed automatic events remain visible to the GM for retry after the external problem is fixed or for skipping. Events cannot exceed 1,000 active plus pending enemies.

A changed map cell uses the ordinary tower/garrison removal rules. Combat scenes still need a valid initial route; an event can open a second route later. Use a counter to represent a narrative gate's durability rather than assuming a separate destructible-gate combat unit exists.

## GM cards and boss phases

NPC cards record role, motivation, personality/voice, knowledge, help conditions, concessions and secrets. Tactics cards record an optional enemy type, priorities, opening actions, retreat and surrender. These cards are hidden from players.

Boss cards link an enemy type and up to 10 phases with decreasing HP thresholds, such as 100, 50, 20. Automatic phase reminders use the lowest living matching enemy HP ratio. Healing does not move a phase backward. The GM can select a phase manually. These reminders do not modify enemy stats; use a supported event for actual reinforcements or map changes.

Mark cards used to track which reminders have mattered. The mark belongs to the active scene and does not change the library template.

## Session plans

Open `/adventure-editor.html`. Create an adventure, describe its premise, and add saved scenes. A scene template can be used more than once. Name each step, give GM notes and estimated minutes, then mark it Required, Optional or Backup. Main-route and backup time estimates are shown separately.

Add branches with labels, target steps and accepted outcomes: any, success, partial or failure. Up to 8 branches are permitted per step. A branch must lead to another existing step; returning to a different earlier step is allowed.

Save the plan and start it from the GM dashboard. With no branches, Next chooses the next Required/Optional step and skips Backup. With branches, only matching transitions are available. “Any” does not need a resolved scene. The GM can use a manual transition to open any step, including a backup.

Transitions always require a GM choice and use normal scene opening: map/resources are replaced and heroes recover in Preparation. Outcomes and visit history are saved. Re-entering a step creates a new attempt and clears its old outcome. Finishing the plan marks it completed without clearing the battlefield; start it again for a new playthrough. Opening an independent library scene detaches the map from the active plan.

## Persistence

The shared schema is `public/scenario-rules.js`; automation is `scene-director.js`. `scenes.json` stores templates and the `adventures` array under one revision. Older version-1 libraries without adventures load an empty list; older templates without scenario/cards load empty defaults. Active runtime progress lives in `gamestate_save.json`. Back up all three game JSON files while the server is stopped.
