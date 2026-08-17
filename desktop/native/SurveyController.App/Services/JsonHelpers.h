#pragma once

namespace winrt::SurveyController::App::Services
{
    inline bool TryParseJsonObject(winrt::hstring const& json,
        winrt::Windows::Data::Json::JsonObject& value, winrt::hstring& error) noexcept
    {
        try
        {
            value = winrt::Windows::Data::Json::JsonObject::Parse(json);
            return true;
        }
        catch (winrt::hresult_error const& exception)
        {
            error = L"后端响应格式无效：" + exception.message();
        }
        catch (...)
        {
            error = L"后端响应格式无效";
        }
        return false;
    }
}
