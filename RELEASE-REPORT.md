# Release preparation report

**0.1.0-en.1 · English local-play candidate · 23 October 2026**

## Scope and provenance

Prepared from the user-supplied `Kr6DnD (1).rar`. Original archive SHA-256:

```text
d42fa8da9ad4171293a366825282668e57a1aa0abf7c8438ff952c9ab277ff44
```

The original archive was preserved. Work was performed in a separate Downloads folder. The Area47 repository was not changed. Archived instructions were treated as project reference material, not authorization to publish, deploy or send communications.

The package version is assigned to this English preparation. It includes 2,516 extracted source-string translations, new English manuals and a Russian owner/release manual beside the product. Developer comments, old test names and Unicode fixtures are not all translated. Built-in data IDs, numeric values, original wave composition and combat rules are preserved; corrected ability descriptions and added installation/sample content are listed in CHANGELOG.

## Completed checks

| Check | Observed result |
| --- | --- |
| Original supplied project baseline | 250/250 tests passed |
| English candidate full suite | 253/253 tests passed; none skipped |
| Syntax compilation | 70 JS/CJS/inline HTML scripts compiled |
| Built-in content | 15 enemies, 7 waves validated |
| Example content | Built-ins plus Crypt Guard and example wave validated |
| Starter content | Translated saved catalog and playable training scene validated |
| English content check | Game data, tower previews, traits, dictionary values and HTML passed |
| Dependency installation | Clean `npm ci --ignore-scripts` succeeded |
| Dependency audit | 0 reported vulnerabilities on preparation date |
| License inventory | Full license texts for 67 unique installed dependency name/version pairs included |
| First-start regression | Existing save/catalog/library are preserved; missing starter files created |
| Migration regression | Hero labels translated; IDs, numbers and player identity/references preserved; original/existing output cannot be overwritten |
| Production string-literal audit | 36 runtime JS files contain no Russian string/template literals; comments excluded |
| Numeric and identifier contract | Four supplied data sources match the original numeric structure and explicit hero/skill/tower/wave ID contracts |
| Documentation links | 172 local links resolved before the final report update |

Automated environment: Windows, Node.js 24.16.0, npm 11.13.0. Audit results describe this installation and date, not a permanent absence of vulnerabilities.

## Browser acceptance

Checked in the available desktop Chromium-based in-app browser using a separate port and data directory:

- New start page and English guide loaded.
- GM connected and opened Roadside Defense — Quick Start.
- Player created Gerald, spent 27 points and selected three abilities.
- Player entered the shared 12×8 battlefield.
- Royal Archers I built for 70 gold; GM treasury updated from 300 to 230.
- GM changed Preparation to Play, launched the first wave and advanced round 1.
- Four Bandits spawned and one took tower damage, visible on the GM map.
- Catalog name edit saved and survived editor reload; test edit then restored.
- Tower preview tab displayed local-only status and save label.
- Scene and adventure editors connected and loaded English controls; inspected editor browser error log was empty.

The screenshot beside this package is from this isolated sample party. It contains a disposable test player, not the supplied saved game.

## Distribution preparation

The downloadable archive excludes the original live save, logs, backups, installed dependencies, unrelated text files and unused Kingdom Rush map-compilation JPEG. The translated saved enemy/wave catalog is supplied as installation data under `defaults/`; it is not a player save.

Public screen titles use Kr6DnD, and borrowed-franchise references are documented for owner review. This is not a content/branding clearance. No project license, author identity or permission evidence was invented. See RIGHTS-REVIEW.md.

## Limits of verification

Real second-device LAN/hotspot connectivity, physical phone/tablet layout, macOS/Linux launch, browser diversity, long multiplayer sessions and the complete seven-wave campaign were not manually exercised. Existing automated tests cover many mechanics and scene/plan cases; they do not replace those acceptance checks.

The app remains a trusted-LAN prototype: self-declared GM role, one shared party per process, client-supplied primary dice, no automatic reconnection for most clients, debounced game save and local-only tower design editing. Some legacy hero descriptions may still require a separate mechanic-by-mechanic editorial review; the source was translated without silently rebalancing its promises into new rules.

The package has not been published or deployed. Technical local testing can proceed; public release needs the owner decisions in RIGHTS-REVIEW.md and the remaining device acceptance checks.

## Archive verification

The packaged ZIP was extracted to an independent empty directory. A fresh locked dependency installation and the full 253-test check passed there. A real server launched from the extracted files served all public HTML/CSS/JS resources successfully and returned HTTP 404 for save/library/package files outside public.

The extracted server accepted all eight built-in heroes, opened the training scene, built Royal Archers I (treasury 230), launched four Bandits and resolved round 1 with tower damage. After stopping and restarting, all eight heroes, the tower, treasury, round and enemies were restored. These are script-driven HTTP/WebSocket checks, separate from the browser walkthrough above.

The final archive adds the verification summary and updated report; its executable files are checked against that independently tested extraction. File manifests cover the exact distributable files. The ZIP checksum is supplied separately. See `VERIFICATION.md` beside the product folder in the download.
