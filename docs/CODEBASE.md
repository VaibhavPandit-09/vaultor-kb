# Vaultor: living codebase and agent guide

Last reviewed: 2026-09-22. This is the current implementation reference. Update it in every change as required by [AGENTS.md](../AGENTS.md). Historical specifications are context only. See [API.md](API.md), [OPERATIONS.md](OPERATIONS.md), and the [documentation index](README.md).

## Product and architecture

Vaultor is a personal, locally hosted knowledge workspace. Notes and uploaded files are resources, organized by tags and connected through inline links. The UI opens directly into the workspace. There are no accounts, authentication, master passwords, tokens, lock controls, encryption, or encrypted archive compatibility. Obsolete credentials stored in an existing database are ignored; startup does not delete resources.

React 19 + TypeScript 5.9 + Vite 8 + Tailwind 3 + Redux + Tiptap 3 call Spring Boot 4 / Java 25 through a shared Axios client at /api. Spring Data JPA stores metadata and serialized Tiptap documents in SQLite; file bytes live separately on disk. Backend JSON uses Jackson 3 tools.jackson. Exact versions are in the package lock and pom.xml. Vite proxies /api to port 8080 in development. Docker embeds the frontend in the Spring JAR and serves one origin.

The backend is authoritative. This is not an offline browser database or a synchronization system. Docker publishes to loopback by default. Do not add a replacement authentication scheme or expose this personal deployment publicly as part of routine maintenance.

## Repository and source map

Paths in the following tables are repository-relative.

```text
AGENTS.md                  Agent discovery and documentation maintenance rules
README.md                  Short project/docs entry point
docs/                      Living guide, index, historical specifications
Dockerfile                 Frontend + backend + runtime, multi-stage image
docker-compose.yml         One service, port 8080, named data volume
frontend/
  package.json / package-lock.json
  vite.config.ts           React plugin and API development proxy
  tailwind.config.js       CSS-variable colors, class-based dark mode, typography
  eslint.config.js         TS, React Hooks, React Refresh lint rules
  tsconfig*.json           Strict TypeScript project references
  index.html / public/     HTML shell and static public assets
  src/
    main.tsx / App.tsx     Root providers, application boundary and providers
    index.css             Active global theme and editor styles
    types.ts              Resource and Tag contracts
    state/                Redux store and typed hooks
    pages/                Dashboard
    components/editor/    Tiptap editor, extensions, menus, import helpers
    components/modals/    Shared modal, palette, settings, shortcuts
    components/           PreviewLayer and FilePreview
    lib/                  API, settings, shortcuts, colors, symbols, focus helpers
backend/
  pom.xml / mvnw* / .mvn/  Java build and Maven wrapper
  Dockerfile              Backend-only image
  src/main/java/com/vaultor/vaultor/
    VaultorApplication.java
    config/               MVC, CORS, SPA fallback, request IDs, structured logging, mutation gate
    controller/           HTTP endpoints
    service/              Resource, link, tag, settings, storage, diagnostics and transfer logic
    model/                JPA entities
    repository/           Spring Data repositories
  src/main/resources/application.properties
  src/test/java/com/vaultor/vaultor/VaultorApplicationTests.java
```

| Responsibility | Source to inspect first |
| --- | --- |
| App bootstrap and routes | `frontend/src/main.tsx`, `frontend/src/App.tsx` |
| Workspace orchestration, panes, sidebar, CRUD, imports | `frontend/src/pages/Dashboard.tsx` |
| HTTP JSON conversion, request IDs and error reporting | `frontend/src/lib/api.ts` |
| Navigation/filter state | `frontend/src/state/store.ts`, `hooks.ts` |
| Settings defaults, migration, persistence, DOM theme | `frontend/src/lib/settings.tsx` |
| Command definitions, ranking, multi-step actions | `frontend/src/lib/commandPalette.ts` |
| Palette rendering, input, preview coordination | `frontend/src/components/modals/CommandPaletteModal.tsx` |
| Keyboard parsing, validation, defaults | `frontend/src/lib/shortcuts.ts` |
| Escape ownership and editor focus restoration | `frontend/src/lib/escape/escape.ts`, `EscapeManagerProvider.tsx`, `useRestoreFocusOnClose.ts` |
| Portal placement with viewport constraints | `frontend/src/lib/useAnchoredPortalPosition.ts` |
| Theme surfaces and editor typography | `frontend/src/index.css`, `frontend/tailwind.config.js` |
| Glass panels and colored tag chips | `frontend/src/lib/transparency.ts`, `tagColors.ts` |
| Editor composition, saving callbacks, selection, tables | `frontend/src/components/editor/BlockEditor.tsx` |
| Slash detection and available commands | `SlashCommandExtension.ts`, `SlashMenu.tsx` in the editor directory |
| Inline resource links | `ResourceLinkExtension.ts`, `ResourceLinkMenu.tsx`, `ResourceLinkView.tsx` in the editor directory |
| Code highlighting, language selection, copy UI | `frontend/src/components/editor/CodeBlockView.tsx` |
| Markdown/CSV insertion | `markdownUtils.ts`, `csvUtils.ts` in the editor directory |
| Symbols and text replacement | `frontend/src/lib/symbols.ts`, `components/editor/SymbolSystemExtension.ts` |
| File preview chrome and renderers | `frontend/src/components/PreviewLayer.tsx`, `FilePreview.tsx` |

`Dashboard.tsx` is a large orchestration component, not a thin routing page. Many state synchronization responsibilities live there. `App.css` and several assets are leftover scaffolding; `App.tsx` does not import `App.css`. `GlobalSearchModal.tsx` exists but is not mounted by Dashboard; the command palette is the active search interface. `WorkspaceSettingsService.java` is a legacy service; current controllers use `SettingsService`.

## Data model and persistence

| Entity | Contract |
| --- | --- |
| Resource / resources | UUID string id, type note/file, title, serialized content, filePath, MIME, size, createdAt/updatedAt/lastOpenedAt, many-to-many tags |
| Tag / tags | UUID id, normalized unique name, persistent color |
| Relationship / relationships | fromId/toId/type=link, derived from resourceLink nodes; IDs are plain strings |
| Setting / settings | key_name/value; app_settings_v2 holds workspace/local/keybindings |
| TransferOperation | persisted kind, status, phase, progress, mode, detail, requestId, timestamps, cleanup journal |

SQLite uses Hibernate ddl-auto=update; there is no versioned migration framework. Resource DTOs omit internal file paths and expose note content as a JSON object (never a JSON-encoded string). Entity persistence still stores content as text. Dates use LocalDateTime without a timezone suffix. Updating open/tag state can change updatedAt; it is not strictly a content timestamp. Import preserves archived IDs on replacement and allocates new IDs on merge.

ResourceService saves the note and rebuilds outgoing link relationships transactionally. LinkExtractionService extracts resourceLink.attrs.resourceId; table sourceResourceId is checked/remapped by DocumentService but is not a backlink edge. Replacing links rewrites stored note references and table source references, rebuilds edges, and deletes the old resource. Replacement with itself is rejected. Ordinary deletion can leave incoming document references; the read-only integrity API reports them. Tag names trim/lowercase and unify case-insensitively; default colors are deterministic. FileStorageService confines paths to its configured directory.

## Backend and API contracts

Use [API.md](API.md) for flows and /api/openapi.json for the machine contract. The same APIs serve agents and UI, without a privileged execution interface. Explicit DTOs cover resources, tags, settings and operations. List responses include items/page/size/totalItems/totalPages (size 1–200). Search is title-based with up to 200 matches.

All API responses carry X-Request-ID. Errors use problem details with status, code, detail, fieldErrors and requestId. Default logs contain request method/path/status/duration and mutation outcomes, not complete request payloads, note bodies or binary contents. Unexpected failures include stack traces. Frontend boundaries and network errors retain diagnostic references and correlate server request IDs.

RequestLoggingFilter takes a shared workspace gate for resource/tag/settings calls. Transfers take the exclusive gate during snapshot/commit, and concurrent calls receive 409 WORKSPACE_BUSY. The gate is process-local: run a single backend against a data directory. Health reports readiness and busy state; integrity checks never repair data.

## Frontend state and workflows

Root composition is StrictMode, Redux, application ErrorBoundary, SettingsProvider and EscapeManagerProvider. App mounts Dashboard directly. Redux owns resource navigation/history and filters. Dashboard owns resource list/detail caches, open panes, previews and modals. Tiptap owns live documents/selections. Settings context owns the normalized configuration. The API client converts legacy internal string content into JSON at the HTTP boundary; listResources loads paginated results for the sidebar.

Opening a note appends or replaces panes according to settings. Pane count is bounded 1–3; closing a pane is distinct from deleting a resource. File previews do not consume a pane. Sidebar filtering combines type and all selected tags. Palette commands support create/upload/rename/delete/close/settings/help with ranked resource search and multi-step interactions. Preview highlighting temporarily overrides the preview and restores it on dismissal.

SaveCoordinator holds latest title/content per note, debounces and serializes writes, coalesces newer edits, and exposes Saving / Saved / Save failed with Retry. The title bar has a compact status icon at the top right (spinner/check/cloud alert), hover/focus tooltip, accessible status announcement and clickable retry on failure. Editor changes reach the coordinator immediately so unmount cannot silently discard a debounce. Pane closing/replacement, history navigation, deletion and transfers flush pending saves. Import clears all stale draft caches after refresh. beforeunload warns while notes are dirty; unload-time network requests are not treated as durable storage. Failed drafts remain in memory and must be retried before leaving.

Application and independent editor/settings/preview/transfer/diagnostics boundaries show recovery UI and copyable diagnostic details. Regional recovery preserves sibling editor state. Global network failures show a banner. Settings writes are serialized with visible failure/retry. Preview requests abort/ignore stale results and clean up object URLs. Diagnostic delivery failures never trigger further diagnostic requests or break UI: queue 100, batch 20, three delivery attempts, local history 100; backend history 200 events/24 hours/process lifetime.

## Editor and content contracts

`BlockEditor` composes StarterKit (with custom code block), headings 1-3, placeholder, Lowlight code block React node view, resizable tables, highlight, nested tasks, underline, slash commands, resource links, and symbol replacement. Existing marks include bold, italic, strike, inline code, underline, and highlight.

Slash menu actions: Text, Heading 1/2/3, Bullet List, Numbered List, Task List, Code Block, Quote, Divider, Highlight, Insert Symbol, Table, Link Resource, Upload Markdown, Upload CSV as Table. Symbol candidates are sourced from `lib/symbols.ts`. `:symbol_name:` converts on space/Enter; punctuation patterns such as `->`, `=>`, `<=`, `!=`, `...`, and `--` convert on space.

Inline links are atomic Tiptap nodes:

```json
{"type":"resourceLink","attrs":{"resourceId":"uuid","label":"Resource title","type":"note"}}
```

The `[[` picker searches resources and offers note creation/file upload. Preserve the `resourceLink` node name and `resourceId` attribute when evolving editor schemas: backend backlink extraction depends on them. The displayed label is stored in the node, not dynamically joined to a resource title.

Native file picker commands delete the slash query without scheduling editor focus, then blur the active element synchronously before opening the dialog. CSV/Markdown imports capture the originating editor before awaiting file reads/uploads. Focus restoration registers on Tiptap mount and unregisters on unmount; do not access view.dom before mounting. The reported Windows/Vivaldi hidden-pointer symptom requires native confirmation; component tests verify the focus race is removed.

Current cross-component bridges include `window.__vaultor_editor`, `__openResource`, `__executeResourceLink`, `__executeSlashCommand`, and a per-editor `__slashCommandExecutors` map. Multi-pane changes must preserve correct editor ownership and cleanup; replacing these bridges requires coordinated edits, not a single call-site change. `BlockEditor` is memoized with a custom comparison; new props may require comparator updates.

Markdown paste detection converts text using `marked` with GFM, then inserts HTML into Tiptap. Markdown upload inserts content into the active editor and does not create an uploaded file resource. `tiptapToMarkdown` is a best-effort helper, not a lossless serialization format for all supported nodes.

CSV editor import both uploads a file resource and inserts a table. The custom parser handles comma/tab/semicolon delimiters, quoted fields, BOM/newline normalization, and pads uneven rows. It validates content against the editor schema, falling back to a resource link plus code block/text. Imported table attrs retain `sourceResourceId`, `sourceResourceTitle`, `sourceResourceType`; these are not themselves `resourceLink` nodes and do not produce graph edges. File CSV preview separately uses Papa Parse.

Tables have resize handles, selected-cell styles, hover controls for row/column operations, and Enter in the last row adds a row. Preserve selection/focus restoration across menus, palette, and pane switches. Test both editors when changing plugins shared by multiple panes.

## UI and visual design

The active design is a full-height workspace with a subdued sidebar, rounded note surfaces, compact icon controls, restrained borders, and accent-colored actions/links. Use Lucide icons and existing Tailwind/CSS-variable conventions. Exact component markup remains the authority for spacing; there is no independent design library or token package.

### Layout and surfaces

- Dashboard: `h-screen`, hidden outer overflow, scrollable internal regions. Sidebar contains type selector, New Note/Upload, resource groups, tag chips/color controls, and footer export/import/help/settings/theme/diagnostics controls.
- Fixed sidebar can collapse. Floating sidebar uses a `w-72` glass panel, hover reveal/pinning, and hide delay. Focus mode hides sidebar access surfaces.
- One note is centered at `max-w-4xl`. Two notes use equal flex panes and `gap-6`; three use `gap-4`, with active pane flex 1.2 versus 0.9 for others. Pane corners are about 1.35rem. Each pane has title/tag chrome and scrollable editor content. Smooth mode dims/scales inactive panes; snappy mode keeps equal opacity/scale.
- Side preview is a fixed right overlay, full width on narrow screens, 60% at medium and 40% at wide widths, capped at 44rem; it is not a note pane. Floating preview is 84vh, `max-w-6xl`, with mode toggle, Open, Download, and close controls.
- Command palette is a custom overlay with a panel capped at 40rem, searchable ranked items and multi-step interaction. Generic dialogs use `AppModal`, default `max-w-md`, rounded 28px shell, header/body/footer.
- Settings uses `AppModal` at `max-w-6xl`; at large widths a 220px section navigation column sits beside settings cards. Sections are Workspace, Local, and Key bindings, with search, resets, selectors/sliders, and shortcut capture/validation.
- Tag chips are rounded, colored pills with subtle hover lift; dropdowns/tag pickers render via portals to avoid clipping and use viewport-aware positioning.

The workspace is primarily desktop-oriented. Multiple panes and the percentage-width side preview are not proof of a complete mobile layout; explicitly verify narrow screens when changing layout.

### Theme tokens

Authoritative CSS: `frontend/src/index.css`; settings apply root classes/data attributes and accent variables.

| Token | Light | Dark |
| --- | --- | --- |
| `--surface-1` | `#f6f7f9` | `#020617` |
| `--surface-2` | `#ffffff` | `#0b1220` |
| `--surface-3` | `#eef2f6` | `#111a2e` |
| `--surface-4` | `#e8edf3` | `#182235` |
| `--text-primary` | `#111827` | `#f8fafc` |
| `--text-secondary` | `#374151` | `#cbd5e1` |
| `--text-tertiary` | `#6b7280` | `#94a3b8` |
| `--border-subtle` | `rgba(17,24,39,0.08)` | `rgba(148,163,184,0.14)` |
| `--border-strong` | `rgba(17,24,39,0.14)` | `rgba(148,163,184,0.22)` |

Semantic aliases include background, foreground, muted/subtle foreground, card, sidebar, surface-hover, border, primary, and primary-foreground. Tailwind exposes background/foreground/card/cardForeground/border/primary. Use semantic surfaces for new UI and check both themes; some existing controls still hardcode slate/white values.

Accent options: blue `#3b82f6`, purple `#8b5cf6`, green `#22c55e`, orange `#f97316`, red `#ef4444`, teal `#14b8a6`, pink `#ec4899`, cyan `#06b6d4`. Compact density sets the root to 15px and smaller form/control text. Base transitions are 40ms; smooth mode uses 170ms, with component-specific overrides. Glass helpers clamp opacity to 0.6-1 and calculate background/overlay blur. The setting named transparency is used as panel alpha: higher means more opaque.

Editor CSS defines relaxed paragraph lines; H1/H2/H3 at 3xl/2xl/xl; conventional list indentation; primary-accent quote borders; dark code surfaces; pink inline code; yellow highlight; horizontally scrollable tables; selected-cell outlines; 8px scrollbars. Preserve these shared rules when adding blocks.

### Overlays, focus, and Escape

`useEscapeLayer` registers closable layers with the centralized provider. Only the highest priority closes per Escape; newer registration wins ties. Repeated/composing Escape is ignored. Focus restoration can use a registered Tiptap selection-restoring callback.

| Escape layer | Priority |
| --- | --- |
| Modal | 500 |
| Command palette | 400 |
| Preview | 350 |
| Popover | 300 |
| Inline editor | 200 |
| Editor focus | 100 |

These priorities are **not CSS z-indexes**. Current CSS includes AppModal 90, preview loading 74, preview 75, palette 80, and several portal menus 1100. Check visual stacking and keyboard ownership together when changing overlays. Use existing focus/portal helpers, meaningful labels, and keyboard navigation; `AppModal` does not currently implement a complete focus trap; it does provide dialog semantics and an accessible title.

### File rendering

All inline previews have a 1 MiB metadata size cutoff, including images/PDFs. Beyond it, fallback messaging is shown and preview chrome still provides Open/Download. MIME controls selection; missing MIME goes directly to fallback even when the extension is recognizable.

Supported renderers: PDF iframe using an blob URL, image blob, Markdown via ReactMarkdown + remark-gfm, CSV table (first 500 rows), code via Prism with line numbers/oneDark, and plain text. CSV rendering uses a header row. Unknown formats get fallback; spreadsheets are stored but have no native spreadsheet renderer. Fetches are abortable, ignore stale results and revoke blob URLs; Retry preview remounts the renderer.

## Settings and keyboard behavior

Settings are persisted in `settings.app_settings_v2` as one JSON document:

```json
{
  "workspace": {"maxOpenNotes":2,"openBehavior":"split","autosaveDelay":0,"focusMode":false},
  "local": {"<device-id>": {"theme":"dark","accentColor":"blue","density":"comfortable","animationMode":"snappy","previewMode":"side","sidebarMode":"fixed","uiTransparency":0.85,"sidebarCollapsed":false}},
  "keybindings": {"commandPalette":{"mac":"Mod+K","windows":"Mod+K"}}
}
```

Workspace values are shared. `maxOpenNotes` is clamped 1-3; autosave delay is nonnegative milliseconds. Local appearance is **stored on the backend under a device ID**, not solely in browser storage. `vaultor_device_id` is retained in localStorage; clearing it selects a different settings entry. Keybinding overrides are scoped by platform (`mac` / `windows`, with non-Mac using Windows bindings), with defaults resolved for absent overrides.

Backend settings migrate legacy `workspace_settings`; frontend migrates `vaultor_local_settings` and `vaultor_sidebar_collapsed`. Keep normalization/defaults aligned between TypeScript and Java. Frontend updates are optimistic, serialized through a write queue, and ignore stale response versions. Failed writes retain the desired configuration with a visible Retry action. Workspace operations flush settings first. The entire document is PUT each time; there is no server-side multi-client concurrency/version checking.

| Action | Default |
| --- | --- |
| Command palette | Mod+K |
| Next / previous open note | Mod+Right / Mod+Left |
| Close active note | Mod+Shift+Backspace |
| Toggle sidebar | Mod+B |
| Shortcuts help | Mod+/ |
| History back / forward | Mac Cmd+[ / Cmd+]; non-Mac Alt+Left / Alt+Right |

Mod means Cmd on Mac and Ctrl otherwise. The first six actions are customizable; history shortcuts are static. Shortcut validation rejects conflicts and reserved browser combinations including Mod+W, Mod+Shift+W, Mod+T. Editor typing contexts receive special handling in Dashboard; test conflicts with formatting when changing shortcut dispatch. Menus use Up/Down/Enter and Escape.

## Workspace transfer and export foundation

TransferService orchestrates one persisted-operation worker. WorkspaceExporter separates archive rendering; ExporterRegistry enables only workspace/zip. Scope definitions also reserve notes and table. DocumentService validates node/mark shapes separately from attribute objects (ordered lists legitimately have attrs.type=null) and traverses blocks, marks, links, tables and asset reference attributes; future renderers must consume structured documents, not editor HTML.

ZIP version 1 contains manifest.json (version, creation time, counts, SHA-256 checksums), workspace.json (logical resources/tags/workspace settings), and files/{resource-id}. No live SQLite file, credentials, diagnostics or device appearance/keybindings are exported. JSON entries cap at 20 MiB, archive defaults to 512 MiB, expanded data 2 GiB and 20,000 entries. Configure limits through environment variables; malformed paths, duplicate entries, checksums, counts and document/reference shapes are validated before mutation. Missing document targets appear as preview warnings.

Preview stages the upload. Merge generates a new resource graph and rewrites both inline links and table source IDs; same-name tags reuse existing colors and workspace settings stay unchanged. Replace requires explicit confirmation and replaces resources/tags/files/workspace settings while retaining local appearance and keybindings. Both derive backlinks from documents. Repeating a commit returns the original operation, never applies twice; to retry a failed commit upload/preview again.

Before the DB transaction, imported binaries are copied under unique names and their names journaled. Metadata changes and the obsolete-file cleanup journal commit in one transaction. Old binaries are deleted only after commit. Restart marks interrupted queued/running operations failed and removes unreferenced staging; CLEANUP resumes idempotently. Rollback preserves existing metadata and binaries. Cancellation is allowed at preview/queue and during import preparation, but never after the commit phase begins. Progress is phase-based, not byte-level. UI refreshes after completion without timed reload or backend exit.

Future work: note PDF/DOCX, table XLSX/PDF, and separately connected Google Docs publishing. Do not expose unfinished formats as selectable. Artifact/staging directories currently remain until manually cleaned with the backend stopped; automatic transfer-artifact expiry is a follow-up.

## Development, deployment and validation

See [OPERATIONS.md](OPERATIONS.md) for commands, environment, Docker logs and disposable API smoke testing. Run npm ci in frontend, then npm run build, npm run lint and npm test. Backend uses Java 25 and the Maven wrapper: ./mvnw test (Windows: .\mvnw.cmd test). Both service tests use temporary SQLite/storage. Docker builds the entire app; do not mount real data into the smoke runner.

Validated 2026-09-22: frontend production build/lint and nine component/unit tests; seven backend tests including full API/transfer flows, rollback and restart journal recovery. Docker build and disposable API smoke cover JSON CRUD, file bytes, links/backlinks, tags/settings, pagination, export/merge/replace, idempotency, cancellation, problem errors and diagnostics. See the [archived modernization tracker](history/modernization-plan.md) for final run evidence and manual UI coverage.

## Known limitations

- No multi-user settings conflict resolution or multi-instance SQLite/gate coordination. Full-document settings writes are serialized per browser only.
- Sidebar still loads all resource pages; there is no full-text index. Large workspace UI and transfer snapshot memory can be improved later.
- Preview cap is 1 MiB. PDF/DOCX/XLSX/Google Docs exports are future work.
- Full modal focus trapping and a comprehensive mobile editor redesign are not implemented. Existing visual layout is retained; test responsive surfaces when editing them.
- Diagnostic history is bounded/in-memory; Docker logs are the durable operational source subject to Docker log retention configuration.
- Cleanup errors leave the operation in CLEANUP with an actionable detail; restart retries. Transfer artifacts currently require manual expiry.
- Build reports a large JS chunk and an outdated Browserslist dataset; these do not prevent packaging. Chunk splitting remains performance work.

## Change checklist and maintenance history

For each change: inspect current code and git diff; preserve unrelated work; update the relevant architecture/API/editor/settings/UI/configuration sections; run appropriate checks and record actual results. Keep docs under docs/, add index links, and distinguish proposals from current behavior. Changes to reference attributes must update extraction, remapping, integrity checks and editor rendering together. Changes to settings defaults must update Java and TypeScript. Test both panes, themes and Escape ownership for interaction changes.

- 2026-09-21: created living guide and agent rules; archived historical specifications without rewriting them.
- 2026-09-22: implemented password-free workspace, dropdown fix, serialized saves/settings, DTO/error/diagnostic APIs, logical transfer pipeline/recovery and exporter foundation; added component/backend/disposable API tests. Updated structural/design/operating guidance in the same change. Final verification recorded in the modernization tracker.

- 2026-09-22 follow-up: fixed numbered-list paste validation, moved save feedback into title-bar icons, removed pre-picker asynchronous focus, and made editor focus registration mount-safe. Nine frontend tests and seven backend tests pass; Docker smoke includes list/code/table save and ZIP round trips. API-first debugging is now required by AGENTS.md; no further browser sessions were used for this follow-up.
