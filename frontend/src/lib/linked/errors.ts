export function linkedError(value:unknown){
  const detail=String(value instanceof Error?value.message:value).replace(/^Error: /,'');
  if(/REFERENCE_NEEDS_AUTHORIZATION|REFERENCE_UNAVAILABLE/.test(detail))return 'Locate the source folder to authorize access on this computer. Workspace references do not grant filesystem access.';
  if(/COMBINATION_OVERLAP/.test(detail))return 'These changes overlap or share a boundary. Keep or export your protected draft, reload the external file, and reapply the desired edits.';
  if(/COMBINATION_SOURCE_REFUSED|COMBINATION_REQUIRES_VALIDATED|COMBINATION_READONLY/.test(detail))return 'These versions cannot be combined safely. Keep or export your draft and review the external file.';
  if(/REFRESH_DISK_CHANGED|REFRESH_EXPIRED/.test(detail))return 'The external file changed again or this review expired. Compare the current versions again.';
  if(/JOURNAL_(?:QUOTA|OPERATION_LIMIT)|RECOVERY_LIMIT/.test(detail))return 'Recovery storage is full. Export and resolve retained drafts before saving.';
  if(/CARRIER_|RECOVERY_VOLUME_UNAVAILABLE|SOURCE_VOLUME_UNAVAILABLE/.test(detail))return 'The source volume or its private recovery folder is unavailable or needs setup. Reconnect the same drive and review Linked sources; protected drafts remain in Recovery.';
  if(/SOURCE_REMOVED|SOURCE_DISCONNECTED|SOURCE_UNAVAILABLE|ROOT_REVOKED|ROOT_REPLACED|SOURCE_REVOKED/.test(detail))return 'This linked folder is unavailable. Reconnect it from Linked sources; your protected drafts remain in Recovery.';
  if(/DOCUMENT_REPLACED|DOCUMENT_CHANGED|REFRESH_SUPERSEDED/.test(detail))return 'This file changed outside Vaultor. Refresh its folder and review the current file; your draft is retained.';
  if(/OWNER_CHANGED|WORKSPACE_CHANGED|LOCAL_OWNER_REQUIRED|OWNER_REQUIRED/.test(detail))return 'The local workspace connection changed. Reconnect before accessing linked files.';
  if(/ExportCreateNew/.test(detail))return 'Choose a new filename. Recovery exports never overwrite existing files.';
  if(/NATIVE_HOST_CLOSED|NATIVE_TIMEOUT/.test(detail))return 'The local file service stopped. Reopen Vaultor and review retained recovery before saving.';
  if(/LINKED_SOURCE_LIMIT/.test(detail))return 'Up to eight linked folders are supported. Remove an unused source before linking another.';
  if(/LINKED_OPEN_LIMIT|LINKED_BUSY/.test(detail))return 'A linked-file operation is still running. Wait a moment, then retry.';
  if(/PROTECTED_HOST_LOCATION/.test(detail))return 'Choose a documentation folder outside Vaultor’s private application storage.';
  if(/NTFS_ONLY|FIXED_VOLUME_ONLY|LOCAL_VOLUME_ONLY/.test(detail))return 'Linked editing currently supports fixed local NTFS drives on Windows.';
  if(/^[A-Z][A-Z_0-9:]+$/.test(detail))return 'This linked-file operation could not complete safely. Retry or review Recovery; no successful Save was reported.';
  return detail;
}
