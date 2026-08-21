#pragma once

#include "OptionWeight.g.h"

namespace winrt::SurveyController::App::implementation
{
    struct OptionWeight : OptionWeightT<OptionWeight>
    {
        OptionWeight(hstring const& label, double value, double minimum, double maximum, double step);

        hstring Label() const;
        double Value() const;
        void Value(double value);
        double Minimum() const;
        double Maximum() const;
        double Step() const;

        winrt::event_token PropertyChanged(
            Microsoft::UI::Xaml::Data::PropertyChangedEventHandler const& handler);
        void PropertyChanged(winrt::event_token const& token) noexcept;

    private:
        hstring m_label;
        double m_value{};
        double m_minimum{};
        double m_maximum{};
        double m_step{ 1 };
        winrt::event<Microsoft::UI::Xaml::Data::PropertyChangedEventHandler> m_propertyChanged;
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct OptionWeight : OptionWeightT<OptionWeight, implementation::OptionWeight>
    {
    };
}
