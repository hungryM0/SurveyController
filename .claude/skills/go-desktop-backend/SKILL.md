---
name: go-desktop-backend
description: 面向 SurveyController 桌面 Go 后端的开发与排错技能。用于修改 `apps/desktop/` 的应用服务、匿名管道 JSON RPC、运行任务、日志、代理编排、配置读写、凭据存储、后端进程和原生壳契约。
---

# Go Desktop Backend

1. 先读目标 `appservice_*.go`、`rpc_handler.go`、相邻测试，以及 WinUI 调用方需要时的 `Services/BackendClient` 和目标页面。
2. `apps/desktop/` 只做应用编排、持久化和 RPC。平台解析、HTTP 提交和代理核心仍放 `packages/`。
3. 新增或修改 RPC 时同时维护方法常量、请求结构、参数校验、服务实现、错误语义和原生调用方。接口字段保持 JSON 兼容，避免让旧配置或旧壳静默读错。
4. 长任务必须接收或传递 `context.Context`，保持取消、暂停、日志和状态查询可用。不要将共享任务状态散落在页面或全局变量。
5. 配置、凭据和日志只写用户可写位置。敏感信息不得写入仓库、日志或测试样本。
6. 先跑最相邻的 `*_test.go`，再运行：

```powershell
Set-Location apps/desktop
go test ./...
```

改变后端可执行文件、RPC 进程协议或交付物时追加 `build/native.ps1 -Action build -Configuration Release`。
