#include "pch.h"
#include "ShellSettings.h"

namespace winrt::SurveyController::App::Services
{
    ShellSettings& ShellSettings::Current()
    {
        static ShellSettings instance;
        return instance;
    }

    void ShellSettings::Update(hstring const& json)
    {
        m_json = json;
        if (m_changed) m_changed(m_json);
    }

    void ShellSettings::SetChangedHandler(std::function<void(hstring const&)> handler)
    {
        m_changed = std::move(handler);
        if (m_changed && !m_json.empty()) m_changed(m_json);
    }
}
