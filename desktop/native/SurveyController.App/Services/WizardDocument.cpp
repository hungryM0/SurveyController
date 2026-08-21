#include "pch.h"
#include "WizardDocument.h"
#include "JsonHelpers.h"

#include <charconv>
#include <algorithm>
#include <sstream>

namespace winrt::SurveyController::App::Services
{
    namespace
    {
        using namespace Windows::Data::Json;

        JsonObject Object(JsonObject const& parent, wchar_t const* name)
        {
            if (!parent || !parent.HasKey(name)) return JsonObject{};
            auto value = parent.GetNamedValue(name);
            return value.ValueType() == JsonValueType::Object ? value.GetObject() : JsonObject{};
        }

        JsonArray Array(JsonObject const& parent, wchar_t const* name)
        {
            if (!parent || !parent.HasKey(name)) return JsonArray{};
            auto value = parent.GetNamedValue(name);
            return value.ValueType() == JsonValueType::Array ? value.GetArray() : JsonArray{};
        }

        JsonObject Clone(JsonObject const& source)
        {
            if (!source) return JsonObject{};
            return JsonObject::Parse(source.Stringify());
        }

        JsonArray NumberPair(int32_t left, int32_t right)
        {
            JsonArray result;
            result.Append(JsonValue::CreateNumberValue(left));
            result.Append(JsonValue::CreateNumberValue(right));
            return result;
        }

        JsonArray StringPair(hstring const& left, hstring const& right)
        {
            JsonArray result;
            result.Append(JsonValue::CreateStringValue(left));
            result.Append(JsonValue::CreateStringValue(right));
            return result;
        }

        std::array<int32_t, 2> ReadNumberPair(JsonObject const& object, wchar_t const* name, int32_t first, int32_t second)
        {
            auto value = Array(object, name);
            if (value.Size() < 2)
            {
                return { first, second };
            }
            return { static_cast<int32_t>(value.GetNumberAt(0)), static_cast<int32_t>(value.GetNumberAt(1)) };
        }

        std::array<hstring, 2> ReadStringPair(JsonObject const& object, wchar_t const* name)
        {
            auto value = Array(object, name);
            if (value.Size() < 2)
            {
                return { L"", L"" };
            }
            return { value.GetStringAt(0), value.GetStringAt(1) };
        }

        hstring FormatWeights(JsonObject const& strategy)
        {
            auto table = Object(strategy, L"custom_weights");
            auto values = Array(table, L"options");
            std::wostringstream output;
            for (uint32_t index = 0; index < values.Size(); ++index)
            {
                if (index > 0) output << L", ";
                output << values.GetNumberAt(index);
            }
            return hstring{ output.str() };
        }

        JsonArray ParseWeights(hstring const& text)
        {
            std::wstring normalized{ text };
            for (auto& character : normalized)
            {
                if (character == L',' || character == L';') character = L' ';
            }
            std::wistringstream input(normalized);
            JsonArray values;
            double value = 0;
            while (input >> value)
            {
                if (value >= 0) values.Append(JsonValue::CreateNumberValue(value));
            }
            return values;
        }

        hstring QuestionTypeLabel(hstring const& value)
        {
            if (value == L"single") return L"单选题";
            if (value == L"multiple") return L"多选题";
            if (value == L"dropdown") return L"下拉题";
            if (value == L"scale") return L"量表题";
            if (value == L"slider") return L"滑块题";
            if (value == L"matrix") return L"矩阵题";
            if (value == L"sort") return L"排序题";
            if (value == L"location") return L"地区题";
            if (value == L"multi_text") return L"多项填空";
            if (value == L"text") return L"填空题";
            return L"未知题型";
        }

        hstring NormalizedQuestionType(JsonObject const& question)
        {
            if (question.GetNamedBoolean(L"unsupported", false)) return L"unsupported";
            if (question.GetNamedBoolean(L"is_location", false)) return L"location";
            if (question.GetNamedBoolean(L"is_multi_text", false)) return L"multi_text";
            if (question.GetNamedBoolean(L"is_rating", false)) return L"scale";
            auto raw = question.GetNamedString(L"provider_type", L"");
            if (raw == L"single" || raw == L"radio" || raw == L"3") return L"single";
            if (raw == L"multiple" || raw == L"checkbox" || raw == L"4") return L"multiple";
            if (raw == L"dropdown" || raw == L"select") return L"dropdown";
            if (raw == L"scale") return L"scale";
            if (raw == L"matrix" || raw == L"matrix_radio" || raw == L"6") return L"matrix";
            if (raw == L"sort" || raw == L"order" || raw == L"ranking") return L"sort";
            if (raw == L"slider") return L"slider";
            if (raw == L"multi_text") return L"multi_text";
            if (raw == L"text" || raw == L"textarea") return L"text";
            if (!raw.empty()) return L"unsupported";

            auto typeCode = question.GetNamedString(L"type_code", L"");
            if (typeCode == L"3") return L"single";
            if (typeCode == L"4") return L"multiple";
            if (typeCode == L"5") return L"scale";
            if (typeCode == L"6") return L"matrix";
            if (typeCode == L"7") return L"dropdown";
            if (typeCode == L"8") return L"slider";
            if (typeCode == L"11") return L"sort";
            if (question.GetNamedBoolean(L"is_text_like", false) || question.GetNamedNumber(L"text_inputs", 0) > 0) return L"text";
            return L"unsupported";
        }

        hstring QuestionIcon(hstring const& type)
        {
            if (type == L"single" || type == L"multiple" || type == L"dropdown") return L"\uE73E";
            if (type == L"text" || type == L"multi_text" || type == L"location") return L"\uE70F";
            if (type == L"scale" || type == L"slider") return L"\uE8EF";
            if (type == L"matrix") return L"\uE80A";
            if (type == L"sort") return L"\uE8CB";
            return L"\uE946";
        }

        bool IsMatrix(JsonObject const& question)
        {
            return NormalizedQuestionType(question) == L"matrix";
        }

        bool IsSelectable(JsonObject const& question)
        {
            auto type = NormalizedQuestionType(question);
            return type == L"single" || type == L"multiple" || type == L"dropdown" || type == L"scale" ||
                type == L"matrix" || type == L"slider" || type == L"sort";
        }

        std::wstring JoinLogicSummary(JsonObject const& question)
        {
            std::wstring summary;
            auto jumps = Array(question, L"jump_rules");
            if (jumps.Size()) summary += L"跳题";
            auto display = Array(question, L"controls_display_targets");
            if (display.Size())
            {
                if (!summary.empty()) summary += L" · ";
                summary += L"显示条件";
            }
            if (question.GetNamedBoolean(L"unsupported", false))
            {
                if (!summary.empty()) summary += L" · ";
                summary += L"暂不支持";
            }
            return summary;
        }
    }

    WizardDocument& WizardDocument::Current()
    {
        static WizardDocument instance;
        return instance;
    }

    void WizardDocument::LoadConfigState(hstring const& json)
    {
        JsonObject state;
        hstring parseError;
        if (!TryParseJsonObject(json, state, parseError))
        {
            throw hresult_error(E_FAIL, parseError);
        }
        m_path = state.GetNamedString(L"path", L"");
        m_config = Object(state, L"config");
        m_initialized = true;
        m_dirty = false;
        m_transactionConfig = nullptr;
        m_transactionPath.clear();
        m_transactionDirty = false;
        m_transactionActive = false;
    }

    void WizardDocument::SetParsedConfig(hstring const& json)
    {
        JsonObject parsed;
        hstring parseError;
        if (!TryParseJsonObject(json, parsed, parseError))
        {
            throw hresult_error(E_FAIL, parseError);
        }
        m_config = parsed;
        m_initialized = true;
        m_dirty = true;
    }

    void WizardDocument::BeginEditTransaction()
    {
        if (m_transactionActive) return;
        m_transactionConfig = Clone(m_config);
        m_transactionPath = m_path;
        m_transactionDirty = m_dirty;
        m_transactionActive = true;
    }

    void WizardDocument::CommitEditTransaction()
    {
        if (!m_transactionActive) return;
        m_transactionConfig = nullptr;
        m_transactionPath.clear();
        m_transactionDirty = false;
        m_transactionActive = false;
    }

    void WizardDocument::RollbackEditTransaction()
    {
        if (!m_transactionActive) return;
        m_config = m_transactionConfig;
        m_path = m_transactionPath;
        m_dirty = m_transactionDirty;
        m_transactionConfig = nullptr;
        m_transactionPath.clear();
        m_transactionDirty = false;
        m_transactionActive = false;
    }

    bool WizardDocument::HasRealSurvey() const
    {
        if (!m_config || URL().empty()) return false;
        for (auto const& value : DefinitionQuestions())
        {
            auto question = value.GetObject();
            if (!question.GetNamedBoolean(L"is_description", false)) return true;
        }
        return false;
    }

    hstring WizardDocument::URL() const { return Survey().GetNamedString(L"url", L""); }
    hstring WizardDocument::Title() const { return Survey().GetNamedString(L"title", L""); }
    hstring WizardDocument::Provider() const { return Survey().GetNamedString(L"provider", L"wjx"); }

    uint32_t WizardDocument::QuestionCount() const
    {
        uint32_t count = 0;
        for (auto const& value : DefinitionQuestions())
        {
            if (!value.GetObject().GetNamedBoolean(L"is_description", false)) ++count;
        }
        return count;
    }

    uint32_t WizardDocument::StrategyCount() const { return Strategies().Size(); }

    std::vector<WizardQuestion> WizardDocument::Questions() const
    {
        std::vector<WizardQuestion> result;
        auto strategies = Strategies();
        for (auto const& value : DefinitionQuestions())
        {
            auto question = value.GetObject();
            if (question.GetNamedBoolean(L"is_description", false)) continue;
            WizardQuestion item;
            item.number = static_cast<int32_t>(question.GetNamedNumber(L"num", 0));
            item.page = static_cast<int32_t>(question.GetNamedNumber(L"page", 1));
            item.rows = static_cast<int32_t>(question.GetNamedNumber(L"rows", 0));
            item.title = question.GetNamedString(L"title", L"");
            item.normalizedType = NormalizedQuestionType(question);
            item.type = QuestionTypeLabel(item.normalizedType);
            item.icon = QuestionIcon(item.normalizedType);
            item.required = question.GetNamedBoolean(L"required", false);
            for (auto const& option : Array(question, L"option_texts"))
            {
                if (option.ValueType() == JsonValueType::String) item.optionTexts.push_back(option.GetString());
            }
            for (auto const& row : Array(question, L"row_texts"))
            {
                if (row.ValueType() == JsonValueType::String) item.rowTexts.push_back(row.GetString());
            }
            item.options = (std::max)(static_cast<int32_t>(question.GetNamedNumber(L"options", 0)),
                static_cast<int32_t>(item.optionTexts.size()));
            item.rows = (std::max)(item.rows, static_cast<int32_t>(item.rowTexts.size()));
            item.unsupported = question.GetNamedBoolean(L"unsupported", false) || item.normalizedType == L"unsupported";
            item.unsupportedReason = question.GetNamedString(L"unsupported_reason", L"");
            item.hasJump = question.GetNamedBoolean(L"has_jump", false) ||
                Array(question, L"jump_rules").Size() > 0;
            item.hasDisplayLogic = question.GetNamedBoolean(L"has_display_condition", false) ||
                Array(question, L"controls_display_targets").Size() > 0;
            item.logicSummary = hstring{ JoinLogicSummary(question) };
            for (auto const& strategyValue : strategies)
            {
                auto strategy = strategyValue.GetObject();
                if (static_cast<int32_t>(strategy.GetNamedNumber(L"question_num", -1)) != item.number) continue;
                item.dimension = strategy.GetNamedString(L"dimension", L"");
                item.bias = strategy.GetNamedString(L"psycho_bias", L"custom");
                item.configured = true;
                item.aiEnabled = strategy.GetNamedBoolean(L"ai_enabled", false);
                for (auto const& flag : Array(strategy, L"multi_text_blank_ai_flags"))
                {
                    item.aiEnabled = item.aiEnabled || (flag.ValueType() == JsonValueType::Boolean && flag.GetBoolean());
                }
                for (auto const& fill : Array(strategy, L"option_fill_texts"))
                {
                    item.aiEnabled = item.aiEnabled || (fill.ValueType() == JsonValueType::String && fill.GetString() == L"__AI_FILL__");
                }
                item.weights = FormatWeights(strategy);
                break;
            }
            result.push_back(std::move(item));
        }
        return result;
    }

    JsonObject WizardDocument::QuestionAt(uint32_t index) const
    {
        uint32_t current = 0;
        for (auto const& value : DefinitionQuestions())
        {
            auto question = value.GetObject();
            if (question.GetNamedBoolean(L"is_description", false)) continue;
            if (current++ == index) return question;
        }
        return JsonObject{};
    }

    JsonObject WizardDocument::StrategyAt(uint32_t index) const
    {
        auto question = QuestionAt(index);
        auto number = static_cast<int32_t>(question.GetNamedNumber(L"num", -1));
        for (auto const& value : Strategies())
        {
            auto strategy = value.GetObject();
            if (static_cast<int32_t>(strategy.GetNamedNumber(L"question_num", -2)) == number) return strategy;
        }
        return JsonObject{};
    }

    JsonArray WizardDocument::Rules() const { return Array(Answers(), L"rules"); }
    JsonArray WizardDocument::Dimensions() const { return Array(Answers(), L"dimensions"); }

    void WizardDocument::SetSurveyURL(hstring const& value)
    {
        auto survey = Survey();
        survey.SetNamedValue(L"url", JsonValue::CreateStringValue(value));
        m_config.SetNamedValue(L"survey", survey);
        m_dirty = true;
    }

    void WizardDocument::SetExecution(int32_t target, int32_t threads, int32_t intervalMin, int32_t intervalMax,
        int32_t durationMin, int32_t durationMax, hstring const& windowStart, hstring const& windowEnd,
        bool failStop, bool pauseCaptcha)
    {
        auto execution = Execution();
        execution.SetNamedValue(L"target", JsonValue::CreateNumberValue(target));
        execution.SetNamedValue(L"threads", JsonValue::CreateNumberValue(threads));
        execution.SetNamedValue(L"submitInterval", NumberPair(intervalMin, intervalMax));
        execution.SetNamedValue(L"answerDuration", NumberPair(durationMin, durationMax));
        execution.SetNamedValue(L"answerDatetimeWindow", StringPair(windowStart, windowEnd));
        execution.SetNamedValue(L"failStop", JsonValue::CreateBooleanValue(failStop));
        execution.SetNamedValue(L"pauseOnAliyunCaptcha", JsonValue::CreateBooleanValue(pauseCaptcha));
        m_config.SetNamedValue(L"execution", execution);
        m_dirty = true;
    }

    void WizardDocument::SetNetwork(hstring const& mode, hstring const& fixedAddress, hstring const& source,
        hstring const& customApi, hstring const& areaCode, bool randomUA)
    {
        auto network = Network();
        network.SetNamedValue(L"proxyMode", JsonValue::CreateStringValue(mode));
        network.SetNamedValue(L"randomProxyEnabled", JsonValue::CreateBooleanValue(mode == L"random"));
        network.SetNamedValue(L"fixedProxyAddress", JsonValue::CreateStringValue(mode == L"fixed" ? fixedAddress : L""));
        network.SetNamedValue(L"proxySource", JsonValue::CreateStringValue(source));
        network.SetNamedValue(L"customProxyApi", JsonValue::CreateStringValue(customApi));
        network.SetNamedValue(L"proxyAreaCode", JsonValue::CreateStringValue(areaCode));
        network.SetNamedValue(L"randomUaEnabled", JsonValue::CreateBooleanValue(randomUA));
        m_config.SetNamedValue(L"network", network);
        m_dirty = true;
    }

    void WizardDocument::SetReverseFill(bool enabled, hstring const& path)
    {
        auto reverseFill = ReverseFill();
        reverseFill.SetNamedValue(L"enabled", JsonValue::CreateBooleanValue(enabled));
        reverseFill.SetNamedValue(L"sourcePath", JsonValue::CreateStringValue(path));
        m_config.SetNamedValue(L"reverseFill", reverseFill);
        m_dirty = true;
    }

    void WizardDocument::SetQuestionStrategy(uint32_t index, hstring const& dimension, hstring const& bias,
        hstring const& weights, bool aiEnabled)
    {
        auto questions = Questions();
        if (index >= questions.size()) return;
        auto strategies = Strategies();
        for (uint32_t strategyIndex = 0; strategyIndex < strategies.Size(); ++strategyIndex)
        {
            auto strategy = strategies.GetObjectAt(strategyIndex);
            if (static_cast<int32_t>(strategy.GetNamedNumber(L"question_num", -1)) != questions[index].number) continue;
            strategy.SetNamedValue(L"dimension", JsonValue::CreateStringValue(dimension));
            strategy.SetNamedValue(L"psycho_bias", JsonValue::CreateStringValue(bias));
            strategy.SetNamedValue(L"ai_enabled", JsonValue::CreateBooleanValue(aiEnabled));
            auto parsedWeights = ParseWeights(weights);
            if (parsedWeights.Size() > 0)
            {
                JsonObject table;
                table.SetNamedValue(L"options", parsedWeights);
                strategy.SetNamedValue(L"custom_weights", table);
            }
            else
            {
                strategy.Remove(L"custom_weights");
            }
            strategies.SetAt(strategyIndex, strategy);
            auto answers = Object(m_config, L"answers");
            answers.SetNamedValue(L"questions", strategies);
            m_config.SetNamedValue(L"answers", answers);
            m_dirty = true;
            return;
        }
    }

    void WizardDocument::UpdateQuestionStrategy(uint32_t index, JsonObject const& changes)
    {
        auto question = QuestionAt(index);
        auto number = static_cast<int32_t>(question.GetNamedNumber(L"num", -1));
        if (number < 0) return;
        auto strategies = Strategies();
        for (uint32_t strategyIndex = 0; strategyIndex < strategies.Size(); ++strategyIndex)
        {
            auto strategy = strategies.GetObjectAt(strategyIndex);
            if (static_cast<int32_t>(strategy.GetNamedNumber(L"question_num", -2)) != number) continue;
            for (auto const& entry : changes)
            {
                if (entry.Value().ValueType() == JsonValueType::Null)
                {
                    strategy.Remove(entry.Key());
                }
                else
                {
                    strategy.SetNamedValue(entry.Key(), entry.Value());
                }
            }
            strategies.SetAt(strategyIndex, strategy);
            auto answers = Answers();
            answers.SetNamedValue(L"questions", strategies);
            m_config.SetNamedValue(L"answers", answers);
            m_dirty = true;
            return;
        }

        JsonObject strategy;
        strategy.SetNamedValue(L"question_num", JsonValue::CreateNumberValue(number));
        strategy.SetNamedValue(L"question_title", JsonValue::CreateStringValue(question.GetNamedString(L"title", L"")));
        auto questionType = NormalizedQuestionType(question);
        if (questionType == L"sort") questionType = L"order";
        if (questionType == L"multi_text") questionType = L"text";
        strategy.SetNamedValue(L"question_type", JsonValue::CreateStringValue(questionType));
        auto optionCount = (std::max)(1.0, question.GetNamedNumber(L"options", 0));
        strategy.SetNamedValue(L"option_count", JsonValue::CreateNumberValue(optionCount));
        strategy.SetNamedValue(L"rows", JsonValue::CreateNumberValue(question.GetNamedNumber(L"rows", 0)));
        strategy.SetNamedValue(L"distribution_mode", JsonValue::CreateStringValue(L"random"));
        strategy.SetNamedValue(L"psycho_bias", JsonValue::CreateStringValue(L"custom"));
        strategy.SetNamedValue(L"survey_provider", JsonValue::CreateStringValue(question.GetNamedString(L"provider", Provider())));
        strategy.SetNamedValue(L"provider_question_id", JsonValue::CreateStringValue(question.GetNamedString(L"provider_question_id", L"")));
        strategy.SetNamedValue(L"provider_page_id", JsonValue::CreateStringValue(question.GetNamedString(L"provider_page_id", L"")));
        strategy.SetNamedValue(L"fillable_option_indices", Array(question, L"fillable_options"));
        strategy.SetNamedValue(L"attached_option_selects", Array(question, L"attached_option_selects"));
        strategy.SetNamedValue(L"is_location", JsonValue::CreateBooleanValue(question.GetNamedBoolean(L"is_location", false)));
        auto defaultValue = questionType == L"multiple" ? 50.0 : 1.0;
        JsonArray probabilities;
        for (uint32_t option = 0; option < static_cast<uint32_t>(optionCount); ++option)
            probabilities.Append(JsonValue::CreateNumberValue(defaultValue));
        JsonObject probabilityTable;
        probabilityTable.SetNamedValue(L"options", probabilities);
        strategy.SetNamedValue(L"probabilities", probabilityTable);
        auto forcedTexts = Array(question, L"forced_texts");
        if (forcedTexts.Size()) strategy.SetNamedValue(L"texts", forcedTexts);
        for (auto const& entry : changes)
        {
            if (entry.Value().ValueType() != JsonValueType::Null) strategy.SetNamedValue(entry.Key(), entry.Value());
        }
        strategies.Append(strategy);
        auto answers = Answers();
        answers.SetNamedValue(L"questions", strategies);
        m_config.SetNamedValue(L"answers", answers);
        m_dirty = true;
    }

    void WizardDocument::SetRule(int32_t index, JsonObject const& rule)
    {
        auto validation = ValidateRule(rule);
        if (!validation.empty()) throw hresult_invalid_argument(validation);
        auto rules = Rules();
        if (index >= 0 && static_cast<uint32_t>(index) < rules.Size())
        {
            rules.SetAt(static_cast<uint32_t>(index), rule);
        }
        else
        {
            rules.Append(rule);
        }
        auto answers = Answers();
        answers.SetNamedValue(L"rules", rules);
        m_config.SetNamedValue(L"answers", answers);
        m_dirty = true;
    }

    void WizardDocument::DeleteRule(uint32_t index)
    {
        auto rules = Rules();
        if (index >= rules.Size()) return;
        rules.RemoveAt(index);
        auto answers = Answers();
        answers.SetNamedValue(L"rules", rules);
        m_config.SetNamedValue(L"answers", answers);
        m_dirty = true;
    }

    bool WizardDocument::MoveRule(uint32_t from, uint32_t to)
    {
        auto rules = Rules();
        if (from >= rules.Size() || to >= rules.Size() || from == to) return false;
        auto value = rules.GetAt(from);
        rules.RemoveAt(from);
        rules.InsertAt(to, value);
        auto answers = Answers();
        answers.SetNamedValue(L"rules", rules);
        m_config.SetNamedValue(L"answers", answers);
        m_dirty = true;
        return true;
    }

    bool WizardDocument::MoveRuleUp(uint32_t index)
    {
        return index > 0 && MoveRule(index, index - 1);
    }

    bool WizardDocument::MoveRuleDown(uint32_t index)
    {
        auto rules = Rules();
        return index + 1 < rules.Size() && MoveRule(index, index + 1);
    }

    hstring WizardDocument::ValidateRule(JsonObject const& rule) const
    {
        if (!rule) return L"规则不能为空。";
        auto conditionNumber = static_cast<int32_t>(rule.GetNamedNumber(L"condition_question_num", 0));
        auto targetNumber = static_cast<int32_t>(rule.GetNamedNumber(L"target_question_num", 0));
        if (conditionNumber <= 0 || targetNumber <= 0) return L"条件题和目标题必须有效。";
        if (conditionNumber >= targetNumber) return L"目标题必须晚于条件题。";

        JsonObject condition;
        JsonObject target;
        for (auto const& value : DefinitionQuestions())
        {
            auto question = value.GetObject();
            auto number = static_cast<int32_t>(question.GetNamedNumber(L"num", 0));
            if (number == conditionNumber) condition = question;
            if (number == targetNumber) target = question;
        }
        if (!condition || !target) return L"规则引用了不存在的题目。";
        if (!IsSelectable(condition) || !IsSelectable(target)) return L"条件题和目标题必须带可选项。";

        auto checkIndices = [&rule](JsonObject const& question, wchar_t const* key) -> bool
        {
            auto indices = Array(rule, key);
            auto optionCount = static_cast<int32_t>(question.GetNamedNumber(L"options", 0));
            optionCount = (std::max)(optionCount,
                static_cast<int32_t>(Array(question, L"option_texts").Size()));
            for (auto const& value : indices)
            {
                if (value.ValueType() != JsonValueType::Number) return false;
                auto index = static_cast<int32_t>(value.GetNumber());
                if (index < 0 || index >= optionCount) return false;
            }
            return indices.Size() > 0;
        };
        if (!checkIndices(condition, L"condition_option_indices")) return L"条件选项超出题目范围。";
        if (!checkIndices(target, L"target_option_indices")) return L"目标选项超出题目范围。";

        auto validateRow = [&rule](JsonObject const& question, wchar_t const* key) -> bool
        {
            auto value = rule.GetNamedValue(key, nullptr);
            if (!value || value.ValueType() == JsonValueType::Null) return true;
            if (value.ValueType() != JsonValueType::Number) return false;
            auto row = static_cast<int32_t>(value.GetNumber());
            auto rows = (std::max)(static_cast<int32_t>(question.GetNamedNumber(L"rows", 0)),
                static_cast<int32_t>(Array(question, L"row_texts").Size()));
            return IsMatrix(question) && row >= 0 && row < rows;
        };
        if (!validateRow(condition, L"condition_row_index")) return L"条件矩阵行超出题目范围。";
        if (!validateRow(target, L"target_row_index")) return L"目标矩阵行超出题目范围。";
        auto conditionMode = rule.GetNamedString(L"condition_mode", L"");
        auto actionMode = rule.GetNamedString(L"action_mode", L"");
        if (conditionMode != L"selected" && conditionMode != L"not_selected") return L"条件状态无效。";
        if (actionMode != L"must_select" && actionMode != L"must_not_select") return L"规则动作无效。";
        return {};
    }

    void WizardDocument::SetDimensions(JsonArray const& dimensions)
    {
        auto answers = Answers();
        answers.SetNamedValue(L"dimensions", dimensions);
        m_config.SetNamedValue(L"answers", answers);
        m_dirty = true;
    }

    void WizardDocument::SetPsychometrics(bool enabled, double targetAlpha)
    {
        auto psychometrics = Psychometrics();
        psychometrics.SetNamedValue(L"enabled", JsonValue::CreateBooleanValue(enabled));
        psychometrics.SetNamedValue(L"targetAlpha", JsonValue::CreateNumberValue(targetAlpha));
        m_config.SetNamedValue(L"psychometrics", psychometrics);
        m_dirty = true;
    }

    int32_t WizardDocument::Target() const { return static_cast<int32_t>(Execution().GetNamedNumber(L"target", 1)); }
    int32_t WizardDocument::Threads() const { return static_cast<int32_t>(Execution().GetNamedNumber(L"threads", 1)); }
    std::array<int32_t, 2> WizardDocument::SubmitInterval() const { return ReadNumberPair(Execution(), L"submitInterval", 0, 0); }
    std::array<int32_t, 2> WizardDocument::AnswerDuration() const { return ReadNumberPair(Execution(), L"answerDuration", 60, 120); }
    std::array<hstring, 2> WizardDocument::AnswerWindow() const { return ReadStringPair(Execution(), L"answerDatetimeWindow"); }
    bool WizardDocument::FailStop() const { return Execution().GetNamedBoolean(L"failStop", true); }
    bool WizardDocument::PauseCaptcha() const { return Execution().GetNamedBoolean(L"pauseOnAliyunCaptcha", true); }
    hstring WizardDocument::ProxyMode() const { return Network().GetNamedString(L"proxyMode", Network().GetNamedBoolean(L"randomProxyEnabled", false) ? L"random" : L"direct"); }
    hstring WizardDocument::FixedProxyAddress() const { return Network().GetNamedString(L"fixedProxyAddress", L""); }
    hstring WizardDocument::ProxySource() const { return Network().GetNamedString(L"proxySource", L"default"); }
    hstring WizardDocument::CustomProxyAPI() const { return Network().GetNamedString(L"customProxyApi", L""); }
    hstring WizardDocument::ProxyAreaCode() const { return Network().GetNamedString(L"proxyAreaCode", L""); }
    bool WizardDocument::RandomUA() const { return Network().GetNamedBoolean(L"randomUaEnabled", false); }
    bool WizardDocument::ReverseFillEnabled() const { return ReverseFill().GetNamedBoolean(L"enabled", false); }
    hstring WizardDocument::ReverseFillPath() const { return ReverseFill().GetNamedString(L"sourcePath", L""); }
    bool WizardDocument::PsychometricsEnabled() const { return Psychometrics().GetNamedBoolean(L"enabled", false); }
    double WizardDocument::TargetAlpha() const { return Psychometrics().GetNamedNumber(L"targetAlpha", 0.85); }

    hstring WizardDocument::CheckRequest(JsonObject const& settings) const
    {
        JsonObject request;
        request.SetNamedValue(L"config", m_config);
        request.SetNamedValue(L"aiProfile", settings.GetNamedObject(L"aiProfile", JsonObject{}));
        return request.Stringify();
    }

    hstring WizardDocument::SaveRequest() const
    {
        JsonObject request;
        request.SetNamedValue(L"path", JsonValue::CreateStringValue(m_path));
        request.SetNamedValue(L"config", m_config);
        return request.Stringify();
    }

    hstring WizardDocument::RunRequest() const
    {
        JsonObject request;
        request.SetNamedValue(L"config", m_config);
        return request.Stringify();
    }

    JsonObject WizardDocument::Survey() const { return m_config ? Object(m_config, L"survey") : JsonObject{}; }
    JsonObject WizardDocument::Execution() const { return m_config ? Object(m_config, L"execution") : JsonObject{}; }
    JsonObject WizardDocument::Network() const { return m_config ? Object(m_config, L"network") : JsonObject{}; }
    JsonObject WizardDocument::ReverseFill() const { return m_config ? Object(m_config, L"reverseFill") : JsonObject{}; }
    JsonObject WizardDocument::Answers() const { return m_config ? Object(m_config, L"answers") : JsonObject{}; }
    JsonObject WizardDocument::Psychometrics() const { return m_config ? Object(m_config, L"psychometrics") : JsonObject{}; }
    JsonArray WizardDocument::DefinitionQuestions() const { return Array(Object(Survey(), L"definition"), L"questions"); }
    JsonArray WizardDocument::Strategies() const { return m_config ? Array(Object(m_config, L"answers"), L"questions") : JsonArray{}; }
}
