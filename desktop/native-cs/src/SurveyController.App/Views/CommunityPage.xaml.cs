using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Windows.System;

namespace SurveyController.App.Views;

/// <summary>社区页：静态内容 + 外链与二维码弹层。</summary>
public sealed partial class CommunityPage : Page
{
    public CommunityPage()
    {
        InitializeComponent();
    }

    private async void OnOpenQr(object sender, RoutedEventArgs e)
    {
        var dialog = new ContentDialog
        {
            Title = "QQ 群二维码",
            Content = new Image
            {
                Source = CommunityQrImage.Source,
                Width = 280,
                Height = 280,
                Stretch = Microsoft.UI.Xaml.Media.Stretch.Uniform,
            },
            CloseButtonText = "关闭",
        };
        DialogStyling.PrepareContentDialog(dialog, Content.XamlRoot);
        try
        {
            await dialog.ShowAsync();
        }
        catch (Exception)
        {
        }
    }

    private void OnOpenRepository(object sender, RoutedEventArgs e) =>
        _ = OpenUrlAsync("https://github.com/SurveyController/SurveyController");

    private void OnOpenLicense(object sender, RoutedEventArgs e) =>
        _ = OpenUrlAsync("https://github.com/SurveyController/SurveyController/blob/main/LICENSE");

    private static async Task OpenUrlAsync(string url)
    {
        try
        {
            await Launcher.LaunchUriAsync(new Uri(url));
        }
        catch (Exception)
        {
        }
    }
}
