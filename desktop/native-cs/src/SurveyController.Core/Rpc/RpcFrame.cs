using System.Buffers.Binary;
using System.Text;

namespace SurveyController.Core.Rpc;

/// <summary>
/// 匿名管道上的帧协议：u32 小端长度前缀 + UTF-8 JSON 载荷，上限 16 MiB。
/// 与 desktop/internal/rpc/codec.go 逐字节兼容。
/// </summary>
public static class RpcFrame
{
    public const int MaxFrameSize = 16 << 20;

    public static string ReadFrame(Stream stream)
    {
        Span<byte> header = stackalloc byte[4];
        ReadExact(stream, header);
        var size = BinaryPrimitives.ReadUInt32LittleEndian(header);
        if (size == 0)
        {
            throw new RpcException("RPC 帧不能为空");
        }
        if (size > MaxFrameSize)
        {
            throw new RpcException($"RPC 帧超过大小限制：{size}");
        }
        var payload = new byte[size];
        ReadExact(stream, payload);
        return Encoding.UTF8.GetString(payload);
    }

    public static void WriteFrame(Stream stream, string payload)
    {
        var bytes = Encoding.UTF8.GetBytes(payload);
        if (bytes.Length == 0 || bytes.Length > MaxFrameSize)
        {
            throw new RpcException($"RPC 帧超过大小限制：{bytes.Length}");
        }
        Span<byte> header = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32LittleEndian(header, (uint)bytes.Length);
        stream.Write(header);
        stream.Write(bytes);
        stream.Flush();
    }

    private static void ReadExact(Stream stream, Span<byte> buffer)
    {
        var offset = 0;
        while (offset < buffer.Length)
        {
            var read = stream.Read(buffer[offset..]);
            if (read <= 0)
            {
                throw new RpcException("后端响应提前结束");
            }
            offset += read;
        }
    }
}
