#include "pch.h"
#include "StrategyEditor.xaml.h"
#include "Services/UiMotion.h"

#include <winrt/Microsoft.UI.Xaml.Automation.h>

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <sstream>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        using namespace Windows::Data::Json;

        JsonArray ConfiguredWeights(JsonObject const& strategy)
        {
            auto values = strategy.GetNamedObject(L"custom_weights", JsonObject{}).GetNamedArray(L"options", JsonArray{});
            if (values.Size() > 0) return values;
            return strategy.GetNamedObject(L"probabilities", JsonObject{}).GetNamedArray(L"options", JsonArray{});
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
    }

    void StrategyEditor::RebuildWeightEditor(JsonObject const& question, JsonObject const& strategy)
    {
        using namespace Microsoft::UI::Xaml;
        using namespace Microsoft::UI::Xaml::Controls;

        m_syncingWeights = true;
        OptionWeightRows().Children().Clear();
        m_weightSliders.clear();
        m_weightInputs.clear();
        m_weightLabels.clear();

        auto questionType = strategy.GetNamedString(L"question_type", L"");
        auto isTextQuestion = questionType == L"text" || questionType == L"multi_text"
            || question.GetNamedBoolean(L"is_location", false);
        auto optionTexts = question.GetNamedArray(L"option_texts", JsonArray{});
        auto weights = ConfiguredWeights(strategy);
        auto optionCount = static_cast<uint32_t>((std::max)(0.0,
            strategy.GetNamedNumber(L"option_count", question.GetNamedNumber(L"options", 0))));
        optionCount = (std::max)(optionCount, optionTexts.Size());
        optionCount = (std::max)(optionCount, weights.Size());
        if (isTextQuestion) optionCount = 0;

        m_multipleWeights = questionType == L"multiple";
        Services::SetVisibility(OptionWeightsSection(), optionCount > 0);
        Services::SetVisibility(OptionWeightEmpty(), optionCount == 0);

        auto maximum = m_multipleWeights ? 100.0 : 50.0;
        auto defaultValue = m_multipleWeights ? 50.0 : 1.0;
        auto weak = get_weak();
        for (uint32_t optionIndex = 0; optionIndex < optionCount; ++optionIndex)
        {
            auto label = optionIndex < optionTexts.Size()
                ? optionTexts.GetStringAt(optionIndex)
                : hstring{ L"选项 " + std::to_wstring(optionIndex + 1) };
            if (label.empty()) label = hstring{ L"选项 " + std::to_wstring(optionIndex + 1) };
            m_weightLabels.push_back(label);

            StackPanel row;
            row.Spacing(6);

            TextBlock optionLabel;
            optionLabel.Text(hstring{ std::to_wstring(optionIndex + 1) + L". " + std::wstring{ label } });
            optionLabel.TextWrapping(TextWrapping::Wrap);
            row.Children().Append(optionLabel);

            Grid controls;
            Slider slider;
            slider.Minimum(0);
            slider.Maximum(maximum);
            slider.StepFrequency(1);
            slider.SmallChange(1);
            slider.LargeChange(5);
            slider.Margin(Thickness{ 0, 0, 104, 0 });
            slider.HorizontalAlignment(HorizontalAlignment::Stretch);
            Automation::AutomationProperties::SetName(slider, hstring{ std::wstring{ label } + L"比例" });

            NumberBox input;
            input.Width(92);
            input.HorizontalAlignment(HorizontalAlignment::Right);
            input.Minimum(0);
            input.Maximum(maximum);
            input.SmallChange(1);
            input.SpinButtonPlacementMode(NumberBoxSpinButtonPlacementMode::Compact);
            Automation::AutomationProperties::SetName(input, hstring{ std::wstring{ label } + L"比例数值" });

            auto value = optionIndex < weights.Size() ? weights.GetNumberAt(optionIndex) : defaultValue;
            value = (std::max)(0.0, (std::min)(maximum, std::round(value)));
            slider.Value(value);
            input.Value(value);
            m_weightSliders.push_back(slider);
            m_weightInputs.push_back(input);

            slider.ValueChanged([weak, optionIndex](auto const&, auto const& args)
            {
                if (auto self = weak.get()) self->SetWeightValue(optionIndex, args.NewValue(), true);
            });
            input.ValueChanged([weak, optionIndex](auto const&, auto const& args)
            {
                if (auto self = weak.get(); self && !std::isnan(args.NewValue()))
                {
                    self->SetWeightValue(optionIndex, args.NewValue(), true);
                }
            });

            controls.Children().Append(slider);
            controls.Children().Append(input);
            row.Children().Append(controls);
            OptionWeightRows().Children().Append(row);
        }
        m_syncingWeights = false;
        UpdateRatioPreview();
    }

    void StrategyEditor::SetWeightValue(uint32_t index, double value, bool selectCustomBias)
    {
        if (m_syncingWeights || index >= m_weightSliders.size()) return;
        m_syncingWeights = true;
        auto maximum = m_weightSliders[index].Maximum();
        auto normalized = (std::max)(0.0, (std::min)(maximum, std::round(value)));
        m_weightSliders[index].Value(normalized);
        m_weightInputs[index].Value(normalized);
        if (selectCustomBias) SelectTag(Bias(), L"custom");
        m_syncingWeights = false;
        UpdateRatioPreview();
    }

    void StrategyEditor::OnBiasChanged(IInspectable const&,
        Microsoft::UI::Xaml::Controls::SelectionChangedEventArgs const&)
    {
        if (!m_initialized || m_syncingWeights) return;
        auto bias = SelectedTag(Bias(), L"custom");
        if (bias != L"custom") ApplyBiasPreset(bias);
    }

    void StrategyEditor::ApplyBiasPreset(hstring const& bias)
    {
        auto count = m_weightSliders.size();
        if (count == 0) return;
        std::vector<double> raw(count, 1.0);
        if (count > 1)
        {
            auto center = static_cast<double>(count - 1) / 2.0;
            for (size_t index = 0; index < count; ++index)
            {
                auto position = static_cast<double>(index) / static_cast<double>(count - 1);
                auto base = bias == L"left" ? 1.0 - position : position;
                if (bias == L"center") base = 1.0 - std::abs(static_cast<double>(index) - center) / center;
                raw[index] = std::pow((std::max)(0.0, base), bias == L"center" ? 3.0 : 8.0);
            }
        }
        auto maximum = *std::max_element(raw.begin(), raw.end());
        auto scale = m_multipleWeights ? 100.0 : 50.0;
        for (uint32_t index = 0; index < count; ++index)
        {
            auto value = maximum > 0 ? std::round(raw[index] / maximum * scale) : std::round(scale / count);
            SetWeightValue(index, value, false);
        }
    }

    Windows::Data::Json::JsonArray StrategyEditor::WeightValues() const
    {
        Windows::Data::Json::JsonArray values;
        for (auto const& input : m_weightInputs)
        {
            auto value = input.Value();
            values.Append(Windows::Data::Json::JsonValue::CreateNumberValue(
                std::isnan(value) ? 0 : (std::max)(0.0, value)));
        }
        return values;
    }

    void StrategyEditor::UpdateRatioPreview()
    {
        if (m_weightInputs.empty())
        {
            RatioPreview().Text(L"");
            return;
        }
        std::vector<double> values;
        values.reserve(m_weightInputs.size());
        double total = 0;
        for (auto const& input : m_weightInputs)
        {
            auto value = std::isnan(input.Value()) ? 0 : (std::max)(0.0, input.Value());
            values.push_back(value);
            total += value;
        }

        std::wstring preview = m_multipleWeights ? L"命中率：" : L"预计占比：";
        for (size_t index = 0; index < values.size(); ++index)
        {
            if (index > 0) preview += L" | ";
            std::wstring label{ m_weightLabels[index] };
            if (label.size() > 14) label = label.substr(0, 14) + L"…";
            auto percent = m_multipleWeights ? values[index]
                : (total > 0 ? values[index] / total * 100.0 : 100.0 / values.size());
            preview += label + L" " + std::wstring{ PercentText(percent) };
        }
        RatioPreview().Text(hstring{ preview });
    }
}
