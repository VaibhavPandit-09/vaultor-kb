/** Native text commands stay in webContents; no renderer path/clipboard privileges. */
export function textMenuTemplate(params) {
  if (!params.isEditable && !params.selectionText.trim()) return [];
  const flags = params.editFlags;
  if (!params.isEditable) return [{ role: 'copy', enabled: flags.canCopy }];
  return [
    { role: 'undo', enabled: flags.canUndo }, { role: 'redo', enabled: flags.canRedo },
    { type: 'separator' },
    { role: 'cut', enabled: flags.canCut }, { role: 'copy', enabled: flags.canCopy },
    { role: 'paste', enabled: flags.canPaste }, { type: 'separator' },
    { role: 'selectAll', enabled: flags.canSelectAll },
  ];
}
