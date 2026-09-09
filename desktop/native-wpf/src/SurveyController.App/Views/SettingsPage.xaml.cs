using System.Windows;
using System.Windows.Controls;
using ModernWpf.Controls;
using SurveyController.App.Services;
using SurveyController.App.ViewModels;
using SurveyController.Core.Settings;
using Page = System.Windows.Controls.Page;

namespace SurveyController.App.Views;

/// <summary>设置页：控件状态由 SettingsViewModel 驱动，事件只做调度。</summary>
public partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; }

    public SettingsPage()
    {
        ViewModel = new SettingsViewModel();
        try
        {
            ViewModel.LoadFrom(ShellSettings.Current.Json);
        }
        catch (Exception error)
        {
            ViewModel.StatusText = error.Message;
        }
        DataContext = this;
        InitializeComponent();
    }

    private void OnSettingToggled(object sender, RoutedEventArgs e) => ViewModel.ScheduleSave();

    private void OnSettingSelectionChanged(object sender, SelectionChangedEventArgs e) => ViewModel.ScheduleSave();

    private async void OnReset(object sender, RoutedEventArgs e)
    {
        var dialog = new ContentDialog
        {
            Title = "恢复默认设置",
            Content = "确定要恢复默认设置吗？这将还原所有设置项到初始状态。",
            PrimaryButtonText = "恢复",
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Primary,
            Owner = WindowContext.MainWindow,
        };
        if (await dialog.ShowAsync() != ContentDialogResult.Primary)
        {
            return;
        }
        await ViewModel.ResetToDefaultsAsync();
    }

    private async void OnChooseDirectory(object sender, RoutedEventArgs e)
    {
        try
        {
            var dialog = new System.Windows.Forms.FolderBrowserDialog
            {
                Description = "选择配置保存目录",
                ShowNewFolderButton = true,
            };
            if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK)
            {
                await ViewModel.ChooseConfigDirectoryAsync(dialog.SelectedPath);
            }
        }
        catch (Exception error)
        {
            ViewModel.StatusText = error.Message;
        }
    }
}
