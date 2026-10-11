$ErrorActionPreference = "Stop"
$text = [Console]::In.ReadToEnd()
if ([string]::IsNullOrWhiteSpace($text)) {
  Write-Error "empty"
  exit 3
}

$checkOnly = $env:TICKDASH_TYPE_MODE -eq "check"
$source = @"
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class TickDashTyper {
  const int KEYEVENTF_KEYUP = 0x0002;
  const int KEYEVENTF_UNICODE = 0x0004;
  const int INPUT_KEYBOARD = 1;
  const ushort VK_RETURN = 0x0D;
  const byte VK_MENU = 0x12;

  [StructLayout(LayoutKind.Sequential)]
  struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct KEYBDINPUT {
    public ushort wVk;
    public ushort wScan;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct HARDWAREINPUT {
    public uint uMsg;
    public ushort wParamL;
    public ushort wParamH;
  }

  [StructLayout(LayoutKind.Explicit)]
  struct INPUTUNION {
    [FieldOffset(0)] public MOUSEINPUT mi;
    [FieldOffset(0)] public KEYBDINPUT ki;
    [FieldOffset(0)] public HARDWAREINPUT hi;
  }

  [StructLayout(LayoutKind.Sequential)]
  struct INPUT {
    public uint type;
    public INPUTUNION U;
  }

  delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

  [DllImport("user32.dll")]
  static extern bool EnumWindows(EnumProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  static IntPtr gameWindow;
  static IntPtr clientWindow;
  static EnumProc enumProc;

  static void Tap(INPUT down, INPUT up) {
    SendInput(2, new INPUT[] { down, up }, Marshal.SizeOf(typeof(INPUT)));
  }

  static void TapVk(ushort vk) {
    var down = new INPUT();
    down.type = INPUT_KEYBOARD;
    down.U.ki.wVk = vk;
    var up = down;
    up.U.ki.dwFlags = KEYEVENTF_KEYUP;
    Tap(down, up);
  }

  static void TapChar(char c) {
    var down = new INPUT();
    down.type = INPUT_KEYBOARD;
    down.U.ki.wScan = c;
    down.U.ki.dwFlags = KEYEVENTF_UNICODE;
    var up = down;
    up.U.ki.dwFlags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
    Tap(down, up);
  }

  static IntPtr FindLeague() {
    gameWindow = IntPtr.Zero;
    clientWindow = IntPtr.Zero;
    enumProc = (h, l) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, sb.Capacity);
      var title = sb.ToString();
      if (title.IndexOf("League of Legends (TM) Client", StringComparison.OrdinalIgnoreCase) >= 0) gameWindow = h;
      else if (title.IndexOf("League of Legends", StringComparison.OrdinalIgnoreCase) >= 0) clientWindow = h;
      return true;
    };
    EnumWindows(enumProc, IntPtr.Zero);
    return gameWindow != IntPtr.Zero ? gameWindow : clientWindow;
  }

  public static int Run(string text, bool checkOnly) {
    var target = FindLeague();
    if (target == IntPtr.Zero) return 2;
    if (checkOnly) return 0;
    keybd_event(VK_MENU, 0, 0, UIntPtr.Zero);
    try {
      ShowWindow(target, 9);
      SetForegroundWindow(target);
    } finally {
      keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
    }
    Thread.Sleep(220);
    TapVk(VK_RETURN);
    Thread.Sleep(180);
    foreach (var c in text) {
      TapChar(c);
      Thread.Sleep(15);
    }
    Thread.Sleep(40);
    TapVk(VK_RETURN);
    return 0;
  }
}
"@

Add-Type -TypeDefinition $source -Language CSharp
$code = [TickDashTyper]::Run($text, $checkOnly)
exit $code
