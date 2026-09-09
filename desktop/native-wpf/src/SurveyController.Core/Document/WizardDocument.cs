using System.Text.Json;
using System.Text.Json.Nodes;
using SurveyController.Core.Settings;

namespace SurveyController.Core.Document;

/// <summary>
/// 向导配置文档：进程内持有 {"path","config"} 状态，提供读取、编辑事务和请求构造。
/// 语义与 C++ Services/WizardDocument 一致——策略规范化和规则校验由 Go 负责，
/// 壳层仅维护编辑草稿状态（SetQuestionStrategy/UpdateQuestionStrategy/ValidateRule 为占位）。
/// </summary>
public sealed class WizardDocument
{
    public static WizardDocument Current { get; } = new();

    private JsonObject? _config;
    private JsonObject? _transactionConfig;
    private string _path = string.Empty;
    private string _transactionPath = string.Empty;
    private bool _initialized;
    private bool _dirty;
    private bool _transactionDirty;
    private bool _transactionActive;

    /// <param name="shellSettings">保留参数以便未来联动；当前文档不直接消费设置。</param>
    public WizardDocument(ShellSettings? shellSettings = null)
    {
    }

    public bool Initialized => _initialized;

    public bool Dirty => _dirty;

    public bool EditTransactionActive => _transactionActive;

    public string Path => _path;

    public void LoadConfigState(string json)
    {
        var state = ParseJsonObject(json);
        _path = Str(state, "path", string.Empty);
        _config = Obj(state, "config");
        _initialized = true;
        _dirty = false;
        ClearTransaction();
    }

    public void SetParsedConfig(string json)
    {
        _config = ParseJsonObject(json);
        _initialized = true;
        _dirty = true;
    }

    public void BeginEditTransaction()
    {
        if (_transactionActive)
        {
            return;
        }
        _transactionConfig = _config is null ? null : CloneObject(_config);
        _transactionPath = _path;
        _transactionDirty = _dirty;
        _transactionActive = true;
    }

    public void CommitEditTransaction()
    {
        if (!_transactionActive)
        {
            return;
        }
        ClearTransaction();
    }

    public void RollbackEditTransaction()
    {
        if (!_transactionActive)
        {
            return;
        }
        _config = _transactionConfig;
        _path = _transactionPath;
        _dirty = _transactionDirty;
        ClearTransaction();
    }

    public bool HasRealSurvey()
    {
        if (_config is null || URL().Length == 0)
        {
            return false;
        }
        foreach (var question in DefinitionQuestions())
        {
            if (question is not JsonObject entry || !Bool(entry, "is_description", false))
            {
                return true;
            }
        }
        return false;
    }

    public string URL() => Str(Survey(), "url", string.Empty);

    public string Title() => Str(Survey(), "title", string.Empty);

    public string Provider() => Str(Survey(), "provider", "wjx");

    public int QuestionCount()
    {
        var count = 0;
        foreach (var value in DefinitionQuestions())
        {
            if (value is JsonObject question && !Bool(question, "is_description", false))
            {
                count++;
            }
        }
        return count;
    }

    public int StrategyCount() => Strategies().Count;

    public IReadOnlyList<WizardQuestion> Questions()
    {
        var result = new List<WizardQuestion>();
        foreach (var value in DefinitionQuestions())
        {
            if (value is not JsonObject question || Bool(question, "is_description", false))
            {
                continue;
            }

            var optionTexts = ReadStrings(question, "option_texts");
            var rowTexts = ReadStrings(question, "row_texts");
            result.Add(new WizardQuestion
            {
                Number = Int(question, "num", 0),
                Page = Int(question, "page", 1),
                Rows = Math.Max(Int(question, "rows", 0), rowTexts.Count),
                Title = Str(question, "title", string.Empty),
                // Go 返回的展示 DTO 已包含规范化题型和展示字段；壳层只绑定这些值。
                NormalizedType = Str(question, "normalized_type", Str(question, "type", "unsupported")),
                Type = Str(question, "type_label", Str(question, "type", string.Empty)),
                Icon = Str(question, "icon", string.Empty),
                Required = Bool(question, "required", false),
                Options = Math.Max(Int(question, "options", 0), optionTexts.Count),
                OptionTexts = optionTexts,
                RowTexts = rowTexts,
                Unsupported = Bool(question, "unsupported", false),
                UnsupportedReason = Str(question, "unsupported_reason", string.Empty),
                HasJump = Bool(question, "has_jump", false),
                HasDisplayLogic = Bool(question, "has_display_condition", false),
                LogicSummary = Str(question, "logic_summary", string.Empty),
                Dimension = Str(question, "dimension", string.Empty),
                Bias = Str(question, "bias", "custom"),
                Weights = Str(question, "weights", string.Empty),
                Configured = Bool(question, "configured", false),
                AiEnabled = Bool(question, "ai_enabled", false),
            });
        }
        return result;
    }

    public JsonObject? QuestionAt(int index)
    {
        var current = 0;
        foreach (var value in DefinitionQuestions())
        {
            if (value is not JsonObject question || Bool(question, "is_description", false))
            {
                continue;
            }
            if (current++ == index)
            {
                return question;
            }
        }
        return null;
    }

    public JsonObject? StrategyAt(int index)
    {
        var number = QuestionAt(index) is { } question ? Int(question, "num", -1) : -1;
        foreach (var value in Strategies())
        {
            if (value is JsonObject strategy && Int(strategy, "question_num", -2) == number)
            {
                return strategy;
            }
        }
        return null;
    }

    public JsonArray? Rules() => Arr(Answers(), "rules");

    public JsonArray? Dimensions() => Arr(Answers(), "dimensions");

    public void SetSurveyURL(string value)
    {
        var config = RequireConfig();
        var survey = Survey();
        survey["url"] = value;
        Attach(config, "survey", survey);
        _dirty = true;
    }

    public void SetExecution(int target, int threads, int intervalMin, int intervalMax,
        int durationMin, int durationMax, string windowStart, string windowEnd,
        bool failStop, bool pauseCaptcha)
    {
        var config = RequireConfig();
        var execution = Execution();
        execution["target"] = target;
        execution["threads"] = threads;
        execution["submitInterval"] = NumberPair(intervalMin, intervalMax);
        execution["answerDuration"] = NumberPair(durationMin, durationMax);
        execution["answerDatetimeWindow"] = StringPair(windowStart, windowEnd);
        execution["failStop"] = failStop;
        execution["pauseOnAliyunCaptcha"] = pauseCaptcha;
        Attach(config, "execution", execution);
        _dirty = true;
    }

    public void SetNetwork(string mode, string fixedAddress, string source,
        string customApi, string areaCode, bool randomUa)
    {
        var config = RequireConfig();
        var network = Network();
        network["proxyMode"] = mode;
        network["randomProxyEnabled"] = mode == "random";
        network["fixedProxyAddress"] = mode == "fixed" ? fixedAddress : string.Empty;
        network["proxySource"] = source;
        network["customProxyApi"] = customApi;
        network["proxyAreaCode"] = areaCode;
        network["randomUaEnabled"] = randomUa;
        Attach(config, "network", network);
        _dirty = true;
    }

    public void SetReverseFill(bool enabled, string path)
    {
        var config = RequireConfig();
        var reverseFill = ReverseFill();
        reverseFill["enabled"] = enabled;
        reverseFill["sourcePath"] = path;
        Attach(config, "reverseFill", reverseFill);
        _dirty = true;
    }

    public void SetPsychometrics(bool enabled, double targetAlpha)
    {
        var config = RequireConfig();
        var psychometrics = Psychometrics();
        psychometrics["enabled"] = enabled;
        psychometrics["targetAlpha"] = targetAlpha;
        Attach(config, "psychometrics", psychometrics);
        _dirty = true;
    }

    public void SetDimensions(JsonArray dimensions)
    {
        var answers = Answers();
        answers["dimensions"] = CloneNode(dimensions);
        Attach(RequireConfig(), "answers", answers);
        _dirty = true;
    }

    /// <summary>策略规范化由 Go 完成；原生侧只标记脏状态。</summary>
    public void SetQuestionStrategy(int index, string dimension, string bias, string weights, bool aiEnabled)
    {
        _ = index;
        _ = dimension;
        _ = bias;
        _ = weights;
        _ = aiEnabled;
        _dirty = true;
    }

    /// <summary>策略规范化由 Go 完成；原生侧只标记脏状态。</summary>
    public void UpdateQuestionStrategy(int index, JsonObject changes)
    {
        _ = index;
        _ = changes;
        _dirty = true;
    }

    public void SetRule(int index, JsonObject rule)
    {
        var answers = Answers();
        var rules = Arr(answers, "rules") ?? new JsonArray();
        var copy = CloneObject(rule);
        if (index >= 0 && index < rules.Count)
        {
            rules[index] = copy;
        }
        else
        {
            rules.Add(copy);
        }
        Attach(answers, "rules", rules);
        Attach(RequireConfig(), "answers", answers);
        _dirty = true;
    }

    public void DeleteRule(int index)
    {
        var answers = Answers();
        var rules = Arr(answers, "rules") ?? new JsonArray();
        if (index >= rules.Count)
        {
            return;
        }
        rules.RemoveAt(index);
        Attach(answers, "rules", rules);
        Attach(RequireConfig(), "answers", answers);
        _dirty = true;
    }

    public bool MoveRule(int from, int to)
    {
        var answers = Answers();
        var rules = Arr(answers, "rules") ?? new JsonArray();
        if (from >= rules.Count || to >= rules.Count || from == to)
        {
            return false;
        }
        var value = rules[from]!;
        rules.RemoveAt(from);
        rules.Insert(to, CloneNode(value));
        Attach(answers, "rules", rules);
        Attach(RequireConfig(), "answers", answers);
        _dirty = true;
        return true;
    }

    public bool MoveRuleUp(int index) => index > 0 && MoveRule(index, index - 1);

    public bool MoveRuleDown(int index)
    {
        var rules = Rules() ?? new JsonArray();
        return index + 1 < rules.Count && MoveRule(index, index + 1);
    }

    /// <summary>规则校验由 Go 拥有；原生恒返回通过。</summary>
    public string ValidateRule(JsonObject rule)
    {
        _ = rule;
        return string.Empty;
    }

    public int Target() => Int(Execution(), "target", 1);

    public int Threads() => Int(Execution(), "threads", 1);

    public (int Min, int Max) SubmitInterval() => ReadNumberPair(Execution(), "submitInterval", 0, 0);

    public (int Min, int Max) AnswerDuration() => ReadNumberPair(Execution(), "answerDuration", 60, 120);

    public (string Start, string End) AnswerWindow() => ReadStringPair(Execution(), "answerDatetimeWindow");

    public bool FailStop() => Bool(Execution(), "failStop", true);

    public bool PauseCaptcha() => Bool(Execution(), "pauseOnAliyunCaptcha", true);

    public string ProxyMode()
    {
        var network = Network();
        return Str(network, "proxyMode", Bool(network, "randomProxyEnabled", false) ? "random" : "direct");
    }

    public string FixedProxyAddress() => Str(Network(), "fixedProxyAddress", string.Empty);

    public string ProxySource() => Str(Network(), "proxySource", "default");

    public string CustomProxyAPI() => Str(Network(), "customProxyApi", string.Empty);

    public string ProxyAreaCode() => Str(Network(), "proxyAreaCode", string.Empty);

    public bool RandomUA() => Bool(Network(), "randomUaEnabled", false);

    public bool ReverseFillEnabled() => Bool(ReverseFill(), "enabled", false);

    public string ReverseFillPath() => Str(ReverseFill(), "sourcePath", string.Empty);

    public bool PsychometricsEnabled() => Bool(Psychometrics(), "enabled", false);

    public double TargetAlpha()
    {
        var psychometrics = Psychometrics();
        if (psychometrics["targetAlpha"] is JsonValue value && value.TryGetValue<double>(out var alpha))
        {
            return alpha;
        }
        return 0.85;
    }

    public string CheckRequest(JsonObject settings)
    {
        var request = new JsonObject
        {
            ["config"] = CloneOrEmpty(_config),
            ["aiProfile"] = CloneOrEmpty(Obj(settings, "aiProfile")),
        };
        return request.ToJsonString();
    }

    public string SaveRequest()
    {
        var request = new JsonObject
        {
            ["path"] = _path,
            ["config"] = CloneOrEmpty(_config),
        };
        return request.ToJsonString();
    }

    public string RunRequest()
    {
        var request = new JsonObject
        {
            ["config"] = CloneOrEmpty(_config),
        };
        return request.ToJsonString();
    }

    private JsonObject Survey() => Obj(_config, "survey");

    private JsonObject Execution() => Obj(_config, "execution");

    private JsonObject Network() => Obj(_config, "network");

    private JsonObject ReverseFill() => Obj(_config, "reverseFill");

    private JsonObject Answers() => Obj(_config, "answers");

    private JsonObject Psychometrics() => Obj(_config, "psychometrics");

    private JsonArray DefinitionQuestions() => Arr(Obj(Survey(), "definition"), "questions");

    private JsonArray Strategies() => Arr(Obj(_config, "answers"), "questions");

    private JsonObject RequireConfig()
    {
        if (_config is not { } config)
        {
            throw new InvalidOperationException("向导文档尚未加载配置");
        }
        return config;
    }

    private void ClearTransaction()
    {
        _transactionConfig = null;
        _transactionPath = string.Empty;
        _transactionDirty = false;
        _transactionActive = false;
    }

    private static JsonObject ParseJsonObject(string json)
    {
        JsonNode? root;
        try
        {
            root = JsonNode.Parse(json);
        }
        catch (JsonException exception)
        {
            throw new InvalidOperationException($"后端响应格式无效：{exception.Message}", exception);
        }
        return root as JsonObject
            ?? throw new InvalidOperationException("后端响应格式无效");
    }

    private static JsonObject CloneObject(JsonObject source) => (JsonObject)CloneNode(source);

    private static JsonNode CloneNode(JsonNode source) =>
        JsonNode.Parse(source.ToJsonString()) ?? throw new InvalidOperationException("JSON 克隆失败");

    private static JsonObject CloneOrEmpty(JsonObject? source) => source is null ? new JsonObject() : CloneObject(source);

    /// <summary>缺失或类型不符时返回新的空对象；调用方修改后须重新 Attach。</summary>
    private static JsonObject Obj(JsonObject? parent, string name)
    {
        if (parent is not null && parent[name] is JsonObject value)
        {
            return value;
        }
        return new JsonObject();
    }

    private static JsonArray Arr(JsonObject? parent, string name)
    {
        if (parent is not null && parent[name] is JsonArray value)
        {
            return value;
        }
        return new JsonArray();
    }

    /// <summary>已挂载则原位返回，避免重复赋值；未挂载时写入父对象。</summary>
    private static void Attach(JsonObject parent, string name, JsonObject child)
    {
        if (!ReferenceEquals(parent[name], child))
        {
            parent[name] = child;
        }
    }

    private static void Attach(JsonObject parent, string name, JsonArray child)
    {
        if (!ReferenceEquals(parent[name], child))
        {
            parent[name] = child;
        }
    }

    private static string Str(JsonObject? parent, string name, string fallback)
    {
        if (parent is not null && parent[name] is JsonValue value && value.TryGetValue<string>(out var text))
        {
            return text;
        }
        return fallback;
    }

    private static int Int(JsonObject? parent, string name, int fallback)
    {
        if (parent is not null
            && parent[name] is JsonValue value
            && TryGetNumber(value, out var number))
        {
            return (int)number;
        }
        return fallback;
    }

    /// <summary>JsonValue 按写入时的 CLR 类型严格匹配，数值读取须兼容多种数字类型。</summary>
    private static bool TryGetNumber(JsonValue value, out double number)
    {
        if (value.TryGetValue<double>(out number))
        {
            return true;
        }
        if (value.TryGetValue<float>(out var single))
        {
            number = single;
            return true;
        }
        if (value.TryGetValue<decimal>(out var decimalValue))
        {
            number = (double)decimalValue;
            return true;
        }
        if (value.TryGetValue<long>(out var longValue))
        {
            number = longValue;
            return true;
        }
        if (value.TryGetValue<int>(out var intValue))
        {
            number = intValue;
            return true;
        }
        return false;
    }

    private static bool Bool(JsonObject? parent, string name, bool fallback)
    {
        if (parent is not null && parent[name] is JsonValue value && value.TryGetValue<bool>(out var flag))
        {
            return flag;
        }
        return fallback;
    }

    private static List<string> ReadStrings(JsonObject parent, string name)
    {
        var result = new List<string>();
        if (parent[name] is not JsonArray values)
        {
            return result;
        }
        foreach (var node in values)
        {
            if (node is JsonValue value && value.TryGetValue<string>(out var text))
            {
                result.Add(text);
            }
        }
        return result;
    }

    private static (int First, int Second) ReadNumberPair(JsonObject parent, string name, int first, int second)
    {
        if (parent[name] is not JsonArray values || values.Count < 2)
        {
            return (first, second);
        }
        return (AsInt(values[0], first), AsInt(values[1], second));
    }

    private static int AsInt(JsonNode? node, int fallback) =>
        node is JsonValue value && TryGetNumber(value, out var number) ? (int)number : fallback;

    private static (string First, string Second) ReadStringPair(JsonObject parent, string name)
    {
        if (parent[name] is not JsonArray values || values.Count < 2)
        {
            return (string.Empty, string.Empty);
        }
        return (AsString(values[0]), AsString(values[1]));
    }

    private static string AsString(JsonNode? node) =>
        node is JsonValue value && value.TryGetValue<string>(out var text) ? text : string.Empty;

    private static JsonArray NumberPair(int left, int right) => new() { left, right };

    private static JsonArray StringPair(string left, string right) => new() { left, right };
}
