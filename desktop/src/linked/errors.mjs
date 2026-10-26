/** Native/Node errors may include private absolute paths. Keep those out of the
 * renderer while preserving normal bounded error codes and user-facing text. */
export function linkedPublicError(error){const message=String(error?.message??error).slice(0,1000);return /(?:[a-z]:[\\/]|\\\\|file:\/\/|(?:^|[\s:\x22\x27(])\/[^\s])/i.test(message)?new Error(typeof error?.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'LINKED_FILE_OPERATION_FAILED'):new Error(message);}
