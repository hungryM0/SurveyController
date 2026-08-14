#include "pch.h"
#include "TaskPage.xaml.h"
#include "Services/BackendClient.h"
#include "Services/NativeResource.h"
#include "Services/WindowContext.h"
#include "Services/JsonHelpers.h"

#if __has_include("TaskPage.g.cpp")
#include "TaskPage.g.cpp"
#endif

#include <algorithm>
#include <cmath>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        using namespace Microsoft::UI::Xaml;
        using namespace Microsoft::UI::Xaml::Controls;
        using namespace Windows::Data::Json;

        int32_t NumberValue(NumberBox const& control, int32_t fallback, int32_t minimum, int32_t maximum)
        {
            auto value = control.Value();
            if (std::isnan(value)) return fallback;
            return std::clamp(static_cast<int32_t>(value), minimum, maximum);
        }

        hstring NumberText(int32_t value, wchar_t const* suffix)
        {
            return hstring{ std::to_wstring(value) + suffix };
        }

        hstring EscapeJsonString(hstring const& value)
        {
            return JsonValue::CreateStringValue(value).Stringify();
        }

        InfoBarSeverity SeverityForStatus(hstring const& status)
        {
            if (status == L"ready" || status == L"succeeded") return InfoBarSeverity::Success;
            if (status == L"warning" || status == L"paused") return InfoBarSeverity::Warning;
            if (status == L"blocked" || status == L"failed") return InfoBarSeverity::Error;
            return InfoBarSeverity::Informational;
        }
    }

    TaskPage::TaskPage() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
        m_initialized = true;
        InitializeState();
    }

    void TaskPage::InitializeState()
    {
        try
        {
            auto& backend = Services::BackendClient::Current();
            backend.Start();
            hstring parseError;
            if (!Services::TryParseJsonObject(backend.Call(L"GetAppSettings"), m_settings, parseError))
            {
                throw hresult_error(E_FAIL, parseError);
            }
            if (!m_document.Initialized())
            {
                m_document.LoadConfigState(backend.Call(L"LoadConfig", L"{}"));
            }
            m_parsed = m_document.HasRealSurvey();
            m_highestStep = m_parsed ? 4 : 0;
            PopulateControls();
            MoveToStep(0, true);
        }
        catch (hresult_error const& error)
        {
            SetFooterError(error.message());
        }
        UpdateStepVisuals();
    }

    void TaskPage::PopulateControls()
    {
        SurveyUrl().Text(m_document.URL());
        PopulateAIControls();
        auto duration = m_document.AnswerDuration();
        AnswerDurationMin().Value(duration[0]);
        AnswerDurationMax().Value(duration[1]);
        TargetCount().Value(m_document.Target());
        ThreadCount().Value(m_document.Threads());
        auto interval = m_document.SubmitInterval();
        SubmitIntervalMin().Value(interval[0]);
        SubmitIntervalMax().Value(interval[1]);
        auto window = m_document.AnswerWindow();
        WindowStartDate().Tag(box_value(window[0]));
        WindowEndDate().Tag(box_value(window[1]));
        FailStop().IsOn(m_document.FailStop());
        PauseCaptcha().IsOn(m_document.PauseCaptcha());
        SelectTag(ProxyMode(), m_document.ProxyMode());
        FixedProxyAddress().Text(m_document.FixedProxyAddress());
        SelectTag(ProxySource(), m_document.ProxySource());
        CustomProxyApi().Text(m_document.CustomProxyAPI());
        m_proxyAreaCode = m_document.ProxyAreaCode();
        RandomUA().IsOn(m_document.RandomUA());
        m_reverseFillPath = m_document.ReverseFillPath();
        ReverseFillEnabled().IsOn(m_document.ReverseFillEnabled());
        ReverseFillButton().Content(box_value(m_reverseFillPath.empty() ? L"选择 Excel" : L"更换 Excel"));
        auto total = m_document.QuestionCount();
        auto strategies = m_document.StrategyCount();
        AnswerCoverageStatus().Title(strategies >= total && total > 0
            ? hstring{ L"已生成 " + std::to_wstring(total) + L" 道题的初始策略" }
            : hstring{ L"已有 " + std::to_wstring(strategies) + L" / " + std::to_wstring(total) + L" 道题策略" });
        AnswerCoverageStatus().Severity(strategies >= total && total > 0 ? InfoBarSeverity::Success : InfoBarSeverity::Warning);
        AnswerStrategyEditor().Refresh();
        UpdateNetworkVisibility();
        LoadProxyAreaOptions();
        UpdateReview();
    }

    void TaskPage::PopulateAIControls()
    {
        auto profile = m_settings ? m_settings.GetNamedObject(L"aiProfile", JsonObject{}) : JsonObject{};
        SelectTag(AIMode(), profile.GetNamedString(L"mode", L"free"));
        SelectTag(AIProvider(), profile.GetNamedString(L"provider", L"deepseek"));
        AIBaseURL().Text(profile.GetNamedString(L"baseURL", L""));
        AIModel().Text(profile.GetNamedString(L"model", L""));
        AIApiKey().Password(L"");
        AIApiKey().PlaceholderText(profile.GetNamedBoolean(L"hasAPIKey", false)
            ? L"已保存，留空不修改" : L"输入 API Key");
        UpdateAIVisibility();
    }

    void TaskPage::UpdateAIVisibility()
    {
        auto providerMode = SelectedTag(AIMode(), L"free") == L"provider";
        auto customProvider = SelectedTag(AIProvider(), L"deepseek") == L"custom";
        AIProviderRow().Visibility(providerMode ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        AIBaseURLRow().Visibility(providerMode && customProvider ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        AIModelRow().Visibility(providerMode ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        AICredentialRow().Visibility(providerMode ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        AITestRow().Visibility(providerMode ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
    }

    hstring TaskPage::BuildAISettingsRequest()
    {
        auto profile = m_settings.GetNamedObject(L"aiProfile", JsonObject{});
        profile.SetNamedValue(L"mode", JsonValue::CreateStringValue(SelectedTag(AIMode(), L"free")));
        profile.SetNamedValue(L"provider", JsonValue::CreateStringValue(SelectedTag(AIProvider(), L"deepseek")));
        profile.SetNamedValue(L"baseURL", JsonValue::CreateStringValue(AIBaseURL().Text()));
        profile.SetNamedValue(L"model", JsonValue::CreateStringValue(AIModel().Text()));
        if (!profile.HasKey(L"apiProtocol"))
        {
            profile.SetNamedValue(L"apiProtocol", JsonValue::CreateStringValue(L"auto"));
        }
        m_settings.SetNamedValue(L"aiProfile", profile);

        JsonObject credential;
        auto apiKey = AIApiKey().Password();
        credential.SetNamedValue(L"operation", JsonValue::CreateStringValue(apiKey.empty() ? L"keep" : L"replace"));
        if (!apiKey.empty()) credential.SetNamedValue(L"apiKey", JsonValue::CreateStringValue(apiKey));

        JsonObject request;
        request.SetNamedValue(L"settings", m_settings);
        request.SetNamedValue(L"aiCredential", credential);
        return request.Stringify();
    }

    void TaskPage::SyncControlsToDocument()
    {
        auto durationMin = NumberValue(AnswerDurationMin(), 60, 1, 3600);
        auto durationMax = (std::max)(durationMin, NumberValue(AnswerDurationMax(), 120, 1, 3600));
        auto target = NumberValue(TargetCount(), 1, 1, 999999);
        auto threads = (std::min)(target, NumberValue(ThreadCount(), 1, 1, 128));
        auto intervalMin = NumberValue(SubmitIntervalMin(), 0, 0, 1800);
        auto intervalMax = (std::max)(intervalMin, NumberValue(SubmitIntervalMax(), 0, 0, 1800));
        m_document.SetExecution(target, threads, intervalMin, intervalMax, durationMin, durationMax,
            unbox_value_or<hstring>(WindowStartDate().Tag(), L""),
            unbox_value_or<hstring>(WindowEndDate().Tag(), L""), FailStop().IsOn(), PauseCaptcha().IsOn());
        m_document.SetNetwork(SelectedTag(ProxyMode(), L"direct"), FixedProxyAddress().Text(),
            SelectedTag(ProxySource(), L"default"), CustomProxyApi().Text(), m_proxyAreaCode, RandomUA().IsOn());
        m_document.SetReverseFill(ReverseFillEnabled().IsOn(), m_reverseFillPath);
    }

    fire_and_forget TaskPage::OnPrimary(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        if (m_busy) co_return;
        SyncControlsToDocument();
        if (m_step > 0 && m_step < 4)
        {
            MoveToStep(m_step + 1);
            co_return;
        }
        if (m_step == 0 && m_parsed)
        {
            MoveToStep(1);
            co_return;
        }

        auto dispatcher = DispatcherQueue();
        hstring method;
        hstring params;
        hstring settingsRequest;
        if (m_step == 0)
        {
            auto url = SurveyUrl().Text();
            if (!(url.starts_with(L"http://") || url.starts_with(L"https://")))
            {
                SetFooterError(L"请输入有效的 HTTP 或 HTTPS 问卷链接。");
                co_return;
            }
            method = L"CreateSurveyDocument";
            params = L"{\"url\":" + EscapeJsonString(url) + L"}";
            SetBusy(true, L"正在解析问卷");
        }
        else if (m_step == 4)
        {
            method = L"CheckTask";
            settingsRequest = BuildAISettingsRequest();
            SetBusy(true, L"正在检查配置");
        }
        else
        {
            method = L"StartRun";
            params = m_document.RunRequest();
            SetBusy(true, L"正在启动任务");
        }

        hstring result;
        hstring saved;
        hstring savedSettings;
        hstring error;
        co_await resume_background();
        try
        {
            if (method == L"CheckTask")
            {
                savedSettings = Services::BackendClient::Current().Call(L"SaveAppSettings", settingsRequest);
                JsonObject savedSettingsObject;
                hstring parseError;
                if (!Services::TryParseJsonObject(savedSettings, savedSettingsObject, parseError))
                {
                    throw hresult_error(E_FAIL, parseError);
                }
                result = Services::BackendClient::Current().Call(method,
                    lifetime->m_document.CheckRequest(savedSettingsObject));
                JsonObject check;
                if (!Services::TryParseJsonObject(result, check, parseError))
                {
                    throw hresult_error(E_FAIL, parseError);
                }
                if (check.GetNamedString(L"status", L"blocked") != L"blocked")
                {
                    saved = Services::BackendClient::Current().Call(L"SaveConfig", lifetime->m_document.SaveRequest());
                }
            }
            else
            {
                result = Services::BackendClient::Current().Call(method, params);
            }
        }
        catch (hresult_error const& value)
        {
            error = value.message();
        }
        dispatcher.TryEnqueue([lifetime, method, result, saved, savedSettings, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty())
            {
                lifetime->SetFooterError(error);
                return;
            }
            if (!savedSettings.empty())
            {
                JsonObject parsedSettings;
                hstring parseError;
                if (!Services::TryParseJsonObject(savedSettings, parsedSettings, parseError))
                {
                    lifetime->SetFooterError(parseError);
                    return;
                }
                lifetime->m_settings = parsedSettings;
                lifetime->PopulateAIControls();
            }
            if (method == L"CreateSurveyDocument")
            {
                lifetime->m_document.SetParsedConfig(result);
                lifetime->m_parsed = lifetime->m_document.HasRealSurvey();
                if (!lifetime->m_parsed)
                {
                    lifetime->SetFooterError(L"解析结果没有真实可作答题目。");
                    return;
                }
                lifetime->PopulateControls();
                lifetime->SurveyStatus().Title(L"问卷解析完成");
                lifetime->SurveyStatus().Message(lifetime->m_document.Title());
                lifetime->SurveyStatus().Severity(InfoBarSeverity::Success);
                lifetime->SurveyStatus().IsOpen(true);
                lifetime->MoveToStep(1, true);
            }
            else if (method == L"CheckTask")
            {
                lifetime->ApplyCheckState(result);
                if (!saved.empty())
                {
                    lifetime->m_document.LoadConfigState(saved);
                    lifetime->MoveToStep(5, true);
                }
            }
            else
            {
                lifetime->ApplyRunState(result);
                lifetime->StartPolling();
            }
        });
    }

    void TaskPage::OnBack(IInspectable const&, RoutedEventArgs const&)
    {
        if (!m_busy && m_step > 0) MoveToStep(m_step - 1, true);
    }

    void TaskPage::OnSurveyUrlChanged(IInspectable const&, TextChangedEventArgs const&)
    {
        if (!m_document.HasRealSurvey() || SurveyUrl().Text() == m_document.URL()) return;
        m_parsed = false;
        m_highestStep = 0;
        m_document.SetSurveyURL(SurveyUrl().Text());
        SurveyStatus().Title(L"链接已修改");
        SurveyStatus().Message(L"需要重新解析问卷。");
        SurveyStatus().Severity(InfoBarSeverity::Warning);
        SurveyStatus().IsOpen(true);
        UpdateStepVisuals();
    }

    fire_and_forget TaskPage::OnImportConfig(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        auto path = co_await ChooseFile(false);
        if (path.empty()) co_return;
        auto dispatcher = DispatcherQueue();
        SetBusy(true, L"正在导入配置");
        hstring result;
        hstring error;
        co_await resume_background();
        try { result = Services::BackendClient::Current().Call(L"LoadConfig", L"{\"path\":" + EscapeJsonString(path) + L"}"); }
        catch (hresult_error const& value) { error = value.message(); }
        dispatcher.TryEnqueue([lifetime, result, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty()) { lifetime->SetFooterError(error); return; }
            lifetime->m_document.LoadConfigState(result);
            lifetime->m_parsed = lifetime->m_document.HasRealSurvey();
            if (!lifetime->m_parsed) { lifetime->SetFooterError(L"导入配置没有真实可作答题目。"); return; }
            lifetime->PopulateControls();
            lifetime->MoveToStep(4, true);
        });
    }

    fire_and_forget TaskPage::OnChooseQRCode(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        auto path = co_await ChooseFile(true);
        if (path.empty()) co_return;
        auto dispatcher = DispatcherQueue();
        SetBusy(true, L"正在识别二维码");
        hstring parsed;
        hstring decoded;
        hstring url;
        hstring error;
        co_await resume_background();
        try
        {
            decoded = Services::BackendClient::Current().Call(L"DecodeQRCode", L"{\"path\":" + EscapeJsonString(path) + L"}");
            JsonObject decodedObject;
            hstring parseError;
            if (!Services::TryParseJsonObject(decoded, decodedObject, parseError))
            {
                throw hresult_error(E_FAIL, parseError);
            }
            url = decodedObject.GetNamedString(L"text", L"");
            if (url.empty())
            {
                throw hresult_error(E_INVALIDARG, L"二维码没有识别出问卷链接");
            }
            parsed = Services::BackendClient::Current().Call(L"CreateSurveyDocument", L"{\"url\":" + EscapeJsonString(url) + L"}");
        }
        catch (hresult_error const& value) { error = value.message(); }
        dispatcher.TryEnqueue([lifetime, parsed, url, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty()) { lifetime->SetFooterError(error); return; }
            lifetime->m_document.SetParsedConfig(parsed);
            lifetime->m_document.SetSurveyURL(url);
            lifetime->m_parsed = lifetime->m_document.HasRealSurvey();
            if (!lifetime->m_parsed) { lifetime->SetFooterError(L"二维码对应问卷没有真实可作答题目。"); return; }
            lifetime->PopulateControls();
            lifetime->SurveyStatus().Title(L"二维码已识别");
            lifetime->SurveyStatus().Message(lifetime->m_document.Title());
            lifetime->SurveyStatus().Severity(InfoBarSeverity::Success);
            lifetime->SurveyStatus().IsOpen(true);
            lifetime->MoveToStep(1, true);
        });
    }

    fire_and_forget TaskPage::OnChooseReverseFill(IInspectable const&, RoutedEventArgs const&)
    {
        auto path = co_await ChooseFile(false, true);
        if (path.empty()) co_return;
        m_reverseFillPath = path;
        ReverseFillEnabled().IsOn(true);
        ReverseFillButton().Content(box_value(L"更换 Excel"));
    }

    void TaskPage::OnAIModeChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (m_initialized) UpdateAIVisibility();
    }

    fire_and_forget TaskPage::OnTestAIConnection(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        auto settingsRequest = BuildAISettingsRequest();
        auto dispatcher = DispatcherQueue();
        SetBusy(true, L"正在测试 AI 连接");
        hstring savedSettings;
        hstring result;
        hstring error;
        co_await resume_background();
        try
        {
            savedSettings = Services::BackendClient::Current().Call(L"SaveAppSettings", settingsRequest);
            JsonObject settings;
            hstring parseError;
            if (!Services::TryParseJsonObject(savedSettings, settings, parseError))
            {
                throw hresult_error(E_FAIL, parseError);
            }
            JsonObject request;
            request.SetNamedValue(L"aiProfile", settings.GetNamedObject(L"aiProfile", JsonObject{}));
            result = Services::BackendClient::Current().Call(L"TestAIConnection", request.Stringify());
        }
        catch (hresult_error const& value)
        {
            error = value.message();
        }
        dispatcher.TryEnqueue([lifetime, savedSettings, result, error]()
        {
            lifetime->SetBusy(false);
            if (!savedSettings.empty())
            {
                JsonObject parsedSettings;
                hstring parseError;
                if (!Services::TryParseJsonObject(savedSettings, parsedSettings, parseError))
                {
                    lifetime->AIStatus().Severity(InfoBarSeverity::Error);
                    lifetime->AIStatus().Title(L"AI 设置响应无效");
                    lifetime->AIStatus().Message(parseError);
                    lifetime->AIStatus().IsOpen(true);
                    return;
                }
                lifetime->m_settings = parsedSettings;
                lifetime->PopulateAIControls();
            }
            lifetime->AIStatus().IsOpen(true);
            if (!error.empty())
            {
                lifetime->AIStatus().Severity(InfoBarSeverity::Error);
                lifetime->AIStatus().Title(L"AI 连接失败");
                lifetime->AIStatus().Message(error);
                return;
            }
            JsonObject state;
            hstring parseError;
            if (!Services::TryParseJsonObject(result, state, parseError))
            {
                lifetime->AIStatus().Severity(InfoBarSeverity::Error);
                lifetime->AIStatus().Title(L"AI 响应无效");
                lifetime->AIStatus().Message(parseError);
                return;
            }
            auto success = state.GetNamedBoolean(L"success", false);
            lifetime->AIStatus().Severity(success ? InfoBarSeverity::Success : InfoBarSeverity::Error);
            lifetime->AIStatus().Title(success ? L"AI 连接正常" : L"AI 连接失败");
            lifetime->AIStatus().Message(state.GetNamedString(L"message", L""));
        });
    }

    void TaskPage::UpdateReview()
    {
        ReviewSurvey().Text(m_document.Title().empty() ? L"未命名问卷" : m_document.Title());
        auto provider = m_document.Provider();
        ReviewProvider().Text(provider == L"qq" ? L"腾讯问卷" : provider == L"credamo" ? L"见数" : L"问卷星");
        ReviewQuestions().Text(NumberText(static_cast<int32_t>(m_document.QuestionCount()), L" 题"));
        ReviewTarget().Text(NumberText(m_document.Target(), L" 份"));
        ReviewThreads().Text(NumberText(m_document.Threads(), L" 路"));
        auto mode = m_document.ProxyMode();
        ReviewNetwork().Text(mode == L"fixed" ? L"固定代理" : mode == L"random" ? L"随机 IP" : L"直连");
        ReviewUrl().Text(m_document.URL());
    }

    void TaskPage::MoveToStep(int32_t step, bool force)
    {
        if (step < 0 || step > 5 || (!force && step > m_highestStep + 1)) return;
        m_step = step;
        m_highestStep = (std::max)(m_highestStep, step);
        if (step == 4) { SyncControlsToDocument(); UpdateReview(); }
        UpdateStepVisuals();
    }

    void TaskPage::UpdateStepVisuals()
    {
        std::array<UIElement, 6> panels{ SurveyPanel(), AnswersPanel(), TaskPanel(), NetworkPanel(), ReviewPanel(), RunPanel() };
        for (int32_t index = 0; index < 6; ++index)
        {
            panels[index].Visibility(index == m_step ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        }
        StepProgress().Value(m_step);
        static const std::array<hstring, 6> labels{ L"问卷", L"答案", L"任务", L"网络", L"检查", L"运行" };
        StepSummary().Text(hstring{ L"第 " } + to_hstring(m_step + 1) + L"/6 步：" + labels[m_step]);
        auto const firstStep = m_step == 0;
        AnswerCoverageStatus().IsOpen(m_step == 1);
        NetworkStatus().IsOpen(m_step == 3);
        CheckStatus().IsOpen(m_step == 4);
        RunStatus().IsOpen(m_step == 5);
        if (m_step != 0) SurveyStatus().IsOpen(false);
        if (m_step != 1) AIStatus().IsOpen(false);
        if (m_step != 5) RunExportStatus().IsOpen(false);
        FooterDivider().Visibility(!firstStep ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        FooterBar().Visibility(!firstStep ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        SurveyPrimaryButton().Content(box_value(m_parsed ? L"继续" : L"解析并继续"));
        SurveyPrimaryButton().IsEnabled(!m_busy);
        BackButton().IsEnabled(!m_busy && m_step > 0);
        if (m_step == 4) PrimaryButton().Content(box_value(L"检查并保存"));
        else if (m_step == 5) PrimaryButton().Content(box_value(L"启动任务"));
        else PrimaryButton().Content(box_value(L"继续"));
        PrimaryButton().IsEnabled(!m_busy);
    }

    void TaskPage::SetBusy(bool busy, hstring const& message)
    {
        m_busy = busy;
        FooterStatus().Text(message);
        UpdateStepVisuals();
    }

    void TaskPage::SetFooterError(hstring const& message)
    {
        FooterStatus().Text(message);
        if (m_step == 0)
        {
            SurveyStatus().Title(L"无法继续");
            SurveyStatus().Message(message);
            SurveyStatus().Severity(InfoBarSeverity::Error);
            SurveyStatus().IsOpen(true);
        }
    }

    Windows::Foundation::IAsyncOperation<hstring> TaskPage::ChooseFile(bool image, bool spreadsheet)
    {
        Microsoft::Windows::Storage::Pickers::FileOpenPicker picker(Services::MainWindowId());
        auto types = picker.FileTypeFilter();
        if (image) { types.Append(L".png"); types.Append(L".jpg"); types.Append(L".jpeg"); types.Append(L".bmp"); }
        else if (spreadsheet) { types.Append(L".xlsx"); types.Append(L".xls"); }
        else { types.Append(L".json"); }
        auto file = co_await picker.PickSingleFileAsync();
        co_return file ? file.Path() : hstring{};
    }

    hstring TaskPage::SelectedTag(ComboBox const& combo, hstring const& fallback) const
    {
        auto item = combo.SelectedItem().try_as<ComboBoxItem>();
        return item ? unbox_value_or<hstring>(item.Tag(), fallback) : fallback;
    }

    void TaskPage::SelectTag(ComboBox const& combo, hstring const& value)
    {
        for (uint32_t index = 0; index < combo.Items().Size(); ++index)
        {
            auto item = combo.Items().GetAt(index).try_as<ComboBoxItem>();
            if (item && unbox_value_or<hstring>(item.Tag(), L"") == value)
            {
                combo.SelectedIndex(static_cast<int32_t>(index));
                return;
            }
        }
        combo.SelectedIndex(0);
    }

    void TaskPage::ApplyCheckState(hstring const& json)
    {
        JsonObject state;
        hstring error;
        if (!Services::TryParseJsonObject(json, state, error))
        {
            SetFooterError(error);
            return;
        }
        auto status = state.GetNamedString(L"status", L"blocked");
        CheckStatus().Severity(SeverityForStatus(status));
        CheckStatus().Title(status == L"ready" ? L"配置可以启动" : status == L"warning" ? L"配置需要注意" : L"暂时无法启动");
        CheckStatus().Message(status == L"blocked" ? L"请按问题提示返回修改后再检查。" : L"配置检查完成。");
        CheckProblems().Items().Clear();
        auto problems = state.GetNamedArray(L"problems", JsonArray{});
        for (auto const& value : problems)
        {
            CheckProblems().Items().Append(box_value(value.GetObject().GetNamedString(L"message", L"未知问题")));
        }
        FooterStatus().Text(status == L"blocked" ? L"配置检查未通过" : L"配置已保存");
    }

}
