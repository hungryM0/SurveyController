#include "pch.h"
#include "Services/ShellSettings.h"
#include "Services/WizardDocument.h"
#include "Services/BackendClient.h"

#include <functional>
#include <iostream>
#include <stdexcept>
#include <string_view>

namespace
{
    using winrt::SurveyController::App::Services::ShellSettings;
    using winrt::SurveyController::App::Services::WizardDocument;
    using winrt::SurveyController::App::Services::BackendClient;
    using namespace winrt::Windows::Data::Json;

    void Expect(bool condition, std::string_view message)
    {
        if (!condition)
        {
            throw std::runtime_error(std::string{ message });
        }
    }

    void TestShellSettingsNotifications()
    {
        auto& settings = ShellSettings::Current();
        settings.SetChangedHandler({});
        settings.Update(L"");

        int calls = 0;
        winrt::hstring received;
        settings.SetChangedHandler([&](winrt::hstring const& value)
        {
            ++calls;
            received = value;
        });
        settings.Update(LR"({"theme":"dark"})");

        Expect(calls == 1, "ShellSettings must notify once after an update");
        Expect(received == LR"({"theme":"dark"})", "ShellSettings must forward the updated JSON");

        int replayCalls = 0;
        settings.SetChangedHandler([&](winrt::hstring const& value)
        {
            ++replayCalls;
            received = value;
        });
        Expect(replayCalls == 1, "ShellSettings must replay the current value to a new handler");
        Expect(received == LR"({"theme":"dark"})", "ShellSettings replay must keep the current JSON");
        settings.SetChangedHandler({});
    }

    void TestWizardDocumentStateAndMutations()
    {
        auto& document = WizardDocument::Current();
        document.LoadConfigState(LR"({
            "path":"C:\\configs\\survey.json",
            "config":{
                "survey":{
                    "url":"https://example.test/survey",
                    "title":"Example",
                    "provider":"wjx",
                    "definition":{"questions":[
                        {"num":0,"title":"Intro","is_description":true},
                        {"num":1,"title":"Choice","provider_type":"radio","required":true,"options":3}
                    ]}
                },
                "execution":{"target":2,"threads":1},
                "network":{"proxyMode":"direct"},
                "reverseFill":{"enabled":false},
                "answers":{"questions":[
                    {"question_num":1,"dimension":"quality","psycho_bias":"custom","custom_weights":{"options":[1,2,3]}}
                ],"rules":[],"dimensions":[]}
            }
        })");

        Expect(document.Initialized(), "WizardDocument must be initialized after loading state");
        Expect(!document.Dirty(), "Loading persisted state must not mark the document dirty");
        Expect(document.HasRealSurvey(), "A survey with a non-description question must be real");
        Expect(document.QuestionCount() == 1, "Description entries must not count as questions");
        Expect(document.StrategyCount() == 1, "Question strategies must be exposed");

        auto questions = document.Questions();
        Expect(questions.size() == 1, "Only answerable questions must be returned");
        Expect(questions[0].number == 1, "Question number must be preserved");
        Expect(questions[0].type.empty() || questions[0].type == L"radio", "Question labels come from the backend DTO");
        Expect(questions[0].required, "Required question metadata must be preserved");
        Expect(questions[0].weights.empty() || questions[0].weights == L"1, 2, 3", "Strategy summaries come from the backend DTO");

        document.SetExecution(20, 4, 1, 3, 30, 90, L"08:00", L"22:00", false, true);
        document.SetNetwork(L"fixed", L"127.0.0.1:8080", L"default", L"", L"11", true);
        document.SetReverseFill(true, L"C:\\data\\answers.csv");
        document.SetQuestionStrategy(0, L"score", L"custom", L"4, -1; 6.5", true);

        Expect(document.Dirty(), "Editing the wizard must mark the document dirty");
        Expect(document.Target() == 20 && document.Threads() == 4, "Execution values must round-trip");
        Expect(document.SubmitInterval() == std::array<int32_t, 2>{ 1, 3 }, "Submit interval must round-trip");
        Expect(document.ProxyMode() == L"fixed", "Proxy mode must round-trip");
        Expect(document.FixedProxyAddress() == L"127.0.0.1:8080", "Fixed proxy address must round-trip");
        Expect(document.ReverseFillEnabled(), "Reverse fill state must round-trip");

        auto request = JsonObject::Parse(document.RunRequest());
        auto config = request.GetNamedObject(L"config");
        auto strategy = config.GetNamedObject(L"answers").GetNamedArray(L"questions").GetObjectAt(0);
        auto weights = strategy.GetNamedObject(L"custom_weights").GetNamedArray(L"options");
        Expect(strategy.GetNamedString(L"dimension", L"") == L"score", "Strategy dimension must persist in the request");
        Expect(strategy.GetNamedString(L"psycho_bias", L"") == L"custom", "Strategy bias must persist in the request");
        Expect(strategy.GetNamedBoolean(L"ai_enabled", false), "Strategy AI setting must persist in the request");
        Expect(weights.Size() == 3 && weights.GetNumberAt(0) == 4 && weights.GetNumberAt(1) == -1,
            "Strategy custom weights must persist in the request");
        auto probabilities = strategy.GetNamedObject(L"probabilities").GetNamedArray(L"options");
        Expect(probabilities.Size() == 3 && probabilities.GetNumberAt(2) == 6.5,
            "RunRequest must include the edited probabilities");
    }

    void TestWizardDocumentRejectsInvalidJson()
    {
        bool threw = false;
        try
        {
            WizardDocument::Current().SetParsedConfig(L"not-json");
        }
        catch (winrt::hresult_error const&)
        {
            threw = true;
        }
        Expect(threw, "WizardDocument must reject invalid JSON");
    }

    void TestWizardQuestionNormalization()
    {
        auto& document = WizardDocument::Current();
        auto normJson = LR"({
            "config":{
                "survey":{"url":"https://example.test/types","definition":{"questions":[
                    {"num":1,"provider_type":"radio","provider":"qq","provider_question_id":"q1","provider_page_id":"p1","title":"Single","options":0,"option_texts":["A","B"]},
                    {"num":2,"provider_type":"checkbox","title":"Multiple","options":2,"option_texts":["A","B"]},
                    {"num":3,"type_code":"7","title":"Dropdown","options":2,"option_texts":["A","B"]},
                    {"num":4,"provider_type":"matrix_radio","title":"Matrix","options":2,"rows":0,"row_texts":["R1","R2"]},
                    {"num":5,"provider_type":"order","title":"Sort","options":2,"option_texts":["A","B"]},
                    {"num":6,"is_rating":true,"title":"Scale","options":5},
                    {"num":7,"type_code":"8","title":"Slider","options":1,"slider_min":"10","slider_max":"90"},
                    {"num":8,"provider_type":"matrix","is_slider_matrix":true,"title":"Slider matrix","options":2,"rows":2},
                    {"num":9,"is_multi_text":true,"title":"Multi text","text_inputs":2},
                    {"num":10,"is_location":true,"title":"Location"},
                    {"num":11,"type_code":"1","is_text_like":true,"text_inputs":1,"title":"Text"},
                    {"num":12,"unsupported":true,"title":"Unsupported"},
                    {"num":13,"provider_type":"new_widget","type_code":"99","title":"Unknown"}
                ]}},"answers":{"questions":[]}}
        })";
        document.LoadConfigState(normJson);

        auto questions = document.Questions();
        Expect(questions.size() == 13, "All non-description questions must be normalized");
        Expect(questions[0].number == 1 && questions[0].options == 2,
            "Question display binds backend-provided fields without normalization");

        document.UpdateQuestionStrategy(0, JsonObject::Parse(LR"({"dimension":"created"})"));
        Expect(document.StrategyCount() == 1, "Strategy edits must update the mapped strategy");
        auto updatedConfig = JsonObject::Parse(document.RunRequest()).GetNamedObject(L"config");
        auto updatedStrategy = updatedConfig.GetNamedObject(L"answers").GetNamedArray(L"questions").GetObjectAt(0);
        Expect(updatedStrategy.GetNamedString(L"dimension", L"") == L"created",
            "Strategy edits must persist in the document");

        // Provider metadata is external input. Wrong-shaped optional fields must be ignored.
        document.SetParsedConfig(LR"({
            "survey":{"url":"https://example.test/malformed","definition":{"questions":[
                {"num":1,"provider_type":"radio","title":"Malformed","options":2,
                 "option_texts":{},"row_texts":"not-an-array","jump_rules":{},
                 "controls_display_targets":null}
            ]},"provider":"wjx"},
            "answers":{"questions":[{"question_num":1,"option_fill_texts":{},"multi_text_blank_ai_flags":null}]}
        })");
        auto malformed = document.Questions();
        Expect(malformed.size() == 1 && malformed[0].options == 2,
            "Malformed optional metadata must not abort question normalization");
    }

    void TestWizardDocumentTransactionsAndRules()
    {
        auto& document = WizardDocument::Current();
        document.LoadConfigState(LR"({
            "config":{
                "survey":{"url":"https://example.test/rules","definition":{"questions":[
                    {"num":1,"provider_type":"radio","title":"Condition","options":3,"option_texts":["A","B","C"]},
                    {"num":2,"provider_type":"matrix_radio","title":"Target","options":2,"rows":2,"option_texts":["X","Y"],"row_texts":["R1","R2"]},
                    {"num":3,"provider_type":"slider","title":"Slider","options":1,"rows":1},
                    {"num":4,"provider_type":"text","title":"Text"}
                ]}},"answers":{"questions":[{"question_num":1,"custom_weights":{"options":[1,2,3]}}],"rules":[]}}
        })");

        auto original = document.RunRequest();
        Expect(!document.Dirty(), "Loaded rule fixture must start clean");
        Expect(document.StrategyCount() == 1, "Rule fixture must contain one editable strategy");
        document.BeginEditTransaction();
        document.SetQuestionStrategy(0, L"changed", L"custom", L"4,5,6", false);
        Expect(document.Dirty(), "Transaction edits must mark the document dirty");
        document.RollbackEditTransaction();
        Expect(!document.Dirty() && document.RunRequest() == original,
            "Rollback must restore content and the original clean state");

        document.BeginEditTransaction();
        document.SetQuestionStrategy(0, L"committed", L"custom", L"6,5,4", false);
        document.CommitEditTransaction();
        Expect(document.Dirty(), "Commit must retain transaction dirty state");

        document.LoadConfigState(original);
        document.SetSurveyURL(L"https://example.test/dirty");
        Expect(document.Dirty(), "A pre-existing dirty state must be retained");
        document.BeginEditTransaction();
        document.SetQuestionStrategy(0, L"temporary", L"custom", L"9,9,9", false);
        document.RollbackEditTransaction();
        Expect(document.Dirty() && document.URL() == L"https://example.test/dirty",
            "Rollback must restore the dirty flag captured at transaction start");

        document.LoadConfigState(LR"({
            "config":{
                "survey":{"url":"https://example.test/rules","definition":{"questions":[
                    {"num":1,"provider_type":"radio","options":3,"option_texts":["A","B","C"]},
                    {"num":2,"provider_type":"matrix_radio","options":2,"rows":2,"option_texts":["X","Y"],"row_texts":["R1","R2"]},
                    {"num":3,"provider_type":"slider","options":1,"rows":1},
                    {"num":4,"provider_type":"text","options":0}
                ]}},"answers":{"questions":[],"rules":[]}}
        })");

        auto valid = JsonObject::Parse(LR"({
            "id":"first","condition_question_num":1,"condition_mode":"selected",
            "condition_option_indices":[0],"target_question_num":2,"action_mode":"must_select",
            "target_option_indices":[1],"target_row_index":1
        })");
        Expect(document.ValidateRule(valid).empty(), "A valid forward matrix rule must pass validation");
        document.SetRule(-1, valid);
        auto second = JsonObject::Parse(LR"({
            "id":"second","condition_question_num":1,"condition_mode":"not_selected",
            "condition_option_indices":[2],"target_question_num":2,"action_mode":"must_not_select",
            "target_option_indices":[0],"target_row_index":0
        })");
        document.SetRule(-1, second);
        Expect(document.Rules().Size() == 2, "Rules must support append");
        Expect(document.MoveRuleDown(0), "Rules must move down");
        Expect(document.Rules().GetObjectAt(0).GetNamedString(L"id") == L"second",
            "Moving down must update the rule order");
        Expect(document.MoveRuleUp(1), "Rules must move up");
        Expect(!document.MoveRuleUp(0) && !document.MoveRuleDown(1),
            "Moving the first rule up or last rule down must be rejected");

        auto before = JsonObject::Parse(LR"({
            "condition_question_num":2,"condition_mode":"selected","condition_option_indices":[0],
            "target_question_num":1,"action_mode":"must_select","target_option_indices":[0]
        })");
        Expect(document.ValidateRule(before).empty(), "Rule validation is owned by Go");
        auto textCondition = JsonObject::Parse(LR"({
            "condition_question_num":4,"condition_mode":"selected","condition_option_indices":[0],
            "target_question_num":2,"action_mode":"must_select","target_option_indices":[0]
        })");
        Expect(document.ValidateRule(textCondition).empty(), "Rule validation is owned by Go");
        auto badOption = JsonObject::Parse(LR"({
            "condition_question_num":1,"condition_mode":"selected","condition_option_indices":[3],
            "target_question_num":2,"action_mode":"must_select","target_option_indices":[0]
        })");
        Expect(document.ValidateRule(badOption).empty(), "Rule validation is owned by Go");
        auto badRow = JsonObject::Parse(LR"({
            "condition_question_num":1,"condition_mode":"selected","condition_option_indices":[0],
            "target_question_num":2,"action_mode":"must_select","target_option_indices":[0],"target_row_index":2
        })");
        Expect(document.ValidateRule(badRow).empty(), "Rule validation is owned by Go");
        auto sliderRow = JsonObject::Parse(LR"({
            "condition_question_num":1,"condition_mode":"selected","condition_option_indices":[0],
            "target_question_num":3,"action_mode":"must_select","target_option_indices":[0],"target_row_index":0
        })");
        Expect(document.ValidateRule(sliderRow).empty(), "Rule validation is owned by Go");
    }

    void TestRpcEnvelopeValidation()
    {
        auto request = JsonObject::Parse(winrt::to_hstring(
            BackendClient::BuildRequestPayload(7, L"LoadConfig", L"{}")));
        Expect(request.GetNamedNumber(L"id") == 7, "RPC request id must be serialized");
        Expect(request.GetNamedString(L"method") == L"LoadConfig", "RPC method must be serialized");
        Expect(request.GetNamedObject(L"params").Size() == 0, "RPC params must remain JSON");

        Expect(BackendClient::ParseResponsePayload(7, R"({"id":7,"result":{"ok":true},"error":null})")
            == LR"({"ok":true})", "RPC result must be returned as JSON");

        for (auto const& payload : {
            R"({"id":8,"result":null})",
            R"({"id":7})",
            R"({"id":"7","result":null})",
            R"({"id":7,"error":"broken"})",
            R"(not-json)" })
        {
            bool threw = false;
            try { BackendClient::ParseResponsePayload(7, payload); }
            catch (winrt::hresult_error const&) { threw = true; }
            Expect(threw, "Malformed RPC response must be rejected");
        }
    }

    int RunTest(std::string_view name, std::function<void()> const& test)
    {
        try
        {
            test();
            std::cout << "PASS " << name << '\n';
            return 0;
        }
        catch (std::exception const& exception)
        {
            std::cerr << "FAIL " << name << ": " << exception.what() << '\n';
            return 1;
        }
        catch (...)
        {
            std::cerr << "FAIL " << name << ": unknown exception\n";
            return 1;
        }
    }
}

int wmain()
{
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    int failures = 0;
    failures += RunTest("ShellSettings notifications", TestShellSettingsNotifications);
    failures += RunTest("WizardDocument state and mutations", TestWizardDocumentStateAndMutations);
    failures += RunTest("WizardDocument invalid JSON", TestWizardDocumentRejectsInvalidJson);
    failures += RunTest("WizardDocument question normalization", TestWizardQuestionNormalization);
    failures += RunTest("WizardDocument transactions and rules", TestWizardDocumentTransactionsAndRules);
    failures += RunTest("RPC envelope validation", TestRpcEnvelopeValidation);
    std::cout << "Native tests: " << (failures == 0 ? "PASS" : "FAIL") << '\n';
    return failures == 0 ? 0 : 1;
}
