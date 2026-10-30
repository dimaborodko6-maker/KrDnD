# Changelog

## 0.1.0-en.1 — English local-play release candidate — 2026-10-23

- Translated shipped screens, built-in content, tooltips, accessibility labels, combat messages and editor/server feedback into English.
- Added a start page, a complete English host/player guide and English maintenance references.
- Added a Roadside Defense training map using the supplied original wave definitions and existing balance.
- Added first-start seeding that preserves existing files, Windows/shell launchers and a migration utility that writes to a new file without changing IDs or numeric values.
- Corrected verified legacy Musketeer, Arcane Wizard and Tesla upgrade descriptions to match the current engine. No combat rebalance.
- Clarified that tower catalog edits are browser-local design previews and do not change server rules.
- Fixed the player WebSocket URL to select the secure scheme when served over HTTPS. TLS hosting/authentication are not supplied by this change.
- Added syntax, English-content and release regression checks. Existing gameplay tests remain enabled.
- Removed unrelated images, a previous live save, logs, backups and bundled installed dependencies from distribution. Preserved the translated starter enemy/wave catalog separately under `defaults/`.

This is a packaging version assigned for this English preparation, not an assertion of the original author's public version history. Nothing was published or deployed.
