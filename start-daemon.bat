@echo off
REM Lance le daemon sans fenetre (logs -> logs\daemon.log)
wscript.exe //B "%~dp0start-daemon.vbs"
