using System.ComponentModel;
using System.IO;
using System.Text.Json.Nodes;
using System.Windows;
using ModernWpf;
using ModernWpf.Controls;
using SurveyController.App.Controls;
using SurveyController.App.Services;
using SurveyController.App.Views;
using SurveyController.Core.Document;
using SurveyController.Core.Rpc;
using SurveyController.Core.Settings;

namespace SurveyController.App;

/// <summary>
/// 主窗口壳：ModernWpf 标题栏、导航、主题/置顶应用、启动初始化与关闭确认保存。
/// </summary>
public partial class MainWindow : Window
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
        WindowContext.SetMainWindow(this);

        Loaded += OnWindowLoaded;
        Closing += OnWindowClosing;
        Closed += OnWindowClosed;
        ShellNavigation.SelectionChanged += OnNavigationSelectionChanged;
    }

    private async void OnWindowLoaded(object sender, RoutedEventArgs args)
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
        ThemeManager.Current.ApplicationTheme = theme switch
        {
            "light" => ApplicationTheme.Light,
            "dark" => ApplicationTheme.Dark,
            _ => null, // Follow system
        };

        ShellNavigation.PaneDisplayMode = Bool(settings, "showNavigationText", true)
            ? NavigationViewPaneDisplayMode.Auto
            : NavigationViewPaneDisplayMode.LeftCompact;

        _askSaveOnClose = Bool(settings, "askSaveOnClose", true);
        Topmost = Bool(settings, "topmost");
    }

    private async void OnWindowClosing(object? sender, CancelEventArgs args)
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

    private void OnWindowClosed(object? sender, EventArgs args)
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
            Owner = this,
        };

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
                    Owner = this,
                };
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
        ContentFrame.Navigate(pageType);
        _currentPageIndex = targetIndex;
    }

    private static string Str(JsonObject parent, string name, string fallback) =>
        parent[name] is JsonValue value && value.TryGetValue<string>(out var text) ? text : fallback;

    private static bool Bool(JsonObject parent, string name, bool fallback = false) =>
        parent[name] is JsonValue value && value.TryGetValue<bool>(out var flag) ? flag : fallback;
}
