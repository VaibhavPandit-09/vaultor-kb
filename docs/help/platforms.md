# Platform support and Android companion

## Verified release baseline

Audited 2026-11-08 against release evidence and actual source. Windows x64 **0.27.0** adds Help to the previously published Desktop Experience. macOS Apple Silicon remains at the verified **0.26.0** release. Android remains **0.1.0-alpha.28 / versionCode 32**. GitHub Latest remains a separate distribution designation, not proof of the newest platform asset.

Help is bundled with Windows 0.27.0 and its browser UI. The Mac 0.26.0 installer does not contain Help. Mac Help source is implemented but a native-qualified release is not available in this Windows delivery. Android has no in-app Help.

| Capability | Windows 0.27.0 / Mac arm64 0.26.0 | Browser | Android alpha.28 |
| --- | --- | --- | --- |
| Managed notes and organization editing | Yes | Compatible approved host | Read originals; no original editing |
| Desktop selection / internal drag | Yes | Shared UI where supported | No desktop workflow |
| Native resource clipboard / prepared file copies | Yes | No | No desktop workflow |
| Linked external Markdown editing | Local owner NTFS / APFS only | No local authority | No |
| Offline bundled Help | Windows 0.27.0; not in Mac 0.26.0 | UI served by the 0.27.0 host | Not implemented |
| Retained offline original reading | Local desktop workspace, not Android download model | Browser storage limits | Verified companion downloads |

Linux and Intel Mac installers are not supported. Native runtime qualification is platform-specific. Detailed Windows subjective D3/D4 acceptance and physical Samsung/OEM/haptics/TalkBack/real-LAN acceptance remain user-owned; automated evidence does not certify these experiences.

## Android: read, retain and Review

Android uses Home, Library and Review, source selection and a retained reader. Read notes/originals, use outline/find and reading appearance controls, follow links and preview supported media. Downloaded verified companion checkpoints support bounded offline browsing/search and available originals. Expired/missing/policy-omitted content is explicit; access revocation/replacement locks source content rather than silently reusing stale authority.

Capture a Review against a source/revision, protect its quote/context locally, then explicitly Create Review to queue it. Keeping a draft or going Back does not submit. Delivery retains its captured source and receipts; reconnect never retargets evidence. There is no guaranteed force-stopped delivery and no Android original-note/organization/Trash editing.

Android supports reviewed import delivery, full/partial exports and native Save/Share where source capabilities allow. Offline exports declare omissions. Pairing uses approved host identity/pinned TLS; no host administration is added. Update using the original-signed increasing-code APK without uninstalling or clearing data. Legacy recovery exports remain separate and never replay retired writes.

No Android in-app Help was implemented by this initiative. The articles here explain Android differences for desktop users; they are not Android UI instructions for new Help controls.
