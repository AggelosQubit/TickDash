$ErrorActionPreference = "Stop"
[Console]::InputEncoding = [System.Text.Encoding]::UTF8

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
public class TickType2 {
  delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  static EnumProc callback;
  static IntPtr found;

  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

  [StructLayout(LayoutKind.Sequential)]
  struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Explicit, Size = 40)]
  struct INPUT {
    [FieldOffset(0)] public uint type;
    [FieldOffset(8)] public KEYBDINPUT ki;
  }

  const uint KEYEVENTF_KEYUP = 0x0002;
  const uint KEYEVENTF_UNICODE = 0x0004;
  const byte VK_SHIFT = 0x10;
  const byte VK_CONTROL = 0x11;
  const byte VK_MENU = 0x12;
  const int CHAR_MS = 30;

  public static IntPtr FindForPid(uint pid) {
    found = IntPtr.Zero;
    callback = (h, l) => {
      if (!IsWindowVisible(h)) return true;
      uint windowPid;
      GetWindowThreadProcessId(h, out windowPid);
      if (windowPid != pid) return true;
      var sb = new StringBuilder(256);
      GetWindowText(h, sb, sb.Capacity);
      if (sb.Length == 0) return true;
      found = h;
      return true;
    };
    EnumWindows(callback, IntPtr.Zero);
    return found;
  }

  public static string WaitForeground(IntPtr hwnd) {
    for (int i = 0; i < 200; i++) {
      if (GetForegroundWindow() == hwnd) {
        Thread.Sleep(120);
        if (GetForegroundWindow() == hwnd) {
          var sb = new StringBuilder(256);
          GetWindowText(hwnd, sb, sb.Capacity);
          return sb.ToString();
        }
      }
      Thread.Sleep(50);
    }
    throw new InvalidOperationException("partie pas au premier plan");
  }

  public static void Detach() {
    ReleaseModifiers();
  }

  public static void ReleaseModifiers() {
    keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
  }

  static void SendUni(char ch, bool up) {
    INPUT input = new INPUT();
    input.type = 1;
    input.ki.wScan = (ushort)ch;
    input.ki.dwFlags = KEYEVENTF_UNICODE;
    if (up) input.ki.dwFlags |= KEYEVENTF_KEYUP;
    INPUT[] inputs = new INPUT[] { input };
    uint sent = SendInput(1, inputs, Marshal.SizeOf(typeof(INPUT)));
    if (sent != 1) throw new InvalidOperationException("SendInput " + sent);
  }

  static void TapChar(char ch) {
    SendUni(ch, false);
    Thread.Sleep(CHAR_MS);
    SendUni(ch, true);
  }

  public static void WaitEnter() {
    bool seenUp = false;
    for (int i = 0; i < 400; i++) {
      bool down = (GetAsyncKeyState(0x0D) & 0x8000) != 0;
      if (!down) seenUp = true;
      else if (seenUp) return;
      Thread.Sleep(50);
    }
    throw new InvalidOperationException("entrée non reçue");
  }

  public static void TypeMessage(string text) {
    try {
      foreach (char ch in text) {
        TapChar(ch);
        Thread.Sleep(18);
      }
    } finally {
      ReleaseModifiers();
    }
  }
}
"@

$text = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($text)) {
  Write-Error "empty"
  exit 2
}

function Find-LeagueHandle {
  $game = Get-Process -Name "League of Legends" -ErrorAction SilentlyContinue |
    Where-Object { $_.Id -gt 0 } |
    Select-Object -First 1
  if ($game) {
    if ($game.MainWindowHandle -ne 0) { return [IntPtr]$game.MainWindowHandle }
    $byPid = [TickType2]::FindForPid([uint32]$game.Id)
    if ($byPid -ne [IntPtr]::Zero) { return $byPid }
  }
  $client = Get-Process -Name "LeagueClientUx" -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1
  if ($client) { return [IntPtr]$client.MainWindowHandle }
  return [IntPtr]::Zero
}

$hwnd = Find-LeagueHandle
if ($hwnd -eq [IntPtr]::Zero) {
  Write-Error "Fenêtre League introuvable"
  exit 3
}

function Write-Phase([string]$name) {
  [Console]::Out.WriteLine("phase $name")
  [Console]::Out.Flush()
}

try {
  Write-Phase "wait-focus"
  $title = [TickType2]::WaitForeground($hwnd)
  Write-Phase "typing"
  [TickType2]::TypeMessage($text.TrimEnd("`r", "`n"))
  [TickType2]::WaitEnter()
  Write-Phase "validate"
  Write-Output $title
  exit 0
} catch {
  Write-Error $_.Exception.Message
  exit 4
} finally {
  [TickType2]::Detach()
}
