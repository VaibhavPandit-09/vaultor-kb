# Instructions for agents working on Vaultor

Read [docs/CODEBASE.md](docs/CODEBASE.md) before making changes. It is the living reference for architecture, data contracts, UI behavior, design conventions, setup, and known limitations. Use [docs/README.md](docs/README.md) to find other documentation.

## Required maintenance workflow

1. Inspect the current code and working tree before editing. Preserve unrelated work.
2. Check the guide's relevant sections against the implementation; historical specifications are context, not proof of current behavior.
3. Make the requested change and run the checks appropriate to its scope.
4. **Update `docs/CODEBASE.md` in the same change whenever code, behavior, UI, structure, dependencies, configuration, or workflows change.** Correct existing sections instead of appending contradictory descriptions. Update its review date and add a short entry to its maintenance history with the change and actual validation outcome. For changes with no architectural effect, record that explicitly in the history.
5. Keep supporting documentation in `docs/`, link it from `docs/README.md`, and preserve one authoritative explanation of each topic. Do not rewrite archived specifications as current documentation.
6. Report the change, checks performed, and any remaining limitations. Do not claim tests or visual verification that were not performed.

Root `README.md` and this discovery file are intentionally small entry points; substantive documentation belongs in `docs/`. No documentation generator or background updater exists: maintaining the guide is part of completing every change.

Preserve the resource-based model, structured Tiptap JSON, shared API client, shared settings/design tokens, and centralized Escape/focus behavior. Consult the guide's known limitations before changing saving, links, workspace operations, or import/export. Use disposable data for tests that mutate a workspace.
