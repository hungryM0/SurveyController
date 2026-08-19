#pragma once

namespace winrt::SurveyController::App::Services
{
    struct SettingsService
    {
        Windows::Foundation::IAsyncOperation<hstring> LoadAsync() const;
        Windows::Foundation::IAsyncOperation<hstring> SaveAsync(hstring request) const;
        Windows::Foundation::IAsyncOperation<hstring> ResetAsync() const;
    };

    struct ConfigService
    {
        Windows::Foundation::IAsyncOperation<hstring> LoadAsync(hstring path = L"") const;
        Windows::Foundation::IAsyncOperation<hstring> SaveAsync(hstring request) const;
        Windows::Foundation::IAsyncOperation<hstring> CreateSurveyAsync(hstring url) const;
        Windows::Foundation::IAsyncOperation<hstring> DecodeQrCodeAsync(hstring path) const;
    };

    struct TaskService
    {
        Windows::Foundation::IAsyncOperation<hstring> CheckAsync(hstring request) const;
        Windows::Foundation::IAsyncOperation<hstring> StartAsync(hstring request) const;
        Windows::Foundation::IAsyncOperation<hstring> StateAsync(hstring runId, std::uint64_t afterSequence) const;
        Windows::Foundation::IAsyncOperation<hstring> PauseAsync(hstring reason) const;
        Windows::Foundation::IAsyncOperation<hstring> ResumeAsync() const;
        Windows::Foundation::IAsyncOperation<hstring> StopAsync() const;
        Windows::Foundation::IAsyncOperation<hstring> ExportAsync(hstring path, Windows::Data::Json::JsonArray lines) const;
        Windows::Foundation::IAsyncOperation<hstring> TestAiAsync(Windows::Data::Json::JsonObject profile) const;
    };

    struct ProxyService
    {
        Windows::Foundation::IAsyncOperation<hstring> AreasAsync(hstring source) const;
        Windows::Foundation::IAsyncOperation<hstring> TestFixedAsync(hstring address) const;
        Windows::Foundation::IAsyncOperation<hstring> TestCustomAsync(hstring url) const;
        Windows::Foundation::IAsyncOperation<hstring> SyncAsync(hstring source) const;
    };

    struct CommunityService
    {
        Windows::Foundation::IAsyncOperation<hstring> CheckUpdateAsync(hstring currentVersion) const;
        Windows::Foundation::IAsyncOperation<hstring> IpUsageAsync() const;
    };
}
