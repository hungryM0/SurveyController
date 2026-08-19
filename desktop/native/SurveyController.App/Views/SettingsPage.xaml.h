#pragma once

#include "SettingsPage.g.h"

namespace winrt::SurveyController::App::implementation
{
    struct SettingsPage : SettingsPageT<SettingsPage>
    {
        SettingsPage();
        void OnSettingToggled(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnSettingSelectionChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        winrt::fire_and_forget OnReset(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnChooseDirectory(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Windows::Data::Json::JsonObject m_settings{ nullptr };
        bool m_loadingSettings{ true };
        bool m_saving{};
        bool m_savePending{};
        uint64_t m_saveGeneration{};
        Microsoft::UI::Dispatching::DispatcherQueueTimer m_saveTimer{ nullptr };
        void LoadSettings(winrt::hstring const& json);
        winrt::hstring BuildSaveRequest();
        void ScheduleSave();
        winrt::fire_and_forget SaveSettingsAsync();
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct SettingsPage : SettingsPageT<SettingsPage, implementation::SettingsPage> {};
}
