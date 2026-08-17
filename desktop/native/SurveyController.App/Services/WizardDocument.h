#pragma once

namespace winrt::SurveyController::App::Services
{
    struct WizardQuestion
    {
        int32_t number{};
        hstring title;
        hstring type;
        bool required{};
        int32_t options{};
        hstring dimension;
        hstring bias{ L"custom" };
        hstring weights;
        bool aiEnabled{};
    };

    class WizardDocument final
    {
    public:
        static WizardDocument& Current();

        void LoadConfigState(hstring const& json);
        void SetParsedConfig(hstring const& json);
        bool Initialized() const { return m_initialized; }
        bool Dirty() const { return m_dirty; }
        bool HasRealSurvey() const;

        hstring Path() const { return m_path; }
        hstring URL() const;
        hstring Title() const;
        hstring Provider() const;
        uint32_t QuestionCount() const;
        uint32_t StrategyCount() const;
        std::vector<WizardQuestion> Questions() const;
        Windows::Data::Json::JsonObject QuestionAt(uint32_t index) const;
        Windows::Data::Json::JsonObject StrategyAt(uint32_t index) const;
        Windows::Data::Json::JsonArray Rules() const;
        Windows::Data::Json::JsonArray Dimensions() const;

        void SetSurveyURL(hstring const& value);
        void SetExecution(int32_t target, int32_t threads, int32_t intervalMin, int32_t intervalMax,
            int32_t durationMin, int32_t durationMax, hstring const& windowStart, hstring const& windowEnd,
            bool failStop, bool pauseCaptcha);
        void SetNetwork(hstring const& mode, hstring const& fixedAddress, hstring const& source,
            hstring const& customApi, hstring const& areaCode, bool randomUA);
        void SetReverseFill(bool enabled, hstring const& path);
        void SetQuestionStrategy(uint32_t index, hstring const& dimension, hstring const& bias,
            hstring const& weights, bool aiEnabled);
        void UpdateQuestionStrategy(uint32_t index, Windows::Data::Json::JsonObject const& changes);
        void SetRule(int32_t index, Windows::Data::Json::JsonObject const& rule);
        void DeleteRule(uint32_t index);
        void SetDimensions(Windows::Data::Json::JsonArray const& dimensions);

        int32_t Target() const;
        int32_t Threads() const;
        std::array<int32_t, 2> SubmitInterval() const;
        std::array<int32_t, 2> AnswerDuration() const;
        std::array<hstring, 2> AnswerWindow() const;
        bool FailStop() const;
        bool PauseCaptcha() const;
        hstring ProxyMode() const;
        hstring FixedProxyAddress() const;
        hstring ProxySource() const;
        hstring CustomProxyAPI() const;
        hstring ProxyAreaCode() const;
        bool RandomUA() const;
        bool ReverseFillEnabled() const;
        hstring ReverseFillPath() const;

        hstring CheckRequest(Windows::Data::Json::JsonObject const& settings) const;
        hstring SaveRequest() const;
        hstring RunRequest() const;

    private:
        Windows::Data::Json::JsonObject m_config{ nullptr };
        hstring m_path;
        bool m_initialized{};
        bool m_dirty{};

        Windows::Data::Json::JsonObject Survey() const;
        Windows::Data::Json::JsonObject Execution() const;
        Windows::Data::Json::JsonObject Network() const;
        Windows::Data::Json::JsonObject ReverseFill() const;
        Windows::Data::Json::JsonArray DefinitionQuestions() const;
        Windows::Data::Json::JsonArray Strategies() const;
        Windows::Data::Json::JsonObject Answers() const;
    };
}
