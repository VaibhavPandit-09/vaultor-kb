# Platform support and Android companion

## Verified release baseline

Windows x64 and macOS Apple Silicon **0.27.0** add Help to the previously published Desktop Experience. The Android update covered here is **0.1.0-alpha.29 / versionCode 36**. Android releases have their own GitHub prerelease channel.

Help is bundled with both 0.27.0 desktop installers and the browser UI they serve. Android has no in-app Help.

| Capability | Windows x64 / Mac arm64 0.27.0 | Browser | Android alpha.29 |
| --- | --- | --- | --- |
| Managed notes and organization editing | Yes | Compatible approved host | Read originals; no original editing |
| Desktop selection / internal drag | Yes | Shared UI where supported | No desktop workflow |
| Native resource clipboard / prepared file copies | Yes | No | No desktop workflow |
| Linked external Markdown editing | Local owner NTFS / APFS only | No local authority | No |
| Offline bundled Help | Yes | UI served by the 0.27.0 host | Not implemented |
| Retained offline original reading | Local desktop workspace, not Android download model | Browser storage limits | Verified companion downloads |

Linux and Intel Mac installers are not supported. Native runtime qualification is platform-specific. Detailed Windows subjective D3/D4 acceptance and physical Samsung/OEM/haptics/TalkBack/real-LAN acceptance remain user-owned; automated evidence does not certify these experiences.

## Android: read, retain and Review

Android uses Home, Library and Review, source selection and a retained reader. Read notes/originals, use outline/find and reading appearance controls, follow links and preview supported media. Downloaded verified companion checkpoints support bounded offline browsing/search and available originals. Expired/missing/policy-omitted content is explicit; access revocation/replacement locks source content rather than silently reusing stale authority.

Capture a Review against a source/revision, protect its quote/context locally, then explicitly Create Review to queue it. Keeping a draft or going Back does not submit. Delivery retains its captured source and receipts; reconnect never retargets evidence. There is no guaranteed force-stopped delivery and no Android original-note/organization/Trash editing.

Android supports reviewed import delivery, full/partial exports and native Save/Share where source capabilities allow. Offline exports declare omissions. Pairing uses approved host identity/pinned TLS; no host administration is added. Update using the original-signed increasing-code APK without uninstalling or clearing data. Legacy recovery exports remain separate and never replay retired writes.

No Android in-app Help was implemented by this initiative. The articles here explain Android differences for desktop users; they are not Android UI instructions for new Help controls.

## Keep an existing Vaultor installation

Keep using Windows 0.27.0 until a Windows Next installer is published. The planned installer performs a one-time reset of the old Electron workspace and settings. Electron-managed notes and attachments do not migrate. Keep any exports you want to retain outside the old application's managed storage. External linked originals and independently exported backups in other folders are retained. Future Next updates preserve the new workspace. See [Vaultor Next experimental foundation](next-foundation.md).

## Upgrade Android from alpha.28

Open **Settings → App updates** and check for the official Android prerelease. Download, verify and install the update, then confirm Android's install prompt. You can also [download the signed alpha.29 APK](https://github.com/VaibhavPandit-09/vaultor-kb/releases/tag/android/v0.1.0-alpha.29) and choose **Verify a downloaded APK**. Install over the existing app. Keep app data and the old app installed during the update.

After reopening Vaultor, choose the remembered source. Your saved offline notes, Review drafts, pending Reviews, collected originals and reader preferences stay in the app. Keep using your original Windows 0.27.0 host. A Next engineering host uses a separate approval and workspace grant. Pending work stays with its original source. See [Connect Android on the same Wi-Fi](next-foundation.md#connect-android-on-the-same-wi-fi).
