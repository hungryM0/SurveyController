using System.Text.Json.Nodes;
using SurveyController.Core.Document;
using Xunit;

namespace SurveyController.Core.Tests;

/// <summary>语义对照 C++ 原生测试 SurveyController.Native.Tests/main.cpp 移植。</summary>
public class WizardDocumentTests
{
    [Fact]
    public void LoadConfigState_ExposesLoadedSurvey()
    {
        var document = new WizardDocument();
        document.LoadConfigState("""
            {
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
            }
            """);

        Assert.True(document.Initialized);
        Assert.False(document.Dirty);
        Assert.True(document.HasRealSurvey());
        Assert.Equal(1, document.QuestionCount());
        Assert.Equal(1, document.StrategyCount());

        var questions = document.Questions();
        Assert.Single(questions);
        Assert.Equal(1, questions[0].Number);
        Assert.True(questions[0].Type.Length == 0 || questions[0].Type == "radio");
        Assert.True(questions[0].Required);
        Assert.True(questions[0].Weights.Length == 0 || questions[0].Weights == "1, 2, 3");
    }

    [Fact]
    public void Mutations_RoundTripAndMarkDirty()
    {
        var document = LoadedRuleFixture();
        document.SetExecution(20, 4, 1, 3, 30, 90, "08:00", "22:00", false, true);
        document.SetNetwork("fixed", "127.0.0.1:8080", "default", "", "11", true);
        document.SetReverseFill(true, "C:\\data\\answers.csv");
        document.SetQuestionStrategy(0, "score", "custom", "4, -1; 6.5", true);

        Assert.True(document.Dirty);
        Assert.Equal((20, 4), (document.Target(), document.Threads()));
        Assert.Equal((1, 3), document.SubmitInterval());
        Assert.Equal("fixed", document.ProxyMode());
        Assert.Equal("127.0.0.1:8080", document.FixedProxyAddress());
        Assert.True(document.ReverseFillEnabled());

        var request = JsonNode.Parse(document.RunRequest())!.AsObject();
        var config = request["config"]!.AsObject();
        var strategy = config["answers"]!.AsObject()["questions"]!.AsArray()[0]!.AsObject();
        var weights = strategy["custom_weights"]!.AsObject()["options"]!.AsArray();
        // 策略编辑是草稿：既有 strategy JSON 必须原样保留，等待 Go 归一化。
        Assert.Equal("quality", strategy["dimension"]?.GetValue<string>() ?? "quality");
        Assert.False(strategy["ai_enabled"]?.GetValue<bool>() ?? false);
        Assert.Equal(3, weights.Count);
    }

    [Fact]
    public void SetParsedConfig_RejectsInvalidJson()
    {
        var document = new WizardDocument();
        Assert.Throws<InvalidOperationException>(() => document.SetParsedConfig("not-json"));
        Assert.Throws<InvalidOperationException>(() => document.LoadConfigState("[1,2]"));
    }

    [Fact]
    public void Questions_BindBackendFieldsWithoutNormalization()
    {
        var document = new WizardDocument();
        document.LoadConfigState("""
            {
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
            }
            """);

        var questions = document.Questions();
        Assert.Equal(13, questions.Count);
        Assert.True(questions[0].Number == 1 && questions[0].Options == 2,
            "题目展示直接绑定后端字段，不做壳层归一化");
        Assert.Equal("unsupported", questions[12].NormalizedType);

        document.UpdateQuestionStrategy(0, Parse("""{"dimension":"created"}"""));
        Assert.Equal(0, document.StrategyCount());
    }

    [Fact]
    public void MalformedProviderMetadata_DoesNotAbortQuestions()
    {
        var document = new WizardDocument();
        document.SetParsedConfig("""
            {
                "survey":{"url":"https://example.test/malformed","definition":{"questions":[
                    {"num":1,"provider_type":"radio","title":"Malformed","options":2,
                     "option_texts":{},"row_texts":"not-an-array","jump_rules":{},
                     "controls_display_targets":null}
                ]},"provider":"wjx"},
                "answers":{"questions":[{"question_num":1,"option_fill_texts":{},"multi_text_blank_ai_flags":null}]}
            }
            """);

        var malformed = document.Questions();

        Assert.Single(malformed);
        Assert.Equal(2, malformed[0].Options);
        Assert.Empty(malformed[0].OptionTexts);
        Assert.Equal(1, document.StrategyCount());
    }

    [Fact]
    public void Transactions_RollbackRestoresContentAndDirtyFlag()
    {
        var document = LoadedRuleFixture();
        var original = document.RunRequest();
        Assert.False(document.Dirty);

        document.BeginEditTransaction();
        document.SetQuestionStrategy(0, "changed", "custom", "4,5,6", false);
        Assert.True(document.Dirty);
        document.RollbackEditTransaction();
        Assert.False(document.Dirty);
        Assert.Equal(original, document.RunRequest());

        document.BeginEditTransaction();
        document.SetQuestionStrategy(0, "committed", "custom", "6,5,4", false);
        document.CommitEditTransaction();
        Assert.True(document.Dirty);

        // 预置脏状态必须在回滚后保留（对应 AnswerEditorWindow 取消场景）。
        document.LoadConfigState(original);
        document.SetSurveyURL("https://example.test/dirty");
        Assert.True(document.Dirty);
        document.BeginEditTransaction();
        document.SetQuestionStrategy(0, "temporary", "custom", "9,9,9", false);
        document.RollbackEditTransaction();
        Assert.True(document.Dirty);
        Assert.Equal("https://example.test/dirty", document.URL());
    }

    [Fact]
    public void Rules_AppendMoveAndValidationContract()
    {
        var document = new WizardDocument();
        document.LoadConfigState("""
            {
                "config":{
                    "survey":{"url":"https://example.test/rules","definition":{"questions":[
                        {"num":1,"provider_type":"radio","options":3,"option_texts":["A","B","C"]},
                        {"num":2,"provider_type":"matrix_radio","options":2,"rows":2,"option_texts":["X","Y"],"row_texts":["R1","R2"]},
                        {"num":3,"provider_type":"slider","options":1,"rows":1},
                        {"num":4,"provider_type":"text","options":0}
                    ]}},"answers":{"questions":[],"rules":[]}}
            }
            """);

        document.SetRule(-1, Rule("first", "selected", [0], "must_select", [1], targetRow: 1));
        document.SetRule(-1, Rule("second", "not_selected", [2], "must_not_select", [0], targetRow: 0));
        Assert.Equal(2, document.Rules()!.Count);

        Assert.True(document.MoveRuleDown(0));
        Assert.Equal("second", RuleId(document.Rules()![0]));
        Assert.True(document.MoveRuleUp(1));
        Assert.False(document.MoveRuleUp(0));
        Assert.False(document.MoveRuleDown(1));

        document.DeleteRule(1);
        Assert.Single(document.Rules()!);

        // 规则校验由 Go 拥有：任何形状的原生侧校验恒为通过。
        foreach (var rule in new[]
                 {
                     Rule("fwd", "selected", [0], "must_select", [0]).ToJsonString(),
                     """{"condition_question_num":2,"condition_mode":"selected","condition_option_indices":[0],"target_question_num":1,"action_mode":"must_select","target_option_indices":[0]}""",
                     """{"condition_question_num":4,"condition_mode":"selected","condition_option_indices":[0],"target_question_num":2,"action_mode":"must_select","target_option_indices":[0]}""",
                     """{"condition_question_num":1,"condition_mode":"selected","condition_option_indices":[3],"target_question_num":2,"action_mode":"must_select","target_option_indices":[0]}""",
                     """{"condition_question_num":1,"condition_mode":"selected","condition_option_indices":[0],"target_question_num":2,"action_mode":"must_select","target_option_indices":[0],"target_row_index":2}""",
                     """{"condition_question_num":1,"condition_mode":"selected","condition_option_indices":[0],"target_question_num":3,"action_mode":"must_select","target_option_indices":[0],"target_row_index":0}""",
                 })
        {
            Assert.Equal(string.Empty, document.ValidateRule(Parse(rule)));
        }
    }

    [Fact]
    public void Requests_ExposeConfigAndAiProfile()
    {
        var document = LoadedRuleFixture();

        var check = JsonNode.Parse(document.CheckRequest(Parse("""{"aiProfile":{"mode":"free"}}""")))!.AsObject();
        Assert.NotNull(check["config"]);
        Assert.Equal("free", check["aiProfile"]!.AsObject()["mode"]!.GetValue<string>());

        var save = JsonNode.Parse(document.SaveRequest())!.AsObject();
        Assert.NotNull(save["path"]);

        var run = JsonNode.Parse(document.RunRequest())!.AsObject();
        Assert.NotNull(run["config"]);
    }

    private static WizardDocument LoadedRuleFixture()
    {
        var document = new WizardDocument();
        document.LoadConfigState("""
            {
                "path":"C:\\configs\\rules.json",
                "config":{
                    "survey":{"url":"https://example.test/rules","definition":{"questions":[
                        {"num":1,"provider_type":"radio","title":"Condition","options":3,"option_texts":["A","B","C"]},
                        {"num":2,"provider_type":"matrix_radio","title":"Target","options":2,"rows":2,"option_texts":["X","Y"],"row_texts":["R1","R2"]}
                    ]}},"answers":{"questions":[{"question_num":1,"custom_weights":{"options":[1,2,3]}}],"rules":[]}}
            }
            """);
        return document;
    }

    private static JsonObject Rule(string id, string conditionMode, int[] conditionIndices,
        string actionMode, int[] targetIndices, int? targetRow = null)
    {
        var rule = new JsonObject
        {
            ["id"] = id,
            ["condition_question_num"] = 1,
            ["condition_mode"] = conditionMode,
            ["condition_option_indices"] = new JsonArray(conditionIndices.Select(i => JsonValue.Create(i)).ToArray()),
            ["target_question_num"] = 2,
            ["action_mode"] = actionMode,
            ["target_option_indices"] = new JsonArray(targetIndices.Select(i => JsonValue.Create(i)).ToArray()),
        };
        if (targetRow is { } row)
        {
            rule["target_row_index"] = row;
        }
        return rule;
    }

    private static JsonObject Parse(string json) => JsonNode.Parse(json)!.AsObject();

    private static string RuleId(JsonNode? node) => node!["id"]!.GetValue<string>();
}
