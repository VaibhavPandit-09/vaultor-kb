# Vaultor VERSION

Source tag: vVERSION (the immutable tag resolves to the release source commit; record its hash in the published GitHub notes after committing).

## Changes

- Describe visible behavior and any backend/runtime compatibility change.

## Platform availability

| Platform | Artifact and sidecar | Native validation | Status |
| --- | --- | --- | --- |
| Windows x64 | Vaultor-VERSION-windows-x64.exe + .vaultor.json | Actual results/date | Ready or blocked |
| Mac arm64 | Vaultor-VERSION-mac-arm64.dmg + .vaultor.json | Actual results/date | Ready or blocked |
| Ubuntu/Mac Intel/Android native | No package | Not performed | Deferred |

## Installation and update

Download your installer and its signed .vaultor.json into one folder. In Vaultor, open Updates → Import update, choose the sidecar, then Install update. Windows runs its installer; Mac opens a DMG for manual app replacement. See [the installation guide](https://github.com/VaibhavPandit-09/vaultor-kb/blob/master/docs/desktop/INSTALLATION-AND-UPDATES.md). The host stops during installation; its clients must reconnect. Do not delete app data.

## Compatibility and recovery

State the minimum protocol/capability requirements, whether coordinated client/host updating is needed, data effects, actual backup/recovery checks and known limitations. Link to [update recovery](https://github.com/VaibhavPandit-09/vaultor-kb/blob/master/docs/desktop/UPDATES.md).

## Validation

List actual compilation, focused tests, package verification and native checks; explicitly state unperformed checks. Include installer size/checksum from the signed manifest when publishing. Never publish user diagnostics containing credentials or workspace data.
