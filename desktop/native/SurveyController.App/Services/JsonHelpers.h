#pragma once

namespace winrt::SurveyController::App::Services
{
    inline winrt::Windows::Data::Json::JsonArray GetJsonArray(
        winrt::Windows::Data::Json::JsonObject const& parent, wchar_t const* name) noexcept
    {
        try
        {
            if (!parent || !parent.HasKey(name)) return {};
            auto value = parent.GetNamedValue(name);
            return value.ValueType() == winrt::Windows::Data::Json::JsonValueType::Array
                ? value.GetArray() : winrt::Windows::Data::Json::JsonArray{};
        }
        catch (...)
        {
            return {};
        }
    }

    inline winrt::Windows::Data::Json::JsonObject GetJsonObject(
        winrt::Windows::Data::Json::JsonObject const& parent, wchar_t const* name) noexcept
    {
        try
        {
            if (!parent || !parent.HasKey(name)) return {};
            auto value = parent.GetNamedValue(name);
            return value.ValueType() == winrt::Windows::Data::Json::JsonValueType::Object
                ? value.GetObject() : winrt::Windows::Data::Json::JsonObject{};
        }
        catch (...)
        {
            return {};
        }
    }

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
