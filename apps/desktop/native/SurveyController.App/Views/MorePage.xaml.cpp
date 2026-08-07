#include "pch.h"
#include "MorePage.xaml.h"
#include "Services/BackendClient.h"

#if __has_include("MorePage.g.cpp")
#include "MorePage.g.cpp"
#endif

#include <shellapi.h>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        void Open(wchar_t const* url) { ShellExecuteW(nullptr, L"open", url, nullptr, nullptr, SW_SHOWNORMAL); }
    }

    MorePage::MorePage() { InitializeComponent(); }
    void MorePage::OnOpenDownload(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&) { Open(m_downloadUrl.c_str()); }
    fire_and_forget MorePage::OnCheckUpdate(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        auto dispatcher = DispatcherQueue();
        UpdateStatus().Text(L"正在检查更新");
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
            if (!error.empty())
            {
                lifetime->UpdateStatus().Text(L"检查更新失败：" + error);
                return;
            }
            auto state = Windows::Data::Json::JsonObject::Parse(result);
            lifetime->UpdateStatus().Text(state.GetNamedString(L"message", L"无法识别远端版本"));
            lifetime->m_downloadUrl = state.GetNamedString(L"downloadUrl", lifetime->m_downloadUrl);
        });
    }
    void MorePage::OnOpenDocs(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&) { Open(L"https://surveydoc.hungrym0.com/"); }
    void MorePage::OnOpenTerms(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&) { Open(L"https://github.com/SurveyController/SurveyController/blob/main/LICENSE"); }
}
