#include "pch.h"
#include "TaskPage.xaml.h"
#include "Services/BackendClient.h"
#include "Services/JsonHelpers.h"

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        using namespace Microsoft::UI::Xaml;
        using namespace Microsoft::UI::Xaml::Controls;
        using namespace Windows::Data::Json;

        hstring ProxyJsonString(hstring const& value)
        {
            return JsonValue::CreateStringValue(value).Stringify();
        }

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

    void TaskPage::OnProxyModeChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (!m_initialized) return;
        UpdateNetworkVisibility();
        LoadProxyAreaOptions();
    }

    void TaskPage::OnProxySourceChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (!m_initialized) return;
        if (SelectedTag(ProxySource(), L"default") != m_document.ProxySource()) m_proxyAreaCode.clear();
        UpdateNetworkVisibility();
        LoadProxyAreaOptions();
    }

    void TaskPage::OnProxyProvinceChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (m_updatingProxyAreas) return;
        auto provinceCode = SelectedTag(ProxyProvince(), L"");
        RebuildProxyCities(provinceCode);
        m_proxyAreaCode = SelectedTag(ProxyCity(), L"");
    }

    void TaskPage::OnProxyCityChanged(IInspectable const&, SelectionChangedEventArgs const&)
    {
        if (!m_updatingProxyAreas) m_proxyAreaCode = SelectedTag(ProxyCity(), L"");
    }

    fire_and_forget TaskPage::LoadProxyAreaOptions()
    {
        auto mode = SelectedTag(ProxyMode(), L"direct");
        auto source = SelectedTag(ProxySource(), L"default");
        if (mode != L"random" || source == L"custom") co_return;
        auto lifetime = get_strong();
        auto dispatcher = DispatcherQueue();
        hstring result;
        hstring error;
        co_await resume_background();
        try
        {
            result = Services::BackendClient::Current().Call(
                L"GetProxyAreaOptions", L"{\"value\":" + ProxyJsonString(source) + L"}");
        }
        catch (hresult_error const& value)
        {
            error = value.message();
        }
        dispatcher.TryEnqueue([lifetime, result, error, source]()
        {
            if (source != lifetime->SelectedTag(lifetime->ProxySource(), L"default")) return;
            if (!error.empty())
            {
                lifetime->NetworkStatus().Title(L"地区列表读取失败");
                lifetime->NetworkStatus().Message(error);
                lifetime->NetworkStatus().Severity(InfoBarSeverity::Error);
                return;
            }
            lifetime->ApplyProxyAreaOptions(result, source);
        });
    }

    void TaskPage::ApplyProxyAreaOptions(hstring const& json, hstring const& source)
    {
        JsonObject state;
        hstring error;
        if (!Services::TryParseJsonObject(json, state, error))
        {
            SetFooterError(error);
            return;
        }
        m_proxyAreaOptions = state;
        auto provinces = state.GetNamedArray(L"provinces", JsonArray{});
        m_updatingProxyAreas = true;
        ProxyProvince().Items().Clear();
        ProxyProvince().Items().Append(AreaItem(source == L"benefit" ? L"请选择省份" : L"不限制", L""));

        hstring selectedProvince;
        for (auto const& value : provinces)
        {
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

    void TaskPage::RebuildProxyCities(hstring const& provinceCode, hstring const& selectedCode)
    {
        auto source = SelectedTag(ProxySource(), L"default");
        ProxyCity().Items().Clear();
        if (provinceCode.empty())
        {
            ProxyCity().Items().Append(AreaItem(L"不限制", L""));
            ProxyCity().SelectedIndex(0);
            return;
        }

        ProxyCity().Items().Append(AreaItem(source == L"benefit" ? L"请选择城市" : L"全省/全市",
            source == L"benefit" ? L"" : provinceCode));
        auto provinces = m_proxyAreaOptions
            ? m_proxyAreaOptions.GetNamedArray(L"provinces", JsonArray{})
            : JsonArray{};
        for (auto const& value : provinces)
        {
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

    fire_and_forget TaskPage::OnTestFixedProxy(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        auto address = FixedProxyAddress().Text();
        auto dispatcher = DispatcherQueue();
        SetBusy(true, L"正在测试固定代理");
        hstring result, error;
        co_await resume_background();
        try { result = Services::BackendClient::Current().Call(L"TestFixedProxy", L"{\"address\":" + ProxyJsonString(address) + L"}"); }
        catch (hresult_error const& value) { error = value.message(); }
        dispatcher.TryEnqueue([lifetime, result, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty()) { lifetime->SetFooterError(error); return; }
            JsonObject state;
            hstring parseError;
            if (!Services::TryParseJsonObject(result, state, parseError))
            {
                lifetime->SetFooterError(parseError);
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

    fire_and_forget TaskPage::OnTestCustomProxy(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        auto url = CustomProxyApi().Text();
        auto dispatcher = DispatcherQueue();
        SetBusy(true, L"正在测试代理 API");
        hstring result, error;
        co_await resume_background();
        try { result = Services::BackendClient::Current().Call(L"TestCustomProxyAPI", L"{\"url\":" + ProxyJsonString(url) + L"}"); }
        catch (hresult_error const& value) { error = value.message(); }
        dispatcher.TryEnqueue([lifetime, result, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty()) { lifetime->SetFooterError(error); return; }
            JsonObject state;
            hstring parseError;
            if (!Services::TryParseJsonObject(result, state, parseError))
            {
                lifetime->SetFooterError(parseError);
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

    fire_and_forget TaskPage::OnSyncProxy(IInspectable const&, RoutedEventArgs const&)
    {
        auto lifetime = get_strong();
        auto source = SelectedTag(ProxySource(), L"default");
        auto dispatcher = DispatcherQueue();
        SetBusy(true, L"正在同步代理状态");
        hstring result, error;
        co_await resume_background();
        try { result = Services::BackendClient::Current().Call(L"SyncProxyStatus", L"{\"value\":" + ProxyJsonString(source) + L"}"); }
        catch (hresult_error const& value) { error = value.message(); }
        dispatcher.TryEnqueue([lifetime, result, error]()
        {
            lifetime->SetBusy(false);
            if (!error.empty()) { lifetime->SetFooterError(error); return; }
            JsonObject state;
            hstring parseError;
            if (!Services::TryParseJsonObject(result, state, parseError))
            {
                lifetime->SetFooterError(parseError);
                return;
            }
            lifetime->ApplyProxyStatus(state);
        });
    }

    void TaskPage::ApplyProxyStatus(JsonObject const& state)
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

    void TaskPage::UpdateNetworkVisibility()
    {
        auto mode = SelectedTag(ProxyMode(), L"direct");
        auto source = SelectedTag(ProxySource(), L"default");
        FixedProxyRow().Visibility(mode == L"fixed" ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        ProxySourceRow().Visibility(mode == L"random" ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        CustomProxyRow().Visibility(mode == L"random" && source == L"custom" ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        ProxyAreaRow().Visibility(mode == L"random" && source != L"custom" ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
        SyncProxyButton().Visibility(mode == L"random" && source != L"custom" ? Microsoft::UI::Xaml::Visibility::Visible : Microsoft::UI::Xaml::Visibility::Collapsed);
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
            NetworkStatus().Message(L"测试连接后再继续。");
            ProxyStatusSource().Text(L"固定代理");
            ProxyStatusQuota().Text(L"不适用");
            ProxyStatusPool().Text(L"尚未测试");
        }
        else
        {
            NetworkStatus().Title(L"随机 IP");
            NetworkStatus().Message(source == L"custom" ? L"测试代理 API 后再继续。" : L"同步代理额度后再继续。");
            ProxyStatusSource().Text(ProxySourceLabel(source));
            ProxyStatusQuota().Text(source == L"custom" ? L"不适用" : L"未知");
            ProxyStatusPool().Text(L"未知");
        }
        NetworkStatus().Severity(InfoBarSeverity::Informational);
    }
}
