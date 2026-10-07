# Navigation, recovery and export integration handoff

N6 completed 2026-09-30. All six navigation/session/export sprints are implemented. This records actual verification, not a claim that every browser or interruption scenario has been exercised.

## Corrections

- Changing editor editability no longer emits a save. Opening/restoring an unchanged note does not create a pending draft merely because its editor mounts.
- SQLite uses one pooled connection. Concurrent application transactions wait for that connection instead of competing to upgrade deferred read transactions into writes. This serializes reads as well as writes; keep transactions short and run one backend per database.
- Export controller lifetime is bound to workspace identity/generation. Replacement disposes old tracking, preventing later client-side continuation/download; already accepted backend work is not cancelled. Import closes stale export and title-edit UI. Ordinary picker dismissal still permits completion within the same workspace.
- Corrupted stored pane/visit/position entries fail session validation without preventing independent recovery-journal access.
- Note title controls wrap onto a separate row when panes are narrow, preventing icons overlapping titles.

## Verification

| Area | Actual coverage |
| --- | --- |
| Frontend | Production build and targeted ESLint; 55 distinct focused cases across navigation, shared documents/tables, recovery, editor, journeys and export lifecycle passed. The 11 editor/shared-view cases were rerun after the mount-save fix. |
| Backend | Disposable `SessionRevisionTest` passed: existing-schema upgrade, simultaneous saves to different notes, conditional revision rejection, generation rollback and archive replacement isolation. |
| Navigation | Targeted tests cover failed saves/retry/close, rapid/superseded loads, duplicate views/undo, pane capacity, previews, cycles/branches, missing visits and bounded histories. |
| Recovery/export | Targeted tests cover tab isolation, matching acknowledgements, conflicts, malformed storage, retained drafts, restored context, participant saving and export disposal across replacement. |
| Integrated browser | Real Dashboard with three disposable linked notes on isolated ports/storage. Keyboard link opening, three/four-step trails, Ctrl-click split, refresh restoring two panes/focus/journey, retrying a real failed save, and Library query restoration were observed. Dark/light at 1280px and light at 760px were inspected. No automatic backlinks column or reopened transient dialog appeared. |

The browser run exposed the unnecessary mount saves and a SQLite lock collision. Retry retained and saved the failed draft. After correction, refresh restored both panes as Saved. Narrow inspection exposed and verified the header wrapping correction.

## Remaining limits

- Reduced-motion animation suppression was checked in CSS, not visually emulated; precise animation timing and OS-specific keyboard behavior were not measured.
- DOCX bookmark structure was verified in N5, but Word pagination remains unverified because LibreOffice is unavailable. N5 visually checked graph PDF pages.
- Browser disk-save completion cannot be observed reliably. Export UI reports download handoff, not successful disk persistence.
- Recovery remains best effort under abrupt termination. Undo is not persisted; numeric caret positions are clamped. See [SESSIONS.md](SESSIONS.md).
- No routine Docker rebuild or broad API smoke run. The browser used disposable data; the user's workspace was not mutated. Existing bundle-size/Browserslist warnings remain.
