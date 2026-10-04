# Documentation

- [Desktop and private-network plan](desktop-network-plan.md): D1–D7 implemented on Windows, including owned server, native lifecycle, paired HTTPS, saved-change propagation and integrated chrome; D8 installers/updates and D9 real Windows–Mac verification remain; D10 Ubuntu follow-up. One sprint per authorization.
- [Saved changes across devices](MULTI-DEVICE.md): bounded approved SSE, clean-note refresh, draft/deletion/replacement recovery, scoped settings, revision requirements and actual validation.
- [Host access and pairing](HOST-ACCESS.md): owner/browser bootstrap, opt-in HTTPS, stable host trust, device approval/revoke, CSRF, approved agents and current limits.
- [Desktop shell and connections](DESKTOP.md): bundled runtime/server packages, data/process ownership, startup logs, paired profiles/discovery, integrated chrome, persistent sessions, native bridge and current limits.
- [Platform and connection boundary](PLATFORM.md): browser/platform transport, cancellation, protocol checks, download outcomes, build diagnostics and sidebar shortcut migration.

- [Workspace evolution plan](workspace-evolution-plan.md): empty-note closing and expanded-table workspace implemented; scalable Library and collections/tags implemented; U1 navigation refresh fix complete; U2 resource organization/pins complete; U3 palette/saved-note full-text search complete; K1 form/palette keyboard corrections complete; K2 organization simplification complete; K3 title-first search and explicit scope complete; N1 direct-download exports implemented; N2 pane navigation/shared editing implemented; N3 journeys implemented; N4 session recovery implemented; N5 linked-resource exports implemented; N6 integration complete; exactly one sprint per authorization.

- [Editor and portability plan](editor-portability-plan.md): imports and table foundations implemented; individual note exports implemented; table filtering/copy/export implemented; remaining manual verification recorded; one sprint per authorized call.

- [Modernization tracker](history/modernization-plan.md): archived implementation checklist, validation evidence and remaining manual coverage.

- [Library workflows](LIBRARY.md): paginated metadata browsing, quick access, unified pins, resource-level collections/tag management, bulk organization and transfer semantics.
- [Search and Ctrl+K](SEARCH.md): saved-note indexing, ranking, palette targeting, diagnostics and limits.
- [Table workflows](TABLES.md): contextual table menus, filtering, spreadsheet paste/copy, CSV export and expanded editing.
- [Pane navigation and shared editing](NAVIGATION.md): pane ownership, linked opening, on-demand backlinks, responsive journeys, duplicate views and source save barriers.
- [Sessions and draft recovery](SESSIONS.md): per-tab IndexedDB layout, recovery journals, conditional note revisions and workspace replacement isolation.
- [Individual note exports](NOTE-EXPORTS.md): standalone/linked-graph formats, snapshot semantics, assets, fidelity, limits and verification.
- [Integration handoff](INTEGRATION.md): N6 fixes, focused test/visual coverage and remaining verification limits.
- [API guide](API.md): shared UI/agent contracts, examples and transfer flow.
- [Operations guide](OPERATIONS.md): development, Docker, limits, logging and isolated verification.
- [Living codebase guide](CODEBASE.md): current implementation, source map, API/data contracts, UI/design, setup, validation, limitations, and maintenance history. This is the primary reference for agents and maintainers.
- [Agent instructions](../AGENTS.md): repository-wide requirement to read and maintain the guide.
- [Historical v2 specification](history/vaultor-v2-spec.md): former root README; describes product intent and includes claims that differ from current code.
- [Historical v1 specification](history/vaultor-v1-spec.md): earlier product model and delivery notes.
- [Original frontend template README](history/frontend-template.md): archived scaffolding documentation, not the current development guide.

Put new documentation here and add a link to this index. Update the current guide in the same change as the implementation. Preserve historical documents as historical context.
