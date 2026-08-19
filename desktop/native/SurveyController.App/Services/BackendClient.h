#pragma once

#include <condition_variable>

namespace winrt::SurveyController::App::Services
{
    enum class BackendState { Stopped, Starting, Running, Stopping };
    struct RpcSession;

    class BackendClient final
    {
    public:
        BackendClient() = default;
        ~BackendClient();
        static BackendClient& Current();
        BackendClient(BackendClient const&) = delete;
        BackendClient& operator=(BackendClient const&) = delete;

        void Start();
        void ShutdownImmediate() noexcept;
        void Shutdown() noexcept { ShutdownImmediate(); }
        BackendState State() const noexcept;
        winrt::hstring Call(winrt::hstring const& method, winrt::hstring const& params = L"null",
            std::chrono::milliseconds timeout = std::chrono::seconds{ 15 });
        winrt::Windows::Foundation::IAsyncOperation<winrt::hstring> CallAsync(
            winrt::hstring method, winrt::hstring params = L"null",
            std::chrono::milliseconds timeout = std::chrono::seconds{ 15 });

        static std::string BuildRequestPayload(std::uint64_t requestId,
            winrt::hstring const& method, winrt::hstring const& params);
        static winrt::hstring ParseResponsePayload(std::uint64_t requestId, std::string const& payload);

    private:
        mutable std::mutex m_stateMutex;
        std::condition_variable m_stateChanged;
        BackendState m_state{ BackendState::Stopped };
        std::shared_ptr<RpcSession> m_session;
        std::atomic_uint64_t m_nextRequestId{ 1 };

        std::shared_ptr<RpcSession> AcquireSession();
        void MarkSessionFailed(std::shared_ptr<RpcSession> const& session) noexcept;
        static std::shared_ptr<RpcSession> CreateSession();
        static std::wstring BackendPath();
        static void ReadExact(HANDLE handle, void* buffer, std::uint32_t size);
        static void WriteExact(HANDLE handle, void const* buffer, std::uint32_t size);
    };
}
