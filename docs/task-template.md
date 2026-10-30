# Maintenance task template

Copy this structure when requesting a change from a developer or coding assistant.

```text
Goal:
What should a player or GM be able to do after this change?

Current behavior:
Exact steps, current result and relevant version.

Expected behavior:
Concrete example, including invalid-input behavior.

Data layer:
Built-in data / saved enemy catalog / scene library / runtime / browser preview.

Read first:
README.md, relevant docs page, nearest implementation and tests.

Preserve:
IDs, unrelated mechanics, saves and numeric balance unless explicitly changing them.

Validation:
Targeted tests, full npm run check, relevant browser flow, backup/restart if needed.

Delivery:
Changed files, verified behavior, test results and remaining limitations.
```

Example: add a new enemy using only existing shield/regeneration traits, with a specified difficulty budget and a wave referencing its ID. Update the selected authoritative data layer, validate the full catalog and confirm that the editor copy, spawn, combat, save and reload work. Do not silently create an unsupported ability because its description sounds plausible.
