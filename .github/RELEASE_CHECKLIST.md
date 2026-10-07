# Release discovery for agents

Read [the agent-owned release process](../docs/desktop/RELEASE-PROCESS.md) before preparing an installed-app change. [Installation and updates](../docs/desktop/INSTALLATION-AND-UPDATES.md) is the user procedure.

- Version and lockfile agree; UI and bundled server rebuilt from the intended release commit.
- Original release key preserved; only public trust and signed artifact metadata published.
- Focused checks/native platform results recorded honestly, with disposable storage.
- Source commit pushed and immutable version tag matches it.
- Draft assets verified by `npm --prefix desktop run publish:release`; no overwrites.
- Both Windows x64 and Mac arm64 pairs ready for a complete release; partial platforms explicitly labeled.
- Published release notes and URL provided to the user; docs/tracker reflect actual results.

No CI auto-publishing, paid signing or automatic background update feed is configured. GitHub Release downloads are imported into the app; current feed transport rejects redirects. Missing native access/signing identity is a blocker, never a reason to fabricate artifacts or bypass verification.
