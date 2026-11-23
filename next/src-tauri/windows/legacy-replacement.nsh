!define VAULTOR_REPLACEMENT_BINARY "${__FILEDIR__}\..\target\release\vaultor-legacy-replacement.exe"
!define MUI_WELCOMEPAGE_TEXT "This installs Vaultor Next for the current Windows user.$\r$\n$\r$\nThe first replacement of Electron resets its managed notes, attachments and settings. External linked originals and independent backups outside that storage are retained.$\r$\n$\r$\nFuture Next updates preserve your new workspace."

!macro VaultorReplacement PHASE
  nsExec::ExecToStack /TIMEOUT=90000 '"$PLUGINSDIR\vaultor-legacy-replacement.exe" ${PHASE} "$INSTDIR" "${VERSION}"'
  Pop $0
  Pop $1
  ${If} $0 != 0
    DetailPrint "$1"
    MessageBox MB_ICONEXCLAMATION|MB_OK "$1" /SD IDOK
    ${If} "${PHASE}" == "prepare"
      SetErrorLevel 2
      Abort
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREINSTALL
  InitPluginsDir
  SetOutPath "$PLUGINSDIR"
  File "${VAULTOR_REPLACEMENT_BINARY}"
  SetOutPath "$INSTDIR"
  !insertmacro VaultorReplacement "prepare"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro VaultorReplacement "finish"
!macroend
