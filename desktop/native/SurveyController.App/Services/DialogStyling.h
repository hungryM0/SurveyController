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
    }
}
