---
name: survey-http-core
description: 面向 SurveyController Go 代理和问卷 HTTP 核心的开发、解析与排错技能。用于修改 `packages/proxycore/`、`packages/surveycore/`、问卷星、腾讯问卷、Credamo 平台子包的模型、HTTP 请求、响应解析、提交参数、并发、取消、超时和 fake 测试。
---

# Survey HTTP Core

1. 先读目标包公开接口、对应测试和直接调用方。核心库不读取桌面配置，不碰 UI、RPC 或用户路径。
2. 代理租约、TTL、代理池和官方会话放 `proxycore`；通用模型和编排放 `surveycore`；平台字段、解析与提交参数放 `{wjx,tencent,credamo}`。
3. 保持纯 HTTP 提交。不得恢复 Python、Playwright、Selenium 或浏览器自动化回退。
4. 请求路径明确处理 `context.Context`、超时、取消、代理、响应错误和资源释放。平台特有参数不得渗入通用包。
5. 为纯逻辑使用 table-driven 测试；网络、代理和时间边界使用 fake。普通测试不得访问真实问卷、账号或付费代理。
6. 变更后运行受影响包，跨包接口变更运行：

```powershell
go test ./packages/proxycore/... ./packages/surveycore/...
```
