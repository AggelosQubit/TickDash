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

    public TickDashForm(string url)
    {
        this.url = url;
        Text = "TickDash";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1600, 980);
        MinimumSize = new Size(960, 640);
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

    [STAThread]
    static void Main(string[] args)
    {
        string url = args.Length > 0 ? args[0] : "http://127.0.0.1:3789/";
        bool createdNew;
        using (Mutex mutex = new Mutex(true, @"Local\TickDash.WebView", out createdNew))
        {
            if (!createdNew)
            {
                IntPtr hwnd = FindWindow(null, "TickDash");
                if (hwnd != IntPtr.Zero)
                {
                    ShowWindow(hwnd, 9);
                    SetForegroundWindow(hwnd);
                }
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new TickDashForm(url));
        }
    }
}
