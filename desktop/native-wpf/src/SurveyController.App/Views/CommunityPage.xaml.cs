using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using ModernWpf.Controls;
using SurveyController.App.Services;
using Page = System.Windows.Controls.Page;

namespace SurveyController.App.Views;

/// <summary>社区页：静态内容 + 外链与二维码弹层。</summary>
public partial class CommunityPage : Page
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
                Stretch = Stretch.Uniform,
            },
            CloseButtonText = "关闭",
            Owner = WindowContext.MainWindow,
        };
        try
        {
            await dialog.ShowAsync();
        }
        catch
        {
        }
    }

    private void OnOpenRepository(object sender, RoutedEventArgs e) =>
        OpenUrl("https://github.com/SurveyController/SurveyController");

    private void OnOpenLicense(object sender, RoutedEventArgs e) =>
        OpenUrl("https://github.com/SurveyController/SurveyController/blob/main/LICENSE");

    private static void OpenUrl(string url)
    {
        try
        {
            Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch
        {
        }
    }
}
