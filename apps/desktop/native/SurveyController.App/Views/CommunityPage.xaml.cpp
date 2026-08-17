#include "pch.h"
#include "CommunityPage.xaml.h"
#include "Services/BackendClient.h"
#include "Services/JsonHelpers.h"
#include "Services/DialogStyling.h"

#if __has_include("CommunityPage.g.cpp")
#include "CommunityPage.g.cpp"
#endif

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.System.h>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        fire_and_forget OpenUrl(wchar_t const* url)
        {
            co_await Windows::System::Launcher::LaunchUriAsync(Windows::Foundation::Uri(url));
        }
    }

    CommunityPage::CommunityPage()
    {
        InitializeComponent();
        try
        {
            Services::BackendClient::Current().Start();
            LoadCommunityStatus();
        }
        catch (hresult_error const& error)
        {
            CommunityStatus().Text(L"作者当前在线状态：" + error.message());
        }
    }

    fire_and_forget CommunityPage::LoadCommunityStatus()
    {
        auto lifetime = get_strong();
        auto dispatcher = DispatcherQueue();
        co_await resume_background();

        hstring result;
        hstring error;
        try
        {
            result = Services::BackendClient::Current().Call(L"GetCommunityStatus");
        }
        catch (hresult_error const& value)
        {
            error = value.message();
        }

        dispatcher.TryEnqueue([lifetime, result, error]()
        {
            if (!error.empty())
            {
                lifetime->CommunityStatus().Text(L"作者当前在线状态：获取失败");
                return;
            }

            Windows::Data::Json::JsonObject state;
            hstring parseError;
            if (!Services::TryParseJsonObject(result, state, parseError))
            {
                lifetime->CommunityStatus().Text(L"作者当前在线状态：获取失败");
                return;
            }

            auto message = state.GetNamedString(L"message", L"状态未知");
            if (!state.HasKey(L"online"))
            {
                lifetime->CommunityStatus().Text(L"作者当前在线状态：" + message);
                return;
            }
            lifetime->CommunityStatus().Text(
                state.GetNamedBoolean(L"online")
                    ? L"作者当前在线状态：在线 · " + message
                    : L"作者当前在线状态：离线 · " + message);
        });
    }

    fire_and_forget CommunityPage::OnOpenQr(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        Microsoft::UI::Xaml::Controls::ContentDialog dialog;
        Services::PrepareContentDialog(dialog, Content().XamlRoot());
        dialog.Title(box_value(L"QQ 群二维码"));

        Microsoft::UI::Xaml::Controls::Image image;
        image.Source(CommunityQrImage().Source());
        image.Width(280);
        image.Height(280);
        image.Stretch(Microsoft::UI::Xaml::Media::Stretch::Uniform);
        dialog.Content(image);
        dialog.CloseButtonText(L"关闭");
        co_await dialog.ShowAsync();
    }

    fire_and_forget CommunityPage::OnOpenContact(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        auto type = Microsoft::UI::Xaml::Controls::ComboBox();
        type.Header(box_value(L"消息类型"));
        type.Items().Append(box_value(L"报错反馈"));
        type.Items().Append(box_value(L"新功能建议"));
        type.Items().Append(box_value(L"纯聊天"));
        type.SelectedIndex(0);

        auto email = Microsoft::UI::Xaml::Controls::TextBox();
        email.Header(box_value(L"联系邮箱（可选）"));
        email.PlaceholderText(L"name@example.com");

        auto issueTitle = Microsoft::UI::Xaml::Controls::TextBox();
        issueTitle.Header(box_value(L"反馈标题（可选）"));
        issueTitle.PlaceholderText(L"简要概括问题");
        issueTitle.MaxLength(60);

        auto message = Microsoft::UI::Xaml::Controls::TextBox();
        message.Header(box_value(L"消息内容"));
        message.PlaceholderText(L"请详细描述问题、需求或留言");
        message.AcceptsReturn(true);
        message.TextWrapping(Microsoft::UI::Xaml::TextWrapping::Wrap);
        message.MinHeight(160);

        auto form = Microsoft::UI::Xaml::Controls::StackPanel();
        form.Spacing(12);
        form.Children().Append(type);
        form.Children().Append(email);
        form.Children().Append(issueTitle);
        form.Children().Append(message);

        Microsoft::UI::Xaml::Controls::ContentDialog dialog;
        Services::PrepareContentDialog(dialog, Content().XamlRoot());
        dialog.Title(box_value(L"联系开发者"));
        dialog.Content(form);
        dialog.PrimaryButtonText(L"发送");
        dialog.CloseButtonText(L"取消");
        dialog.DefaultButton(Microsoft::UI::Xaml::Controls::ContentDialogButton::Primary);
        auto result = co_await dialog.ShowAsync();
        if (result != Microsoft::UI::Xaml::Controls::ContentDialogResult::Primary)
        {
            co_return;
        }

        if (message.Text().empty())
        {
            Microsoft::UI::Xaml::Controls::ContentDialog validation;
            Services::PrepareContentDialog(validation, Content().XamlRoot());
            validation.Title(box_value(L"无法发送"));
            validation.Content(box_value(L"请输入消息内容。"));
            validation.CloseButtonText(L"返回");
            co_await validation.ShowAsync();
            co_return;
        }

        std::wstring fullMessage{ L"来源：SurveyController v5.0.0\n类型：" };
        fullMessage.append(unbox_value_or<hstring>(type.SelectedItem(), L"报错反馈").c_str());
        if (!email.Text().empty())
        {
            fullMessage.append(L"\n联系邮箱：");
            fullMessage.append(email.Text().c_str());
        }
        if (!issueTitle.Text().empty())
        {
            fullMessage.append(L"\n反馈标题：");
            fullMessage.append(issueTitle.Text().c_str());
        }
        fullMessage.append(L"\n\n消息：");
        fullMessage.append(message.Text().c_str());

        Windows::Data::Json::JsonObject request;
        request.SetNamedValue(L"message", Windows::Data::Json::JsonValue::CreateStringValue(fullMessage));
        request.SetNamedValue(L"messageType", Windows::Data::Json::JsonValue::CreateStringValue(
            unbox_value_or<hstring>(type.SelectedItem(), L"报错反馈")));
        request.SetNamedValue(L"issueTitle", Windows::Data::Json::JsonValue::CreateStringValue(issueTitle.Text()));
        request.SetNamedValue(L"email", Windows::Data::Json::JsonValue::CreateStringValue(email.Text()));

        CommunityStatus().Text(L"正在发送消息...");
        auto lifetime = get_strong();
        auto dispatcher = DispatcherQueue();
        auto payload = request.Stringify();
        co_await resume_background();
        hstring error;
        try
        {
            Services::BackendClient::Current().Call(L"SendContact", payload);
        }
        catch (hresult_error const& value)
        {
            error = value.message();
        }
        dispatcher.TryEnqueue([lifetime, error]()
        {
            lifetime->CommunityStatus().Text(error.empty() ? L"消息已发送，感谢你的反馈。" : L"消息发送失败：" + error);
        });
    }

    fire_and_forget CommunityPage::OnOpenRepository(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/SurveyController/SurveyController");
        co_return;
    }

    fire_and_forget CommunityPage::OnOpenLicense(
        IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        OpenUrl(L"https://github.com/SurveyController/SurveyController/blob/main/LICENSE");
        co_return;
    }
}
