# Help documentation ownership and release gate

Reviewed 2026-11-08. This owns user-documentation maintenance. Engineering contracts remain in CODEBASE and their existing topic guides. User instructions live in `docs/help/*.md`; `docs/help/catalogue.json` is the capability/discovery index, not a second copy of article prose.

## During development

Every addition, removal or change to user-facing behavior requires an explicit applicability review of Help and the catalogue in the same change. Include screens, commands, keyboard context, menus, drag/drop, settings, imports/exports, platform restrictions and unsupported operations. Update affected articles/metadata when applicable; record an unchanged result when no Help change is needed. Technical documentation remains mandatory independently. Passing code tests does not establish documentation accuracy.

Use stable feature identifiers, one canonical article per workflow and cross-links. Catalogue entries name areas, screens, searchable task phrases, platform availability, limitations and repository evidence. `verifiedVersion` records an evidenced baseline, **not** an invented introduction version. Add `introducedVersion` only with proof. Available, development, unsupported and deferred are distinct. Android read/Review documentation never implies original editing or Android Help UI. Do not infer native platform availability from shared source alone.

Read current implementation and relevant tests/contracts before writing instructions. Resolve discrepancies in current topic guides; historical qualification records remain historical evidence. Keep prose practical and avoid API/class details in user articles. The catalogue's evidence paths help future audits; they do not automatically prove prose.

## Exact-source release reconciliation (mandatory)

Before publishing **any** desktop or Android release, the publisher must:

1. Identify the user-facing delta since the previous relevant **platform** release, using exact release source and implementation.
2. Reconcile every affected catalogue entry, Help article and platform/version restriction; inspect the final release delta even if documentation commits are present.
3. Update What's New using existing platform release ledgers as evidence, without creating another version-history authority.
4. Reconcile CODEBASE and relevant architecture/development/platform guides.
5. Validate metadata, links/headings, contextual mappings and packaged Help against the exact build. Confirm the runtime index uses the same bundled content.
6. Check release notes against actually supported capabilities and record the source, commands/results, factual-review scope and gaps in the existing qualification/release report.

**Do not publish user-facing behavior changes with materially outdated, missing or misleading Help.** Complete the missing documentation first. For releases with no user-facing changes, an explicit applicability review may record Help unchanged; meaningless edits are not required. Android-only releases still reconcile relevant Android Help/catalogue and developer contracts, without rebuilding desktop or claiming an Android Help renderer.

This branch's Help capability is development-only after 0.26.0. Future publication must assign its actual release availability, reconcile the development wording in articles/reader and update version baselines. Do not label it as already shipped in 0.26.0.

## Validation and bundling

Run `npm run help:validate` and `npm run help:test` at repository root. Vite runs validation before production builds, embeds Markdown eagerly for local reading/indexing and emits `help/` source articles, catalogue and SHA-256 provenance. `node scripts/validate-help.mjs --dist frontend/dist` verifies source-to-build hashes. Desktop's recursive `copy-ui.mjs` validates the source build before carrying those assets unchanged; release packaging validates `desktop/ui` against current Help as well. No startup fetch or backend service is used.

Checks cover unique IDs/paths/headings, required metadata, categories, platform/status/version formats, article/source evidence existence, safe links and heading targets, required screen mappings and unsupported raw HTML/images. Negative tests demonstrate representative failures. Search tests exercise required user task queries and live shortcut terms. These checks **cannot prove factual prose accuracy** or native platform acceptance.

Help links are restricted to catalogued bundled Markdown/heading targets or credential-free HTTP(S). ReactMarkdown renders without raw HTML or embedded images; external anchors use the existing Electron policy / browser opening with noopener. No Help file enters resources, autosave, recovery, portable exports, Trash or ordinary search.

## Completion and handoff

Report whether user Help changed, affected topics/catalogue entries, technical documentation changes, actual validation and incomplete documentation. Releases also record exact-source delta reconciliation and packaging evidence. Never claim documentation complete when only developer guides changed. User presentation acceptance and unperformed platform checks remain explicit.
