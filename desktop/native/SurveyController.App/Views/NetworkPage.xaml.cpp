#include "pch.h"
#include "NetworkPage.xaml.h"
#include "Services/RpcServices.h"
#include "Services/JsonHelpers.h"

#include <algorithm>
#include <cmath>
#include <string>

#if __has_include("NetworkPage.g.cpp")
#include "NetworkPage.g.cpp"
#endif

namespace winrt::SurveyController::App::implementation
{
    using namespace Microsoft::UI::Dispatching;
    using namespace Microsoft::UI::Xaml;
    using namespace Microsoft::UI::Xaml::Controls;
    using namespace Windows::Data::Json;

    namespace
    {
        hstring ProxySourceLabel(hstring const& source)
        {
            if (source == L"benefit") return L"限时福利代理";
            if (source == L"custom") return L"自定义代理 API";
            return L"默认代理";
        }

        ComboBoxItem AreaItem(hstring const& label, hstring const& code)
        {
            ComboBoxItem item;
            item.Content(box_value(label));
            item.Tag(box_value(code));
            return item;
        }
    }

    NetworkPage::NetworkPage() : m_document(Services::WizardDocument::Current())
    {
        InitializeComponent();
        m_initialized = true;
        PopulateFromDocument();
    }

    hstring NetworkPage::SelectedTag(ComboBox const& combo, hstring const& fallback) const
    {
        auto item = combo.SelectedItem().try_as<ComboBoxItem>();
        return item ? unbox_value_or<hstring>(item.Tag(), fallback) : fallback;
    }

    void NetworkPage::SelectTag(ComboBox const& combo, hstring const& value)
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

    void NetworkPage::PopulateFromDocument()
    {
        SelectTag(ProxyMode(), m_document.ProxyMode());
        FixedProxyAddress().Text(m_document.FixedProxyAddress());
        SelectTag(ProxySource(), m_document.ProxySource());
        CustomProxyApi().Text(m_document.CustomProxyAPI());
        m_proxyAreaCode = m_document.ProxyAreaCode();
        RandomUA().IsOn(m_document.RandomUA());
        PsychometricsEnabled().IsOn(m_document.PsychometricsEnabled());
        TargetAlpha().Value(m_document.TargetAlpha());
        UpdatePsychometricsVisibility();
        UpdateNetworkVisibility();
        LoadProxyAreaOptions();
    }

    void NetworkPage::ScheduleSync()
    {
        // 与 SettingsPage 相同的 30ms 单发防抖；写回仅作用于内存文档，无 RPC。
        ++m_syncGeneration;
        if (!m_syncTimer)
        {
            m_syncTimer = DispatcherQueue().CreateTimer();
            m_syncTimer.IsRepeating(false);
            m_syncTimer.Interval(std::chrono::milliseconds{ 30 });
            auto weak = get_weak();
            m_syncTimer.Tick([weak](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->SyncToDocument();
            });
        }
        m_syncTimer.Stop();
        m_syncTimer.Start();
    }

    void NetworkPage::SyncToDocument()
    {
        if (!m_initialized) return;
        m_document.SetNetwork(
            SelectedTag(ProxyMode(), L"direct"),
            FixedProxyAddress().Text(),
            SelectedTag(ProxySource(), L"default"),
            CustomProxyApi().Text(),
            m_proxyAreaCode,
            RandomUA().IsOn());
        auto alphaValue = TargetAlpha().Value();
        if (std::isnan(alphaValue)) alphaValue = 0.85;
        alphaValue = std::clamp(alphaValue, 0.5, 0.99);
        m_document.SetPsychometrics(PsychometricsEnabled().IsOn(), alphaValue);
    }

    void NetworkPage::UpdatePsychometricsVisibility()
    {
        PsychometricsRow().Visibility(PsychometricsEnabled().IsOn() ? Visibility::Visible : Visibility::Collapsed);
    }

    void NetworkPage::OnTextChanged(IInspectable const&, TextChangedEventArgs const&)
    {
        ScheduleSync();
    }

    void NetworkPage::OnAlphaChanged(IInspectable const&, NumberBoxValueChangedEventArgs const&)
    {
        ScheduleSync();
    }

    void NetworkPage::OnSettingToggled(IInspectable const&, RoutedEventArgs const&)
    {
        ScheduleSync();
    }

    void NetworkPage::OnPsychometricsToggled(IInspectable const&, RoutedEventArgs const&)
    {
        if (!m_initialized) return;
        UpdatePsychometricsVisibility();
        ScheduleSync();
    }

    void NetworkPage::OnProxyModeChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (!m_initialized) return;
        SyncToDocument();
        UpdateNetworkVisibility();
        LoadProxyAreaOptions();
    }

    void NetworkPage::OnProxySourceChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (!m_initialized) return;
        if (SelectedTag(ProxySource(), L"default") != m_document.ProxySource()) m_proxyAreaCode.clear();
        SyncToDocument();
        UpdateNetworkVisibility();
        LoadProxyAreaOptions();
    }

    void NetworkPage::OnProxyProvinceChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (m_updatingProxyAreas) return;
        auto provinceCode = SelectedTag(ProxyProvince(), L"");
        RebuildProxyCities(provinceCode);
        m_proxyAreaCode = SelectedTag(ProxyCity(), L"");
        ScheduleSync();
    }

    void NetworkPage::OnProxyCityChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (!m_updatingProxyAreas)
        {
            m_proxyAreaCode = SelectedTag(ProxyCity(), L"");
            ScheduleSync();
        }
    }

    fire_and_forget NetworkPage::LoadProxyAreaOptions()
    {
        try
        {
            auto mode = SelectedTag(ProxyMode(), L"direct");
            auto source = SelectedTag(ProxySource(), L"default");
            if (mode != L"random" || source == L"custom") co_return;
            auto lifetime = get_strong();
            hstring result;
            hstring error;
            co_await winrt::resume_background();
            try { result = co_await Services::ProxyService{}.AreasAsync(source); }
            catch (winrt::hresult_error const& value) { error = value.message(); }
            catch (std::exception const& value) { error = to_hstring(value.what()); }
            catch (...) { error = L"地区列表读取失败。"; }

            lifetime->DispatcherQueue().TryEnqueue([lifetime, result, error, source]()
            {
                try
                {
                    if (!lifetime->m_initialized) return;
                    if (source != lifetime->SelectedTag(lifetime->ProxySource(), L"default")) return;
                    if (!error.empty())
                    {
                        lifetime->NetworkStatus().Title(L"地区列表读取失败");
                        lifetime->NetworkStatus().Message(error);
                        lifetime->NetworkStatus().Severity(InfoBarSeverity::Error);
                        return;
                    }
                    lifetime->ApplyProxyAreaOptions(result, source);
                }
                catch (...) {}
            });
        }
        catch (...) {}
    }

    void NetworkPage::ApplyProxyAreaOptions(hstring const& json, hstring const& source)
    {
        JsonObject state;
        hstring error;
        if (!Services::TryParseJsonObject(json, state, error))
        {
            return;
        }
        m_proxyAreaOptions = state;
        auto provinces = Services::GetJsonArray(state, L"provinces");
        m_updatingProxyAreas = true;
        ProxyProvince().Items().Clear();
        ProxyProvince().Items().Append(AreaItem(source == L"benefit" ? L"请选择省份" : L"不限制", L""));

        hstring selectedProvince;
        for (auto const& value : provinces)
        {
            if (value.ValueType() != JsonValueType::Object) continue;
            auto province = value.GetObject();
            auto code = province.GetNamedString(L"code", L"");
            ProxyProvince().Items().Append(AreaItem(province.GetNamedString(L"name", code), code));
            if (code == m_proxyAreaCode) selectedProvince = code;
            for (auto const& cityValue : province.GetNamedArray(L"cities", JsonArray{}))
            {
                if (cityValue.GetObject().GetNamedString(L"code", L"") == m_proxyAreaCode)
                {
                    selectedProvince = code;
                }
            }
        }
        SelectTag(ProxyProvince(), selectedProvince);
        RebuildProxyCities(selectedProvince, m_proxyAreaCode);
        m_updatingProxyAreas = false;
    }

    void NetworkPage::RebuildProxyCities(hstring const& provinceCode, hstring const& selectedCode)
    {
        auto source = SelectedTag(ProxySource(), L"default");
        ProxyCity().Items().Clear();
        if (provinceCode.empty())
        {
            ProxyCity().Items().Append(AreaItem(L"不限制", L""));
            ProxyCity().SelectedIndex(0);
            return;
        }

        ProxyCity().Items().Append(AreaItem(
            source == L"benefit" ? L"请选择城市" : L"全省/全市",
            source == L"benefit" ? L"" : provinceCode));
        auto provinces = m_proxyAreaOptions
            ? Services::GetJsonArray(m_proxyAreaOptions, L"provinces")
            : JsonArray{};
        for (auto const& value : provinces)
        {
            if (value.ValueType() != JsonValueType::Object) continue;
            auto province = value.GetObject();
            if (province.GetNamedString(L"code", L"") != provinceCode) continue;
            for (auto const& cityValue : province.GetNamedArray(L"cities", JsonArray{}))
            {
                auto city = cityValue.GetObject();
                auto code = city.GetNamedString(L"code", L"");
                ProxyCity().Items().Append(AreaItem(city.GetNamedString(L"name", code), code));
            }
            break;
        }
        SelectTag(ProxyCity(), selectedCode.empty() ? (source == L"benefit" ? L"" : provinceCode) : selectedCode);
    }

    void NetworkPage::SetBusy(bool busy)
    {
        m_busy = busy;
        ProxyMode().IsEnabled(!busy);
        ProxySource().IsEnabled(!busy);
        FixedProxyAddress().IsEnabled(!busy);
        CustomProxyApi().IsEnabled(!busy);
        ProxyProvince().IsEnabled(!busy);
        ProxyCity().IsEnabled(!busy);
        SyncProxyButton().IsEnabled(!busy);
    }

    fire_and_forget NetworkPage::OnTestFixedProxy(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        auto address = FixedProxyAddress().Text();
        SetBusy(true);
        SyncToDocument();
        UpdateNetworkVisibility();

        hstring result, error;
        co_await winrt::resume_background();
        try { result = co_await Services::ProxyService{}.TestFixedAsync(address); }
        catch (winrt::hresult_error const& value) { error = value.message(); }
        catch (std::exception const& value) { error = to_hstring(value.what()); }
        catch (...) { error = L"固定代理测试失败。"; }

        lifetime->DispatcherQueue().TryEnqueue([lifetime, result, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty())
            {
                lifetime->NetworkStatus().Title(L"固定代理不可用");
                lifetime->NetworkStatus().Message(error);
                lifetime->NetworkStatus().Severity(InfoBarSeverity::Error);
                return;
            }
            JsonObject state;
            hstring parseError;
            if (!Services::TryParseJsonObject(result, state, parseError))
            {
                lifetime->NetworkStatus().Title(L"固定代理测试失败");
                lifetime->NetworkStatus().Message(parseError);
                lifetime->NetworkStatus().Severity(InfoBarSeverity::Error);
                return;
            }
            auto success = state.GetNamedBoolean(L"success", false);
            lifetime->NetworkStatus().Title(success ? L"固定代理可用" : L"固定代理不可用");
            lifetime->NetworkStatus().Message(state.GetNamedString(L"message", L""));
            lifetime->NetworkStatus().Severity(success ? InfoBarSeverity::Success : InfoBarSeverity::Error);
            lifetime->ProxyStatusSource().Text(L"固定代理");
            lifetime->ProxyStatusQuota().Text(L"不适用");
            lifetime->ProxyStatusPool().Text(success ? L"1 个可用" : L"不可用");
        });
    }

    fire_and_forget NetworkPage::OnTestCustomProxy(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        auto url = CustomProxyApi().Text();
        SetBusy(true);
        SyncToDocument();
        UpdateNetworkVisibility();

        hstring result, error;
        co_await winrt::resume_background();
        try { result = co_await Services::ProxyService{}.TestCustomAsync(url); }
        catch (winrt::hresult_error const& value) { error = value.message(); }
        catch (std::exception const& value) { error = to_hstring(value.what()); }
        catch (...) { error = L"代理 API 测试失败。"; }

        lifetime->DispatcherQueue().TryEnqueue([lifetime, result, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty())
            {
                lifetime->NetworkStatus().Title(L"代理 API 不可用");
                lifetime->NetworkStatus().Message(error);
                lifetime->NetworkStatus().Severity(InfoBarSeverity::Error);
                return;
            }
            JsonObject state;
            hstring parseError;
            if (!Services::TryParseJsonObject(result, state, parseError))
            {
                lifetime->NetworkStatus().Title(L"代理 API 测试失败");
                lifetime->NetworkStatus().Message(parseError);
                lifetime->NetworkStatus().Severity(InfoBarSeverity::Error);
                return;
            }
            auto success = state.GetNamedBoolean(L"success", false);
            lifetime->NetworkStatus().Title(success ? L"代理 API 可用" : L"代理 API 不可用");
            lifetime->NetworkStatus().Message(state.GetNamedString(L"message", L""));
            lifetime->NetworkStatus().Severity(success ? InfoBarSeverity::Success : InfoBarSeverity::Error);
            lifetime->ProxyStatusSource().Text(L"自定义代理 API");
            lifetime->ProxyStatusQuota().Text(L"不适用");
            auto count = state.GetNamedArray(L"proxies", JsonArray{}).Size();
            lifetime->ProxyStatusPool().Text(success ? hstring{ std::to_wstring(count) + L" 个可用" } : L"不可用");
        });
    }

    fire_and_forget NetworkPage::OnSyncProxy(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        auto source = SelectedTag(ProxySource(), L"default");
        SetBusy(true);

        hstring result, error;
        co_await winrt::resume_background();
        try { result = co_await Services::ProxyService{}.SyncAsync(source); }
        catch (winrt::hresult_error const& value) { error = value.message(); }
        catch (std::exception const& value) { error = to_hstring(value.what()); }
        catch (...) { error = L"同步代理状态失败。"; }

        lifetime->DispatcherQueue().TryEnqueue([lifetime, result, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty())
            {
                lifetime->NetworkStatus().Title(L"同步代理状态失败");
                lifetime->NetworkStatus().Message(error);
                lifetime->NetworkStatus().Severity(InfoBarSeverity::Error);
                return;
            }
            JsonObject state;
            hstring parseError;
            if (!Services::TryParseJsonObject(result, state, parseError))
            {
                lifetime->NetworkStatus().Title(L"同步代理状态失败");
                lifetime->NetworkStatus().Message(parseError);
                lifetime->NetworkStatus().Severity(InfoBarSeverity::Error);
                return;
            }
            lifetime->ApplyProxyStatus(state);
        });
    }

    void NetworkPage::ApplyProxyStatus(JsonObject const& state)
    {
        auto source = state.GetNamedString(L"source", SelectedTag(ProxySource(), L"default"));
        auto message = state.GetNamedString(L"message", L"");
        ProxyStatusSource().Text(ProxySourceLabel(source));
        if (state.GetNamedBoolean(L"quotaKnown", false))
        {
            ProxyStatusQuota().Text(hstring{ L"剩余 " + std::wstring{ state.GetNamedString(L"remainingQuota", L"0") } +
                L" / " + std::wstring{ state.GetNamedString(L"totalQuota", L"0") } });
        }
        else
        {
            ProxyStatusQuota().Text(L"未知");
        }
        if (state.GetNamedBoolean(L"poolRemainingKnown", false))
        {
            auto remaining = static_cast<int32_t>(state.GetNamedNumber(L"poolRemainingIp", 0));
            ProxyStatusPool().Text(hstring{ std::to_wstring(remaining) + L" 个可用 IP" });
        }
        else
        {
            auto available = static_cast<int32_t>(state.GetNamedNumber(L"available", 0));
            auto inUse = static_cast<int32_t>(state.GetNamedNumber(L"inUse", 0));
            ProxyStatusPool().Text(available > 0 || inUse > 0
                ? hstring{ std::to_wstring(available) + L" 个可用 / " + std::to_wstring(inUse) + L" 个使用中" }
                : L"未知");
        }
        auto unavailable = std::wstring{ message }.find(L"失败") != std::wstring::npos ||
            std::wstring{ message }.find(L"已用完") != std::wstring::npos ||
            std::wstring{ message }.find(L"不可用") != std::wstring::npos;
        NetworkStatus().Title(unavailable ? L"代理不可用" : L"代理状态已同步");
        NetworkStatus().Message(message);
        NetworkStatus().Severity(unavailable ? InfoBarSeverity::Error : InfoBarSeverity::Success);
    }

    void NetworkPage::UpdateNetworkVisibility()
    {
        auto mode = SelectedTag(ProxyMode(), L"direct");
        auto source = SelectedTag(ProxySource(), L"default");
        FixedProxyRow().Visibility(mode == L"fixed" ? Visibility::Visible : Visibility::Collapsed);
        ProxySourceRow().Visibility(mode == L"random" ? Visibility::Visible : Visibility::Collapsed);
        CustomProxyRow().Visibility(mode == L"random" && source == L"custom" ? Visibility::Visible : Visibility::Collapsed);
        ProxyAreaRow().Visibility(mode == L"random" && source != L"custom" ? Visibility::Visible : Visibility::Collapsed);
        SyncProxyButton().Visibility(mode == L"random" && source != L"custom" ? Visibility::Visible : Visibility::Collapsed);
        if (mode == L"direct")
        {
            NetworkStatus().Title(L"直连");
            NetworkStatus().Message(L"不使用代理访问问卷。");
            ProxyStatusSource().Text(L"直连");
            ProxyStatusQuota().Text(L"不适用");
            ProxyStatusPool().Text(L"不适用");
        }
        else if (mode == L"fixed")
        {
            NetworkStatus().Title(L"固定代理");
            NetworkStatus().Message(L"测试连接后再启动任务。");
            ProxyStatusSource().Text(L"固定代理");
            ProxyStatusQuota().Text(L"不适用");
            ProxyStatusPool().Text(L"尚未测试");
        }
        else
        {
            NetworkStatus().Title(L"随机 IP");
            NetworkStatus().Message(source == L"custom" ? L"测试代理 API 后再启动任务。" : L"同步代理额度后再启动任务。");
            ProxyStatusSource().Text(ProxySourceLabel(source));
            ProxyStatusQuota().Text(source == L"custom" ? L"不适用" : L"未知");
            ProxyStatusPool().Text(L"未知");
        }
        NetworkStatus().Severity(InfoBarSeverity::Informational);
    }
}
