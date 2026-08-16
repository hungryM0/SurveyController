#include "pch.h"
#include "MorePage.xaml.h"
#include "Services/BackendClient.h"
#include "Services/JsonHelpers.h"

#if __has_include("MorePage.g.cpp")
#include "MorePage.g.cpp"
#endif

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.h>

#include <algorithm>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        fire_and_forget OpenUrl(wchar_t const* url)
        {
            co_await Windows::System::Launcher::LaunchUriAsync(Windows::Foundation::Uri(url));
        }

        fire_and_forget ShowTerms(Microsoft::UI::Xaml::XamlRoot const& root)
        {
            Microsoft::UI::Xaml::Controls::ContentDialog dialog;
            dialog.XamlRoot(root);
            dialog.Title(box_value(L"服务条款与隐私声明"));

            auto text = Microsoft::UI::Xaml::Controls::TextBlock();
            text.Text(
                L"服务条款\n\n"
                L"本软件仅供个人学习、研究和技术交流使用。严禁伪造不实数据、商业性质的数据采集或问卷填写服务、污染或破坏他人问卷数据，以及其他违反法律法规或侵犯他人权益的行为。\n\n"
                L"本软件按现状提供，不对适用性、准确性、完整性或可靠性提供保证。使用软件产生的法律责任及后果由使用者自行承担。软件采用 GPL-3.0 开源许可证。\n\n"
                L"隐私声明\n\n"
                L"本软件不收集个人身份信息和用户填写的问卷内容。配置信息存储在本地设备。AI 服务和随机 IP 代理服务只在用户主动启用时调用，并受对应服务商隐私政策约束。若用户主动上传配置或日志用于报错反馈，仅用于错误分析与问题定位。");
            text.TextWrapping(Microsoft::UI::Xaml::TextWrapping::Wrap);

            auto scroll = Microsoft::UI::Xaml::Controls::ScrollViewer();
            scroll.Content(text);
            scroll.MaxHeight(520);
            dialog.Content(scroll);
            dialog.CloseButtonText(L"关闭");
            co_await dialog.ShowAsync();
        }
    }

    MorePage::MorePage()
    {
        InitializeComponent();
        try
        {
            Services::BackendClient::Current().Start();
            LoadIPUsage();
        }
        catch (hresult_error const& error)
        {
            IPUsageStatus().Text(L"IP 使用记录暂不可用：" + error.message());
        }
    }

    fire_and_forget MorePage::OnOpenDownload(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        if (!m_downloadUrl.empty())
        {
            OpenUrl(m_downloadUrl.c_str());
        }
        co_return;
    }

    fire_and_forget MorePage::OnCheckUpdate(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        if (m_checkingUpdate)
        {
            co_return;
        }
        m_checkingUpdate = true;
        UpdateButton().IsEnabled(false);
        UpdateStatus().Text(L"正在检查更新...");
        ReleaseNotes().Visibility(Microsoft::UI::Xaml::Visibility::Collapsed);

        auto lifetime = get_strong();
        auto dispatcher = DispatcherQueue();
        co_await resume_background();
        hstring result;
        hstring error;
        try
        {
            result = Services::BackendClient::Current().Call(L"CheckUpdate", L"{\"currentVersion\":\"5.0.0\"}");
        }
        catch (hresult_error const& value)
        {
            error = value.message();
        }

        dispatcher.TryEnqueue([lifetime, result, error]()
        {
            lifetime->m_checkingUpdate = false;
            lifetime->UpdateButton().IsEnabled(true);
            if (!error.empty())
            {
                lifetime->UpdateStatus().Text(L"检查更新失败：" + error);
                lifetime->DownloadButton().IsEnabled(false);
                return;
            }

            Windows::Data::Json::JsonObject state;
            hstring parseError;
            if (!Services::TryParseJsonObject(result, state, parseError))
            {
                lifetime->UpdateStatus().Text(parseError);
                lifetime->DownloadButton().IsEnabled(false);
                return;
            }

            auto status = state.GetNamedString(L"status", L"unknown");
            lifetime->UpdateStatus().Text(state.GetNamedString(L"message", L"无法识别远端版本"));
            lifetime->m_downloadUrl = state.GetNamedString(L"downloadUrl", lifetime->m_downloadUrl);
            lifetime->DownloadButton().IsEnabled(status == L"outdated");
            auto notes = state.GetNamedString(L"releaseNotes", L"");
            if (!notes.empty())
            {
                lifetime->ReleaseNotes().Text(notes);
                lifetime->ReleaseNotes().Visibility(Microsoft::UI::Xaml::Visibility::Visible);
            }
        });
    }

    fire_and_forget MorePage::LoadIPUsage()
    {
        if (m_loadingUsage)
        {
            co_return;
        }
        m_loadingUsage = true;
        IPUsageStatus().Text(L"正在加载 IP 使用记录...");
        auto lifetime = get_strong();
        auto dispatcher = DispatcherQueue();
        co_await resume_background();
        hstring result;
        hstring error;
        try
        {
            result = Services::BackendClient::Current().Call(L"GetIPUsageSummary");
        }
        catch (hresult_error const& value)
        {
            error = value.message();
        }

        dispatcher.TryEnqueue([lifetime, result, error]()
        {
            lifetime->m_loadingUsage = false;
            lifetime->UsageRows().Children().Clear();
            if (!error.empty())
            {
                lifetime->IPUsageStatus().Text(L"获取失败：" + error);
                lifetime->IPBalance().Text(L"IP 池剩余数量：同步失败");
                return;
            }

            Windows::Data::Json::JsonObject state;
            hstring parseError;
            if (!Services::TryParseJsonObject(result, state, parseError))
            {
                lifetime->IPUsageStatus().Text(parseError);
                return;
            }

            if (state.HasKey(L"remainingIp") &&
                state.GetNamedValue(L"remainingIp").ValueType() != Windows::Data::Json::JsonValueType::Null)
            {
                auto remaining = static_cast<int32_t>(state.GetNamedNumber(L"remainingIp"));
                auto nonNegativeRemaining = remaining < 0 ? 0 : remaining;
                lifetime->IPBalance().Text(hstring{ L"IP 池剩余数量：" } + hstring{ std::to_wstring(nonNegativeRemaining) });
            }
            else
            {
                lifetime->IPBalance().Text(L"IP 池剩余数量：未知");
            }

            auto records = state.GetNamedArray(L"records", Windows::Data::Json::JsonArray{});
            if (records.Size() == 0)
            {
                lifetime->IPUsageStatus().Text(L"暂无数据");
                return;
            }

            double maxTotal = 1;
            for (auto const& value : records)
            {
                auto record = value.GetObject();
                auto total = record.GetNamedNumber(L"total", 0);
                maxTotal = maxTotal > total ? maxTotal : total;
            }
            for (auto const& value : records)
            {
                auto record = value.GetObject();
                auto label = record.GetNamedString(L"label", L"未知日期");
                auto total = record.GetNamedNumber(L"total", 0);

                auto row = Microsoft::UI::Xaml::Controls::Grid();
                row.ColumnSpacing(12);
                row.Margin(Microsoft::UI::Xaml::Thickness{ 0, 2, 0, 2 });
                row.ColumnDefinitions().Append(Microsoft::UI::Xaml::Controls::ColumnDefinition{});
                row.ColumnDefinitions().Append(Microsoft::UI::Xaml::Controls::ColumnDefinition{});
                row.ColumnDefinitions().Append(Microsoft::UI::Xaml::Controls::ColumnDefinition{});
                row.ColumnDefinitions().GetAt(0).Width(Microsoft::UI::Xaml::GridLength{ 96, Microsoft::UI::Xaml::GridUnitType::Pixel });
                row.ColumnDefinitions().GetAt(1).Width(Microsoft::UI::Xaml::GridLength{ 1, Microsoft::UI::Xaml::GridUnitType::Star });
                row.ColumnDefinitions().GetAt(2).Width(Microsoft::UI::Xaml::GridLength{ 72, Microsoft::UI::Xaml::GridUnitType::Pixel });

                auto date = Microsoft::UI::Xaml::Controls::TextBlock();
                date.Text(label);
                date.VerticalAlignment(Microsoft::UI::Xaml::VerticalAlignment::Center);
                row.Children().Append(date);

                auto bar = Microsoft::UI::Xaml::Controls::ProgressBar();
                bar.Maximum(maxTotal);
                bar.Value(total);
                bar.VerticalAlignment(Microsoft::UI::Xaml::VerticalAlignment::Center);
                Microsoft::UI::Xaml::Controls::Grid::SetColumn(bar, 1);
                row.Children().Append(bar);

                auto count = Microsoft::UI::Xaml::Controls::TextBlock();
                count.Text(hstring{ std::to_wstring(static_cast<int>(total)) + L" 个" });
                count.HorizontalAlignment(Microsoft::UI::Xaml::HorizontalAlignment::Right);
                count.VerticalAlignment(Microsoft::UI::Xaml::VerticalAlignment::Center);
                Microsoft::UI::Xaml::Controls::Grid::SetColumn(count, 2);
                row.Children().Append(count);
                lifetime->UsageRows().Children().Append(row);
            }
            lifetime->IPUsageStatus().Text(L"每日提取 IP 数");
        });
    }

    fire_and_forget MorePage::OnLoadIPUsage(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        IPUsageExpander().IsExpanded(true);
        LoadIPUsage();
        co_return;
    }

    fire_and_forget MorePage::OnOpenRepository(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/SurveyController/SurveyController");
        co_return;
    }

    fire_and_forget MorePage::OnOpenLicense(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/SurveyController/SurveyController/blob/main/LICENSE");
        co_return;
    }

    fire_and_forget MorePage::OnOpenChangelog(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/SurveyController/SurveyController/releases");
        co_return;
    }

    fire_and_forget MorePage::OnOpenTutorial(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://surveydoc.hungrym0.com/");
        co_return;
    }

    fire_and_forget MorePage::OnOpenDonation(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        DonationExpander().IsExpanded(true);
        co_return;
    }

    fire_and_forget MorePage::OnOpenTerms(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        ShowTerms(Content().XamlRoot());
        co_return;
    }

    fire_and_forget MorePage::OnOpenContributor1(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/hungryM0");
        co_return;
    }

    fire_and_forget MorePage::OnOpenContributor2(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/shiahonb777");
        co_return;
    }

    fire_and_forget MorePage::OnOpenContributor3(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/BingBuLiang");
        co_return;
    }

    fire_and_forget MorePage::OnOpenContributor4(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/dAwn-Rebirth");
        co_return;
    }

    fire_and_forget MorePage::OnOpenContributor5(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/Moyuin-aka");
        co_return;
    }

    fire_and_forget MorePage::OnOpenContributor6(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/qintaiyang");
        co_return;
    }
}
