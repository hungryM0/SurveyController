#include "pch.h"
#include "IPUsageRow.h"

#if __has_include("IPUsageRow.g.cpp")
#include "IPUsageRow.g.cpp"
#endif

namespace winrt::SurveyController::App::implementation
{
    IPUsageRow::IPUsageRow(hstring const& label, double total, double maximum)
        : m_label(label), m_total(total), m_maximum(maximum > 0 ? maximum : 1)
    {
    }
}
