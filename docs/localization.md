# English localization

The English edition translates 2,516 distinct extracted source strings, including template fragments and HTML sections. This is a source-string count, not a claim of 2,516 separate interface controls. The catalog is in `localization/ru-en.json`; it is a maintenance/migration reference and is not downloaded by the browser during play.

## Scope

- All shipped user-facing HTML screens, ARIA labels, tooltips, ordinary UI feedback and prototype UI text.
- Hero, enemy, tower, wave, trait and ability descriptions in built-in data and the supplied saved catalog.
- Server errors, combat messages and scene/editor validation messages.
- New English user, hosting and development documentation. These manuals are rewritten around the existing implementation rather than literal line-for-line copies of the old manuals.
- Source IDs, WebSocket message names, paths, formulas and balance numbers stay unchanged. English hero display names are changed consistently in rules that inspect those names.

Custom user text, historical logs and unsupported imported content cannot be translated automatically from this dictionary. Developer comments, existing test descriptions and Unicode test fixtures are retained in their source language where they do not appear in the product. Russian keys in the bilingual dictionary are intentional.

## Terminology

| Source term | English term | Meaning |
| --- | --- | --- |
| Мастер | GM / Game Master | Person running the session |
| Период подготовки | Preparation | Free positioning and preparation recovery |
| Период игры | Play | Normal combat restrictions |
| Ход волны | Wave Turn | GM command advancing combat |
| Моб | Enemy | Enemy unit or definition |
| Набор башен / арсенал | Tower roster / arsenal | Shared selection of base families |
| Точка сбора | Rally point | Garrison or golem position |
| ХП | HP | Hit points |
| МП / мана | MP / mana | Ability resource |
| КД | CD / cooldown | Turns until an ability is ready |
| Чистый урон | True damage | Bypasses ordinary defenses where the engine specifies it |
| Исход | Outcome | Scene result |
| Цель | Target / Objective | Target for combat; objective for a scene goal |

Names follow the supplied project: Gerald, Zefira, Malik, Bolin, Connor, Illiana, Sparky, Torghar and Ratchet. These translations do not establish ownership or official franchise terminology. Branding remains subject to the owner's rights review.

## Maintaining English text

Use complete phrases where practical; do not build a sentence by translating isolated Russian words. Template fragments must preserve variable order and numeric meaning. Do not translate IDs. Update source, the reference dictionary and any text-specific test assertions together. For abilities, check the calculation in the engine before promising an effect in a description.

Run `npm run check`. `check:english` validates built-in data, starter catalogs/scenes and public HTML. Syntax checks compile executable scripts. It does not claim to understand every possible dynamically generated message; browser inspection and the release audit complement it. A one-off TypeScript AST audit of production string literals was used during preparation; TypeScript is not a runtime dependency.

For a complete language update, translate newly written custom scene text as well. Never mass-replace Russian words inside identifiers, regular expressions or player identity keys.
