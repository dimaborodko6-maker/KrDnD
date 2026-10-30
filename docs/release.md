# Release, upgrade and recovery procedure

Target: a downloadable source package that a host runs for friends on a trusted local network. No public server or installer containing a Node runtime is included.

## 1. Owner metadata and rights

Complete [RIGHTS-REVIEW.md](../RIGHTS-REVIEW.md), choose the title/license, add author and support details, and revise promotional text to match the actual cleared product. Do not interpret technical test success as permission to publish protected content. Keep the candidate private until those decisions are recorded.

## 2. Freeze and validate the candidate

Use a clean copy in a new folder. Install Node.js 24 LTS and run:

```powershell
npm ci --ignore-scripts
npm run check
npm audit --omit=dev
```

Record actual versions and results. Review dependency advisories at the publication date rather than relying on an older audit. Keep the lockfile. Do not perform an unreviewed major dependency upgrade just to change an audit score.

Manual acceptance checklist:

- First launch creates starter catalog/library files and does not replace existing ones.
- Root page, guide, GM, player and all editors open.
- Open Roadside Defense, create a hero, allocate 27 points, select three abilities and join.
- Build a tower, verify gold on GM/player views, move a hero and use an ability with a valid target.
- Switch to Play, launch a wave, advance a round and inspect English combat feedback.
- Save an enemy/wave edit and reload it. Confirm tower edits are labeled as local previews.
- Save/open a scene, reveal a note, create a plan and test a branch if shipping a new adventure.
- Stop and restart; check party, catalog and library restoration.
- On a separate device, open the host's LAN address. Check narrow/mobile layout, not only a resized desktop window.

The preparation report distinguishes automated/browser checks already performed from device/OS checks still outstanding.

## 3. Package only distributable content

Include source modules, `public`, `defaults`, `localization`, scripts, tests, docs, package metadata/lockfile, launchers, the selected project license and third-party notices/license texts. Include a checksum manifest.

Exclude `node_modules`, live `gamestate_save.json`, live `gamecatalog.json`, live `scenes.json`, `logs`, backups, `.env`, editor caches and unrelated reference files. The clean installation definitions belong under `defaults`; never package the active session merely because a file happens to be in the project root.

The supplied ZIP follows that structure and adds the Russian owner instructions beside the product folder. It does not contain an EXE, a bundled Node runtime or a signed installer. The Windows launcher is a readable command file. Dependencies are installed from the lockfile on the host, with no project/dependency installation scripts executed by that command.

On Windows, after selecting the correct clean release directory, compress its reviewed contents with Explorer's ZIP command. On other systems use an equivalent ZIP tool that preserves UTF-8 names. Do not zip the whole development directory after a playtest. If using `npm run pack:source`, note that npm's archive convention omits `package-lock.json`; use the reviewed ZIP as the primary reproducible download.

Check the ZIP independently: extract to another empty folder, verify file hashes, run `npm ci --ignore-scripts` and `npm run check`, then test first start. Calculate a SHA-256 checksum for the exact ZIP:

```powershell
Get-FileHash .\Kr6DnD-English-0.1.0-en.1.zip -Algorithm SHA256
```

## 4. Prepare the download page

State the version, purpose, supported/tested runtime and OS, installation steps, local-network requirement and GM role. Explicitly state that the host needs Node.js and that the package is source distribution. Do not advertise a public hosted service, accounts, matchmaking or authoritative server-side tower editing.

Provide the ZIP, checksum, changelog, English playing guide, support destination and known limitations. Use screenshots from a fresh sample game with no personal player data. `store-copy.md` contains a draft description to adapt after rights/title decisions.

Publish only after the owner approves the actual archive and description. This preparation does not publish automatically. When issuing a new version, preserve the previous archive and notes so users can revert.

## 5. Upgrade without losing a party

1. Stop the old server after waiting for its latest save.
2. Back up `gamestate_save.json`, `gamecatalog.json` and `scenes.json`, including custom configured paths. Copy logs separately if useful. Keep an untouched copy of the old application.
3. Extract the new release into another folder and install dependencies from its lockfile.
4. For a Russian save, run the migration utility for each JSON into new paths. It converts exact known built-in text, preserves numeric values/IDs and refuses overwrites. Review custom text and historical logs separately.
5. Use a separate port/data folder to open the migrated party and inspect hero identity, tower state, waves, library references and a sample turn. A fresh browser profile avoids an old cached character during this test.
6. Adopt the reviewed files only after this check. Start the chosen release and refresh every client.

Do not mix an old save with unrelated catalog/library revisions without reviewing references. A saved catalog replaces the whole built-in enemy/wave list. First-start seeding does not update an existing file; this is deliberate protection, not an automatic content upgrade.

## 6. Restore or roll back

Stop the current server. Preserve its files in a new backup folder. Restore the three matching JSON files and the application version known to read them. Start on the expected port and refresh clients. Do not delete the only backup to make a clean start.

The migration utility never writes to its input. If it reports an existing destination, choose another output name. A stopped-server backup remains the recovery point even if the converted content needs more translation.

## 7. Collect useful feedback

Ask for version, Node version, OS/browser, reproducible steps, expected/actual behavior and a reviewed log excerpt. If a save is needed, ask the tester to remove private narrative material or send it through the agreed support route. The logs may contain names, local addresses and game details. The product does not add a remote telemetry service.

Priorities for a later public-service edition are authenticated GM/player sessions, room isolation, server-side dice, complete command schemas, WebSocket origin/access controls and operational hosting hardening. These are separate product changes and were not added to this local-play release.
