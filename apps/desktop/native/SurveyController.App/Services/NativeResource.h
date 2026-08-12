#pragma once

#include <objbase.h>

namespace winrt::SurveyController::App::Services
{
    class CoTaskMemString final
    {
    public:
        CoTaskMemString() = default;
        ~CoTaskMemString() noexcept { ::CoTaskMemFree(m_value); }

        CoTaskMemString(CoTaskMemString const&) = delete;
        CoTaskMemString& operator=(CoTaskMemString const&) = delete;

        PWSTR* put() noexcept
        {
            ::CoTaskMemFree(m_value);
            m_value = nullptr;
            return &m_value;
        }

        PWSTR get() const noexcept { return m_value; }

    private:
        PWSTR m_value{};
    };
}
