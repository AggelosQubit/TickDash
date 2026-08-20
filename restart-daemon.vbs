Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

dir = fso.GetParentFolderName(WScript.ScriptFullName)
logsDir = dir & "\logs"

If Not fso.FolderExists(logsDir) Then
  fso.CreateFolder logsDir
End If

shell.CurrentDirectory = dir

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

WScript.Sleep 1000

shell.Run "cmd /c node daemon.js 1>> logs\daemon.log 2>&1", 0, False
