# Instructions for agents working on Vaultor

Read [docs/CODEBASE.md](docs/CODEBASE.md) before making changes. It is the living reference for architecture, data contracts, UI behavior, design conventions, setup, and known limitations. Use [docs/README.md](docs/README.md) to find other documentation.

## Required maintenance workflow

1. Inspect the current code and working tree before editing. Preserve unrelated work.
2. Check the guide's relevant sections against the implementation; historical specifications are context, not proof of current behavior.
3. Make the requested change and keep development checks minimal: compilation and focused checks for changed, failure-prone behavior. Do not routinely repeat full suites, API smoke runs or Docker verification. Keep diagnostic APIs ready; use API checks when debugging a specific problem or explicitly requested.
4. **Update `docs/CODEBASE.md` in the same change whenever code, behavior, UI, structure, dependencies, configuration, or workflows change.** Correct existing sections instead of appending contradictory descriptions. Update its review date and add a short entry to its maintenance history with the change and actual validation outcome. For changes with no architectural effect, record that explicitly in the history.
5. Keep supporting documentation in `docs/`, link it from `docs/README.md`, and preserve one authoritative explanation of each topic. Do not rewrite archived specifications as current documentation.
6. Report the change, checks performed, and any remaining limitations. Do not claim tests or visual verification that were not performed.

Root `README.md` and this discovery file are intentionally small entry points; substantive documentation belongs in `docs/`. No documentation generator or background updater exists: maintaining the guide is part of completing every change.

Preserve the resource-based model, structured Tiptap JSON, shared API client, shared settings/design tokens, and centralized Escape/focus behavior. Consult the guide's known limitations before changing saving, links, workspace operations, or import/export. Use disposable data for tests that mutate a workspace.

When debugging, prefer existing API diagnostics and narrowly targeted service/component checks. Ordinary UI development does not require API testing. Use browser/native UI debugging only when necessary to establish a visual/interaction fact or explicitly requested by the user; avoid repetitive browser inspection.

For local owner or paired LAN API access, follow [docs/security/HOST-ACCESS.md](docs/security/HOST-ACCESS.md). Never bypass approval/TLS/revision checks or expose credentials in logs, renderer storage, URLs or portable archives.

UI / Interaction Design Contract

For any task that changes Vaultor's user interface, layout, styling, interaction behavior, animation, navigation, responsive behavior, visual hierarchy, density, scrolling behavior, panes, previews, theme behavior, or other presentation-layer behavior, you MUST read docs/design/UI_PHILOSOPHY.md completely before proposing or modifying code.

Treat docs/design/UI_PHILOSOPHY.md as the authoritative design contract for Vaultor UI work, not as optional inspiration.

Preserve Vaultor's existing visual identity while applying the document's rules for information density, vertical-space efficiency, progressive compression, spatial continuity, structural motion, surface hierarchy, scroll-driven transformation, pane and preview transitions, theme transitions, responsive adaptation, accessibility, reduced-motion behavior, and animation performance.

Do not default to sticky headers, nested scroll containers, permanently floating toolbars, excessive cards, oversized spacing, duplicated compact/expanded headers, arbitrary fade/slide animations, bounce-heavy motion, or transition-all when a more coherent spatial transformation can solve the problem.

For substantial UI work, do not jump directly from a vague request into implementation.

Use this sequence:

1. inspect the current implementation;
2. audit the screen/workflow against docs/design/UI_PHILOSOPHY.md;
3. define the interaction states and transformations;
4. implement the agreed behavior;
5. review the result against the design contract.


Android UI, motion, and haptics
For any Android-facing UI, interaction, animation, reader, review/capture, offline-state, navigation, theme, or haptic work, you MUST read both:
`docs/design/UI_PHILOSOPHY.md`
`docs/design/ANDROID_UI_PHILOSOPHY.md`
Treat `ANDROID_UI_PHILOSOPHY.md` as the Android-specific extension of the Vaultor design contract.
Android must share Vaultor's interaction language without mechanically copying desktop layouts.
Haptics are a first-class part of Android interaction design. Design motion and tactile feedback together. Use a centralized semantic haptics layer, prefer platform/system action-oriented feedback for standard interactions, use richer device-supported effects only where meaningful, provide capability fallbacks, respect system haptic preferences, and never scatter raw vibrator calls across screens.
Do not equate "fully use haptics" with vibrating on every tap. Frequent interactions must remain subtle; meaningful state changes may use stronger or richer feedback; passive/background events should usually remain silent.
Significant haptic interactions are not considered polished until verified on real Android hardware. Emulator-only validation cannot certify haptic quality.
For Android UI work, static screenshots cannot certify motion quality. Inspect important transitions in motion on an Android runtime and verify meaningful touch/haptic interactions on real hardware.
AI branch and integration workflow
Read `docs/development/AI_DEVELOPMENT_WORKFLOW.md` before integrating divergent AI branches or starting a new major roadmap milestone.
Do not let an old feature branch overwrite newer presentation architecture merely because Git can merge it automatically. Integration must preserve feature semantics while adapting presentation to the current product baseline.

Motion is part of the interaction architecture. Do not merely add animation on top of otherwise static layout decisions. Where appropriate, use motion to communicate continuity, compression, expansion, navigation, focus, hierarchy, and cause-and-effect.

When the same conceptual UI object changes state, prefer visually transforming that object rather than abruptly replacing it with an unrelated duplicate.

Respect prefers-reduced-motion. Application correctness must never depend on an animation finishing.

Parallel AI development rule

Vaultor may be developed by multiple AI agents in parallel on separate branches.

An agent working on one branch MUST NOT merge, rebase onto, cherry-pick from, rewrite, or otherwise incorporate another AI agent's active development branch unless the user explicitly asks for integration work.

Each agent should remain within its assigned scope, make small coherent commits, preserve documented product semantics, push its branch regularly, avoid unnecessary refactors outside its scope, and document any change that could make later integration difficult.

During parallel development, optimize for clear intent and coherent commits rather than trying to keep the branches continuously synchronized.

Final branch integration will be handled as a separate task.

## Agent-owned releases

The user delegates installed-app release preparation and GitHub publication to implementation agents. For every change affecting a shipped app, follow [docs/desktop/RELEASE-PROCESS.md](docs/desktop/RELEASE-PROCESS.md): bump package/lock versions, build fresh UI and bundled server, perform focused/native checks, preserve the original signing identity, create verified platform installers/sidecars, commit/push/tag the intended source, stage GitHub assets and publish when the supported-platform gate is met. Return a usable release URL and update steps, not just instructions for the user to build. Documentation/test-only changes with no shipped behavior do not need new installers. Never claim unavailable Mac/Linux artifacts are ready; report precise blockers and handoffs. No private keys, credentials or workspace backups may enter GitHub, logs or portable archives. This is standing release authorization within the requested change, not permission to include unrelated work or change security/paid-service settings.

Android-only changes follow [docs/android/ANDROID.md](docs/android/ANDROID.md) and the separately authorized Android tracker: preserve its original APK signer, increment versionCode, verify installed release APKs in Windows emulators, and publish an immutable Android-only prerelease. Do not bump/rebuild desktop for mobile-only changes. Agents must never access or USB/wireless ADB-pair the user's phone; every ADB operation targets an explicit emulator serial. Samsung acceptance is user-owned. Stop after each authorized sprint.


