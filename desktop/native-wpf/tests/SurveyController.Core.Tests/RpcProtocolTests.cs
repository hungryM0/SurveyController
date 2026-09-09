using System.Text;
using System.Text.Json.Nodes;
using SurveyController.Core.Rpc;
using Xunit;

namespace SurveyController.Core.Tests;

public class RpcPayloadTests
{
    [Fact]
    public void BuildRequestPayload_SerializesIdMethodParams()
    {
        var payload = BackendClient.BuildRequestPayload(7, "LoadConfig", "{}");
        var request = JsonNode.Parse(payload)!.AsObject();

        Assert.Equal(7UL, request["id"]!.GetValue<ulong>());
        Assert.Equal("LoadConfig", request["method"]!.GetValue<string>());
        Assert.Empty(request["params"]!.AsObject());
    }

    [Fact]
    public void BuildRequestPayload_NullParamsIsPreserved()
    {
        var payload = BackendClient.BuildRequestPayload(1, "ResumeRun", "null");
        var request = JsonNode.Parse(payload)!.AsObject();
        Assert.Null(request["params"]);
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public void BuildRequestPayload_EmptyMethodThrows(string? method)
    {
        Assert.Throws<ArgumentException>(() => BackendClient.BuildRequestPayload(1, method!, "{}"));
    }

    [Fact]
    public void BuildRequestPayload_InvalidParamsJsonThrows()
    {
        Assert.Throws<ArgumentException>(() => BackendClient.BuildRequestPayload(1, "LoadConfig", "not-json"));
    }

    [Fact]
    public void ParseResponsePayload_ReturnsResultJson()
    {
        var result = BackendClient.ParseResponsePayload(7, """{"id":7,"result":{"ok":true},"error":null}""");
        Assert.Equal("""{"ok":true}""", result);
    }

    [Fact]
    public void ParseResponsePayload_ResultNullReturnsNullLiteral()
    {
        var result = BackendClient.ParseResponsePayload(7, """{"id":7,"result":null}""");
        Assert.Equal("null", result);
    }

    [Fact]
    public void ParseResponsePayload_ErrorObjectThrowsWithMessage()
    {
        var exception = Assert.Throws<RpcException>(
            () => BackendClient.ParseResponsePayload(7, """{"id":7,"error":{"code":"invalid_params","message":"boom"}}"""));
        Assert.Equal("boom", exception.Message);
    }

    [Theory]
    [InlineData("""{"id":8,"result":null}""")]
    [InlineData("""{"id":7}""")]
    [InlineData("""{"id":"7","result":null}""")]
    [InlineData("""{"id":7,"error":"broken"}""")]
    [InlineData("""{"id":7,"error":{"code":"x"}}""")]
    [InlineData("not-json")]
    public void ParseResponsePayload_MalformedResponsesThrow(string payload)
    {
        Assert.ThrowsAny<Exception>(() => BackendClient.ParseResponsePayload(7, payload));
    }
}

public class RpcFrameTests
{
    [Fact]
    public void WriteThenRead_RoundTripsPayload()
    {
        using var stream = new MemoryStream();
        const string payload = """{"method":"LoadConfig","params":{"path":"配置.json"}}""";
        RpcFrame.WriteFrame(stream, payload);
        stream.Position = 0;

        Assert.Equal(payload, RpcFrame.ReadFrame(stream));
    }

    [Fact]
    public void ReadFrame_RejectsEmptyFrame()
    {
        using var stream = new MemoryStream([0, 0, 0, 0]);
        var exception = Assert.Throws<RpcException>(() => RpcFrame.ReadFrame(stream));
        Assert.Contains("RPC 帧不能为空", exception.Message);
    }

    [Fact]
    public void ReadFrame_RejectsOversizeHeaderWithoutAllocating()
    {
        using var stream = new MemoryStream([0xFF, 0xFF, 0xFF, 0x7F]);
        var exception = Assert.Throws<RpcException>(() => RpcFrame.ReadFrame(stream));
        Assert.Contains("RPC 帧超过大小限制", exception.Message);
    }

    [Fact]
    public void ReadFrame_TruncatedPayloadReportsBrokenPipe()
    {
        var payload = Encoding.UTF8.GetBytes("""{"a":1}""");
        var bytes = new byte[4 + payload.Length - 2];
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32LittleEndian(bytes.AsSpan(), (uint)payload.Length);
        payload.AsSpan(0, payload.Length - 2).CopyTo(bytes.AsSpan(4));
        using var stream = new MemoryStream(bytes);

        var exception = Assert.Throws<RpcException>(() => RpcFrame.ReadFrame(stream));
        Assert.Contains("后端响应提前结束", exception.Message);
    }
}
