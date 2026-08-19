#include "pch.h"
#include "SettingsPage.xaml.h"
#include "Services/BackendClient.h"
#include "Services/JsonHelpers.h"
#include "Services/ShellSettings.h"
#include "Services/NativeResource.h"
#include "Services/WindowContext.h"
#include "Services/DialogStyling.h"

#if __has_include("SettingsPage.g.cpp")
#include "SettingsPage.g.cpp"
#endif


namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        bool JsonBool(Windows::Data::Json::JsonObject const& value, wchar_t const* key, bool fallback = false)
        {
            return value.GetNamedBoolean(key, fallback);
        }

        int32_t LogCountValue(Microsoft::UI::Xaml::Controls::ComboBoxItem const& item)
        {
            try
            {
                return std::stoi(unbox_value_or<hstring>(item.Tag(), L"10").c_str());
            }
            catch (...)
            {
                return 10;
            }
        }
    }

    SettingsPage::SettingsPage()
    {
        InitializeComponent();
        try
        {
            auto& backend = Services::BackendClient::Current();
            backend.Start();
            LoadSettings(backend.Call(L"GetAppSettings"));
        }
        catch (hresult_error const& error)
        {
            StatusText().Text(error.message());
        }
    }

    void SettingsPage::LoadSettings(hstring const& json)
    {
        m_loadingSettings = true;
        Windows::Data::Json::JsonObject parsed;
        hstring parseError;
        if (!Services::TryParseJsonObject(json, parsed, parseError))
        {
            throw hresult_error(E_FAIL, parseError);
        }
        m_settings = parsed;
        auto theme = m_settings.GetNamedString(L"themeMode", L"system");
        for (uint32_t index = 0; index < ThemeMode().Items().Size(); ++index)
        {
            auto item = ThemeMode().Items().GetAt(index).as<Microsoft::UI::Xaml::Controls::ComboBoxItem>();
            if (unbox_value_or<hstring>(item.Tag(), L"") == theme)
            {
                ThemeMode().SelectedIndex(static_cast<int32_t>(index));
                break;
            }
        }
        ShowNavigationText().IsOn(JsonBool(m_settings, L"showNavigationText", true));
        Topmost().IsOn(JsonBool(m_settings, L"topmost"));
        AskSaveOnClose().IsOn(JsonBool(m_settings, L"askSaveOnClose", true));
        PreventSleep().IsOn(JsonBool(m_settings, L"preventSleepDuringRun", true));
        TaskNotification().IsOn(JsonBool(m_settings, L"taskResultNotification", true));
        Telemetry().IsOn(JsonBool(m_settings, L"submissionReportTelemetry", true));
        AutoCheckUpdate().IsOn(JsonBool(m_settings, L"autoCheckUpdate", true));
        ConfigDirectory().Text(m_settings.GetNamedString(L"configDirectory", L""));
        auto count = static_cast<int32_t>(m_settings.GetNamedNumber(L"autosaveLogCount", 10));
        for (uint32_t index = 0; index < LogCount().Items().Size(); ++index)
        {
            auto item = LogCount().Items().GetAt(index).as<Microsoft::UI::Xaml::Controls::ComboBoxItem>();
            if (LogCountValue(item) == count)
            {
                LogCount().SelectedIndex(static_cast<int32_t>(index));
                break;
            }
        }
        m_loadingSettings = false;
    }

    hstring SettingsPage::BuildSaveRequest()
    {
        auto selectedTheme = ThemeMode().SelectedItem().try_as<Microsoft::UI::Xaml::Controls::ComboBoxItem>();
        m_settings.SetNamedValue(L"themeMode", Windows::Data::Json::JsonValue::CreateStringValue(selectedTheme ? unbox_value_or<hstring>(selectedTheme.Tag(), L"system") : L"system"));
        m_settings.SetNamedValue(L"showNavigationText", Windows::Data::Json::JsonValue::CreateBooleanValue(ShowNavigationText().IsOn()));
        m_settings.SetNamedValue(L"topmost", Windows::Data::Json::JsonValue::CreateBooleanValue(Topmost().IsOn()));
        m_settings.SetNamedValue(L"askSaveOnClose", Windows::Data::Json::JsonValue::CreateBooleanValue(AskSaveOnClose().IsOn()));
        m_settings.SetNamedValue(L"preventSleepDuringRun", Windows::Data::Json::JsonValue::CreateBooleanValue(PreventSleep().IsOn()));
        m_settings.SetNamedValue(L"taskResultNotification", Windows::Data::Json::JsonValue::CreateBooleanValue(TaskNotification().IsOn()));
        m_settings.SetNamedValue(L"submissionReportTelemetry", Windows::Data::Json::JsonValue::CreateBooleanValue(Telemetry().IsOn()));
        m_settings.SetNamedValue(L"autoSaveLogs", Windows::Data::Json::JsonValue::CreateBooleanValue(true));
        m_settings.SetNamedValue(L"autoCheckUpdate", Windows::Data::Json::JsonValue::CreateBooleanValue(AutoCheckUpdate().IsOn()));
        m_settings.SetNamedValue(L"configDirectory", Windows::Data::Json::JsonValue::CreateStringValue(ConfigDirectory().Text()));
        auto selectedCount = LogCount().SelectedItem().try_as<Microsoft::UI::Xaml::Controls::ComboBoxItem>();
        auto count = selectedCount ? LogCountValue(selectedCount) : 10;
        m_settings.SetNamedValue(L"autosaveLogCount", Windows::Data::Json::JsonValue::CreateNumberValue(count));

        Windows::Data::Json::JsonObject credential;
        credential.SetNamedValue(L"operation", Windows::Data::Json::JsonValue::CreateStringValue(L"keep"));
        Windows::Data::Json::JsonObject request;
        request.SetNamedValue(L"settings", m_settings);
        request.SetNamedValue(L"aiCredential", credential);
        return request.Stringify();
    }

    void SettingsPage::SaveSettings()
    {
        if (m_loadingSettings) return;
        try
        {
            auto saved = Services::BackendClient::Current().Call(L"SaveAppSettings", BuildSaveRequest());
            LoadSettings(saved);
            Services::ShellSettings::Current().Update(saved);
            StatusText().Text(L"已保存");
        }
        catch (hresult_error const& error)
        {
            StatusText().Text(error.message());
        }
    }

    void SettingsPage::OnSettingToggled(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        SaveSettings();
    }

    void SettingsPage::OnSettingSelectionChanged(IInspectable const&,
        Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&)
    {
        SaveSettings();
    }

    fire_and_forget SettingsPage::OnReset(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        Microsoft::UI::Xaml::Controls::ContentDialog dialog;
        auto dialogThemeRevoker = Services::PrepareContentDialog(dialog, Content().XamlRoot());
        dialog.Title(box_value(L"恢复默认设置"));
        dialog.Content(box_value(L"确定要恢复默认设置吗？这将还原所有设置项到初始状态。"));
        dialog.PrimaryButtonText(L"恢复");
        dialog.CloseButtonText(L"取消");
        dialog.DefaultButton(Microsoft::UI::Xaml::Controls::ContentDialogButton::Primary);
        auto result = co_await dialog.ShowAsync();
        if (result != Microsoft::UI::Xaml::Controls::ContentDialogResult::Primary)
        {
            co_return;
        }

        try
        {
            auto saved = Services::BackendClient::Current().Call(L"ResetAppSettings");
            LoadSettings(saved);
            Services::ShellSettings::Current().Update(saved);
            StatusText().Text(L"已恢复默认设置");
        }
        catch (hresult_error const& error)
        {
            StatusText().Text(error.message());
        }
        co_return;
    }

    fire_and_forget SettingsPage::OnChooseDirectory(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        Microsoft::Windows::Storage::Pickers::FolderPicker picker(Services::MainWindowId());
        auto folder = co_await picker.PickSingleFolderAsync();
        if (folder)
        {
            ConfigDirectory().Text(folder.Path());
            SaveSettings();
        }
    }
}
