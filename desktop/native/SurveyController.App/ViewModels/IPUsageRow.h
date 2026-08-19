#pragma once

#include "IPUsageRow.g.h"

namespace winrt::SurveyController::App::implementation
{
    struct IPUsageRow : IPUsageRowT<IPUsageRow>
    {
        IPUsageRow(hstring const& label, double total, double maximum);
        hstring Label() const { return m_label; }
        double Total() const { return m_total; }
        double Maximum() const { return m_maximum; }
        hstring CountText() const { return to_hstring(static_cast<int64_t>(m_total)) + L" 个"; }

    private:
        hstring m_label;
        double m_total{};
        double m_maximum{ 1 };
    };
}

namespace winrt::SurveyController::App::factory_implementation
{
    struct IPUsageRow : IPUsageRowT<IPUsageRow, implementation::IPUsageRow> {};
}
