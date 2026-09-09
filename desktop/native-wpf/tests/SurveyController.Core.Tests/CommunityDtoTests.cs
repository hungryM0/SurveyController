using SurveyController.Core.Community;
using Xunit;

namespace SurveyController.Core.Tests;

public class CommunityDtoTests
{
    [Fact]
    public void UpdateCheckState_ParsesOutdatedPayload()
    {
        var state = UpdateCheckState.Parse(
            """{"status":"outdated","message":"发现新版本","latestVersion":"5.1.0","downloadUrl":"https://dl.example/setup.exe","releaseNotes":"修复若干问题"}""");

        Assert.Equal("outdated", state.Status);
        Assert.Equal("发现新版本", state.Message);
        Assert.Equal("5.1.0", state.LatestVersion);
        Assert.Equal("https://dl.example/setup.exe", state.DownloadUrl);
        Assert.Equal("修复若干问题", state.ReleaseNotes);
    }

    [Fact]
    public void UpdateCheckState_MissingFieldsFallBack()
    {
        var state = UpdateCheckState.Parse("""{"message":"ok"}""");

        Assert.Equal("unknown", state.Status);
        Assert.Equal(string.Empty, state.DownloadUrl);
        Assert.Equal(string.Empty, state.ReleaseNotes);
    }

    [Fact]
    public void IpUsageSummary_ParsesRecordsAndRemaining()
    {
        var summary = IpUsageSummary.Parse(
            """{"remainingIp":42,"records":[{"label":"2026-08-21","total":12},{"label":"2026-08-22","total":7}]}""");

        Assert.Equal(42, summary.RemainingIP);
        Assert.Equal(2, summary.Records.Count);
        Assert.Equal("2026-08-21", summary.Records[0].Label);
        Assert.Equal(12, summary.Records[0].Total);
    }

    [Fact]
    public void IpUsageSummary_NullRemainingAndMissingRecords()
    {
        var summary = IpUsageSummary.Parse("""{"remainingIp":null}""");

        Assert.Null(summary.RemainingIP);
        Assert.Empty(summary.Records);
    }

    [Fact]
    public void IpUsageSummary_MalformedEntriesSkipped()
    {
        var summary = IpUsageSummary.Parse("""{"records":["bad",{"label":"a"},{"label":"b","total":"x"}]}""");

        Assert.Equal(2, summary.Records.Count);
        Assert.Equal(0, summary.Records[1].Total);
    }
}
