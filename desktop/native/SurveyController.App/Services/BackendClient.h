#pragma once

namespace winrt::SurveyController::App::Services
{
    class BackendClient final
    {
    public:
        BackendClient() = default;
        ~BackendClient();

        static BackendClient& Current();

        BackendClient(BackendClient const&) = delete;
        BackendClient& operator=(BackendClient const&) = delete;

        void Start();
        winrt::hstring Call(winrt::hstring const& method, winrt::hstring const& params = L"null");

    private:
        winrt::handle m_process;
        winrt::handle m_stdinWrite;
        winrt::handle m_stdoutRead;
        std::atomic_uint64_t m_nextRequestId{ 1 };
        std::mutex m_callMutex;

        static std::wstring BackendPath();
        static void ReadExact(HANDLE handle, void* buffer, std::uint32_t size);
        static void WriteExact(HANDLE handle, void const* buffer, std::uint32_t size);
    };
}
