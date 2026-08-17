#include "pch.h"
#include "Services/ShellSettings.h"
#include "Services/WizardDocument.h"

#include <functional>
#include <iostream>
#include <stdexcept>
#include <string_view>

namespace
{
    using winrt::SurveyController::App::Services::ShellSettings;
    using winrt::SurveyController::App::Services::WizardDocument;
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
        Expect(questions[0].type == L"\x5355\x9009\x9898", "Radio questions must use the native label");
        Expect(questions[0].required, "Required question metadata must be preserved");
        Expect(questions[0].weights == L"1, 2, 3", "Custom weights must be formatted for the editor");

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
        Expect(strategy.GetNamedString(L"dimension") == L"score", "Strategy dimension must be serialized");
        Expect(strategy.GetNamedBoolean(L"ai_enabled"), "AI strategy state must be serialized");
        Expect(weights.Size() == 2, "Negative custom weights must be discarded");
        Expect(weights.GetNumberAt(0) == 4 && weights.GetNumberAt(1) == 6.5, "Valid custom weights must be serialized");
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
    std::cout << "Native tests: " << (failures == 0 ? "PASS" : "FAIL") << '\n';
    return failures == 0 ? 0 : 1;
}
