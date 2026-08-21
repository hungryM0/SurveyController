#include "pch.h"
#include "StrategyEditor.xaml.h"
#include "ViewModels/OptionWeight.h"
#include "Services/JsonHelpers.h"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        using namespace Windows::Data::Json;

        JsonObject ConfiguredWeights(JsonObject const& strategy)
        {
            auto table = Services::GetJsonObject(strategy, L"custom_weights");
            if (Services::GetJsonArray(table, L"options").Size() > 0 ||
                Services::GetJsonArray(table, L"rows").Size() > 0) return table;
            return Services::GetJsonObject(strategy, L"probabilities");
        }

        hstring PercentText(double value)
        {
            std::wostringstream output;
            if (std::abs(value - std::round(value)) < 0.05)
            {
                output << static_cast<int32_t>(std::round(value));
            }
            else
            {
                output << std::fixed << std::setprecision(1) << value;
            }
            output << L'%';
            return hstring{ output.str() };
        }

        double SliderNumber(hstring const& value, double fallback)
        {
            try
            {
                size_t parsed{};
                auto text = std::wstring{ value };
                auto result = std::stod(text, &parsed);
                return parsed == text.size() && std::isfinite(result) ? result : fallback;
            }
            catch (...) { return fallback; }
        }

        hstring NumberText(double value)
        {
            std::wostringstream output;
            if (std::abs(value - std::round(value)) < 0.0001) output << static_cast<int64_t>(std::llround(value));
            else output << std::fixed << std::setprecision(2) << value;
            return hstring{ output.str() };
        }
    }

    void StrategyEditor::RebuildWeightEditor(JsonObject const& question, JsonObject const& strategy,
        hstring const& normalizedType)
    {
        m_syncingWeights = true;
        m_weightOptions.Clear();
        m_weightLabels.clear();

        auto isTextQuestion = normalizedType == L"text" || normalizedType == L"multi_text" || normalizedType == L"location";
        auto optionTexts = Services::GetJsonArray(question, L"option_texts");
        auto weightTable = ConfiguredWeights(strategy);
        auto optionWeights = Services::GetJsonArray(weightTable, L"options");
        auto rowWeights = Services::GetJsonArray(weightTable, L"rows");
        auto optionCount = static_cast<uint32_t>((std::max)(0.0,
            strategy.GetNamedNumber(L"option_count", question.GetNamedNumber(L"options", 0))));
        optionCount = (std::max)(optionCount, optionTexts.Size());
        optionCount = (std::max)(optionCount, optionWeights.Size());
        for (auto const& row : rowWeights)
        {
            if (row.ValueType() == JsonValueType::Array) optionCount = (std::max)(optionCount, row.GetArray().Size());
        }
        if (isTextQuestion || normalizedType == L"unsupported") optionCount = 0;
        if (normalizedType == L"slider") optionCount = 1;

        auto rowTexts = Services::GetJsonArray(question, L"row_texts");
        auto rowCount = static_cast<uint32_t>((std::max)(0.0,
            strategy.GetNamedNumber(L"rows", question.GetNamedNumber(L"rows", 0))));
        rowCount = (std::max)(rowCount, rowTexts.Size());
        rowCount = (std::max)(rowCount, rowWeights.Size());
        auto matrix = normalizedType == L"matrix";
        m_weightRows = matrix && rowCount > 0 ? rowCount : 1;
        m_weightColumns = optionCount;

        m_multipleWeights = normalizedType == L"multiple";
        m_sliderValue = normalizedType == L"slider";
        Bias().Visibility(m_sliderValue ? Microsoft::UI::Xaml::Visibility::Collapsed : Microsoft::UI::Xaml::Visibility::Visible);
        OptionWeightsSection().Visibility(optionCount > 0
            ? Microsoft::UI::Xaml::Visibility::Visible
            : Microsoft::UI::Xaml::Visibility::Collapsed);
        OptionWeightEmpty().Visibility(optionCount == 0
            ? Microsoft::UI::Xaml::Visibility::Visible
            : Microsoft::UI::Xaml::Visibility::Collapsed);

        auto minimum = m_sliderValue ? SliderNumber(question.GetNamedString(L"slider_min", L"0"), 0) : 0.0;
        auto maximum = m_sliderValue ? SliderNumber(question.GetNamedString(L"slider_max", L"100"), 100)
            : (m_multipleWeights ? 100.0 : 50.0);
        if (maximum < minimum) std::swap(minimum, maximum);
        auto step = m_sliderValue ? SliderNumber(question.GetNamedString(L"slider_step", L"1"), 1) : 1.0;
        if (step <= 0) step = 1;
        auto defaultValue = m_sliderValue ? (minimum + maximum) / 2.0 : (m_multipleWeights ? 50.0 : 1.0);
        for (uint32_t rowIndex = 0; rowIndex < m_weightRows; ++rowIndex)
        {
            auto configuredRow = rowIndex < rowWeights.Size() && rowWeights.GetAt(rowIndex).ValueType() == JsonValueType::Array
                ? rowWeights.GetArrayAt(rowIndex) : JsonArray{};
            auto rowLabel = rowIndex < rowTexts.Size() ? rowTexts.GetStringAt(rowIndex)
                : hstring{ L"矩阵行 " + std::to_wstring(rowIndex + 1) };
            for (uint32_t optionIndex = 0; optionIndex < optionCount; ++optionIndex)
            {
                auto optionLabel = m_sliderValue ? hstring{ L"滑块值" } : optionIndex < optionTexts.Size()
                    ? optionTexts.GetStringAt(optionIndex)
                    : hstring{ L"选项 " + std::to_wstring(optionIndex + 1) };
                if (optionLabel.empty()) optionLabel = hstring{ L"选项 " + std::to_wstring(optionIndex + 1) };
                auto label = m_weightRows > 1
                    ? hstring{ std::wstring{ rowLabel } + L" · " + std::wstring{ optionLabel } }
                    : optionLabel;
                m_weightLabels.push_back(label);
                auto values = m_weightRows > 1 ? configuredRow : optionWeights;
                auto value = optionIndex < values.Size() && values.GetAt(optionIndex).ValueType() == JsonValueType::Number
                    ? values.GetNumberAt(optionIndex) : defaultValue;
                value = (std::max)(minimum, (std::min)(maximum, value));
                value = minimum + std::round((value - minimum) / step) * step;
                value = (std::max)(minimum, (std::min)(maximum, value));
                auto option = winrt::make<implementation::OptionWeight>(label, value, minimum, maximum, step);
                auto weak = get_weak();
                option.PropertyChanged([weak](auto const&, auto const&)
                {
                    if (auto self = weak.get(); self && !self->m_syncingWeights)
                    {
                        self->m_currentQuestionDirty = true;
                        self->SelectTag(self->Bias(), L"custom");
                        self->UpdateRatioPreview();
                    }
                });
                m_weightOptions.Append(option);
            }
        }
        m_syncingWeights = false;
        UpdateRatioPreview();
    }

    Windows::Foundation::Collections::IObservableVector<SurveyController::App::OptionWeight>
        StrategyEditor::WeightOptions()
    {
        return m_weightOptions;
    }

    void StrategyEditor::OnBiasChanged(IInspectable const&,
        Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&)
    {
        if (!m_initialized || m_syncingWeights) return;
        m_currentQuestionDirty = true;
        auto bias = SelectedTag(Bias(), L"custom");
        if (bias != L"custom") ApplyBiasPreset(bias);
    }

    void StrategyEditor::ApplyBiasPreset(hstring const& bias)
    {
        if (m_sliderValue) return;
        auto columns = m_weightColumns;
        if (columns == 0) return;
        std::vector<double> raw(columns, 1.0);
        if (columns > 1)
        {
            auto center = static_cast<double>(columns - 1) / 2.0;
            for (size_t index = 0; index < columns; ++index)
            {
                auto position = static_cast<double>(index) / static_cast<double>(columns - 1);
                auto base = bias == L"left" ? 1.0 - position : position;
                if (bias == L"center") base = 1.0 - std::abs(static_cast<double>(index) - center) / center;
                raw[index] = std::pow((std::max)(0.0, base), bias == L"center" ? 3.0 : 8.0);
            }
        }
        auto maximum = *std::max_element(raw.begin(), raw.end());
        auto scale = m_multipleWeights ? 100.0 : 50.0;
        for (uint32_t row = 0; row < m_weightRows; ++row)
        {
            for (uint32_t index = 0; index < columns; ++index)
            {
                auto value = maximum > 0 ? std::round(raw[index] / maximum * scale) : std::round(scale / columns);
                m_weightOptions.GetAt(row * columns + index).Value(value);
            }
        }
    }

    Windows::Data::Json::JsonArray StrategyEditor::WeightValues() const
    {
        Windows::Data::Json::JsonArray values;
        for (auto const& option : m_weightOptions)
        {
            auto value = option.Value();
            values.Append(Windows::Data::Json::JsonValue::CreateNumberValue(std::isnan(value) ? 0 : value));
        }
        return values;
    }

    Windows::Data::Json::JsonObject StrategyEditor::WeightTable() const
    {
        Windows::Data::Json::JsonObject table;
        auto values = WeightValues();
        if (m_weightRows <= 1)
        {
            table.SetNamedValue(L"options", values);
            return table;
        }
        Windows::Data::Json::JsonArray rows;
        for (uint32_t row = 0; row < m_weightRows; ++row)
        {
            Windows::Data::Json::JsonArray rowValues;
            for (uint32_t column = 0; column < m_weightColumns; ++column)
            {
                rowValues.Append(values.GetAt(row * m_weightColumns + column));
            }
            rows.Append(rowValues);
        }
        table.SetNamedValue(L"rows", rows);
        return table;
    }

    void StrategyEditor::UpdateRatioPreview()
    {
        if (m_weightOptions.Size() == 0)
        {
            RatioPreview().Text(L"");
            return;
        }
        if (m_sliderValue)
        {
            RatioPreview().Text(hstring{ L"预计值：" + std::wstring{ NumberText(m_weightOptions.GetAt(0).Value()) } });
            return;
        }
        std::vector<double> values;
        values.reserve(m_weightOptions.Size());
        for (auto const& option : m_weightOptions)
        {
            auto value = std::isnan(option.Value()) ? 0 : (std::max)(0.0, option.Value());
            values.push_back(value);
        }

        std::wstring preview;
        auto columns = (std::max)(1u, m_weightColumns);
        for (uint32_t row = 0; row < m_weightRows; ++row)
        {
            if (row > 0) preview += L"\n";
            preview += m_multipleWeights ? L"命中率：" : L"预计占比：";
            double rowTotal = 0;
            for (uint32_t column = 0; column < columns; ++column) rowTotal += values[row * columns + column];
            for (uint32_t column = 0; column < columns; ++column)
            {
                auto index = row * columns + column;
                if (column > 0) preview += L" | ";
                std::wstring label{ m_weightLabels[index] };
                if (label.size() > 14) label = label.substr(0, 14) + L"…";
                auto percent = m_multipleWeights ? values[index]
                    : (rowTotal > 0 ? values[index] / rowTotal * 100.0 : 100.0 / columns);
                preview += label + L" " + std::wstring{ PercentText(percent) };
            }
        }
        RatioPreview().Text(hstring{ preview });
    }
}
