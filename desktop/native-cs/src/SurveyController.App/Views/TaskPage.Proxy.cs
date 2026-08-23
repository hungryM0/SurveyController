using System.Text.Json.Nodes;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using SurveyController.App.Services;
using SurveyController.Core.Rpc;

namespace SurveyController.App.Views;

/// <summary>代理来源、地区级联与状态同步，对照 C++ TaskPage.Proxy.cpp。</summary>
public sealed partial class TaskPage
{
    private void OnProxyModeChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_initialized)
        {
            return;
        }
        UpdateNetworkVisibility();
        _ = LoadProxyAreaOptions();
    }

    private void OnProxySourceChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_initialized)
        {
            return;
        }
        if (SelectedTag(ProxySource, "default") != _document.ProxySource())
        {
            _proxyAreaCode = string.Empty;
        }
        UpdateNetworkVisibility();
        _ = LoadProxyAreaOptions();
    }

    private void OnProxyProvinceChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_updatingProxyAreas)
        {
            return;
        }
        var provinceCode = SelectedTag(ProxyProvince, string.Empty);
        RebuildProxyCities(provinceCode);
        _proxyAreaCode = SelectedTag(ProxyCity, string.Empty);
    }

    private void OnProxyCityChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_updatingProxyAreas)
        {
            _proxyAreaCode = SelectedTag(ProxyCity, string.Empty);
        }
    }

    private async Task LoadProxyAreaOptions()
    {
        var mode = SelectedTag(ProxyMode, "direct");
        var source = SelectedTag(ProxySource, "default");
        if (mode != "random" || source == "custom")
        {
            return;
        }

        string result;
        string error = string.Empty;
        try
        {
            result = await ProxyService.GetProxyAreaOptionsAsync(source);
        }
        catch (Exception value)
        {
            result = string.Empty;
            error = value.Message;
        }

        // 返回后来源可能已切换，过期结果直接丢弃。
        if (source != SelectedTag(ProxySource, "default"))
        {
            return;
        }
        if (error.Length > 0)
        {
            NetworkStatus.Title = "地区列表读取失败";
            NetworkStatus.Message = error;
            NetworkStatus.Severity = InfoBarSeverity.Error;
            return;
        }
        try
        {
            ApplyProxyAreaOptions(result, source);
        }
        catch (Exception value)
        {
            SetFooterError(value.Message);
        }
    }

    private void ApplyProxyAreaOptions(string json, string source)
    {
        if (JsonNode.Parse(json) is not JsonObject state)
        {
            throw new InvalidOperationException("后端响应格式无效");
        }
        _proxyAreaOptions = state;
        var provinces = state["provinces"] as JsonArray ?? [];
        _updatingProxyAreas = true;
        try
        {
            ProxyProvince.Items.Clear();
            ProxyProvince.Items.Add(AreaItem(source == "benefit" ? "请选择省份" : "不限制", string.Empty));

            var selectedProvince = string.Empty;
            foreach (var value in provinces)
            {
                if (value is not JsonObject province)
                {
                    continue;
                }
                var code = JsonFieldStr(province, "code", string.Empty);
                ProxyProvince.Items.Add(AreaItem(JsonFieldStr(province, "name", code), code));
                if (code == _proxyAreaCode)
                {
                    selectedProvince = code;
                }
                if (province["cities"] is JsonArray cities)
                {
                    foreach (var cityValue in cities)
                    {
                        if (cityValue is JsonObject city && JsonFieldStr(city, "code", string.Empty) == _proxyAreaCode)
                        {
                            selectedProvince = code;
                        }
                    }
                }
            }
            SelectTag(ProxyProvince, selectedProvince);
            RebuildProxyCities(selectedProvince, _proxyAreaCode);
        }
        finally
        {
            _updatingProxyAreas = false;
        }
    }

    private void RebuildProxyCities(string provinceCode, string selectedCode = "")
    {
        var source = SelectedTag(ProxySource, "default");
        ProxyCity.Items.Clear();
        if (provinceCode.Length == 0)
        {
            ProxyCity.Items.Add(AreaItem("不限制", string.Empty));
            ProxyCity.SelectedIndex = 0;
            return;
        }

        ProxyCity.Items.Add(AreaItem(
            source == "benefit" ? "请选择城市" : "全省/全市",
            source == "benefit" ? string.Empty : provinceCode));
        var provinces = _proxyAreaOptions?["provinces"] as JsonArray ?? [];
        foreach (var value in provinces)
        {
            if (value is not JsonObject province || JsonFieldStr(province, "code", string.Empty) != provinceCode)
            {
                continue;
            }
            if (province["cities"] is JsonArray cities)
            {
                foreach (var cityValue in cities)
                {
                    if (cityValue is not JsonObject city)
                    {
                        continue;
                    }
                    var code = JsonFieldStr(city, "code", string.Empty);
                    ProxyCity.Items.Add(AreaItem(JsonFieldStr(city, "name", code), code));
                }
            }
            break;
        }
        SelectTag(ProxyCity, selectedCode.Length == 0 ? (source == "benefit" ? string.Empty : provinceCode) : selectedCode);
    }

    private static ComboBoxItem AreaItem(string label, string code) => new()
    {
        Content = label,
        Tag = code,
    };

    private async void OnTestFixedProxy(object sender, RoutedEventArgs e)
    {
        var address = FixedProxyAddress.Text;
        SetBusy(true, "正在测试固定代理");
        string result;
        string error = string.Empty;
        try
        {
            result = await ProxyService.TestFixedProxyAsync(address);
        }
        catch (Exception value)
        {
            result = string.Empty;
            error = value.Message;
        }

        SetBusy(false);
        if (error.Length > 0)
        {
            SetFooterError(error);
            return;
        }
        if (JsonNode.Parse(result) is not JsonObject state)
        {
            SetFooterError("后端响应格式无效");
            return;
        }
        var success = JsonFieldBool(state, "success");
        NetworkStatus.Title = success ? "固定代理可用" : "固定代理不可用";
        NetworkStatus.Message = JsonFieldStr(state, "message", string.Empty);
        NetworkStatus.Severity = success ? InfoBarSeverity.Success : InfoBarSeverity.Error;
        ProxyStatusSource.Text = "固定代理";
        ProxyStatusQuota.Text = "不适用";
        ProxyStatusPool.Text = success ? "1 个可用" : "不可用";
    }

    private async void OnTestCustomProxy(object sender, RoutedEventArgs e)
    {
        var url = CustomProxyApi.Text;
        SetBusy(true, "正在测试代理 API");
        string result;
        string error = string.Empty;
        try
        {
            result = await ProxyService.TestCustomProxyApiAsync(url);
        }
        catch (Exception value)
        {
            result = string.Empty;
            error = value.Message;
        }

        SetBusy(false);
        if (error.Length > 0)
        {
            SetFooterError(error);
            return;
        }
        if (JsonNode.Parse(result) is not JsonObject state)
        {
            SetFooterError("后端响应格式无效");
            return;
        }
        var success = JsonFieldBool(state, "success");
        NetworkStatus.Title = success ? "代理 API 可用" : "代理 API 不可用";
        NetworkStatus.Message = JsonFieldStr(state, "message", string.Empty);
        NetworkStatus.Severity = success ? InfoBarSeverity.Success : InfoBarSeverity.Error;
        ProxyStatusSource.Text = "自定义代理 API";
        ProxyStatusQuota.Text = "不适用";
        var count = (state["proxies"] as JsonArray)?.Count ?? 0;
        ProxyStatusPool.Text = success ? $"{count} 个可用" : "不可用";
    }

    private async void OnSyncProxy(object sender, RoutedEventArgs e)
    {
        var source = SelectedTag(ProxySource, "default");
        SetBusy(true, "正在同步代理状态");
        string result;
        string error = string.Empty;
        try
        {
            result = await ProxyService.SyncStatusAsync(source);
        }
        catch (Exception value)
        {
            result = string.Empty;
            error = value.Message;
        }

        SetBusy(false);
        if (error.Length > 0)
        {
            SetFooterError(error);
            return;
        }
        if (JsonNode.Parse(result) is not JsonObject state)
        {
            SetFooterError("后端响应格式无效");
            return;
        }
        ApplyProxyStatus(state);
    }

    private void ApplyProxyStatus(JsonObject state)
    {
        var source = JsonFieldStr(state, "source", SelectedTag(ProxySource, "default"));
        var message = JsonFieldStr(state, "message", string.Empty);
        ProxyStatusSource.Text = ProxySourceLabel(source);
        if (JsonFieldBool(state, "quotaKnown"))
        {
            ProxyStatusQuota.Text = $"剩余 {JsonFieldStr(state, "remainingQuota", "0")} / {JsonFieldStr(state, "totalQuota", "0")}";
        }
        else
        {
            ProxyStatusQuota.Text = "未知";
        }
        if (JsonFieldBool(state, "poolRemainingKnown"))
        {
            var remaining = (int)JsonFieldNumber(state, "poolRemainingIp", 0);
            ProxyStatusPool.Text = $"{remaining} 个可用 IP";
        }
        else
        {
            var available = (int)JsonFieldNumber(state, "available", 0);
            var inUse = (int)JsonFieldNumber(state, "inUse", 0);
            ProxyStatusPool.Text = available > 0 || inUse > 0
                ? $"{available} 个可用 / {inUse} 个使用中"
                : "未知";
        }
        var unavailable = message.Contains("失败") || message.Contains("已用完") || message.Contains("不可用");
        NetworkStatus.Title = unavailable ? "代理不可用" : "代理状态已同步";
        NetworkStatus.Message = message;
        NetworkStatus.Severity = unavailable ? InfoBarSeverity.Error : InfoBarSeverity.Success;
    }

    private void UpdateNetworkVisibility()
    {
        var mode = SelectedTag(ProxyMode, "direct");
        var source = SelectedTag(ProxySource, "default");
        FixedProxyRow.Visibility = mode == "fixed" ? Visibility.Visible : Visibility.Collapsed;
        ProxySourceRow.Visibility = mode == "random" ? Visibility.Visible : Visibility.Collapsed;
        CustomProxyRow.Visibility = mode == "random" && source == "custom" ? Visibility.Visible : Visibility.Collapsed;
        ProxyAreaRow.Visibility = mode == "random" && source != "custom" ? Visibility.Visible : Visibility.Collapsed;
        SyncProxyButton.Visibility = mode == "random" && source != "custom" ? Visibility.Visible : Visibility.Collapsed;
        if (mode == "direct")
        {
            NetworkStatus.Title = "直连";
            NetworkStatus.Message = "不使用代理访问问卷。";
            ProxyStatusSource.Text = "直连";
            ProxyStatusQuota.Text = "不适用";
            ProxyStatusPool.Text = "不适用";
        }
        else if (mode == "fixed")
        {
            NetworkStatus.Title = "固定代理";
            NetworkStatus.Message = "测试连接后再继续。";
            ProxyStatusSource.Text = "固定代理";
            ProxyStatusQuota.Text = "不适用";
            ProxyStatusPool.Text = "尚未测试";
        }
        else
        {
            NetworkStatus.Title = "随机 IP";
            NetworkStatus.Message = source == "custom" ? "测试代理 API 后再继续。" : "同步代理额度后再继续。";
            ProxyStatusSource.Text = ProxySourceLabel(source);
            ProxyStatusQuota.Text = source == "custom" ? "不适用" : "未知";
            ProxyStatusPool.Text = "未知";
        }
        NetworkStatus.Severity = InfoBarSeverity.Informational;
    }

    private static string ProxySourceLabel(string source) => source switch
    {
        "benefit" => "限时福利代理",
        "custom" => "自定义代理 API",
        _ => "默认代理",
    };

    private static string JsonFieldStr(JsonObject parent, string name, string fallback) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<string>(out var text) ? text : fallback;

    private static bool JsonFieldBool(JsonObject parent, string name, bool fallback = false) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<bool>(out var flag) ? flag : fallback;

    private static double JsonFieldNumber(JsonObject parent, string name, double fallback) =>
        parent[name] is System.Text.Json.Nodes.JsonValue value && value.TryGetValue<double>(out var number) ? number : fallback;
}
