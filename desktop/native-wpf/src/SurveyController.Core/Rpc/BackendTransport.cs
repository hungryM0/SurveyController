using System.Diagnostics;

namespace SurveyController.Core.Rpc;

/// <summary>
/// 后端传输抽象：BackendClient 的会话状态机只依赖该接口，
/// 单元测试用内存实现替换真实进程。
/// </summary>
public abstract class BackendTransport : IDisposable
{
    public abstract Stream Stdin { get; }

    public abstract Stream Stdout { get; }

    /// <summary>后端进程是否仍然存活；等价于 C++ 侧 WaitForSingleObject(handle, 0) 检测。</summary>
    public abstract bool IsAlive { get; }

    /// <summary>终止后端。仅在进程仍存活时执行终止，可重复调用。</summary>
    public virtual void Kill()
    {
    }

    public virtual void Dispose()
    {
    }
}

/// <summary>以匿名管道 stdio 方式拉起同目录的 SurveyController.Backend.exe。</summary>
public sealed class ProcessBackendTransport : BackendTransport
{
    private readonly Process _process;

    private ProcessBackendTransport(Process process)
    {
        _process = process;
    }

    public override Stream Stdin => _process.StandardInput.BaseStream;

    public override Stream Stdout => _process.StandardOutput.BaseStream;

    public override bool IsAlive => !_process.HasExited;

    public override void Kill()
    {
        try
        {
            if (!_process.HasExited)
            {
                _process.Kill();
                // Unix/Windows 上的终止等待；短暂等待让 HasExited 反映真实状态。
                _process.WaitForExit(500);
            }
        }
        catch (InvalidOperationException)
        {
            // 进程已退出或尚未完全启动，视为终止完成。
        }
        catch (SystemException)
        {
        }
    }

    public override void Dispose()
    {
        Kill();
        _process.Dispose();
    }

    /// <summary>与壳同目录的 Go 后端路径：SurveyController.Backend.exe。</summary>
    public static string BackendPath()
    {
        var exePath = AppDomain.CurrentDomain.BaseDirectory;
        return Path.Combine(exePath, "SurveyController.Backend.exe");
    }

    public static ProcessBackendTransport Start(string backendPath, string arguments = "")
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = backendPath,
            Arguments = arguments,
            UseShellExecute = false,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        var process = Process.Start(startInfo)
            ?? throw new RpcException("启动 SurveyController 后端失败");
        // 后端 stderr 仅用于诊断，持续排空避免管道写满阻塞后端。
        _ = BeginDrain(process);
        return new ProcessBackendTransport(process);
    }

    private static async Task BeginDrain(Process process)
    {
        try
        {
            await process.StandardError.ReadToEndAsync().ConfigureAwait(false);
        }
        catch (Exception)
        {
            // 排空失败不影响主链路；进程退出时流会自然关闭。
        }
    }
}
