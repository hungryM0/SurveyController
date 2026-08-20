---
name: go-desktop-backend
description: 面向 SurveyController 桌面 Go 后端的开发与排错技能。用于修改 `desktop/` 的应用服务、匿名管道 JSON RPC、运行任务、日志、代理编排、配置读写、凭据存储、后端进程和原生壳契约。
---

# Go Desktop Backend

1. 先读目标 `appservice_*.go`、`rpc_handler.go`、相邻测试。涉及原生调用时再读 `Services/RpcServices`、目标页面；只有传输或后端进程问题才进入 `Services/BackendClient`。
2. `desktop/` 只做产品编排、用户态持久化和 RPC。平台解析、HTTP 提交、代理核心和配置文档模型属于 `SurveyCore/` 子模块。
3. 新增或修改 RPC 时同步维护请求结构、参数校验、服务实现、`rpc_handler.go` 分派、错误语义和 `RpcServices` 调用方。字段变化还要检查原生 JSON 解析和旧配置兼容，不能静默错读。
4. 长任务必须接收或传递 `context.Context`，保持取消、暂停、日志和状态查询可用。不要将共享任务状态散落在页面或全局变量。
5. 配置、凭据和日志只写用户可写位置。敏感信息不得写入仓库、日志或测试样本。
6. 先跑最相邻的 `*_test.go`，再运行：

```powershell
Set-Location desktop
go test ./...
```

改变后端可执行文件、RPC 进程协议或交付物时追加 `build/native.ps1 -Action test -Configuration Release` 和 `build/native.ps1 -Action build -Configuration Release`。
