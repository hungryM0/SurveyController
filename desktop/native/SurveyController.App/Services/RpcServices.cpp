#include "pch.h"
#include "RpcServices.h"
#include "BackendClient.h"

namespace winrt::SurveyController::App::Services
{
    namespace
    {
        hstring StringRequest(wchar_t const* key, hstring const& value)
        {
            Windows::Data::Json::JsonObject request;
            request.SetNamedValue(key, Windows::Data::Json::JsonValue::CreateStringValue(value));
            return request.Stringify();
        }
    }

    Windows::Foundation::IAsyncOperation<hstring> SettingsService::LoadAsync() const
    { co_return co_await BackendClient::Current().CallAsync(L"GetAppSettings"); }
    Windows::Foundation::IAsyncOperation<hstring> SettingsService::SaveAsync(hstring request) const
    { co_return co_await BackendClient::Current().CallAsync(L"SaveAppSettings", request); }
    Windows::Foundation::IAsyncOperation<hstring> SettingsService::ResetAsync() const
    { co_return co_await BackendClient::Current().CallAsync(L"ResetAppSettings"); }

    Windows::Foundation::IAsyncOperation<hstring> ConfigService::LoadAsync(hstring path) const
    { co_return co_await BackendClient::Current().CallAsync(L"LoadConfig", path.empty() ? L"{}" : StringRequest(L"path", path)); }
    Windows::Foundation::IAsyncOperation<hstring> ConfigService::SaveAsync(hstring request) const
    { co_return co_await BackendClient::Current().CallAsync(L"SaveConfig", request); }
    Windows::Foundation::IAsyncOperation<hstring> ConfigService::CreateSurveyAsync(hstring url) const
    { co_return co_await BackendClient::Current().CallAsync(L"CreateSurveyDocument", StringRequest(L"url", url)); }
    Windows::Foundation::IAsyncOperation<hstring> ConfigService::DecodeQrCodeAsync(hstring path) const
    { co_return co_await BackendClient::Current().CallAsync(L"DecodeQRCode", StringRequest(L"path", path)); }

    Windows::Foundation::IAsyncOperation<hstring> TaskService::CheckAsync(hstring request) const
    { co_return co_await BackendClient::Current().CallAsync(L"CheckTask", request); }
    Windows::Foundation::IAsyncOperation<hstring> TaskService::StartAsync(hstring request) const
    { co_return co_await BackendClient::Current().CallAsync(L"StartRun", request); }
    Windows::Foundation::IAsyncOperation<hstring> TaskService::StateAsync(hstring runId, std::uint64_t afterSequence) const
    {
        Windows::Data::Json::JsonObject request;
        request.SetNamedValue(L"runId", Windows::Data::Json::JsonValue::CreateStringValue(runId));
        request.SetNamedValue(L"afterSequence", Windows::Data::Json::JsonValue::CreateNumberValue(static_cast<double>(afterSequence)));
        co_return co_await BackendClient::Current().CallAsync(L"GetRunTaskState", request.Stringify(), std::chrono::seconds{ 5 });
    }
    Windows::Foundation::IAsyncOperation<hstring> TaskService::PauseAsync(hstring reason) const
    { co_return co_await BackendClient::Current().CallAsync(L"PauseRun", StringRequest(L"value", reason)); }
    Windows::Foundation::IAsyncOperation<hstring> TaskService::ResumeAsync() const
    { co_return co_await BackendClient::Current().CallAsync(L"ResumeRun"); }
    Windows::Foundation::IAsyncOperation<hstring> TaskService::StopAsync() const
    { co_return co_await BackendClient::Current().CallAsync(L"CancelRun"); }
    Windows::Foundation::IAsyncOperation<hstring> TaskService::ExportAsync(hstring path, Windows::Data::Json::JsonArray lines) const
    {
        Windows::Data::Json::JsonObject request;
        request.SetNamedValue(L"path", Windows::Data::Json::JsonValue::CreateStringValue(path));
        request.SetNamedValue(L"lines", lines);
        co_return co_await BackendClient::Current().CallAsync(L"ExportLogLines", request.Stringify());
    }
    Windows::Foundation::IAsyncOperation<hstring> TaskService::TestAiAsync(Windows::Data::Json::JsonObject profile) const
    {
        Windows::Data::Json::JsonObject request;
        request.SetNamedValue(L"aiProfile", profile);
        co_return co_await BackendClient::Current().CallAsync(L"TestAIConnection", request.Stringify());
    }

    Windows::Foundation::IAsyncOperation<hstring> ProxyService::AreasAsync(hstring source) const
    { co_return co_await BackendClient::Current().CallAsync(L"GetProxyAreaOptions", StringRequest(L"value", source)); }
    Windows::Foundation::IAsyncOperation<hstring> ProxyService::TestFixedAsync(hstring address) const
    { co_return co_await BackendClient::Current().CallAsync(L"TestFixedProxy", StringRequest(L"address", address)); }
    Windows::Foundation::IAsyncOperation<hstring> ProxyService::TestCustomAsync(hstring url) const
    { co_return co_await BackendClient::Current().CallAsync(L"TestCustomProxyAPI", StringRequest(L"url", url)); }
    Windows::Foundation::IAsyncOperation<hstring> ProxyService::SyncAsync(hstring source) const
    { co_return co_await BackendClient::Current().CallAsync(L"SyncProxyStatus", StringRequest(L"value", source)); }

    Windows::Foundation::IAsyncOperation<hstring> CommunityService::CheckUpdateAsync(hstring currentVersion) const
    { co_return co_await BackendClient::Current().CallAsync(L"CheckUpdate", StringRequest(L"currentVersion", currentVersion)); }
    Windows::Foundation::IAsyncOperation<hstring> CommunityService::IpUsageAsync() const
    { co_return co_await BackendClient::Current().CallAsync(L"GetIPUsageSummary"); }
}
