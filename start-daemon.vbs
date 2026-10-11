Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
logsDir = dir & "\logs"

If Not fso.FolderExists(logsDir) Then
  fso.CreateFolder logsDir
End If

shell.CurrentDirectory = dir
shell.Run "cmd /c node """ & dir & "\scripts\build-tickdash-exe.js""", 0, True
shell.Run "cmd /c """"" & dir & "\TickDash.exe"" --watch daemon.js 1>> """ & dir & "\logs\daemon.log"" 2>&1""", 0, False
