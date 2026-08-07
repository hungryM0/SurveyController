#pragma once

#include <functional>

namespace winrt::SurveyController::App::Services
{
    class ShellSettings final
    {
    public:
        static ShellSettings& Current();

        hstring Json() const { return m_json; }
        void Update(hstring const& json);
        void SetChangedHandler(std::function<void(hstring const&)> handler);

    private:
        hstring m_json;
        std::function<void(hstring const&)> m_changed;
    };
}
