#pragma once

#include <winrt/Microsoft.UI.Xaml.h>
#include <winrt/Microsoft.UI.Xaml.Controls.h>

namespace winrt::SurveyController::App::Services
{
    inline void PrepareContentDialog(
        Microsoft::UI::Xaml::Controls::ContentDialog const& dialog,
        Microsoft::UI::Xaml::XamlRoot const& root)
    {
        dialog.XamlRoot(root);

        // Use the WinUI template so theme resources and popup transitions stay intact.
        auto style = Microsoft::UI::Xaml::Application::Current().Resources()
            .Lookup(box_value(L"DefaultContentDialogStyle"))
            .try_as<Microsoft::UI::Xaml::Style>();
        if (style)
        {
            dialog.Style(style);
        }
    }
}
