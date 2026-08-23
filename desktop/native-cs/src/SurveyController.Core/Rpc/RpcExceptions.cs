namespace SurveyController.Core.Rpc;

/// <summary>后端返回 error 或响应不符合协议时抛出，消息面向用户展示。</summary>
public class RpcException : Exception
{
    public RpcException(string message) : base(message)
    {
    }
}

/// <summary>后端在超时窗口内未返回完整响应；对应会话已被终止。</summary>
public sealed class RpcTimeoutException : RpcException
{
    public RpcTimeoutException(string message) : base(message)
    {
    }
}
