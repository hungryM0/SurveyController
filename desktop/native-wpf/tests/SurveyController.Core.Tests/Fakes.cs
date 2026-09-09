using System.Buffers.Binary;
using System.Text;
using SurveyController.Core.Rpc;

namespace SurveyController.Core.Tests;

/// <summary>
/// 内存版管道流：写入按帧解析并回调，读取从队列取数据、可阻塞可被终止。
/// 用于在不启动真实进程的情况下驱动 BackendClient 的会话状态机。
/// </summary>
internal sealed class ScriptedStream : Stream
{
    private readonly object _gate = new();
    private readonly Queue<byte[]> _pending = new();
    private readonly MemoryStream _written = new();
    private readonly ManualResetEventSlim _dataAvailable = new(false);
    private int _parsedOffset;

    public override bool CanRead => true;
    public override bool CanSeek => false;
    public override bool CanWrite => true;
    public override long Length => throw new NotSupportedException();
    public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }

    /// <summary>收到完整请求帧时触发，参数为帧内 UTF-8 JSON 文本。</summary>
    public event Action<string>? FrameReceived;

    public byte[] WrittenBytes
    {
        get
        {
            lock (_gate)
            {
                return _written.ToArray();
            }
        }
    }

    public void EnqueueFrame(string json)
    {
        var payload = Encoding.UTF8.GetBytes(json);
        var frame = new byte[4 + payload.Length];
        BinaryPrimitives.WriteUInt32LittleEndian(frame, (uint)payload.Length);
        payload.CopyTo(frame, 4);
        Enqueue(frame);
    }

    public void Enqueue(byte[] bytes)
    {
        lock (_gate)
        {
            _pending.Enqueue(bytes);
        }
        _dataAvailable.Set();
    }

    private bool _killed;

    /// <summary>让所有阻塞中的 Read 抛出 IOException，模拟后端被终止后管道断裂。</summary>
    public void KillReaders()
    {
        lock (_gate)
        {
            _killed = true;
        }
        _dataAvailable.Set();
    }

    public override int Read(byte[] buffer, int offset, int count)
    {
        while (true)
        {
            byte[]? chunk = null;
            lock (_gate)
            {
                if (_pending.Count > 0)
                {
                    chunk = _pending.Dequeue();
                }
                else if (_killed)
                {
                    throw new IOException("模拟管道已终止");
                }
            }
            if (chunk is not null)
            {
                var copy = Math.Min(count, chunk.Length);
                Array.Copy(chunk, 0, buffer, offset, copy);
                if (copy < chunk.Length)
                {
                    var rest = chunk[copy..];
                    lock (_gate)
                    {
                        _pending.Enqueue(rest);
                    }
                }
                return copy;
            }
            // 无数据：短暂等待后重试；测试通过 KillReaders 立即解除阻塞。
            _dataAvailable.Wait(TimeSpan.FromMilliseconds(50));
        }
    }

    public override void Write(byte[] buffer, int offset, int count)
    {
        lock (_gate)
        {
            _written.Write(buffer, offset, count);
            ParseCompleteFramesLocked();
        }
    }

    public override void Flush()
    {
    }

    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

    public override void SetLength(long value) => throw new NotSupportedException();

    private void ParseCompleteFramesLocked()
    {
        // 只解析逻辑长度内的字节；GetBuffer 的多余容量是未定义内容。
        var bytes = _written.GetBuffer();
        var logicalLength = (int)_written.Length;
        while (logicalLength - _parsedOffset >= 4)
        {
            var size = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(_parsedOffset, 4));
            if (size == 0 || logicalLength - _parsedOffset - 4 < size)
            {
                break;
            }
            _parsedOffset += 4;
            var json = Encoding.UTF8.GetString(bytes, _parsedOffset, (int)size);
            _parsedOffset += (int)size;
            FrameReceived?.Invoke(json);
        }
    }
}

/// <summary>脚本化假传输：可配置存活状态、响应脚本和终止计数。</summary>
internal sealed class FakeTransport : BackendTransport
{
    private readonly ScriptedStream _stdin = new();
    private readonly ScriptedStream _stdout = new();

    public FakeTransport(bool alive = true)
    {
        Alive = alive;
        // 请求帧从客户端写入 stdin；按帧回调响应脚本。
        _stdin.FrameReceived += json =>
        {
            ReceivedRequests.Add(json);
            Respond?.Invoke(json);
        };
    }

    public bool Alive { get; private set; }

    public int Kills { get; private set; }

    public List<string> ReceivedRequests { get; } = new();

    /// <summary>子类或测试覆盖：根据请求生成响应。</summary>
    public Action<string>? Respond { get; set; }

    /// <summary>宿主写入端（客户端发往“后端”的原始流）。</summary>
    public ScriptedStream Input => _stdin;

    /// <summary>宿主读取端（“后端”返回给客户端的原始流）。</summary>
    public ScriptedStream Output => _stdout;

    public override Stream Stdin => _stdin;

    public override Stream Stdout => _stdout;

    public override bool IsAlive => Alive;

    public override void Kill()
    {
        Kills++;
        Alive = false;
        _stdout.KillReaders();
    }
}
