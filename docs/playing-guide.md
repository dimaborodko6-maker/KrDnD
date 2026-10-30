# Kr6DnD: host and player guide

**English local-play edition · 0.1.0-en.1**

Kr6DnD combines a shared tower defense battlefield with hero abilities and a human game master. Players protect the castle together. The GM sets up the map, decides when the action moves forward and manages the surrounding adventure.

## 1. Get everyone connected

One computer runs the server. That computer needs Node.js 24 LTS; the other devices need only a browser. Install dependencies and start using `Start-Game.cmd` on Windows, `sh start-game.sh` on macOS/Linux, or `npm ci --ignore-scripts` followed by `npm start`.

Open `http://localhost:3000/` on the host. Choose **Host a game** for the GM or **Join as a player** for a hero. On other devices use the local network address printed in the server window. For example, if the host is `192.168.1.10`, a player opens `http://192.168.1.10:3000/player.html`.

Keep the host awake and the server window open. All devices must be connected to the same network. A guest Wi-Fi network may prevent devices from reaching one another. If the page will not open, check the address, port and Windows Firewall permission for Node.js on the private network. Never send a friend a `localhost` address to use on another device.

The app assumes a trusted group. It has no GM password or accounts. Use one GM tab; open editors separately. Use different browser profiles for different players on one computer so their saved identities do not collide.

## 2. Run the supplied training map

1. On the GM dashboard, find **Adventure scenes** below the map.
2. Select **Roadside Defense — Quick Start** and choose **Open scene**. Opening a scene replaces the current map and resources, so confirm only when you intend to switch scenes.
3. The road runs from the green spawn on the left to the purple castle on the right. The five yellow slots are build locations. The scene starts with 300 gold and 20 base health, using the original seven wave scenarios.
4. Ask players to open their player screen and create heroes.
5. Stay in **Preparation** while placing heroes and buying the first towers.
6. Switch to **Play**. In the **Wave** panel select the first scenario and choose **Launch wave**.
7. Let players act. When they finish, they click **End turn**. Advance **Wave Turn** when the group is ready.
8. Repeat until the wave is cleared. Prepare for and launch the next wave when appropriate.

Readiness is a signal to the GM. The server does not require every player to be ready before the GM advances. Launching another wave while enemies remain **adds** enemies to the battlefield. It does not replace the old wave.

### Read the battlefield

| Map element | Meaning |
| --- | --- |
| Green spawn | Enemies enter here |
| Brown road | Ground enemies travel along it |
| Purple castle | Enemies reaching it reduce base health |
| Yellow tower slot | Build a tower here |
| Blue hero token | A player-controlled defender |
| Health-filled token | The colored fill shows remaining health |
| Status icons | Click a player's status icons for full details |

Ground paths connect through cell edges. Diagonal contact does not make a continuous road. Flying enemies follow their own movement rules and cannot be stopped by ordinary ground blockers.

## 3. Create a hero

Enter a unique player name, choose a hero, allocate exactly **27 ability-score points**, then choose exactly **three normal abilities**. The ultimate is shown separately during play. Complete all three creation steps before entering the battlefield.

| Hero | General role |
| --- | --- |
| Gerald Lightbringer | Shield-based melee tank and party support |
| Zefira | Ranged magic, area attacks and mobility |
| Malik Hammerfury | Durable melee area fighter |
| Bolin | Ranged artillery and mines |
| Connor | Melee bleeding, parry and Grail revival |
| Illiana and Sparky | Mobile ranged duo with physical and magic attacks |
| Torghar the Unbreakable | Heavy armor, thorns and multi-enemy blocking |
| Ratchet | Healing, shields, recovery and energy attacks |

STR affects melee damage, DEX affects ranged attacks and defensive mechanics, CON affects maximum health, INT affects maximum mana, WIS strengthens some effects, and CHA affects some command/support abilities. Individual abilities use different formulas; inspect their descriptions and the current combat rules. Existing prototype descriptions are not a promise that every number represents a new rule.

The browser remembers your player identity. Refreshing normally reconnects that identity. Two clients using the same name compete for one character record. **Recreate hero** removes your current character; use it deliberately.

## 4. Understand Preparation and Play

The GM controls this switch manually. Starting or clearing a wave does not change it automatically. The dashboard's **Combat / Map Editor** switch chooses tools; it does not choose the game period.

### Preparation

Move freely to available cells. A real move to a **different** cell fully restores HP, mana, cooldowns and action availability, including revival and relevant once-used abilities. Merely clicking the current cell does not trigger restoration. The same preparation recovery applies to GM relocation, Astral Blink and Ambulance Rush when they change the hero's cell.

Choose the shared tower roster and build or adjust defenses. Demolition refunds **100% of the tower's recorded build and upgrade investment**, including purchased specializations.

Enemies wait: the GM must enable Play before advancing a wave turn. The GM can still manage scene notes and narrative decisions.

### Play

Normal speed, movement, mana and cooldown limits apply. A hero normally has one movement and one action per round. Moving away from an engaged enemy may provoke an attack. A fallen hero waits for revival according to the current rules or is restored by a supported ability or GM intervention.

Demolition refunds **60% of the current tower level's cost**, rounded by the server. This is not 60% of everything invested. To reorganize freely between fights, the GM can explicitly return to Preparation.

## 5. Take a player turn

Use the four modes near the map: **Action**, **Move**, **Towers** and **Journal**.

### Attack or use an ability

1. In Action mode select a basic attack or ability.
2. Read the range and target preview. Red highlights indicate attacks; green indicates healing/support. Some abilities can affect several units or include nearby units outside the selectable target range.
3. Select a highlighted target or cell. If several units share the cell, choose the intended one using the target buttons.
4. Confirm the action. Dice are rolled automatically, then damage, costs and effects resolve.

Self and area-around-hero abilities do not need an enemy target. Check the highlighted participants and confirm directly. Clicking the selected ability again clears the selection and its preview. New server states update the preview; the start of a new turn clears the selection.

A disabled confirmation button can mean insufficient mana, cooldown, a fallen hero, a used action, an invalid target or a lost connection. Select an available target rather than clicking an unhighlighted cell repeatedly.

Astral Blink chooses a destination cell. Mine Field chooses a valid road cell; the mine waits for a ground enemy to step on it. Ratchet's Surgical Laser can select an ally to heal or an enemy to damage. Revive abilities can highlight fallen heroes.

### Move

Choose Move mode, then a highlighted blue cell. Play limits movement by the hero's speed and round availability. Preparation permits repeated free moves. Towers, occupied cells and other invalid destinations are excluded by the current movement rules.

### Finish

Choose **End turn** after completing your actions. The readiness marker informs the GM. You can cancel readiness if you need to continue and the round has not advanced.

## 6. Build, upgrade and demolish towers

The team shares one treasury. Select up to **five base tower families** during Preparation. Every level and branch of a family counts as that one type. All players see the shared selection. A family with existing towers cannot be removed until its towers have been demolished.

In Towers mode, click a yellow slot to build. Click an existing tower to inspect range, upgrade paths, specializations and garrison details. Gold is spent when a construction or upgrade command succeeds, not when previewing the catalog.

| Family | Main purpose |
| --- | --- |
| Archers | Long-range physical fire; Ranger or Musketeer branches |
| Mage towers | Magic damage; Arcane Wizard or Sorcerer branches |
| Artillery | Heavy fire; Bertha or Tesla branches |
| Barracks | Soldiers holding the road; Paladin or Barbarian branches |
| Dwarven Outpost | Infantry and gold mining when the area is clear |
| Necromancer | Magic fire and raised skeleton defenders |
| Royal Mage | Court Mage damage support or Priestess healing |

Barracks create soldiers automatically. Use **Select rally point** and choose a road cell within the permitted radius. A purchased Stone Golem also has rally controls. Range previews cost nothing and do not apply an attack.

With one character, a demolition request can complete immediately. With several characters, it requires unanimous approval of the characters in the world, including disconnected characters. One rejection cancels it. The GM can force a decision. A GM map-edit replacement is different from a treasury-funded player construction or refund operation.

The catalog editor's **Towers** section is a **browser-local design preview**. Its saved numbers do not change the server's combat rules. Actual new tower mechanics require changes to the shared definitions and server implementation.

## 7. Read statuses and combat messages

The chronicle records outcomes; the debug log contains detailed calculations. HP loss and healing can also appear as floating combat numbers. Positive status icons appear on the left of a token; negative effects and blocking appear on the right. An overflow indicator opens the full list.

Blocking appears only for a real, current link between a living ground enemy and a living defender. Simply standing near an enemy does not guarantee a block. A hero's block limit matters; flying enemies and invalid old links do not create normal blocking icons.

Common effects include bleeding, poison, stun, slow, polymorph, barriers, parry and invulnerability. Status details show remaining turns, shield durability and linked combatants. The display itself does not advance timers.

Some original tower descriptions disagreed with the engine. This edition corrects the verified Musketeer, Arcane Wizard and Tesla upgrade descriptions. The detailed rules and timing are in the developer reference `docs/tower-combat.md`. The game is turn based: cooldowns use the shared round counter, not elapsed real time.

## 8. GM tools during a session

Use **Object**, **Team**, **Enemies** and **Wave** tabs in the inspector. **Map only** hides extra panels; the same button restores them. **Fit** adjusts the map to the available space.

Select a hero to inspect their current stats, abilities and legal targets. GM ability previews do not cast the ability. Restore HP, mana, revival, cooldowns, action and movement independently. Healing alone does not revive a fallen hero unless revival is selected. The hero editor changes maxima separately from CON/INT and can force the next attack's damage.

Find enemies by name or ID, type, injury, negative effects, distance from the castle or selected cell. Select matching enemies or a rectangle on the map. You can heal, relocate, apply effects, clear effects or remove the selected group. Enemy HP editing accepts values from 1 to the maximum; use Remove to delete.

**Clear enemies** and manual removal do not award gold or trigger death effects. Decide whether to cancel pending reinforcements too. Otherwise those groups can appear later. Individual spawn groups allow counts from 1 to 20.

**Undo intervention** restores the world before the last supported bulk enemy operation, hero restoration or reinforcement cancellation. It expires on the next world change. It is not an unlimited editor undo history. Player rollback restores the whole world before a selected current-round player action and removes every later action, including other players' actions. A new round, GM world changes and a server restart invalidate the relevant history.

Session reset and full map reset are destructive tools with confirmations. A full map reset removes roads, spawns, castle, towers and heroes. Make a stopped-server backup before experimenting with them.

## 9. Prepare your own scene

Open **Prepare Scenes** in a separate tab. Create a new scene or copy the current battlefield. Copying captures map setup and enemy types/positions, not players or enemies' temporary combat condition. The live party continues while you edit.

Set a title, scene type, GM description, starting gold and base health. For combat, create at least one spawn and a castle, connect every spawn to the castle using an unbroken edge-connected road, and place ground enemies on connected road cells. Maps range from 8×8 to 40×40.

Place tower slots and optional prebuilt towers. Include their families in the selected roster. Add enemy groups, copies of catalog waves and map notes. A wave's composition and delays are copied into the scene; enemy stats still use the current catalog when enemies are created.

Save the template. Saving an unfinished combat draft is allowed, but opening it requires a valid playable route. Conversation and exploration scenes can be opened without a combat route. Editing a template does not change an already active scene.

Opening a saved scene replaces battlefield and resources, removes old field effects and pending spawns, resets round progress and enters Preparation. Heroes remain in the party, recover, and move to the initial spawn. Their permanent build is preserved; temporary combat effects are cleared.

## 10. Notes, objectives and adventures

Notes have player-facing text plus GM-only secrets, checks, DC and success/failure guidance. Reveal a note to send its title, coordinates and player text to players. Secret fields remain in the GM view. Narrative checks are reminders: this app does not automatically roll the check or apply a written consequence.

Counters track narrative quantities such as rescued villagers. Objectives can be manual or depend on rounds, counters, base HP, defeated enemies and other supported conditions. If automatic outcomes are enabled, all primary objectives completed means full success; mixed resolved primary objectives mean partial success; all primary objectives failed means defeat. The GM can choose an outcome manually.

Events can spawn reinforcements, launch a saved scene wave, change a cell, update counters or objectives, reveal notes, end a scene or send a message. By default they wait for GM confirmation. Review the listed actions before applying. Events execute once; invalid actions reject the operation rather than partially applying it.

NPC cards record role, motivation, voice and knowledge. Tactics cards are reminders. Boss cards have descending HP thresholds; phase reminders can advance as the boss loses health, but **do not change its combat stats automatically**.

In **Session Plan**, arrange saved scenes as Required, Optional or Backup. Add outcome-based branches where needed. Without branches, Next skips backup scenes. With branches, the available transition must match the scene outcome. Transitions always need a GM decision; opening the next scene replaces the map and restores heroes. Save the plan, then start it from the GM dashboard.

## 11. Save, back up and recover

World changes schedule a save approximately 500 ms after the latest update. Wait at least a second after the last action, then stop the server using Ctrl+C. Copy `gamestate_save.json`, `gamecatalog.json` and `scenes.json` into a dated backup folder. Include any custom configured paths. Back up browser-only tower drafts separately if you need them.

To restore, stop the server, preserve the current files in another folder, copy the chosen backup files into place, restart and refresh all clients. Do not edit live files expecting the running process to reload them. To start a genuinely new party, use a new save folder through `KR_SAVE_FILE` instead of deleting the only save.

Logs are local at `logs/game.log` unless configured otherwise. They can contain player names and session details; inspect them before sharing. There is no remote analytics service added by this edition.

## 12. Troubleshooting

| Symptom | What to check |
| --- | --- |
| Node.js not found | Install Node.js 24 LTS, then reopen the terminal/launcher |
| Initial dependency install fails | Check internet access and the displayed npm error; keep the lockfile |
| Port already in use / EADDRINUSE | Stop the other game process or set a different PORT |
| Phone cannot open the game | Use the host's LAN IP, same network, configured port and private-network firewall permission |
| Page opened as a file and will not connect | Open the HTTP address printed by the running server |
| Enemy does not move | Verify continuous road, edge connections, spawn and castle; check stun and blocking |
| Wave Turn is unavailable | Switch the game period from Preparation to Play |
| Everyone ready but nothing happens | The GM must advance Wave Turn manually |
| Lost connection | Restart the server if needed, then refresh clients |
| Catalog/library conflict | Preserve your draft text, then load the latest server version before editing again |
| Scene will not open | Check route, enemy references and the server's validation message |
| Tower preview changes do not affect combat | They are local prototypes; edit server/shared definitions to implement rules |
| Old Russian hero acts incorrectly after upgrade | Convert built-in names in the save and test with a fresh browser profile |
| Unexpected old party | Check the save path and which server process/port you opened |

For a bug report include the release version, Node version, device/browser, exact steps, expected and observed behavior, and a reviewed log excerpt. Keep the original save backed up before trying a fix.
