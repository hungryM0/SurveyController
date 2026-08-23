#pragma once

#include "NetworkPage.g.h"
#include "Services/WizardDocument.h"

namespace winrt::SurveyController::App::implementation
{
    struct NetworkPage : NetworkPageT<NetworkPage>
    {
        NetworkPage();

        void OnProxyModeChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnProxySourceChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnProxyProvinceChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnProxyCityChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&);
        void OnTextChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::TextChangedEventArgs const&);
        void OnAlphaChanged(IInspectable const&, Microsoft::UI::Xaml::Controls::NumberBoxValueChangedEventArgs const&);
        void OnPsychometricsToggled(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        void OnSettingToggled(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnTestFixedProxy(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnTestCustomProxy(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);
        winrt::fire_and_forget OnSyncProxy(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&);

    private:
        Services::WizardDocument& m_document;
        Windows::Data::Json::JsonObject m_proxyAreaOptions{ nullptr };
        hstring m_proxyAreaCode;
        bool m_initialized{};
        bool m_updatingProxyAreas{};
        bool m_busy{};
        Microsoft::UI::Dispatching::DispatcherQueueTimer m_syncTimer{ nullptr };
        int32_t m_syncGeneration{};

        hstring SelectedTag(Microsoft::UI::Xaml::Controls::ComboBox const& combo, hstring const& fallback) const;
        void SelectTag(Microsoft::UI::Xaml::Controls::ComboBox const& combo, hstring const& value);
        void PopulateFromDocument();
        void ScheduleSync();
        void SyncToDocument();
        winrt::fire_and_forget LoadProxyAreaOptions();
        void ApplyProxyAreaOptions(hstring const& json, hstring const& source);
        void RebuildProxyCities(hstring const& provinceCode, hstring const& selectedCode = L"");
        void ApplyProxyStatus(Windows::Data::Json::JsonObject const& state);
        void UpdateNetworkVisibility();
        void UpdatePsychometricsVisibility();
        void SetBusy(bool busy);
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct NetworkPage : NetworkPageT<NetworkPage, implementation::NetworkPage> {};
}
