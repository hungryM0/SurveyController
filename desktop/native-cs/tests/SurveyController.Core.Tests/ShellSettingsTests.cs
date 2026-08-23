using SurveyController.Core.Settings;
using Xunit;

namespace SurveyController.Core.Tests;

public class ShellSettingsTests
{
    [Fact]
    public void Update_NotifiesHandlerWithLatestJson()
    {
        var settings = new ShellSettings();
        string? received = null;
        var calls = 0;
        settings.SetChangedHandler(value =>
        {
            calls++;
            received = value;
        });

        settings.Update("""{"theme":"dark"}""");

        Assert.Equal(1, calls);
        Assert.Equal("""{"theme":"dark"}""", received);
    }

    [Fact]
    public void NewHandler_ReceivesReplayOfCurrentValue()
    {
        var settings = new ShellSettings();
        settings.Update("""{"theme":"dark"}""");

        string? received = null;
        var replayCalls = 0;
        settings.SetChangedHandler(value =>
        {
            replayCalls++;
            received = value;
        });

        Assert.Equal(1, replayCalls);
        Assert.Equal("""{"theme":"dark"}""", received);
    }

    [Fact]
    public void EmptyUpdate_StillNotifies()
    {
        var settings = new ShellSettings();
        var calls = 0;
        settings.SetChangedHandler(_ => calls++);

        settings.Update(string.Empty);

        Assert.Equal(1, calls);
        Assert.Equal(string.Empty, settings.Json);
    }
}
