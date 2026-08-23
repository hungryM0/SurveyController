using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Automation;
using Microsoft.UI.Xaml.Controls;
using SurveyController.App.Services;
using SurveyController.Core.Settings;

namespace SurveyController.App.Views;

/// <summary>
/// AI 服务设置弹层：全部控件以代码构建，行为对照 C++ Views/AISettingsDialog.cpp。
/// 返回值表示是否保存成功并关闭。
/// </summary>
internal static class AISettingsDialog
{
    public static async Task<bool> ShowAsync(XamlRoot root)
    {
        if (JsonNode.Parse(ShellSettings.Current.Json) is not JsonObject settings)
        {
            return false;
        }
        var profile = settings["aiProfile"] as JsonObject ?? new JsonObject();

        var panel = new StackPanel { Spacing = 12 };

        var mode = new RadioButtons { Header = "AI 模式" };
        AutomationProperties.SetName(mode, "AI 模式");
        mode.Items.Add(new RadioButton { Content = "限时免费", Tag = "free" });
        mode.Items.Add(new RadioButton { Content = "自定义服务", Tag = "provider" });

        var provider = new RadioButtons { Header = "服务商" };
        AutomationProperties.SetName(provider, "AI 服务商");
        provider.Items.Add(new RadioButton { Content = "DeepSeek", Tag = "deepseek" });
        provider.Items.Add(new RadioButton { Content = "OpenAI 兼容", Tag = "custom" });

        var baseUrl = new TextBox { Header = "接口地址", Text = Str(profile, "baseURL", string.Empty) };
        AutomationProperties.SetName(baseUrl, "AI 接口地址");
        var model = new TextBox { Header = "模型", Text = Str(profile, "model", string.Empty) };
        AutomationProperties.SetName(model, "AI 模型");

        var hasSavedKey = Bool(profile, "hasAPIKey");
        var apiKey = new PasswordBox
        {
            Header = "API 密钥",
            PlaceholderText = hasSavedKey ? "已安全保存，留空不修改" : "输入 API Key",
            PasswordRevealMode = PasswordRevealMode.Peek,
        };
        AutomationProperties.SetName(apiKey, "AI API 密钥");

        var testLabel = new TextBlock { Text = "测试连接" };
        var testContent = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
        testContent.Children.Add(new SymbolIcon(Symbol.Refresh));
        testContent.Children.Add(testLabel);
        var test = new Button { Content = testContent };
        AutomationProperties.SetName(test, "测试 AI 连接");

        var status = new InfoBar { IsOpen = false, IsClosable = false };
        AutomationProperties.SetLiveSetting(status, Microsoft.UI.Xaml.Automation.Peers.AutomationLiveSetting.Assertive);

        panel.Children.Add(mode);
        panel.Children.Add(provider);
        panel.Children.Add(baseUrl);
        panel.Children.Add(model);
        panel.Children.Add(apiKey);
        panel.Children.Add(test);
        panel.Children.Add(status);

        SelectTag(mode, Str(profile, "mode", "free"));
        SelectTag(provider, Str(profile, "provider", "deepseek"));

        void UpdateVisibility()
        {
            var customMode = SelectedTag(mode, "free") == "provider";
            provider.Visibility = customMode ? Visibility.Visible : Visibility.Collapsed;
            baseUrl.Visibility = customMode && SelectedTag(provider, "deepseek") == "custom"
                ? Visibility.Visible
                : Visibility.Collapsed;
            model.Visibility = customMode ? Visibility.Visible : Visibility.Collapsed;
            apiKey.Visibility = customMode ? Visibility.Visible : Visibility.Collapsed;
            test.Visibility = customMode ? Visibility.Visible : Visibility.Collapsed;
        }

        mode.SelectionChanged += (_, _) => UpdateVisibility();
        provider.SelectionChanged += (_, _) => UpdateVisibility();
        UpdateVisibility();

        test.Click += async (_, _) =>
        {
            test.IsEnabled = false;
            status.IsOpen = true;
            if (apiKey.Password.Length > 0)
            {
                status.Severity = InfoBarSeverity.Warning;
                status.Title = "请先保存 API 密钥";
                status.Message = "现有连接测试接口只读取安全存储中的密钥。保存后可重新打开并测试。";
                test.IsEnabled = true;
                return;
            }

            status.Severity = InfoBarSeverity.Informational;
            status.Title = "正在测试连接";
            var candidate = new JsonObject
            {
                ["mode"] = SelectedTag(mode, "free"),
                ["provider"] = SelectedTag(provider, "deepseek"),
                ["baseURL"] = baseUrl.Text,
                ["model"] = model.Text,
            };
            try
            {
                var response = await TaskService.TestAiConnectionAsync(candidate.ToJsonString());
                if (JsonNode.Parse(response) is not JsonObject state)
                {
                    throw new InvalidOperationException("后端响应格式无效");
                }
                var success = Bool(state, "success");
                status.Severity = success ? InfoBarSeverity.Success : InfoBarSeverity.Error;
                status.Title = success ? "AI 连接正常" : "AI 连接失败";
                status.Message = Str(state, "message", string.Empty);
            }
            catch (Exception error)
            {
                status.Severity = InfoBarSeverity.Error;
                status.Title = "AI 连接失败";
                status.Message = error.Message;
            }
            test.IsEnabled = true;
        };

        var dialog = new ContentDialog
        {
            Title = "AI 服务设置",
            Content = panel,
            PrimaryButtonText = "保存",
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Primary,
        };
        AutomationProperties.SetName(dialog, "AI 服务设置");
        DialogStyling.PrepareContentDialog(dialog, root);

        var saved = false;
        dialog.PrimaryButtonClick += async (sender, args) =>
        {
            var deferral = args.GetDeferral();
            sender.IsPrimaryButtonEnabled = false;
            try
            {
                // 克隆既有 profile/settings，避免污染当前快照（同 C++ Parse(Stringify())）。
                var updatedProfile = JsonNode.Parse(profile.ToJsonString())!.AsObject();
                updatedProfile["mode"] = SelectedTag(mode, "free");
                updatedProfile["provider"] = SelectedTag(provider, "deepseek");
                updatedProfile["baseURL"] = baseUrl.Text;
                updatedProfile["model"] = model.Text;
                if (!updatedProfile.ContainsKey("apiProtocol"))
                {
                    updatedProfile["apiProtocol"] = "auto";
                }
                var updatedSettings = JsonNode.Parse(settings.ToJsonString())!.AsObject();
                updatedSettings["aiProfile"] = updatedProfile;

                var credential = new JsonObject
                {
                    ["operation"] = apiKey.Password.Length > 0 ? "replace" : "keep",
                };
                if (apiKey.Password.Length > 0)
                {
                    credential["apiKey"] = apiKey.Password;
                }
                var request = new JsonObject
                {
                    ["settings"] = updatedSettings,
                    ["aiCredential"] = credential,
                };

                var response = await SettingsService.SaveAsync(request.ToJsonString());
                ShellSettings.Current.Update(response);
                saved = true;
            }
            catch (Exception error)
            {
                args.Cancel = true;
                status.Severity = InfoBarSeverity.Error;
                status.Title = "AI 设置保存失败";
                status.Message = error.Message;
                status.IsOpen = true;
            }
            sender.IsPrimaryButtonEnabled = true;
            deferral.Complete();
        };

        var result = await dialog.ShowAsync();
        return result == ContentDialogResult.Primary && saved;
    }

    private static string SelectedTag(RadioButtons buttons, string fallback) =>
        buttons.SelectedItem is RadioButton item && item.Tag is string tag ? tag : fallback;

    private static void SelectTag(RadioButtons buttons, string value)
    {
        for (var index = 0; index < buttons.Items.Count; index++)
        {
            if (buttons.Items[index] is RadioButton item && item.Tag as string == value)
            {
                buttons.SelectedIndex = index;
                return;
            }
        }
        buttons.SelectedIndex = 0;
    }

    private static string Str(JsonObject parent, string name, string fallback) =>
        parent[name] is JsonValue value && value.TryGetValue<string>(out var text) ? text : fallback;

    private static bool Bool(JsonObject parent, string name, bool fallback = false) =>
        parent[name] is JsonValue value && value.TryGetValue<bool>(out var flag) ? flag : fallback;
}
