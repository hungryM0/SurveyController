using System.Text.Json;
using System.Text.Json.Nodes;

namespace SurveyController.Core.Community;

/// <summary>CheckUpdate RPC 响应（Go updateCheckState）。</summary>
public sealed record UpdateCheckState(
    string Status,
    string Message,
    string LatestVersion,
    string DownloadUrl,
    string ReleaseNotes)
{
    public static UpdateCheckState Parse(string json)
    {
        if (JsonNode.Parse(json) is not JsonObject state)
        {
            throw new InvalidOperationException("后端响应格式无效");
        }
        return new UpdateCheckState(
            Status: JsonField.Str(state, "status", "unknown"),
            Message: JsonField.Str(state, "message", string.Empty),
            LatestVersion: JsonField.Str(state, "latestVersion", string.Empty),
            DownloadUrl: JsonField.Str(state, "downloadUrl", string.Empty),
            ReleaseNotes: JsonField.Str(state, "releaseNotes", string.Empty));
    }
}

/// <summary>GetIPUsageSummary RPC 响应（Go IPUsageSummary）。</summary>
public sealed record IpUsageSummary(int? RemainingIP, IReadOnlyList<IpUsageRecord> Records)
{
    public static IpUsageSummary Parse(string json)
    {
        if (JsonNode.Parse(json) is not JsonObject state)
        {
            throw new InvalidOperationException("后端响应格式无效");
        }
        int? remaining = null;
        if (state["remainingIp"] is JsonValue value)
        {
            if (value.TryGetValue<int>(out var parsed))
            {
                remaining = parsed;
            }
            else if (value.TryGetValue<long>(out var longValue) && longValue is >= int.MinValue and <= int.MaxValue)
            {
                remaining = (int)longValue;
            }
            else if (value.TryGetValue<double>(out var doubleValue))
            {
                remaining = (int)doubleValue;
            }
        }
        var records = new List<IpUsageRecord>();
        if (state["records"] is JsonArray entries)
        {
            foreach (var node in entries)
            {
                if (node is not JsonObject entry)
                {
                    continue;
                }
                records.Add(new IpUsageRecord(
                    Label: JsonField.Str(entry, "label", "未知日期"),
                    Total: entry["total"] is JsonValue total && total.TryGetValue<int>(out var amount) ? amount : 0));
            }
        }
        return new IpUsageSummary(remaining, records);
    }
}

public sealed record IpUsageRecord(string Label, int Total);

internal static class JsonField
{
    internal static string Str(JsonObject parent, string name, string fallback)
    {
        if (parent[name] is JsonValue value && value.TryGetValue<string>(out var text))
        {
            return text;
        }
        return fallback;
    }
}
