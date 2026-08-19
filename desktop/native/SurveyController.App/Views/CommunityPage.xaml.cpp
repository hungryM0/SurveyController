#include "pch.h"
#include "CommunityPage.xaml.h"
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
