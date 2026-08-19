#pragma once

#include <winrt/Microsoft.UI.Xaml.h>
#include <winrt/Microsoft.UI.Xaml.Controls.h>

namespace winrt::SurveyController::App::Services
{
    using DialogThemeRevoker = Microsoft::UI::Xaml::FrameworkElement::ActualThemeChanged_revoker;

    inline DialogThemeRevoker PrepareContentDialog(
        Microsoft::UI::Xaml::Controls::ContentDialog const& dialog,
        Microsoft::UI::Xaml::XamlRoot const& root)
    {
        dialog.XamlRoot(root);

        auto host = root.Content().try_as<Microsoft::UI::Xaml::FrameworkElement>();
        if (!host)
        {
            return {};
        }

        // Code-created dialogs need the WinUI style explicitly. Keep the dialog
        // on the host's requested theme so the template and transitions follow
        // both app theme changes and system theme changes.
        dialog.RequestedTheme(host.RequestedTheme());
        auto style = Microsoft::UI::Xaml::Application::Current().Resources()
            .Lookup(box_value(L"DefaultContentDialogStyle"))
            .try_as<Microsoft::UI::Xaml::Style>();
        if (style)
        {
            dialog.Style(style);
        }

        return host.ActualThemeChanged(
            winrt::auto_revoke,
            [dialog, host](winrt::Windows::Foundation::IInspectable const&, winrt::Windows::Foundation::IInspectable const&)
            {
                dialog.RequestedTheme(host.RequestedTheme());
            });
    }
}
