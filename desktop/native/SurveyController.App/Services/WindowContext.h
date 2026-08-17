#pragma once

#include <winrt/Microsoft.UI.Windowing.h>

namespace winrt::SurveyController::App::Services
{
    inline Microsoft::UI::WindowId g_mainWindowId{};

    inline void SetMainWindowId(Microsoft::UI::WindowId id) noexcept { g_mainWindowId = id; }
    inline Microsoft::UI::WindowId MainWindowId() noexcept { return g_mainWindowId; }
}
