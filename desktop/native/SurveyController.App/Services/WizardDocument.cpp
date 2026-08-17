#include "pch.h"
#include "WizardDocument.h"
#include "JsonHelpers.h"

#include <charconv>
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
            if (value == L"single" || value == L"radio" || value == L"3") return L"单选题";
            if (value == L"multiple" || value == L"checkbox" || value == L"4") return L"多选题";
            if (value == L"scale" || value == L"5") return L"量表题";
            if (value == L"matrix" || value == L"matrix_radio" || value == L"6") return L"矩阵题";
            if (value == L"multi_text") return L"多项填空";
            return L"填空题";
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
            item.title = question.GetNamedString(L"title", L"");
            auto rawType = question.GetNamedString(L"provider_type", question.GetNamedString(L"type_code", L""));
            item.type = QuestionTypeLabel(rawType);
            item.required = question.GetNamedBoolean(L"required", false);
            item.options = static_cast<int32_t>(question.GetNamedNumber(L"options", 0));
            for (auto const& strategyValue : strategies)
            {
                auto strategy = strategyValue.GetObject();
                if (static_cast<int32_t>(strategy.GetNamedNumber(L"question_num", -1)) != item.number) continue;
                item.dimension = strategy.GetNamedString(L"dimension", L"");
                item.bias = strategy.GetNamedString(L"psycho_bias", L"custom");
                item.aiEnabled = strategy.GetNamedBoolean(L"ai_enabled", false);
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
    }

    void WizardDocument::SetRule(int32_t index, JsonObject const& rule)
    {
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

    void WizardDocument::SetDimensions(JsonArray const& dimensions)
    {
        auto answers = Answers();
        answers.SetNamedValue(L"dimensions", dimensions);
        m_config.SetNamedValue(L"answers", answers);
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
    JsonArray WizardDocument::DefinitionQuestions() const { return Array(Object(Survey(), L"definition"), L"questions"); }
    JsonArray WizardDocument::Strategies() const { return m_config ? Array(Object(m_config, L"answers"), L"questions") : JsonArray{}; }
}
