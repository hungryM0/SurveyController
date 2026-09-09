using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using ModernWpf.Controls;
using SurveyController.App.Services;
using SurveyController.App.ViewModels;
using SurveyController.Core.Community;
using Page = System.Windows.Controls.Page;

namespace SurveyController.App.Views;

/// <summary>更多页：更新检查、IP 用量、外链与条款弹层。</summary>
public partial class MorePage : Page
{
    private const string CurrentVersion = "5.0.0";

    private bool _checkingUpdate;
    private bool _loadingUsage;
    private string _downloadUrl = string.Empty;

    public ObservableCollection<IpUsageRow> UsageItems { get; } = [];

    public MorePage()
    {
        DataContext = this;
        InitializeComponent();
        LoadIpUsage();
    }

    private void OnOpenDownload(object sender, RoutedEventArgs e)
    {
        if (_downloadUrl.Length > 0)
        {
            Open(_downloadUrl);
        }
    }

    private async void OnCheckUpdate(object sender, RoutedEventArgs e)
    {
        if (_checkingUpdate)
        {
            return;
        }
        _checkingUpdate = true;
        UpdateButton.IsEnabled = false;
        UpdateStatus.Text = "正在检查更新...";
        ReleaseNotes.Visibility = Visibility.Collapsed;

        string error = string.Empty;
        UpdateCheckState? state = null;
        try
        {
            state = UpdateCheckState.Parse(await CommunityService.CheckUpdateAsync(CurrentVersion));
        }
        catch (Exception exception)
        {
            error = exception.Message;
        }

        _checkingUpdate = false;
        UpdateButton.IsEnabled = true;
        if (error.Length > 0 || state is null)
        {
            UpdateStatus.Text = "检查更新失败：" + error;
            DownloadButton.IsEnabled = false;
            return;
        }

        UpdateStatus.Text = state.Message;
        if (state.DownloadUrl.Length > 0)
        {
            _downloadUrl = state.DownloadUrl;
        }
        DownloadButton.IsEnabled = state.Status == "outdated";
        if (state.ReleaseNotes.Length > 0)
        {
            ReleaseNotes.Text = state.ReleaseNotes;
            ReleaseNotes.Visibility = Visibility.Visible;
        }
    }

    private async void LoadIpUsage()
    {
        if (_loadingUsage)
        {
            return;
        }
        _loadingUsage = true;
        IPUsageStatus.Text = "正在加载 IP 使用记录...";

        string error = string.Empty;
        IpUsageSummary? summary = null;
        try
        {
            summary = IpUsageSummary.Parse(await CommunityService.IpUsageAsync());
        }
        catch (Exception exception)
        {
            error = exception.Message;
        }

        _loadingUsage = false;
        UsageItems.Clear();
        if (error.Length > 0 || summary is null)
        {
            IPUsageStatus.Text = "获取失败：" + error;
            IPBalance.Text = "IP 池剩余数量：同步失败";
            return;
        }

        IPBalance.Text = summary.RemainingIP is { } remaining
            ? $"IP 池剩余数量：{Math.Max(remaining, 0)}"
            : "IP 池剩余数量：未知";

        if (summary.Records.Count == 0)
        {
            IPUsageStatus.Text = "暂无数据";
            return;
        }

        var maxTotal = 1.0;
        foreach (var record in summary.Records)
        {
            maxTotal = Math.Max(maxTotal, record.Total);
        }
        foreach (var record in summary.Records)
        {
            UsageItems.Add(new IpUsageRow(record.Label, record.Total, maxTotal));
        }
        IPUsageStatus.Text = "每日提取 IP 数";
    }

    private void OnLoadIpUsage(object sender, RoutedEventArgs e)
    {
        IPUsageExpander.IsExpanded = true;
        LoadIpUsage();
    }

    private async void OnOpenTerms(object sender, RoutedEventArgs e)
    {
        var dialog = new ContentDialog
        {
            Title = "服务条款与隐私声明",
            Content = new ScrollViewer
            {
                MaxHeight = 520,
                Content = new TextBlock
                {
                    TextWrapping = TextWrapping.Wrap,
                    Text = "服务条款\n\n"
                        + "本软件仅供个人学习、研究和技术交流使用。严禁伪造不实数据、商业性质的数据采集或问卷填写服务、污染或破坏他人问卷数据，以及其他违反法律法规或侵犯他人权益的行为。\n\n"
                        + "本软件按现状提供，不对适用性、准确性、完整性或可靠性提供保证。使用软件产生的法律责任及后果由使用者自行承担。软件采用 GPL-3.0 开源许可证。\n\n"
                        + "隐私声明\n\n"
                        + "本软件不收集个人身份信息和用户填写的问卷内容。配置信息存储在本地设备。AI 服务和随机 IP 代理服务只在用户主动启用时调用，并受对应服务商隐私政策约束。若用户主动上传配置或日志用于报错反馈，仅用于错误分析与问题定位。",
                },
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

    private void OnOpenRepository(object sender, RoutedEventArgs e) => Open("https://github.com/SurveyController/SurveyController");

    private void OnOpenLicense(object sender, RoutedEventArgs e) => Open("https://github.com/SurveyController/SurveyController/blob/main/LICENSE");

    private void OnOpenChangelog(object sender, RoutedEventArgs e) => Open("https://github.com/SurveyController/SurveyController/releases");

    private void OnOpenTutorial(object sender, RoutedEventArgs e) => Open("https://surveydoc.hungrym0.com/");

    private void OnOpenDonation(object sender, RoutedEventArgs e) => DonationExpander.IsExpanded = true;

    private void OnOpenContributor1(object sender, RoutedEventArgs e) => Open("https://github.com/hungryM0");

    private void OnOpenContributor2(object sender, RoutedEventArgs e) => Open("https://github.com/shiahonb777");

    private void OnOpenContributor3(object sender, RoutedEventArgs e) => Open("https://github.com/BingBuLiang");

    private void OnOpenContributor4(object sender, RoutedEventArgs e) => Open("https://github.com/dAwn-Rebirth");

    private void OnOpenContributor5(object sender, RoutedEventArgs e) => Open("https://github.com/Moyuin-aka");

    private void OnOpenContributor6(object sender, RoutedEventArgs e) => Open("https://github.com/qintaiyang");

    private static void Open(string url)
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
