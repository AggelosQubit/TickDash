@echo off
set "LNK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\TickDash.lnk"
if exist "%LNK%" (
  del "%LNK%"
  echo [TickDash] Retire du demarrage.
) else (
  echo [TickDash] Raccourci introuvable.
)
pause
