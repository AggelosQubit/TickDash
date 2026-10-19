using System;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

sealed class TickDashForm : Form
{
    readonly WebView2 view;
    readonly string url;

    public TickDashForm(string url, bool secondScreen)
    {
        this.url = url;
        Text = "TickDash";
        int width = 1600;
        int height = 980;
        if (secondScreen)
        {
            Screen screen = Program.SecondScreen();
            Rectangle area = screen.WorkingArea;
            width = Math.Min(width, area.Width);
            height = Math.Min(height, area.Height);
            StartPosition = FormStartPosition.Manual;
            Size = new Size(width, height);
            Location = new Point(
                area.Left + Math.Max(0, (area.Width - width) / 2),
                area.Top + Math.Max(0, (area.Height - height) / 2));
        }
        else
        {
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(width, height);
        }
        MinimumSize = new Size(Math.Min(960, width), Math.Min(640, height));
        view = new WebView2();
        view.Dock = DockStyle.Fill;
        Controls.Add(view);
        Load += OnLoad;
    }

    async void OnLoad(object sender, EventArgs e)
    {
        try
        {
            string data = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "TickDash",
                "WebView2");
            Directory.CreateDirectory(data);
            CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, data);
            await view.EnsureCoreWebView2Async(env);
            view.CoreWebView2.DocumentTitleChanged += delegate { Text = "TickDash"; };
            view.CoreWebView2.Navigate(url);
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "TickDash", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}

static class Program
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

    struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    internal static Screen SecondScreen()
    {
        foreach (Screen screen in Screen.AllScreens)
        {
            if (!screen.Primary) return screen;
        }
        return Screen.PrimaryScreen;
    }

    static void MoveToSecondScreen(IntPtr hwnd)
    {
        ShowWindow(hwnd, 9);
        Rectangle area = SecondScreen().WorkingArea;
        int width = 1600;
        int height = 980;
        RECT rect;
        if (GetWindowRect(hwnd, out rect))
        {
            width = Math.Max(1, rect.Right - rect.Left);
            height = Math.Max(1, rect.Bottom - rect.Top);
        }
        width = Math.Min(width, area.Width);
        height = Math.Min(height, area.Height);
        int x = area.Left + Math.Max(0, (area.Width - width) / 2);
        int y = area.Top + Math.Max(0, (area.Height - height) / 2);
        SetWindowPos(hwnd, IntPtr.Zero, x, y, width, height, 0x0044);
        SetForegroundWindow(hwnd);
    }

    [STAThread]
    static void Main(string[] args)
    {
        string url = "http://127.0.0.1:3789/";
        bool secondScreen = false;
        foreach (string arg in args)
        {
            if (arg == "--screen2") secondScreen = true;
            else if (arg.StartsWith("http", StringComparison.OrdinalIgnoreCase)) url = arg;
        }
        bool createdNew;
        using (Mutex mutex = new Mutex(true, @"Local\TickDash.WebView", out createdNew))
        {
            if (!createdNew)
            {
                IntPtr hwnd = FindWindow(null, "TickDash");
                if (hwnd != IntPtr.Zero)
                {
                    if (secondScreen) MoveToSecondScreen(hwnd);
                    else
                    {
                        ShowWindow(hwnd, 9);
                        SetForegroundWindow(hwnd);
                    }
                }
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TickDashForm(url, secondScreen));
        }
    }
}
