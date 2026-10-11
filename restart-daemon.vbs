Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
logsDir = dir & "\logs"

If Not fso.FolderExists(logsDir) Then
  fso.CreateFolder logsDir
End If

shell.CurrentDirectory = dir
shell.Run "cmd /c node """ & dir & "\scripts\stop-daemon.js""", 0, True

Set exec = shell.Exec("cmd /c netstat -aon | findstr :3789 | findstr LISTENING")
Do While Not exec.StdOut.AtEndOfStream
  line = Trim(exec.StdOut.ReadLine)
  If Len(line) > 0 Then
    parts = Split(line)
    pid = parts(UBound(parts))
    If IsNumeric(pid) Then
      shell.Run "taskkill /F /PID " & pid, 0, True
    End If
  End If
Loop

shell.Run "cmd /c taskkill /F /IM TickDash.exe", 0, True
WScript.Sleep 1000

shell.Run "cmd /c node """ & dir & "\scripts\build-tickdash-exe.js""", 0, True
shell.Run "cmd /c """"" & dir & "\TickDash.exe"" --watch daemon.js 1>> """ & dir & "\logs\daemon.log"" 2>&1""", 0, False
