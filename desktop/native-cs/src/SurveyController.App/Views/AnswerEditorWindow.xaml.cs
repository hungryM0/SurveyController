using System.Runtime.InteropServices;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Input;
using SurveyController.App.Services;
using SurveyController.Core.Document;
using Windows.Graphics;
using WinRT.Interop;

namespace SurveyController.App.Views;

/// <summary>
/// 逐题答案编辑器窗口：生命周期包裹一次 WizardDocument 编辑事务，
/// 保存提交、取消/ESC/直接关闭回滚。行为对照 C++ AnswerEditorWindow.xaml.cpp。
/// </summary>
public sealed partial class AnswerEditorWindow : Window
{
    private bool _committed;
    private bool _closing;
    private bool _aiSettingsOpen;

    public AnswerEditorWindow()
    {
        InitializeComponent();
        Title = "逐题答案编辑器";
        Document.BeginEditTransaction();
        Closed += (_, _) =>
        {
            if (!_committed)
            {
                Document.RollbackEditTransaction();
            }
        };
    }

    private WizardDocument Document { get; } = WizardDocument.Current;

    public void ShowForOwner(WindowId ownerId)
    {
        ConfigureWindow(ownerId);
        Activate();
    }

    private void OnSave(object sender, RoutedEventArgs e)
    {
        if (Editor.SaveCurrentQuestion())
        {
            CloseEditor(commit: true);
        }
    }

    private void OnCancel(object sender, RoutedEventArgs e) => CloseEditor(commit: false);

    private async void OnOpenAISettings(object sender, RoutedEventArgs e)
    {
        if (_aiSettingsOpen)
        {
            return;
        }
        _aiSettingsOpen = true;
        try
        {
            await AISettingsDialog.ShowAsync(Content.XamlRoot);
        }
        catch (Exception)
        {
        }
        _aiSettingsOpen = false;
    }

    private void OnKeyDown(object sender, KeyRoutedEventArgs args)
    {
        if (args.Key == Windows.System.VirtualKey.Escape)
        {
            args.Handled = true;
            CloseEditor(commit: false);
        }
    }

    private void CloseEditor(bool commit)
    {
        if (_closing)
        {
            return;
        }
        _closing = true;
        _committed = commit;
        if (commit)
        {
            Document.CommitEditTransaction();
        }
        else
        {
            Document.RollbackEditTransaction();
        }
        Close();
    }

    private void ConfigureWindow(WindowId ownerId)
    {
        var hwnd = WindowNative.GetWindowHandle(this);

        // 通过 GWLP_HWNDPARENT 建立 owned window 关系，主窗口最小化时跟随。
        var ownerHwnd = Win32Interop.GetWindowFromWindowId(ownerId);
        if (ownerHwnd != 0)
        {
            SetWindowLongPtrW(hwnd, GWLP_HWNDPARENT, ownerHwnd);
        }

        var appWindow = AppWindow;
        if (appWindow.Presenter is OverlappedPresenter presenter)
        {
            presenter.IsResizable = true;
            presenter.IsMaximizable = true;
            presenter.IsMinimizable = false;
            presenter.IsModal = true;
        }

        var dpi = GetDpiForWindow(hwnd);
        var scale = dpi / 96.0;
        var display = DisplayArea.GetFromWindowId(appWindow.Id, DisplayAreaFallback.Nearest);
        var width = (int)Math.Round(1180 * scale);
        var height = (int)Math.Round(840 * scale);
        if (display is not null)
        {
            var work = display.WorkArea;
            var margin = (int)Math.Round(24 * scale);
            var availableWidth = Math.Max(work.Width - margin * 2, 320);
            var availableHeight = Math.Max(work.Height - margin * 2, 320);
            presenter.PreferredMinimumWidth = Math.Min((int)Math.Round(760 * scale), availableWidth);
            presenter.PreferredMinimumHeight = Math.Min((int)Math.Round(560 * scale), availableHeight);
            width = Math.Min(width, availableWidth);
            height = Math.Min(height, availableHeight);
            appWindow.Resize(new SizeInt32(width, height));
            appWindow.Move(new PointInt32(
                work.X + (work.Width - width) / 2,
                work.Y + (work.Height - height) / 2));
        }
        else
        {
            appWindow.Resize(new SizeInt32(width, height));
        }
    }

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    private static extern nint SetWindowLongPtrW(nint hWnd, int nIndex, nint dwNewLong);

    [DllImport("user32.dll")]
    private static extern uint GetDpiForWindow(nint hwnd);

    private const int GWLP_HWNDPARENT = -8;
}
