---
"kazu-fira": major
---

Remove the public `migrateScript` API and move to strict v2 script validation.

BREAKING CHANGE: `migrateScript` is no longer exported. Use `validateScript`/`normalizeScriptInput` for strict version-2 script handling.
