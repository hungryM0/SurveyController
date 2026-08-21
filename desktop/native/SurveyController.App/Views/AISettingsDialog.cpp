#include "pch.h"
#include "AISettingsDialog.h"
#include "Services/DialogStyling.h"
#include "Services/JsonHelpers.h"
#include "Services/RpcServices.h"
#include "Services/ShellSettings.h"

#include <memory>

namespace winrt::SurveyController::App::Views
{
    using namespace Microsoft::UI::Xaml;
    using namespace Microsoft::UI::Xaml::Automation;
    using namespace Microsoft::UI::Xaml::Controls;
    using namespace Windows::Data::Json;

    namespace
    {
        hstring SelectedTag(RadioButtons const& buttons, hstring const& fallback)
        {
            auto item = buttons.SelectedItem().try_as<RadioButton>();
            return item ? unbox_value_or<hstring>(item.Tag(), fallback) : fallback;
        }

        void SelectTag(RadioButtons const& buttons, hstring const& value)
        {
            for (uint32_t index = 0; index < buttons.Items().Size(); ++index)
            {
                auto item = buttons.Items().GetAt(index).try_as<RadioButton>();
                if (item && unbox_value_or<hstring>(item.Tag(), L"") == value) { buttons.SelectedIndex(static_cast<int32_t>(index)); return; }
            }
            buttons.SelectedIndex(0);
        }
    }

    Windows::Foundation::IAsyncOperation<bool> ShowAISettingsDialogAsync(XamlRoot const& root)
    {
        JsonObject settings;
        hstring parseError;
        if (!Services::TryParseJsonObject(Services::ShellSettings::Current().Json(), settings, parseError)) co_return false;
        auto profile = settings.GetNamedObject(L"aiProfile", JsonObject{});

        auto panel = StackPanel{};
        panel.Spacing(12);
        auto mode = RadioButtons{};
        mode.Header(box_value(L"AI 模式"));
        AutomationProperties::SetName(mode, L"AI 模式");
        auto free = RadioButton{}; free.Content(box_value(L"限时免费")); free.Tag(box_value(L"free"));
        auto providerMode = RadioButton{}; providerMode.Content(box_value(L"自定义服务")); providerMode.Tag(box_value(L"provider"));
        mode.Items().Append(free); mode.Items().Append(providerMode);
        auto provider = RadioButtons{};
        provider.Header(box_value(L"服务商"));
        AutomationProperties::SetName(provider, L"AI 服务商");
        auto deepseek = RadioButton{}; deepseek.Content(box_value(L"DeepSeek")); deepseek.Tag(box_value(L"deepseek"));
        auto custom = RadioButton{}; custom.Content(box_value(L"OpenAI 兼容")); custom.Tag(box_value(L"custom"));
        provider.Items().Append(deepseek); provider.Items().Append(custom);
        auto baseUrl = TextBox{}; baseUrl.Header(box_value(L"接口地址")); baseUrl.Text(profile.GetNamedString(L"baseURL", L"")); AutomationProperties::SetName(baseUrl, L"AI 接口地址");
        auto model = TextBox{}; model.Header(box_value(L"模型")); model.Text(profile.GetNamedString(L"model", L"")); AutomationProperties::SetName(model, L"AI 模型");
        auto hasSavedKey = profile.GetNamedBoolean(L"hasAPIKey", false);
        auto apiKey = PasswordBox{}; apiKey.Header(box_value(L"API 密钥")); apiKey.PlaceholderText(hasSavedKey ? L"已安全保存，留空不修改" : L"输入 API Key"); apiKey.PasswordRevealMode(PasswordRevealMode::Peek); AutomationProperties::SetName(apiKey, L"AI API 密钥");
        auto test = Button{};
        auto testContent = StackPanel{}; testContent.Orientation(Orientation::Horizontal); testContent.Spacing(8);
        auto testIcon = SymbolIcon{}; testIcon.Symbol(Symbol::Refresh);
        auto testLabel = TextBlock{}; testLabel.Text(L"测试连接");
        testContent.Children().Append(testIcon); testContent.Children().Append(testLabel); test.Content(testContent);
        AutomationProperties::SetName(test, L"测试 AI 连接");
        auto status = InfoBar{}; status.IsOpen(false); status.IsClosable(false);
        AutomationProperties::SetLiveSetting(status,
            Microsoft::UI::Xaml::Automation::Peers::AutomationLiveSetting::Assertive);
        panel.Children().Append(mode); panel.Children().Append(provider); panel.Children().Append(baseUrl); panel.Children().Append(model); panel.Children().Append(apiKey); panel.Children().Append(test); panel.Children().Append(status);
        SelectTag(mode, profile.GetNamedString(L"mode", L"free"));
        SelectTag(provider, profile.GetNamedString(L"provider", L"deepseek"));

        auto updateVisibility = [=]()
        {
            auto customMode = SelectedTag(mode, L"free") == L"provider";
            provider.Visibility(customMode ? Visibility::Visible : Visibility::Collapsed);
            baseUrl.Visibility(customMode && SelectedTag(provider, L"deepseek") == L"custom" ? Visibility::Visible : Visibility::Collapsed);
            model.Visibility(customMode ? Visibility::Visible : Visibility::Collapsed);
            apiKey.Visibility(customMode ? Visibility::Visible : Visibility::Collapsed);
            test.Visibility(customMode ? Visibility::Visible : Visibility::Collapsed);
        };
        auto modeRevoker = mode.SelectionChanged(auto_revoke, [updateVisibility](auto const&, auto const&) { updateVisibility(); });
        auto providerRevoker = provider.SelectionChanged(auto_revoke, [updateVisibility](auto const&, auto const&) { updateVisibility(); });
        updateVisibility();

        auto testRevoker = test.Click(auto_revoke, [=](auto const& sender, auto const&) -> fire_and_forget
        {
            auto button = sender.template try_as<Button>();
            if (button) button.IsEnabled(false);
            status.IsOpen(true);
            if (!apiKey.Password().empty())
            {
                status.Severity(InfoBarSeverity::Warning);
                status.Title(L"请先保存 API 密钥");
                status.Message(L"现有连接测试接口只读取安全存储中的密钥。保存后可重新打开并测试。");
                if (button) button.IsEnabled(true);
                co_return;
            }
            status.Severity(InfoBarSeverity::Informational);
            status.Title(L"正在测试连接");
            JsonObject candidate;
            candidate.SetNamedValue(L"mode", JsonValue::CreateStringValue(SelectedTag(mode, L"free")));
            candidate.SetNamedValue(L"provider", JsonValue::CreateStringValue(SelectedTag(provider, L"deepseek")));
            candidate.SetNamedValue(L"baseURL", JsonValue::CreateStringValue(baseUrl.Text()));
            candidate.SetNamedValue(L"model", JsonValue::CreateStringValue(model.Text()));
            try
            {
                auto response = co_await Services::TaskService{}.TestAiAsync(candidate);
                JsonObject state;
                hstring error;
                if (!Services::TryParseJsonObject(response, state, error)) throw hresult_error(E_FAIL, error);
                auto success = state.GetNamedBoolean(L"success", false);
                status.Severity(success ? InfoBarSeverity::Success : InfoBarSeverity::Error);
                status.Title(success ? L"AI 连接正常" : L"AI 连接失败");
                status.Message(state.GetNamedString(L"message", L""));
            }
            catch (hresult_error const& error)
            {
                status.Severity(InfoBarSeverity::Error);
                status.Title(L"AI 连接失败");
                status.Message(error.message());
            }
            catch (std::exception const& error)
            {
                status.Severity(InfoBarSeverity::Error);
                status.Title(L"AI 连接失败");
                status.Message(to_hstring(error.what()));
            }
            catch (...)
            {
                status.Severity(InfoBarSeverity::Error);
                status.Title(L"AI 连接失败");
                status.Message(L"连接测试出现未知错误。");
            }
            if (button) button.IsEnabled(true);
        });

        ContentDialog dialog;
        auto revoker = Services::PrepareContentDialog(dialog, root);
        AutomationProperties::SetName(dialog, L"AI 服务设置");
        dialog.Title(box_value(L"AI 服务设置"));
        dialog.Content(panel);
        dialog.PrimaryButtonText(L"保存");
        dialog.CloseButtonText(L"取消");
        dialog.DefaultButton(ContentDialogButton::Primary);
        auto saved = std::make_shared<bool>(false);
        auto primaryRevoker = dialog.PrimaryButtonClick(auto_revoke,
            [=](ContentDialog const& sender, ContentDialogButtonClickEventArgs const& eventArgs) -> fire_and_forget
        {
            auto dialogCopy = sender;
            auto args = eventArgs;
            auto deferral = args.GetDeferral();
            dialogCopy.IsPrimaryButtonEnabled(false);
            try
            {
                auto updatedProfile = JsonObject::Parse(profile.Stringify());
                updatedProfile.SetNamedValue(L"mode", JsonValue::CreateStringValue(SelectedTag(mode, L"free")));
                updatedProfile.SetNamedValue(L"provider", JsonValue::CreateStringValue(SelectedTag(provider, L"deepseek")));
                updatedProfile.SetNamedValue(L"baseURL", JsonValue::CreateStringValue(baseUrl.Text()));
                updatedProfile.SetNamedValue(L"model", JsonValue::CreateStringValue(model.Text()));
                if (!updatedProfile.HasKey(L"apiProtocol")) updatedProfile.SetNamedValue(L"apiProtocol", JsonValue::CreateStringValue(L"auto"));
                auto updatedSettings = JsonObject::Parse(settings.Stringify());
                updatedSettings.SetNamedValue(L"aiProfile", updatedProfile);
                JsonObject credential;
                credential.SetNamedValue(L"operation", JsonValue::CreateStringValue(apiKey.Password().empty() ? L"keep" : L"replace"));
                if (!apiKey.Password().empty()) credential.SetNamedValue(L"apiKey", JsonValue::CreateStringValue(apiKey.Password()));
                JsonObject request;
                request.SetNamedValue(L"settings", updatedSettings);
                request.SetNamedValue(L"aiCredential", credential);
                auto response = co_await Services::SettingsService{}.SaveAsync(request.Stringify());
                Services::ShellSettings::Current().Update(response);
                *saved = true;
            }
            catch (hresult_error const& error)
            {
                args.Cancel(true);
                status.Severity(InfoBarSeverity::Error);
                status.Title(L"AI 设置保存失败");
                status.Message(error.message());
                status.IsOpen(true);
            }
            catch (std::exception const& error)
            {
                args.Cancel(true);
                status.Severity(InfoBarSeverity::Error);
                status.Title(L"AI 设置保存失败");
                status.Message(to_hstring(error.what()));
                status.IsOpen(true);
            }
            catch (...)
            {
                args.Cancel(true);
                status.Severity(InfoBarSeverity::Error);
                status.Title(L"AI 设置保存失败");
                status.Message(L"保存设置时出现未知错误。");
                status.IsOpen(true);
            }
            dialogCopy.IsPrimaryButtonEnabled(true);
            deferral.Complete();
        });
        auto result = co_await dialog.ShowAsync();
        co_return result == ContentDialogResult::Primary && *saved;
    }
}
