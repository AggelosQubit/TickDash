Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
logsDir = dir & "\logs"

If Not fso.FolderExists(logsDir) Then
  fso.CreateFolder logsDir
End If

shell.CurrentDirectory = dir
shell.Run "cmd /c node daemon.js 1>> logs\daemon.log 2>&1", 0, False
