!macro customInstall
  Push $0
  Push $1
  ReadEnvStr $0 "ProgramData"
  StrCmp $0 "" 0 +2
  StrCpy $0 "C:\ProgramData"
  CreateDirectory "$0\NexPDV"
  IfFileExists "$0\NexPDV\config.json" nexpdvConfigPermissions 0
  FileOpen $1 "$0\NexPDV\config.json" w
  FileWrite $1 '{$\r$\n  "apiUrl": "https://nexpdvapi-production.up.railway.app"$\r$\n}$\r$\n'
  FileClose $1
  DetailPrint "NexPDV API Cloud config criada em $0\NexPDV\config.json"

nexpdvConfigPermissions:
  nsExec::ExecToLog 'icacls "$0\NexPDV" /grant *S-1-5-11:(OI)(CI)M /T /C'
  Pop $1
  Pop $0
!macroend
