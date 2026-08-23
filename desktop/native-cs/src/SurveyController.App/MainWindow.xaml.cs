using System.Text.Json.Nodes;
using Microsoft.UI;
using Microsoft.UI.Composition.SystemBackdrops;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Media.Animation;
using SurveyController.App.Services;
using SurveyController.App.Views;
using SurveyController.Core.Document;
using SurveyController.Core.Rpc;
using SurveyController.Core.Settings;
using Windows.Graphics;
using WinRT.Interop;

namespace SurveyController.App;

/// <summary>
/// 主窗口壳：标题栏、导航、主题/置顶应用、启动初始化与关闭确认保存。
/// 行为对照 C++ MainWindow.xaml.cpp。
/// </summary>
public sealed partial class MainWindow : Window
{
    private bool _askSaveOnClose = true;
    private bool _closeConfirmed;
    private bool _confirmingClose;
    private bool _initialized;
    private bool _initializing;
    private bool _closing;
    private int _currentPageIndex = -1;

    public MainWindow()
    {
        InitializeComponent();
        Title = "SurveyController";

        ConfigureTitleBar();
        ConfigureWindow();
        ConfigureBackdrop();

        Activated += OnWindowActivated;
        AppWindow.Closing += OnWindowClosing;
        Closed += OnWindowClosed;
        ShellNavigation.SelectionChanged += OnNavigationSelectionChanged;
    }

    private async void OnWindowActivated(object sender, WindowActivatedEventArgs args)
    {
        if (!_initializing && !_initialized && !_closing)
        {
            await InitializeAsync();
        }
    }

    private async Task InitializeAsync()
    {
        _initializing = true;
        StartupStatus.Severity = InfoBarSeverity.Informational;
        StartupStatus.Title = "正在启动后端";
        StartupStatus.Message = "正在加载设置和配置。";
        StartupStatus.IsOpen = true;
        try
        {
            var settings = await SettingsService.LoadAsync();
            var config = await ConfigService.LoadAsync();
            if (_closing)
            {
                return;
            }
            WizardDocument.Current.LoadConfigState(config);
            ShellSettings.Current.SetChangedHandler(json => ApplyShellSettings(json));
            ShellSettings.Current.Update(settings);
            if (_currentPageIndex < 0)
            {
                ShowPage("task");
            }
            StartupStatus.IsOpen = false;
            _initialized = true;
        }
        catch (Exception error)
        {
            StartupStatus.Severity = InfoBarSeverity.Error;
            StartupStatus.Title = "后端启动失败";
            StartupStatus.Message = error.Message;
        }
        _initializing = false;
    }

    private void ApplyShellSettings(string json)
    {
        if (JsonNode.Parse(json) is not JsonObject settings)
        {
            return;
        }
        var theme = Str(settings, "themeMode", "system");
        if (Content is FrameworkElement root)
        {
            root.RequestedTheme = theme switch
            {
                "light" => ElementTheme.Light,
                "dark" => ElementTheme.Dark,
                _ => ElementTheme.Default,
            };
        }
        ApplyTitleBarTheme(theme);

        ShellNavigation.PaneDisplayMode = Bool(settings, "showNavigationText", true)
            ? NavigationViewPaneDisplayMode.Auto
            : NavigationViewPaneDisplayMode.LeftCompact;

        _askSaveOnClose = Bool(settings, "askSaveOnClose", true);
        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.IsAlwaysOnTop = Bool(settings, "topmost");
        }
    }

    private async void OnWindowClosing(AppWindow sender, AppWindowClosingEventArgs args)
    {
        if (_closeConfirmed || !_askSaveOnClose)
        {
            return;
        }
        args.Cancel = true;
        if (!_confirmingClose)
        {
            await ConfirmCloseAsync();
        }
    }

    private void OnWindowClosed(object sender, WindowEventArgs args)
    {
        BackendClient.Current.ShutdownImmediate();
    }

    private async Task ConfirmCloseAsync()
    {
        _confirmingClose = true;

        var dialog = new ContentDialog
        {
            Title = "保存当前配置？",
            Content = "关闭前可以把本次改动写入配置文件。",
            PrimaryButtonText = "保存并关闭",
            SecondaryButtonText = "不保存并关闭",
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Primary,
        };
        DialogStyling.PrepareContentDialog(dialog, Content.XamlRoot);

        var result = await dialog.ShowAsync();
        if (result == ContentDialogResult.Primary)
        {
            string saveError = string.Empty;
            try
            {
                var saved = await ConfigService.SaveAsync(WizardDocument.Current.SaveRequest());
                WizardDocument.Current.LoadConfigState(saved);
            }
            catch (Exception error)
            {
                saveError = error.Message;
            }

            if (saveError.Length > 0)
            {
                var failure = new ContentDialog
                {
                    Title = "无法保存配置",
                    Content = saveError,
                    CloseButtonText = "返回",
                };
                DialogStyling.PrepareContentDialog(failure, Content.XamlRoot);
                await failure.ShowAsync();
                _confirmingClose = false;
                return;
            }
        }

        _confirmingClose = false;
        if (result == ContentDialogResult.None)
        {
            return;
        }
        _closeConfirmed = true;
        _closing = true;
        (ContentFrame.Content as IShutdownAware)?.PrepareForShutdown();
        Close();
    }

    private void ConfigureTitleBar()
    {
        ExtendsContentIntoTitleBar = true;
        SetTitleBar(AppTitleBar);

        var titleBar = AppWindow.TitleBar;
        titleBar.ButtonBackgroundColor = Colors.Transparent;
        titleBar.ButtonInactiveBackgroundColor = Colors.Transparent;
        ApplyTitleBarTheme("system");
    }

    private void ApplyTitleBarTheme(string themeMode)
    {
        var titleBar = AppWindow.TitleBar;
        if (!titleBar.IsCustomizationSupported)
        {
            return;
        }

        var dark = themeMode == "dark" ||
            (themeMode == "system" && Content is FrameworkElement { ActualTheme: ElementTheme.Dark });
        var foreground = dark ? Colors.White : Colors.Black;
        titleBar.ButtonForegroundColor = foreground;
        titleBar.ButtonHoverForegroundColor = foreground;
        titleBar.ButtonPressedForegroundColor = foreground;
        titleBar.ButtonInactiveForegroundColor = foreground;
    }

    private void ConfigureWindow()
    {
        WindowContext.SetMainWindow(this);

        var hwnd = WindowNative.GetWindowHandle(this);
        var dpi = GetDpiForWindow(hwnd);
        var scale = dpi / 96.0;

        var iconPath = Path.Combine(AppContext.BaseDirectory, "Assets", "SurveyController.ico");
        if (File.Exists(iconPath))
        {
            AppWindow.SetIcon(iconPath);
        }

        if (AppWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.PreferredMinimumWidth = (int)Math.Round(720 * scale);
            presenter.PreferredMinimumHeight = (int)Math.Round(560 * scale);
        }

        var displayArea = DisplayArea.GetFromWindowId(AppWindow.Id, DisplayAreaFallback.Nearest);
        var width = (int)Math.Round(1180 * scale);
        var height = (int)Math.Round(720 * scale);
        if (displayArea is not null)
        {
            var workArea = displayArea.WorkArea;
            var maxWidth = workArea.Width > 64 ? workArea.Width - 64 : workArea.Width;
            var maxHeight = workArea.Height > 64 ? workArea.Height - 64 : workArea.Height;
            width = Math.Min(width, maxWidth);
            height = Math.Min(height, maxHeight);
            AppWindow.Resize(new SizeInt32(width, height));
            var size = AppWindow.Size;
            AppWindow.Move(new PointInt32(
                workArea.X + (workArea.Width - size.Width) / 2,
                workArea.Y + (workArea.Height - size.Height) / 2));
        }
        else
        {
            AppWindow.Resize(new SizeInt32(width, height));
        }
        ContentFrame.CacheSize = 2;
    }

    private void ConfigureBackdrop()
    {
        if (IsWindows11OrGreater())
        {
            SystemBackdrop = new MicaBackdrop { Kind = MicaKind.BaseAlt };
            return;
        }
        SystemBackdrop = new DesktopAcrylicBackdrop();
    }

    private void OnNavigationSelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (!_initialized || _closing)
        {
            return;
        }
        if (args.SelectedItem is not NavigationViewItem item)
        {
            return;
        }
        ShowPage(item.Tag as string ?? string.Empty);
    }

    private void ShowPage(string tag)
    {
        var targetIndex = tag switch
        {
            "task" => 0,
            "settings" => 1,
            "community" => 2,
            _ => 3,
        };
        if (_currentPageIndex >= 0 && targetIndex == _currentPageIndex)
        {
            return;
        }

        Type pageType = tag switch
        {
            "task" => typeof(TaskPage),
            "settings" => typeof(SettingsPage),
            "community" => typeof(CommunityPage),
            _ => typeof(MorePage),
        };
        ContentFrame.Navigate(pageType, null, new EntranceNavigationTransitionInfo());
        _currentPageIndex = targetIndex;
    }

    private static bool IsWindows11OrGreater() =>
        Environment.OSVersion.Version.Build >= 22000;

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(nint hwnd);

    private static string Str(JsonObject parent, string name, string fallback) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<string>(out var text) ? text : fallback;

    private static bool Bool(JsonObject parent, string name, bool fallback = false) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<bool>(out var flag) ? flag : fallback;
}
