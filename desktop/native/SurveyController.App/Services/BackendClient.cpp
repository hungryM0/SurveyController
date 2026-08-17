#include "pch.h"
#include "BackendClient.h"
#include "JsonHelpers.h"

#include <array>
#include <filesystem>
#include <vector>

namespace winrt::SurveyController::App::Services
{
    namespace
    {
        constexpr std::uint32_t maxFrameSize = 16U << 20;

        [[noreturn]] void ThrowLastError(wchar_t const* operation)
        {
            throw winrt::hresult_error(HRESULT_FROM_WIN32(GetLastError()), operation);
        }
    }

    BackendClient& BackendClient::Current()
    {
        static BackendClient client;
        return client;
    }

    BackendClient::~BackendClient()
    {
        m_stdinWrite.close();
        if (!m_process)
        {
            return;
        }
        if (WaitForSingleObject(m_process.get(), 2000) == WAIT_TIMEOUT)
        {
            TerminateProcess(m_process.get(), ERROR_PROCESS_ABORTED);
            WaitForSingleObject(m_process.get(), 1000);
        }
    }

    void BackendClient::Start()
    {
        if (m_process)
        {
            return;
        }

        SECURITY_ATTRIBUTES security{ sizeof(security), nullptr, TRUE };
        winrt::handle childStdinRead;
        winrt::handle childStdoutWrite;
        winrt::handle childStderr;
        if (!CreatePipe(childStdinRead.put(), m_stdinWrite.put(), &security, 0) ||
            !CreatePipe(m_stdoutRead.put(), childStdoutWrite.put(), &security, 0))
        {
            ThrowLastError(L"创建后端管道失败");
        }
        if (!SetHandleInformation(m_stdinWrite.get(), HANDLE_FLAG_INHERIT, 0) ||
            !SetHandleInformation(m_stdoutRead.get(), HANDLE_FLAG_INHERIT, 0))
        {
            ThrowLastError(L"配置后端管道失败");
        }
        childStderr.attach(CreateFileW(
            L"NUL", GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, &security,
            OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr));
        if (!childStderr)
        {
            ThrowLastError(L"打开后端错误输出失败");
        }

        SIZE_T attributeBytes = 0;
        InitializeProcThreadAttributeList(nullptr, 1, 0, &attributeBytes);
        std::vector<std::byte> attributeStorage(attributeBytes);
        auto attributes = reinterpret_cast<PPROC_THREAD_ATTRIBUTE_LIST>(attributeStorage.data());
        if (!InitializeProcThreadAttributeList(attributes, 1, 0, &attributeBytes))
        {
            ThrowLastError(L"初始化后端句柄列表失败");
        }
        struct AttributeListGuard
        {
            PPROC_THREAD_ATTRIBUTE_LIST value;
            ~AttributeListGuard() { DeleteProcThreadAttributeList(value); }
        } attributeGuard{ attributes };

        std::array<HANDLE, 3> inheritedHandles{
            childStdinRead.get(), childStdoutWrite.get(), childStderr.get()
        };
        if (!UpdateProcThreadAttribute(
            attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
            inheritedHandles.data(), sizeof(inheritedHandles), nullptr, nullptr))
        {
            ThrowLastError(L"限制后端继承句柄失败");
        }

        STARTUPINFOEXW startup{};
        startup.StartupInfo.cb = sizeof(startup);
        startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
        startup.StartupInfo.hStdInput = childStdinRead.get();
        startup.StartupInfo.hStdOutput = childStdoutWrite.get();
        startup.StartupInfo.hStdError = childStderr.get();
        startup.lpAttributeList = attributes;

        auto path = BackendPath();
        auto commandLine = L"\"" + path + L"\"";
        PROCESS_INFORMATION process{};
        if (!CreateProcessW(
            path.c_str(), commandLine.data(), nullptr, nullptr, TRUE,
            EXTENDED_STARTUPINFO_PRESENT | CREATE_NO_WINDOW,
            nullptr, nullptr, &startup.StartupInfo, &process))
        {
            ThrowLastError(L"启动 SurveyController 后端失败");
        }
        CloseHandle(process.hThread);
        m_process.attach(process.hProcess);
    }

    winrt::hstring BackendClient::Call(winrt::hstring const& method, winrt::hstring const& params)
    {
        std::scoped_lock lock(m_callMutex);
        if (!m_process)
        {
            throw winrt::hresult_error(E_UNEXPECTED, L"后端尚未启动");
        }

        auto requestId = m_nextRequestId.fetch_add(1);
        winrt::Windows::Data::Json::JsonObject request;
        request.Insert(L"id", winrt::Windows::Data::Json::JsonValue::CreateNumberValue(static_cast<double>(requestId)));
        request.Insert(L"method", winrt::Windows::Data::Json::JsonValue::CreateStringValue(method));
        request.Insert(L"params", winrt::Windows::Data::Json::JsonValue::Parse(params));
        auto payload = winrt::to_string(request.Stringify());
        if (payload.empty() || payload.size() > maxFrameSize)
        {
            throw winrt::hresult_error(E_INVALIDARG, L"RPC 请求大小无效");
        }
        auto requestSize = static_cast<std::uint32_t>(payload.size());
        WriteExact(m_stdinWrite.get(), &requestSize, sizeof(requestSize));
        WriteExact(m_stdinWrite.get(), payload.data(), requestSize);

        std::uint32_t responseSize = 0;
        ReadExact(m_stdoutRead.get(), &responseSize, sizeof(responseSize));
        if (responseSize == 0 || responseSize > maxFrameSize)
        {
            throw winrt::hresult_error(E_FAIL, L"RPC 响应大小无效");
        }
        std::string responsePayload(responseSize, '\0');
        ReadExact(m_stdoutRead.get(), responsePayload.data(), responseSize);
        winrt::Windows::Data::Json::JsonObject response;
        winrt::hstring parseError;
        if (!TryParseJsonObject(winrt::to_hstring(responsePayload), response, parseError))
        {
            throw winrt::hresult_error(E_FAIL, parseError);
        }
        auto responseId = static_cast<std::uint64_t>(response.GetNamedNumber(L"id"));
        if (responseId != requestId)
        {
            throw winrt::hresult_error(E_FAIL, L"RPC 响应编号不匹配");
        }
        if (response.HasKey(L"error"))
        {
            auto errorValue = response.GetNamedValue(L"error");
            if (errorValue.ValueType() != winrt::Windows::Data::Json::JsonValueType::Null)
            {
                auto error = errorValue.GetObject();
                throw winrt::hresult_error(E_FAIL, error.GetNamedString(L"message", L"后端调用失败"));
            }
        }
        return response.GetNamedValue(L"result").Stringify();
    }

    std::wstring BackendClient::BackendPath()
    {
        std::wstring modulePath(32768, L'\0');
        auto length = GetModuleFileNameW(nullptr, modulePath.data(), static_cast<DWORD>(modulePath.size()));
        if (length == 0 || length == modulePath.size())
        {
            ThrowLastError(L"读取应用路径失败");
        }
        modulePath.resize(length);
        return (std::filesystem::path(modulePath).parent_path() / L"SurveyController.Backend.exe").wstring();
    }

    void BackendClient::ReadExact(HANDLE handle, void* buffer, std::uint32_t size)
    {
        auto bytes = static_cast<std::byte*>(buffer);
        std::uint32_t offset = 0;
        while (offset < size)
        {
            DWORD read = 0;
            if (!ReadFile(handle, bytes + offset, size - offset, &read, nullptr))
            {
                ThrowLastError(L"读取后端响应失败");
            }
            if (read == 0)
            {
                throw winrt::hresult_error(HRESULT_FROM_WIN32(ERROR_BROKEN_PIPE), L"后端响应提前结束");
            }
            offset += read;
        }
    }

    void BackendClient::WriteExact(HANDLE handle, void const* buffer, std::uint32_t size)
    {
        auto bytes = static_cast<std::byte const*>(buffer);
        std::uint32_t offset = 0;
        while (offset < size)
        {
            DWORD written = 0;
            if (!WriteFile(handle, bytes + offset, size - offset, &written, nullptr))
            {
                ThrowLastError(L"写入后端请求失败");
            }
            if (written == 0)
            {
                throw winrt::hresult_error(HRESULT_FROM_WIN32(ERROR_WRITE_FAULT), L"后端请求未写入");
            }
            offset += written;
        }
    }
}
