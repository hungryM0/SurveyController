#include "pch.h"
#include "OptionWeight.h"

#if __has_include("OptionWeight.g.cpp")
#include "OptionWeight.g.cpp"
#endif

namespace winrt::SurveyController::App::implementation
{
    OptionWeight::OptionWeight(hstring const& label, double value, double minimum, double maximum, double step)
        : m_label(label), m_value(value), m_minimum(minimum), m_maximum(maximum), m_step(step)
    {
    }

    hstring OptionWeight::Label() const
    {
        return m_label;
    }

    double OptionWeight::Value() const
    {
        return m_value;
    }

    void OptionWeight::Value(double value)
    {
        if (m_value == value) return;
        m_value = value;
        m_propertyChanged(*this, Microsoft::UI::Xaml::Data::PropertyChangedEventArgs{ L"Value" });
    }

    double OptionWeight::Minimum() const
    {
        return m_minimum;
    }

    double OptionWeight::Maximum() const
    {
        return m_maximum;
    }

    double OptionWeight::Step() const
    {
        return m_step;
    }

    winrt::event_token OptionWeight::PropertyChanged(
        Microsoft::UI::Xaml::Data::PropertyChangedEventHandler const& handler)
    {
        return m_propertyChanged.add(handler);
    }

    void OptionWeight::PropertyChanged(winrt::event_token const& token) noexcept
    {
        m_propertyChanged.remove(token);
    }
}
