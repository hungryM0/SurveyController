#include "pch.h"
#include "StrategyEditor.xaml.h"
#include "Services/JsonHelpers.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <sstream>

namespace winrt::SurveyController::App::implementation
{
    namespace
    {
        using namespace Microsoft::UI::Xaml;
        using namespace Microsoft::UI::Xaml::Automation;
        using namespace Microsoft::UI::Xaml::Controls;
        using namespace Microsoft::UI::Xaml::Media;
        using namespace Windows::Data::Json;

        constexpr wchar_t optionFillAI[] = L"__AI_FILL__";
        constexpr wchar_t randomName[] = L"__RANDOM_NAME__";
        constexpr wchar_t randomMobile[] = L"__RANDOM_MOBILE__";
        constexpr wchar_t randomIDCard[] = L"__RANDOM_ID_CARD__";
        constexpr wchar_t randomIntegerPrefix[] = L"__RANDOM_INT__:";

        RadioButtons CreateModeButtons(hstring const& automationName)
        {
            RadioButtons buttons;
            buttons.MaxColumns(3);
            AutomationProperties::SetName(buttons, automationName);
            for (auto const& [label, tag] : std::array<std::pair<wchar_t const*, wchar_t const*>, 5>{ {
                { L"答案文本", L"none" }, { L"随机姓名", L"name" }, { L"随机手机号", L"mobile" },
                { L"随机身份证", L"id_card" }, { L"随机整数", L"integer" } } })
            {
                RadioButton item;
                item.Content(box_value(label));
                item.Tag(box_value(tag));
                buttons.Items().Append(item);
            }
            buttons.SelectedIndex(0);
            return buttons;
        }

        hstring SelectedMode(RadioButtons const& buttons)
        {
            auto item = buttons.SelectedItem().try_as<RadioButton>();
            return item ? unbox_value_or<hstring>(item.Tag(), L"none") : L"none";
        }

        void SelectMode(RadioButtons const& buttons, hstring const& value)
        {
            for (uint32_t index = 0; index < buttons.Items().Size(); ++index)
            {
                auto item = buttons.Items().GetAt(index).try_as<RadioButton>();
                if (item && unbox_value_or<hstring>(item.Tag(), L"") == value)
                {
                    buttons.SelectedIndex(static_cast<int32_t>(index));
                    return;
                }
            }
            buttons.SelectedIndex(0);
        }

        std::pair<hstring, std::array<double, 2>> DecodeFillValue(hstring const& value)
        {
            auto nan = std::numeric_limits<double>::quiet_NaN();
            if (value == randomName) return { L"name", { nan, nan } };
            if (value == randomMobile) return { L"mobile", { nan, nan } };
            if (value == randomIDCard) return { L"id_card", { nan, nan } };
            std::wstring text{ value };
            if (text.starts_with(randomIntegerPrefix))
            {
                auto payload = text.substr(std::size(randomIntegerPrefix) - 1);
                auto separator = payload.find(L':');
                try
                {
                    if (separator != std::wstring::npos)
                    {
                        auto minimum = std::stod(payload.substr(0, separator));
                        auto maximum = std::stod(payload.substr(separator + 1));
                        return { L"integer", { (std::min)(minimum, maximum), (std::max)(minimum, maximum) } };
                    }
                }
                catch (...) {}
            }
            return { L"none", { nan, nan } };
        }

        hstring EncodeFillValue(hstring const& mode, hstring const& text, NumberBox const& minimum, NumberBox const& maximum)
        {
            if (mode == L"name") return randomName;
            if (mode == L"mobile") return randomMobile;
            if (mode == L"id_card") return randomIDCard;
            if (mode == L"integer")
            {
                if (std::isnan(minimum.Value()) || std::isnan(maximum.Value()))
                    throw hresult_error(E_INVALIDARG, L"随机整数模式必须填写最小值和最大值。");
                auto low = static_cast<int64_t>(std::llround((std::min)(minimum.Value(), maximum.Value())));
                auto high = static_cast<int64_t>(std::llround((std::max)(minimum.Value(), maximum.Value())));
                return hstring{ std::wstring{ randomIntegerPrefix } + std::to_wstring(low) + L":" + std::to_wstring(high) };
            }
            return text;
        }

        Border CreateRowSurface()
        {
            Border border;
            border.Padding(Thickness{ 12, 10, 12, 10 });
            border.CornerRadius(CornerRadius{ 10 });
            border.BorderThickness(Thickness{ 1 });
            auto resources = Application::Current().Resources();
            border.Background(resources.Lookup(box_value(L"CardBackgroundFillColorDefaultBrush")).as<Brush>());
            border.BorderBrush(resources.Lookup(box_value(L"CardStrokeColorDefaultBrush")).as<Brush>());
            return border;
        }

        StackPanel CreateRangePanel(NumberBox const& minimum, NumberBox const& maximum)
        {
            StackPanel range;
            range.Orientation(Orientation::Horizontal);
            range.Spacing(8);
            minimum.Header(box_value(L"整数最小值"));
            maximum.Header(box_value(L"整数最大值"));
            minimum.SpinButtonPlacementMode(NumberBoxSpinButtonPlacementMode::Compact);
            maximum.SpinButtonPlacementMode(NumberBoxSpinButtonPlacementMode::Compact);
            minimum.Width(150);
            maximum.Width(150);
            range.Children().Append(minimum);
            range.Children().Append(maximum);
            return range;
        }

        JsonArray IntegerRange(NumberBox const& minimum, NumberBox const& maximum, bool enabled)
        {
            JsonArray range;
            if (!enabled) return range;
            if (std::isnan(minimum.Value()) || std::isnan(maximum.Value()))
                throw hresult_error(E_INVALIDARG, L"随机整数模式必须填写最小值和最大值。");
            range.Append(JsonValue::CreateNumberValue(static_cast<double>(std::llround((std::min)(minimum.Value(), maximum.Value())))));
            range.Append(JsonValue::CreateNumberValue(static_cast<double>(std::llround((std::max)(minimum.Value(), maximum.Value())))));
            return range;
        }

        JsonArray ArrayValue(JsonObject const& object, wchar_t const* primary, wchar_t const* fallback = nullptr)
        {
            auto values = Services::GetJsonArray(object, primary);
            return values.Size() || !fallback ? values : Services::GetJsonArray(object, fallback);
        }

        JsonArray ParseTextCandidates(hstring const& value)
        {
            JsonArray result;
            std::wistringstream input{ std::wstring{ value } };
            std::wstring line;
            while (std::getline(input, line))
            {
                if (!line.empty() && line.back() == L'\r') line.pop_back();
                auto first = line.find_first_not_of(L" \t");
                if (first == std::wstring::npos) continue;
                auto last = line.find_last_not_of(L" \t");
                result.Append(JsonValue::CreateStringValue(hstring{ line.substr(first, last - first + 1) }));
            }
            return result;
        }

        hstring FormatTextCandidates(JsonArray const& values)
        {
            std::wstring result;
            for (auto const& value : values)
            {
                if (value.ValueType() != JsonValueType::String) continue;
                if (!result.empty()) result += L"\r\n";
                result += value.GetString();
            }
            return hstring{ result };
        }
    }

    void StrategyEditor::ApplyQuestionTypeBrush(hstring const& type)
    {
        wchar_t const* foregroundKey = L"QuestionUnknownBrush";
        wchar_t const* badgeForegroundKey = L"QuestionUnknownBadgeForegroundBrush";
        wchar_t const* backgroundKey = L"QuestionUnknownBadgeBackgroundBrush";
        if (type == L"single" || type == L"multiple" || type == L"dropdown")
        {
            foregroundKey = L"QuestionChoiceBrush";
            badgeForegroundKey = L"QuestionChoiceBadgeForegroundBrush";
            backgroundKey = L"QuestionChoiceBadgeBackgroundBrush";
        }
        else if (type == L"text" || type == L"multi_text" || type == L"location")
        {
            foregroundKey = L"QuestionTextBrush";
            badgeForegroundKey = L"QuestionTextBadgeForegroundBrush";
            backgroundKey = L"QuestionTextBadgeBackgroundBrush";
        }
        else if (type == L"scale" || type == L"slider")
        {
            foregroundKey = L"QuestionScaleBrush";
            badgeForegroundKey = L"QuestionScaleBadgeForegroundBrush";
            backgroundKey = L"QuestionScaleBadgeBackgroundBrush";
        }
        else if (type == L"matrix")
        {
            foregroundKey = L"QuestionMatrixBrush";
            badgeForegroundKey = L"QuestionMatrixBadgeForegroundBrush";
            backgroundKey = L"QuestionMatrixBadgeBackgroundBrush";
        }
        else if (type == L"sort")
        {
            foregroundKey = L"QuestionSortBrush";
            badgeForegroundKey = L"QuestionSortBadgeForegroundBrush";
            backgroundKey = L"QuestionSortBadgeBackgroundBrush";
        }
        auto resources = Application::Current().Resources();
        auto foreground = resources.Lookup(box_value(foregroundKey)).as<Brush>();
        auto badgeForeground = resources.Lookup(box_value(badgeForegroundKey)).as<Brush>();
        auto badgeBackground = resources.Lookup(box_value(backgroundKey)).as<Brush>();
        QuestionTypeIcon().Foreground(foreground);
        QuestionTypeBadge().Background(badgeBackground);
        QuestionTypeBadge().Foreground(badgeForeground);
    }

    void StrategyEditor::LoadAdvancedEditors(JsonObject const& question, JsonObject const& strategy,
        Services::WizardQuestion const& summary)
    {
        auto const textQuestion = summary.normalizedType == L"text";
        TextQuestionSection().Visibility(textQuestion ? Visibility::Visible : Visibility::Collapsed);
        LocationSection().Visibility(summary.normalizedType == L"location" ? Visibility::Visible : Visibility::Collapsed);
        MultiTextSection().Visibility(summary.normalizedType == L"multi_text" ? Visibility::Visible : Visibility::Collapsed);

        auto textCandidates = Services::GetJsonArray(strategy, L"texts");
        if (textCandidates.Size() == 0) textCandidates = Services::GetJsonArray(question, L"forced_texts");
        TextAnswers().Text(FormatTextCandidates(textCandidates));
        MultiTextAnswers().Text(FormatTextCandidates(textCandidates));

        auto locations = Services::GetJsonArray(strategy, L"location_parts");
        LocationProvince().Text(locations.Size() > 0 && locations.GetAt(0).ValueType() == JsonValueType::String ? locations.GetStringAt(0) : L"");
        LocationCity().Text(locations.Size() > 1 && locations.GetAt(1).ValueType() == JsonValueType::String ? locations.GetStringAt(1) : L"");
        LocationDistrict().Text(locations.Size() > 2 && locations.GetAt(2).ValueType() == JsonValueType::String ? locations.GetStringAt(2) : L"");

        m_optionFillControls.clear();
        FillableOptionList().Children().Clear();
        auto fillable = Services::GetJsonArray(question, L"fillable_options");
        if (fillable.Size() == 0) fillable = Services::GetJsonArray(strategy, L"fillable_option_indices");
        FillableOptionsSection().Visibility(fillable.Size() > 0 ? Visibility::Visible : Visibility::Collapsed);
        auto optionTexts = Services::GetJsonArray(question, L"option_texts");
        auto savedTexts = Services::GetJsonArray(strategy, L"option_fill_texts");
        for (auto const& value : fillable)
        {
            if (value.ValueType() != JsonValueType::Number) continue;
            auto optionIndex = static_cast<int32_t>(value.GetNumber());
            if (optionIndex < 0 || static_cast<uint32_t>(optionIndex) >= optionTexts.Size()) continue;

            auto saved = static_cast<uint32_t>(optionIndex) < savedTexts.Size() &&
                savedTexts.GetAt(static_cast<uint32_t>(optionIndex)).ValueType() == JsonValueType::String
                ? savedTexts.GetStringAt(static_cast<uint32_t>(optionIndex)) : hstring{};
            auto decoded = DecodeFillValue(saved);
            auto ai = ToggleSwitch{};
            ai.Header(box_value(L"启用 AI"));
            ai.OffContent(box_value(L"关"));
            ai.OnContent(box_value(L"开"));
            ai.IsOn(saved == optionFillAI);
            AutomationProperties::SetName(ai, hstring{ L"第 " + std::to_wstring(optionIndex + 1) + L" 个可填写选项启用 AI" });
            auto mode = CreateModeButtons(hstring{ L"第 " + std::to_wstring(optionIndex + 1) + L" 个可填写选项填写模式" });
            SelectMode(mode, decoded.first);
            auto text = TextBox{};
            text.Header(box_value(L"填写文本"));
            text.Text(decoded.first == L"none" && saved != optionFillAI ? saved : L"");
            auto minimum = NumberBox{};
            auto maximum = NumberBox{};
            minimum.Value(decoded.second[0]);
            maximum.Value(decoded.second[1]);
            auto range = CreateRangePanel(minimum, maximum);
            auto weak = get_weak();
            auto sync = [mode, text, range, ai]()
            {
                auto aiEnabled = ai.IsOn();
                auto selected = SelectedMode(mode);
                mode.IsEnabled(!aiEnabled);
                text.IsEnabled(!aiEnabled && selected == L"none");
                range.Visibility(!aiEnabled && selected == L"integer" ? Visibility::Visible : Visibility::Collapsed);
            };
            mode.SelectionChanged([weak, ai, mode, sync](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->m_currentQuestionDirty = true;
                if (SelectedMode(mode) != L"none" && ai.IsOn()) ai.IsOn(false);
                sync();
            });
            ai.Toggled([weak, ai, mode, sync](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->m_currentQuestionDirty = true;
                if (ai.IsOn() && SelectedMode(mode) != L"none") mode.SelectedIndex(0);
                sync();
            });
            text.TextChanged([weak](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->m_currentQuestionDirty = true;
            });
            minimum.ValueChanged([weak](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->m_currentQuestionDirty = true;
            });
            maximum.ValueChanged([weak](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->m_currentQuestionDirty = true;
            });
            if (ai.IsOn() && SelectedMode(mode) != L"none") mode.SelectedIndex(0);
            sync();

            auto panel = StackPanel{};
            panel.Spacing(8);
            auto title = TextBlock{};
            title.FontWeight(Windows::UI::Text::FontWeights::SemiBold());
            title.Text(hstring{ std::to_wstring(optionIndex + 1) + L". " + std::wstring{ optionTexts.GetStringAt(static_cast<uint32_t>(optionIndex)) } });
            panel.Children().Append(title);
            panel.Children().Append(text);
            panel.Children().Append(mode);
            panel.Children().Append(range);
            panel.Children().Append(ai);
            auto surface = CreateRowSurface();
            surface.Child(panel);
            FillableOptionList().Children().Append(surface);
            m_optionFillControls.push_back({ optionIndex, text, mode, minimum, maximum, ai });
        }
        FillableOptionsSection().Visibility(m_optionFillControls.empty() ? Visibility::Collapsed : Visibility::Visible);

        m_multiTextControls.clear();
        MultiTextRows().Children().Clear();
        auto labels = Services::GetJsonArray(question, L"text_input_labels");
        auto count = static_cast<uint32_t>((std::max)(0.0, question.GetNamedNumber(L"text_inputs", 0)));
        count = (std::max)(count, labels.Size());
        auto modes = Services::GetJsonArray(strategy, L"multi_text_blank_modes");
        auto aiFlags = Services::GetJsonArray(strategy, L"multi_text_blank_ai_flags");
        auto ranges = Services::GetJsonArray(strategy, L"multi_text_blank_int_ranges");
        count = (std::max)(count, modes.Size());
        count = (std::max)(count, aiFlags.Size());
        if (summary.normalizedType == L"multi_text" && count == 0) count = 1;
        for (uint32_t index = 0; index < count; ++index)
        {
            auto mode = CreateModeButtons(hstring{ L"第 " + std::to_wstring(index + 1) + L" 个填空的填写模式" });
            SelectMode(mode, index < modes.Size() && modes.GetAt(index).ValueType() == JsonValueType::String ? modes.GetStringAt(index) : L"none");
            auto ai = ToggleSwitch{};
            ai.Header(box_value(L"启用 AI"));
            ai.OffContent(box_value(L"关"));
            ai.OnContent(box_value(L"开"));
            ai.IsOn(index < aiFlags.Size() && aiFlags.GetAt(index).ValueType() == JsonValueType::Boolean && aiFlags.GetBooleanAt(index));
            auto minimum = NumberBox{};
            auto maximum = NumberBox{};
            auto savedRange = index < ranges.Size() && ranges.GetAt(index).ValueType() == JsonValueType::Array ? ranges.GetArrayAt(index) : JsonArray{};
            minimum.Value(savedRange.Size() > 0 ? savedRange.GetNumberAt(0) : std::numeric_limits<double>::quiet_NaN());
            maximum.Value(savedRange.Size() > 1 ? savedRange.GetNumberAt(1) : std::numeric_limits<double>::quiet_NaN());
            auto range = CreateRangePanel(minimum, maximum);
            auto weak = get_weak();
            auto sync = [mode, range, ai]()
            {
                mode.IsEnabled(!ai.IsOn());
                range.Visibility(!ai.IsOn() && SelectedMode(mode) == L"integer" ? Visibility::Visible : Visibility::Collapsed);
            };
            mode.SelectionChanged([weak, ai, mode, sync](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->m_currentQuestionDirty = true;
                if (SelectedMode(mode) != L"none" && ai.IsOn()) ai.IsOn(false);
                sync();
            });
            ai.Toggled([weak, ai, mode, sync](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->m_currentQuestionDirty = true;
                if (ai.IsOn() && SelectedMode(mode) != L"none") mode.SelectedIndex(0);
                sync();
            });
            minimum.ValueChanged([weak](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->m_currentQuestionDirty = true;
            });
            maximum.ValueChanged([weak](auto const&, auto const&)
            {
                if (auto self = weak.get()) self->m_currentQuestionDirty = true;
            });
            if (ai.IsOn() && SelectedMode(mode) != L"none") mode.SelectedIndex(0);
            sync();
            auto panel = StackPanel{};
            panel.Spacing(8);
            auto title = TextBlock{};
            title.FontWeight(Windows::UI::Text::FontWeights::SemiBold());
            auto label = index < labels.Size() && labels.GetAt(index).ValueType() == JsonValueType::String
                ? labels.GetStringAt(index) : hstring{ L"第 " + std::to_wstring(index + 1) + L" 个填空" };
            title.Text(label);
            panel.Children().Append(title);
            panel.Children().Append(mode);
            panel.Children().Append(range);
            panel.Children().Append(ai);
            auto surface = CreateRowSurface();
            surface.Child(panel);
            MultiTextRows().Children().Append(surface);
            m_multiTextControls.push_back({ mode, minimum, maximum, ai });
        }

        m_attachedSelectControls.clear();
        AttachedOptionSelectList().Children().Clear();
        auto attached = Services::GetJsonArray(strategy, L"attached_option_selects");
        if (attached.Size() == 0) attached = Services::GetJsonArray(question, L"attached_option_selects");
        for (auto const& value : attached)
        {
            if (value.ValueType() != JsonValueType::Object) continue;
            auto source = JsonObject::Parse(value.GetObject().Stringify());
            auto selectTexts = ArrayValue(source, L"select_texts", L"select_options");
            if (selectTexts.Size() == 0) continue;
            AttachedSelectControls controls;
            controls.optionIndex = static_cast<int32_t>(source.GetNamedNumber(L"option_index", 0));
            controls.optionText = source.GetNamedString(L"option_text", L"嵌入式选项");
            controls.source = source;
            auto configured = Services::GetJsonArray(source, L"weights");
            auto panel = StackPanel{};
            panel.Spacing(8);
            auto title = TextBlock{};
            title.FontWeight(Windows::UI::Text::FontWeights::SemiBold());
            title.Text(hstring{ L"选项 " + std::to_wstring(controls.optionIndex + 1) + L" · " + std::wstring{ controls.optionText } });
            panel.Children().Append(title);
            for (uint32_t index = 0; index < selectTexts.Size(); ++index)
            {
                if (selectTexts.GetAt(index).ValueType() != JsonValueType::String) continue;
                auto label = selectTexts.GetStringAt(index);
                controls.selectTexts.push_back(label);
                auto row = Grid{};
                row.ColumnSpacing(8);
                row.ColumnDefinitions().Append(ColumnDefinition{});
                auto sliderColumn = ColumnDefinition{};
                sliderColumn.Width(GridLength{ 1, GridUnitType::Star });
                row.ColumnDefinitions().Append(sliderColumn);
                auto numberColumn = ColumnDefinition{};
                numberColumn.Width(GridLength{ 84, GridUnitType::Pixel });
                row.ColumnDefinitions().Append(numberColumn);
                auto text = TextBlock{};
                text.Text(label);
                text.Width(150);
                text.TextTrimming(TextTrimming::CharacterEllipsis);
                auto slider = Slider{};
                slider.Minimum(0);
                slider.Maximum(100);
                slider.StepFrequency(1);
                auto number = NumberBox{};
                number.Minimum(0);
                number.Maximum(100);
                number.SpinButtonPlacementMode(NumberBoxSpinButtonPlacementMode::Compact);
                auto weight = index < configured.Size() && configured.GetAt(index).ValueType() == JsonValueType::Number ? configured.GetNumberAt(index) : 1.0;
                slider.Value(weight);
                number.Value(weight);
                auto weak = get_weak();
                slider.ValueChanged([weak, number](auto const&, auto const& args)
                {
                    if (auto self = weak.get()) self->m_currentQuestionDirty = true;
                    if (number.Value() != args.NewValue()) number.Value(args.NewValue());
                });
                number.ValueChanged([weak, slider](auto const&, NumberBoxValueChangedEventArgs const& args)
                {
                    if (auto self = weak.get()) self->m_currentQuestionDirty = true;
                    if (!std::isnan(args.NewValue()) && slider.Value() != args.NewValue()) slider.Value(args.NewValue());
                });
                Grid::SetColumn(slider, 1);
                Grid::SetColumn(number, 2);
                row.Children().Append(text);
                row.Children().Append(slider);
                row.Children().Append(number);
                panel.Children().Append(row);
                controls.weights.push_back(number);
            }
            auto surface = CreateRowSurface();
            surface.Child(panel);
            AttachedOptionSelectList().Children().Append(surface);
            m_attachedSelectControls.push_back(std::move(controls));
        }
        AttachedOptionSection().Visibility(m_attachedSelectControls.empty() ? Visibility::Collapsed : Visibility::Visible);
        UpdateTextModeVisibility();
    }

    void StrategyEditor::SaveAdvancedEditors(JsonObject const& question, hstring const& normalizedType, JsonObject& changes)
    {
        if (normalizedType == L"text") changes.SetNamedValue(L"texts", ParseTextCandidates(TextAnswers().Text()));
        if (normalizedType == L"multi_text") changes.SetNamedValue(L"texts", ParseTextCandidates(MultiTextAnswers().Text()));

        auto optionCount = static_cast<uint32_t>((std::max)(0.0, question.GetNamedNumber(L"options", 0)));
        optionCount = (std::max)(optionCount, Services::GetJsonArray(question, L"option_texts").Size());
        JsonArray fillable;
        JsonArray fillTexts;
        for (uint32_t index = 0; index < optionCount; ++index) fillTexts.Append(JsonValue::CreateNullValue());
        for (auto const& controls : m_optionFillControls)
        {
            if (controls.optionIndex < 0 || static_cast<uint32_t>(controls.optionIndex) >= optionCount) continue;
            fillable.Append(JsonValue::CreateNumberValue(controls.optionIndex));
            auto value = controls.ai.IsOn() ? hstring{ optionFillAI }
                : EncodeFillValue(SelectedMode(controls.mode), controls.text.Text(), controls.minimum, controls.maximum);
            fillTexts.SetAt(static_cast<uint32_t>(controls.optionIndex), value.empty()
                ? JsonValue::CreateNullValue() : JsonValue::CreateStringValue(value));
        }
        changes.SetNamedValue(L"fillable_option_indices", fillable);
        changes.SetNamedValue(L"option_fill_texts", fillTexts);

        JsonArray location;
        location.Append(JsonValue::CreateStringValue(LocationProvince().Text()));
        location.Append(JsonValue::CreateStringValue(LocationCity().Text()));
        location.Append(JsonValue::CreateStringValue(LocationDistrict().Text()));
        changes.SetNamedValue(L"location_parts", location);

        JsonArray modes;
        JsonArray aiFlags;
        JsonArray ranges;
        for (auto const& controls : m_multiTextControls)
        {
            auto mode = controls.ai.IsOn() ? hstring{ L"none" } : SelectedMode(controls.mode);
            modes.Append(JsonValue::CreateStringValue(mode));
            aiFlags.Append(JsonValue::CreateBooleanValue(controls.ai.IsOn()));
            ranges.Append(IntegerRange(controls.minimum, controls.maximum, !controls.ai.IsOn() && mode == L"integer"));
        }
        changes.SetNamedValue(L"multi_text_blank_modes", modes);
        changes.SetNamedValue(L"multi_text_blank_ai_flags", aiFlags);
        changes.SetNamedValue(L"multi_text_blank_int_ranges", ranges);

        JsonArray attached;
        for (auto const& controls : m_attachedSelectControls)
        {
            auto item = JsonObject::Parse(controls.source.Stringify());
            JsonArray weights;
            double total = 0;
            for (auto const& number : controls.weights)
            {
                auto value = std::isnan(number.Value()) ? 0 : (std::max)(0.0, number.Value());
                total += value;
                weights.Append(JsonValue::CreateNumberValue(value));
            }
            if (weights.Size() && total <= 0) throw hresult_error(E_INVALIDARG, L"嵌入式下拉配比不能全为 0。");
            item.SetNamedValue(L"weights", weights);
            attached.Append(item);
        }
        changes.SetNamedValue(L"attached_option_selects", attached);
    }
}
