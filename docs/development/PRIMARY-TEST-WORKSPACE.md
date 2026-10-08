# Primary synthetic test workspace

Reviewed 2026-10-08. Specification, not generated data. Generation is Sprint 1 of [the lifecycle plan](../plans/resource-lifecycle-plan.md). This guide will become the authoritative generator/launch/reset procedure when implemented.

## Identity and ownership

Name: **Vaultor Lab — Atlas**. Use a deterministic seed and versioned fixture manifest; recommended first seed `atlas-2026-10-v1`. Keep generated binary data, database, host trust, logs, caches and archives ignored/outside Git. Commit only generator code, synthetic source templates and expected-result metadata. No personal notes, credentials, copyrighted downloaded corpus or remote image fetching.

Create an independent storage directory/profile and clearly labelled connection. Preserve the user's selected personal workspace; provide concrete launch/connect/return steps and the actual path after generation. The test host gets its own identity/trust and loopback port; sharing remains off until explicitly needed for authorized paired-device tests. Never reuse personal workspace credentials or point two hosts at one database.

Retain a clean baseline and a mutable working copy. Reset requires verifying an ownership marker, matching fixture identity and resolved paths inside the dedicated test root; stop only that host first. Refuse reset against absent/mismatched markers. Reimport baseline through normal archive flow when possible. No automatic cleanup of user additions or unmarked directories.

## Target corpus

The first full profile targets **5,000 resources**. Scale down only when actual disk/time constraints require it, report the difference, and provide deterministic small/full profiles.

| Kind/category | Target count | Purpose |
| --- | ---: | --- |
| Notes | 4,000 | Distinct synthetic project/research/journal/tutorial content; varied structured blocks |
| Images | 600 | PNG/JPEG/WebP/GIF originals, varying aspect ratios/dimensions/size |
| PDFs | 200 | Searchable text, many-page, image-only and explicitly labelled unsupported/fault subsets |
| Text files | 150 | Markdown/plain text/CSV/JSON/code, Unicode and literal-search fixtures |
| Other files | 50 | Small generated audio/video/unknown-format resources, honest unsupported previews |

Include approximately 80 collections (empty, sparse, dense, overlapping) and 250 tags, multi-collection notes/files, about 300 mixed pins and timestamp-controlled interleaved Recent. Many/long tags stress existing full-list paths. A manifest fixes exact counts; do not report these targets as actual results before generation.

Notes include headings, lists, code, tables, captions/alt and links: about 200 image-heavy notes, 50 long documents, varied short notes, duplicate titles, Unicode/RTL/emoji, very long titles, punctuation and searchable literal wildcard characters. Produce meaningful synthetic content with unique expected phrases, rather than thousands of identical Lorem Ipsum rows. Include several themed collections the user can explore.

Link graph includes cycles, repeated A → B → A visits, reused images across many notes, multiple occurrences per source, disconnected nodes and known usage counts. Keep missing/trashed/purged destinations and malformed/encrypted/oversized files in an explicit fault profile; create them through supported test operations when available, never corrupt the main baseline secretly. Do not persist transient preview URLs or upload decorations in note JSON.

Generate a few large but supported images near 20 MiB/40 MP and PDFs near measured preview/extraction boundaries, within a declared storage budget (initial target below 1 GiB, actual reported). No giant media files just to inflate counts. Valid format encoders must be available; record omissions if audio/video generation cannot be supported locally. Invalid samples are marked fixtures and never executed.

Journeys/drafts are device session data, not archive contents. Provide a separate deterministic interaction script/scenario for 200-visit journeys, duplicate-note panes, unsaved drafts and recovery conflicts after the baseline imports. Never place an unsaved draft in the archived corpus and claim it is a saved note.

## Generator and verification requirements

- Stable creation/import UUIDs and a persistent manifest make interrupted runs resumable. Verify source fingerprints on retries; never silently duplicate or replace unrelated resources.
- Create/import through supported application contracts with bounded batches/concurrency and progress. Use public test templates for expected references rather than note-body/binary logging. Do not bypass search/reference maintenance with raw SQL inserts.
- Manifest records generator/seed versions, counts, fixture ID mapping, original-file hashes/bytes, expected title/content matches and scopes, usage source/occurrence counts, fault markers, generation duration and archive checksum.
- Baseline verifier checks actual counts, representative hashes, saved search phrases/ranking, collection intersections, mixed Recent/pin order and reference integrity through narrowly targeted queries. Future lifecycle/file-search assertions activate only when those features are implemented.
- Preserve reproducibility of seeded recency: implement a test-only bounded fixture hook if ordinary create/open APIs cannot reproduce timestamps. Such hooks must be explicit disposable-mode only, inaccessible on production hosts; document any required approval/migration boundary.
- Produce a portable baseline archive without host identity/trust or device preferences. Confirm import preview before destructive replace. Keep a small subset for CI/focused tests; large native runs remain explicit.

## Baseline report

Record CPU/RAM/OS/storage, app/host version, seed/archive hash, corpus bytes, cold vs warm cache, number of runs, median and tail measurements. Measure startup-to-usable, Library/Recent/Pinned/collection page requests, title/content queries, tag picker, image visibility/cache release, shared panes and journey navigation. Capture request counts and peak/settled process memory without logging bodies or credentials. Repeat comparable scenarios after changes; do not treat single-run screenshots as a benchmark.

Completion must include the user's actual workspace location, how to start/open/return/reset it, and the generated manifest/archive paths. No workspace exists yet at planning.
