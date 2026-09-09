using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace SurveyController.Core.Rpc;

/// <summary>
/// Go 后端（SurveyController.Backend.exe）的匿名管道 JSON-RPC 客户端。
/// 语义与 desktop/native 的 Services/BackendClient.cpp 保持一致：
/// 惰性启动、崩溃自动重启、按会话串行 I/O、超时看门狗终止进程。
/// </summary>
public sealed class BackendClient : IDisposable
{
    public static TimeSpan DefaultTimeout { get; } = TimeSpan.FromSeconds(15);

    public static BackendClient Current { get; } = new();

    private readonly object _stateGate = new();
    private readonly Func<BackendTransport> _transportFactory;
    private BackendState _state = BackendState.Stopped;
    private RpcSession? _session;
    private long _lastRequestId;

    public enum BackendState
    {
        Stopped,
        Starting,
        Running,
        Stopping,
    }

    public BackendClient()
        : this(() => ProcessBackendTransport.Start(ProcessBackendTransport.BackendPath()))
    {
    }

    /// <summary>测试可注入自定义传输工厂；生产路径拉起真实后端进程。</summary>
    public BackendClient(Func<BackendTransport> transportFactory)
    {
        _transportFactory = transportFactory;
    }

    public BackendState State
    {
        get
        {
            lock (_stateGate)
            {
                return _state;
            }
        }
    }

    /// <summary>同步执行一次 RPC 调用，返回 result 字段的字符串化 JSON。</summary>
    public string Call(string method, string paramsJson = "null", TimeSpan? timeout = null)
    {
        var effectiveTimeout = timeout ?? DefaultTimeout;
        if (effectiveTimeout <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(timeout), "RPC 超时时间无效");
        }

        var session = AcquireSession();
        lock (session.FlightGate)
        {
            if (!session.Accepting)
            {
                throw new RpcException("后端正在关闭");
            }
            session.InFlight++;
        }

        try
        {
            ulong requestId;
            string payload;
            string response;
            lock (session.IoGate)
            {
                if (!session.Accepting)
                {
                    throw new RpcException("后端正在关闭");
                }

                requestId = (ulong)Interlocked.Increment(ref _lastRequestId);
                payload = BuildRequestPayload(requestId, method, paramsJson);

                var completed = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                var timedOut = false;
                var watchdog = Task.Run(async () =>
                {
                    var finished = await Task.WhenAny(completed.Task, Task.Delay(effectiveTimeout)).ConfigureAwait(false);
                    if (finished != completed.Task)
                    {
                        timedOut = true;
                        session.Accepting = false;
                        session.Transport.Kill();
                    }
                });

                try
                {
                    RpcFrame.WriteFrame(session.Transport.Stdin, payload);
                    response = RpcFrame.ReadFrame(session.Transport.Stdout);
                    completed.TrySetResult(true);
                    watchdog.Wait();
                    if (timedOut)
                    {
                        MarkSessionFailed(session);
                        throw new RpcTimeoutException("后端响应超时");
                    }
                    return ParseResponsePayload(requestId, response);
                }
                catch
                {
                    completed.TrySetResult(true);
                    watchdog.Wait();
                    MarkSessionFailed(session);
                    if (timedOut)
                    {
                        throw new RpcTimeoutException("后端响应超时");
                    }
                    throw;
                }
            }
        }
        finally
        {
            lock (session.FlightGate)
            {
                session.InFlight--;
                Monitor.PulseAll(session.FlightGate);
            }
        }
    }

    /// <summary>在线程池上执行 RPC 调用；调用方负责回到 UI 线程更新界面。</summary>
    public Task<string> CallAsync(string method, string paramsJson = "null", TimeSpan? timeout = null)
    {
        return Task.Run(() => Call(method, paramsJson, timeout));
    }

    public void Start()
    {
        lock (_stateGate)
        {
            while (_state == BackendState.Starting)
            {
                Monitor.Wait(_stateGate);
            }

            if (_state == BackendState.Running)
            {
                if (_session is { } running && running.Transport.IsAlive)
                {
                    return;
                }
                if (_session is { } dead)
                {
                    dead.Accepting = false;
                    _session = null;
                }
                _state = BackendState.Stopped;
            }

            if (_state == BackendState.Stopping)
            {
                throw new RpcException("后端正在关闭");
            }
            _state = BackendState.Starting;
        }

        RpcSession session;
        try
        {
            session = new RpcSession(_transportFactory());
        }
        catch
        {
            lock (_stateGate)
            {
                _state = BackendState.Stopped;
                Monitor.PulseAll(_stateGate);
            }
            throw;
        }

        lock (_stateGate)
        {
            if (_state != BackendState.Starting)
            {
                session.Accepting = false;
                session.Transport.Kill();
                Monitor.PulseAll(_stateGate);
                throw new RpcException("后端启动已取消");
            }
            _session = session;
            _state = BackendState.Running;
            Monitor.PulseAll(_stateGate);
        }
    }

    public void ShutdownImmediate()
    {
        RpcSession? session;
        lock (_stateGate)
        {
            if (_state == BackendState.Stopped)
            {
                return;
            }
            _state = BackendState.Stopping;
            session = _session;
            if (session is not null)
            {
                session.Accepting = false;
            }
        }

        if (session is not null)
        {
            try
            {
                session.Transport.Stdin.Dispose();
            }
            catch (Exception)
            {
            }
            session.Transport.Kill();

            lock (session.FlightGate)
            {
                if (session.InFlight > 0)
                {
                    Monitor.Wait(session.FlightGate, TimeSpan.FromSeconds(2));
                }
            }
            try
            {
                session.Transport.Stdout.Dispose();
            }
            catch (Exception)
            {
            }
            session.Transport.Dispose();
        }

        lock (_stateGate)
        {
            _session = null;
            _state = BackendState.Stopped;
            Monitor.PulseAll(_stateGate);
        }
    }

    public void Shutdown() => ShutdownImmediate();

    public void Dispose() => ShutdownImmediate();

    private RpcSession AcquireSession()
    {
        while (true)
        {
            lock (_stateGate)
            {
                if (_state == BackendState.Running && _session is { } current)
                {
                    if (current.Transport.IsAlive)
                    {
                        return current;
                    }
                    current.Accepting = false;
                    _session = null;
                    _state = BackendState.Stopped;
                }
                if (_state == BackendState.Stopping)
                {
                    throw new RpcException("后端正在关闭");
                }
            }
            Start();
        }
    }

    private void MarkSessionFailed(RpcSession session)
    {
        session.Accepting = false;
        session.Transport.Kill();
        lock (_stateGate)
        {
            if (ReferenceEquals(_session, session) && _state == BackendState.Running)
            {
                _session = null;
                _state = BackendState.Stopped;
                Monitor.PulseAll(_stateGate);
            }
        }
    }

    /// <summary>构造请求载荷 {"id":n,"method":"...","params":...}；params 必须是合法 JSON。</summary>
    public static string BuildRequestPayload(ulong requestId, string method, string paramsJson)
    {
        if (string.IsNullOrEmpty(method))
        {
            throw new ArgumentException("RPC 方法不能为空", nameof(method));
        }

        var request = new JsonObject
        {
            ["id"] = JsonValue.Create(requestId),
            ["method"] = method,
        };
        try
        {
            request["params"] = JsonNode.Parse(paramsJson ?? "null");
        }
        catch (JsonException exception)
        {
            throw new ArgumentException("RPC 参数不是有效 JSON", nameof(paramsJson), exception);
        }

        var payload = request.ToJsonString();
        if (payload.Length == 0 || Encoding.UTF8.GetByteCount(payload) > RpcFrame.MaxFrameSize)
        {
            throw new ArgumentException("RPC 请求大小无效", nameof(paramsJson));
        }
        return payload;
    }

    /// <summary>校验响应信封并返回 result 字段的字符串化 JSON。</summary>
    public static string ParseResponsePayload(ulong requestId, string payload)
    {
        JsonNode? root;
        try
        {
            root = JsonNode.Parse(payload);
        }
        catch (JsonException exception)
        {
            throw new RpcException($"RPC 响应不是有效 JSON：后端响应格式无效：{exception.Message}");
        }
        if (root is not JsonObject response)
        {
            throw new RpcException("RPC 响应不是有效 JSON：后端响应格式无效");
        }

        if (response["id"] is not JsonValue idValue || !idValue.TryGetValue<ulong>(out var responseId))
        {
            throw new RpcException("RPC 响应缺少有效 id");
        }
        if (responseId != requestId)
        {
            throw new RpcException("RPC 响应编号不匹配");
        }

        var hasResult = response.ContainsKey("result");
        var hasError = response.ContainsKey("error");
        if (!hasResult && !hasError)
        {
            throw new RpcException("RPC 响应缺少 result 或 error");
        }
        if (hasError && response["error"] is not null)
        {
            if (response["error"] is not JsonObject error)
            {
                throw new RpcException("RPC error 字段类型无效");
            }
            if (error["message"] is not JsonValue messageValue || !messageValue.TryGetValue<string>(out var message))
            {
                throw new RpcException("RPC error 缺少有效 message");
            }
            throw new RpcException(message);
        }
        if (!hasResult)
        {
            throw new RpcException("RPC 成功响应缺少 result");
        }
        // result 为 JSON null 时索引器返回 C# null，按字面量 "null" 返回。
        return response["result"]?.ToJsonString() ?? "null";
    }

    private sealed class RpcSession
    {
        public RpcSession(BackendTransport transport)
        {
            Transport = transport;
        }

        public BackendTransport Transport { get; }

        /// <summary>同一会话的管道 I/O 串行化锁，语义同 C++ ioMutex。</summary>
        public object IoGate { get; } = new();

        /// <summary>在途调用计数锁；关闭时等待在途调用排空。</summary>
        public object FlightGate { get; } = new();

        public int InFlight { get; set; }

        public bool Accepting { get; set; } = true;
    }
}
