using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.Windows.Storage.Pickers;
using SurveyController.App.Services;
using SurveyController.App.ViewModels;
using SurveyController.Core.Settings;

namespace SurveyController.App.Views;

/// <summary>设置页：控件状态由 SettingsViewModel 驱动，事件只做调度。</summary>
public sealed partial class SettingsPage : Page
{
    public SettingsViewModel ViewModel { get; }

    public SettingsPage()
    {
        ViewModel = new SettingsViewModel(Microsoft.UI.Dispatching.DispatcherQueue.GetForCurrentThread());
        try
        {
            ViewModel.LoadFrom(ShellSettings.Current.Json);
        }
        catch (Exception error)
        {
            ViewModel.StatusText = error.Message;
        }
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
        };
        DialogStyling.PrepareContentDialog(dialog, Content.XamlRoot);
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
            var picker = new FolderPicker(WindowContext.MainWindowId);
            var folder = await picker.PickSingleFolderAsync();
            if (folder is not null)
            {
                await ViewModel.ChooseConfigDirectoryAsync(folder.Path);
            }
        }
        catch (Exception error) when (error is not OperationCanceledException)
        {
            ViewModel.StatusText = error.Message;
        }
    }
}
