#include "pch.h"
#include "SettingsPage.xaml.h"
#include "Services/RpcServices.h"
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
        try { LoadSettings(Services::ShellSettings::Current().Json()); }
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

    void SettingsPage::ScheduleSave()
    {
        if (m_loadingSettings) return;
        ++m_saveGeneration;
        m_savePending = true;
        if (!m_saveTimer)
        {
            m_saveTimer = DispatcherQueue().CreateTimer();
            m_saveTimer.IsRepeating(false);
            m_saveTimer.Interval(std::chrono::milliseconds{ 30 });
            m_saveTimer.Tick([weak = get_weak()](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->SaveSettingsAsync();
            });
        }
        m_saveTimer.Stop();
        m_saveTimer.Start();
    }

    fire_and_forget SettingsPage::SaveSettingsAsync()
    {
        auto lifetime = get_strong();
        if (m_saving) co_return;
        m_saving = true;
        while (m_savePending)
        {
            m_savePending = false;
            auto const generation = m_saveGeneration;
            auto request = BuildSaveRequest();
            try
            {
                auto saved = co_await Services::SettingsService{}.SaveAsync(request);
                if (generation == m_saveGeneration)
                {
                    LoadSettings(saved);
                    Services::ShellSettings::Current().Update(saved);
                }
            }
            catch (hresult_error const& error) { StatusText().Text(error.message()); }
            catch (std::exception const& error) { StatusText().Text(to_hstring(error.what())); }
            catch (...) { StatusText().Text(L"保存设置失败。"); }
        }
        m_saving = false;
    }

    void SettingsPage::OnSettingToggled(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        ScheduleSave();
    }

    void SettingsPage::OnSettingSelectionChanged(IInspectable const&,
        Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&)
    {
        ScheduleSave();
    }

    fire_and_forget SettingsPage::OnReset(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
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

        ++m_saveGeneration;
        m_savePending = false;
        if (m_saveTimer) m_saveTimer.Stop();
        try
        {
            auto saved = co_await Services::SettingsService{}.ResetAsync();
            LoadSettings(saved);
            Services::ShellSettings::Current().Update(saved);
            StatusText().Text(L"已恢复默认设置");
        }
        catch (hresult_error const& error)
        {
            StatusText().Text(error.message());
        }
        catch (...) { StatusText().Text(L"恢复默认设置失败。"); }
        co_return;
    }

    fire_and_forget SettingsPage::OnChooseDirectory(IInspectable const&, Microsoft::UI::Xaml::RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        try
        {
            Microsoft::Windows::Storage::Pickers::FolderPicker picker(Services::MainWindowId());
            auto folder = co_await picker.PickSingleFolderAsync();
            if (folder)
            {
                ConfigDirectory().Text(folder.Path());
                ScheduleSave();
            }
        }
        catch (hresult_error const& error) { StatusText().Text(error.message()); }
        catch (...) { StatusText().Text(L"选择配置目录失败。"); }
    }
}
