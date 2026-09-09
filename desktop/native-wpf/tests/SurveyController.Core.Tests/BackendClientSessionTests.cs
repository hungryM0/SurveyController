using System.Diagnostics;
using System.Text.Json.Nodes;
using SurveyController.Core.Rpc;
using Xunit;

namespace SurveyController.Core.Tests;

public class BackendClientSessionTests
{
    private static BackendClient CreateClient(params FakeTransport[] transports)
    {
        var queue = new Queue<FakeTransport>(transports);
        return new BackendClient(() => queue.Count > 0 ? queue.Dequeue() : throw new InvalidOperationException("测试传输已耗尽"));
    }

    /// <summary>按请求 id 构造成功响应帧内容。</summary>
    private static Action<string> EchoResult(FakeTransport transport, string resultJson)
    {
        return json =>
        {
            var id = JsonNode.Parse(json)!["id"]!.GetValue<ulong>();
            transport.Output.EnqueueFrame("{\"id\":" + id + ",\"result\":" + resultJson + "}");
        };
    }

    private static Action<string> EchoError(FakeTransport transport, string message)
    {
        return json =>
        {
            var id = JsonNode.Parse(json)!["id"]!.GetValue<ulong>();
            transport.Output.EnqueueFrame(
                "{\"id\":" + id + ",\"error\":{\"code\":\"invalid_params\",\"message\":\"" + message + "\"}}");
        };
    }

    [Fact]
    public void Call_EchoBackend_ReturnsResultJson()
    {
        var transport = new FakeTransport();
        var client = CreateClient(transport);
        transport.Respond = json =>
        {
            Assert.Equal("LoadConfig", JsonNode.Parse(json)!["method"]!.GetValue<string>());
            EchoResult(transport, "{\"ok\":true}")(json);
        };

        var result = client.Call(RpcMethods.LoadConfig, "{}");

        Assert.Equal("{\"ok\":true}", result);
        Assert.Equal(BackendClient.BackendState.Running, client.State);
        Assert.Single(transport.ReceivedRequests);
    }

    [Fact]
    public void Call_RequestIdsStartAtOneAndMatchResponse()
    {
        var transport = new FakeTransport();
        var client = CreateClient(transport);
        transport.Respond = EchoResult(transport, "null");

        client.Call(RpcMethods.ResumeRun, "null");

        var first = JsonNode.Parse(transport.ReceivedRequests[0])!;
        Assert.Equal(1UL, first["id"]!.GetValue<ulong>());
    }

    [Fact]
    public void Call_ErrorResponse_PropagatesMessage()
    {
        var transport = new FakeTransport();
        var client = CreateClient(transport);
        transport.Respond = EchoError(transport, "boom");

        var exception = Assert.Throws<RpcException>(() => client.Call(RpcMethods.LoadConfig, "{}"));

        Assert.Equal("boom", exception.Message);
        // 出错后该会话作废，客户端回到 Stopped 等待下次调用重启。
        Assert.Equal(BackendClient.BackendState.Stopped, client.State);
    }

    [Fact]
    public void Call_Timeout_KillsTransportAndThrowsTimeout()
    {
        var transport = new FakeTransport();
        var client = CreateClient(transport);

        var stopwatch = Stopwatch.StartNew();
        var exception = Assert.Throws<RpcTimeoutException>(
            () => client.Call(RpcMethods.GetRunTaskState, "{\"runId\":1}", TimeSpan.FromMilliseconds(300)));
        stopwatch.Stop();

        Assert.Equal("后端响应超时", exception.Message);
        Assert.True(stopwatch.Elapsed < TimeSpan.FromSeconds(5), "超时看门狗必须按时终止等待");
        Assert.True(transport.Kills >= 1, "超时必须终止后端进程");
        Assert.Equal(BackendClient.BackendState.Stopped, client.State);
    }

    [Fact]
    public void Call_DeadSession_RestartsTransparently()
    {
        var dead = new FakeTransport(alive: false);
        var live = new FakeTransport();
        var client = CreateClient(dead, live);
        live.Respond = EchoResult(live, "\"restarted\"");

        var result = client.Call(RpcMethods.GetAppSettings, "null");

        Assert.Equal("\"restarted\"", result);
        Assert.Empty(dead.ReceivedRequests);
        Assert.Single(live.ReceivedRequests);
    }

    [Fact]
    public void Call_AfterCrashMidway_StartsFreshSession()
    {
        var crashed = new FakeTransport { Respond = _ => throw new IOException("模拟进程崩溃") };
        var fresh = new FakeTransport();
        var client = CreateClient(crashed, fresh);
        fresh.Respond = EchoResult(fresh, "42");
        // 响应脚本抛出的 IO 异常等价于进程崩溃；会话作废并等待重启。
        Assert.ThrowsAny<Exception>(() => client.Call(RpcMethods.GetProxyStatus, "null"));

        var result = client.Call(RpcMethods.GetProxyStatus, "null");

        Assert.Equal("42", result);
        Assert.True(crashed.Kills >= 1);
    }

    [Fact]
    public void ShutdownImmediate_StopsClientAndNextCallRestarts()
    {
        var first = new FakeTransport();
        var second = new FakeTransport();
        var client = CreateClient(first, second);
        first.Respond = EchoResult(first, "true");
        second.Respond = EchoResult(second, "true");

        client.Call(RpcMethods.CancelRun, "null");
        client.ShutdownImmediate();
        Assert.Equal(BackendClient.BackendState.Stopped, client.State);

        var result = client.Call(RpcMethods.ResumeRun, "null");

        Assert.Equal("true", result);
        Assert.Equal(BackendClient.BackendState.Running, client.State);
    }

    [Fact]
    public void Call_InvalidTimeoutRejected()
    {
        var client = CreateClient(new FakeTransport());
        Assert.Throws<ArgumentOutOfRangeException>(
            () => client.Call(RpcMethods.ResumeRun, "null", TimeSpan.Zero));
    }

    [Fact]
    public void Call_EmptyMethodRejectedWithoutWritingRequest()
    {
        var transport = new FakeTransport();
        var client = CreateClient(transport);

        Assert.Throws<ArgumentException>(() => client.Call("", "null"));

        Assert.Equal(0, transport.Kills);
        Assert.Empty(transport.ReceivedRequests);
    }

    [Fact]
    public void Call_InvalidParamsRejectedWithoutKillingSession()
    {
        var transport = new FakeTransport();
        var client = CreateClient(transport);
        transport.Respond = EchoResult(transport, "null");
        client.Call(RpcMethods.LoadConfig, "{}");

        Assert.Throws<ArgumentException>(() => client.Call(RpcMethods.SaveConfig, "not-json"));

        Assert.Equal(BackendClient.BackendState.Running, client.State);
        Assert.Equal(0, transport.Kills);
    }
}

/// <summary>真实进程路径的冒烟验证：仅在非 Windows 本机执行（CI 的 Windows 不跑）。</summary>
public class ProcessBackendTransportTests
{
    [Fact]
    public void Kill_TerminatesLiveProcess()
    {
        if (OperatingSystem.IsWindows())
        {
            return; // Windows 上由 CI/人工冒烟覆盖；sleep 进程语义按 POSIX 处理。
        }
        var transport = ProcessBackendTransport.Start("/bin/sleep", "30");
        try
        {
            Assert.True(transport.IsAlive);
            transport.Kill();
            Assert.False(transport.IsAlive);
        }
        finally
        {
            transport.Dispose();
        }
    }
}
