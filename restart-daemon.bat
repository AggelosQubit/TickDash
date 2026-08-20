@echo off
REM Redémarre le daemon sans fenêtre (logs -> logs\daemon.log)
wscript.exe //B "%~dp0restart-daemon.vbs"
