---
name: survey-http-core
description: 面向 SurveyController 所引用 SurveyCore 子模块的 Go 代理和问卷 HTTP 核心开发。用于修改 `SurveyCore/pkg/proxycore/`、`SurveyCore/pkg/surveycore/` 及问卷星、腾讯问卷、Credamo 平台实现，或调整它们与 `desktop/` 的公开契约。
---

# Survey HTTP Core

1. `SurveyCore/` 是独立 Git 子模块。先读目标包公开接口、对应测试和 `desktop/` 直接调用方；分别检查子模块差异和根仓库 gitlink。
2. 核心库不读取桌面用户路径，不碰 UI 或匿名管道 RPC。SurveyController 专属编排和持久化留在 `desktop/`。
3. 代理租约、TTL、代理池和官方会话放 `pkg/proxycore`；通用模型和运行编排放 `pkg/surveycore`；平台字段、解析与提交参数放 `{wjx,tencent,credamo}`。第三方 REST 契约属于 `pkg/restapi` 和 `api/openapi.yaml`，不要与桌面 RPC 混用。
4. 保持纯 HTTP 提交。不得恢复 Python、Playwright、Selenium 或浏览器自动化回退。
5. 请求路径明确处理 `context.Context`、超时、取消、代理、响应错误和资源释放。平台特有参数不得渗入通用包。
6. 纯逻辑使用 table-driven 测试；网络、代理和时间边界使用 fake。普通测试不得访问真实问卷、账号或付费代理。
7. 变更后在子模块内运行受影响包；跨包接口变更运行：

```powershell
Set-Location SurveyCore
go test ./pkg/proxycore/... ./pkg/surveycore/...
```

公开类型或行为影响 `desktop/` 时，再运行 `Set-Location ..\desktop; go test ./...`。
