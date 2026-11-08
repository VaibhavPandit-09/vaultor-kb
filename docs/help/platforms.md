# Platform support and Android companion

## Verified release baseline

Audited 2026-11-08 against release evidence and actual source. Windows x64 **0.26.0** and macOS Apple Silicon **0.26.0** are published from the same release source. Android remains **0.1.0-alpha.28 / versionCode 32**. GitHub Latest remains a separate distribution designation, not proof of the newest platform asset.

This branch adds bundled Help after 0.26.0 without bumping versions or publishing installers. It must be marked released with an actual version during future release reconciliation; an installed 0.26.0 does not already have this Help Center.

| Capability | Windows / Mac arm64 0.26.0 | Browser | Android alpha.28 |
| --- | --- | --- | --- |
| Managed notes and organization editing | Yes | Compatible approved host | Read originals; no original editing |
| Desktop selection / internal drag | Yes | Shared UI where supported | No desktop workflow |
| Native resource clipboard / prepared file copies | Yes | No | No desktop workflow |
| Linked external Markdown editing | Local owner NTFS / APFS only | No local authority | No |
| Offline bundled Help | This development branch only | This development build only | Not implemented |
| Retained offline original reading | Local desktop workspace, not Android download model | Browser storage limits | Verified companion downloads |

Linux and Intel Mac installers are not supported. Native runtime qualification is platform-specific. Detailed Windows subjective D3/D4 acceptance and physical Samsung/OEM/haptics/TalkBack/real-LAN acceptance remain user-owned; automated evidence does not certify these experiences.

## Android: read, retain and Review

Android uses Home, Library and Review, source selection and a retained reader. Read notes/originals, use outline/find and reading appearance controls, follow links and preview supported media. Downloaded verified companion checkpoints support bounded offline browsing/search and available originals. Expired/missing/policy-omitted content is explicit; access revocation/replacement locks source content rather than silently reusing stale authority.

Capture a Review against a source/revision, protect its quote/context locally, then explicitly Create Review to queue it. Keeping a draft or going Back does not submit. Delivery retains its captured source and receipts; reconnect never retargets evidence. There is no guaranteed force-stopped delivery and no Android original-note/organization/Trash editing.

Android supports reviewed import delivery, full/partial exports and native Save/Share where source capabilities allow. Offline exports declare omissions. Pairing uses approved host identity/pinned TLS; no host administration is added. Update using the original-signed increasing-code APK without uninstalling or clearing data. Legacy recovery exports remain separate and never replay retired writes.

No Android in-app Help was implemented by this initiative. The articles here explain Android differences for desktop users; they are not Android UI instructions for new Help controls.
