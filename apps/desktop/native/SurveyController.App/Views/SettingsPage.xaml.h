#pragma once

#include "SettingsPage.g.h"

namespace winrt::SurveyController::App::implementation
{
    struct SettingsPage : SettingsPageT<SettingsPage>
    {
        SettingsPage();
        void OnSave(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnReset(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnChooseDirectory(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnPageSizeChanged(IInspectable const&, Microsoft::UI::Xaml::SizeChangedEventArgs const&);

    private:
        Windows::Data::Json::JsonObject m_settings{ nullptr };
        bool m_layoutReady{};
        void LoadSettings(winrt::hstring const& json);
        winrt::hstring BuildSaveRequest();
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct SettingsPage : SettingsPageT<SettingsPage, implementation::SettingsPage> {};
}
