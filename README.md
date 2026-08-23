<div align="center">
  <img src="assets/icon.png" alt="SurveyController" width="120" height="120" />
  <h1>SurveyController</h1>
  
  [![GitHub Stars](https://img.shields.io/github/stars/SurveyController/SurveyController?style=flat&logo=github&color=yellow)](https://github.com/SurveyController/SurveyController/stargazers)
  ![Downloads](https://img.shields.io/github/downloads/SurveyController/SurveyController/total?style=flat&logo=github&color=green)
  [![License](https://img.shields.io/github/license/SurveyController/SurveyController?style=flat&color=orange)](./LICENSE)
  [![Go](https://img.shields.io/badge/Go-1.26.5%2B-00ADD8?style=flat&logo=go&logoColor=white)](https://go.dev/)
  [![WinUI 3](https://img.shields.io/badge/WinUI-3-0078D4?style=flat)](https://learn.microsoft.com/windows/apps/winui/)

  <p><strong>一站式问卷自动化处理程序，适配问卷星、腾讯问卷、Credamo见数平台</strong></p>
  <p>支持指定ip填写地区、信度系数、作答时长与分布比例</p>
  
</div>

> [!WARNING]
> **该项目仅供 HTTP 接口自动化学习与测试使用。** 请确保拥有目标测试问卷的授权再使用，**严禁污染他人问卷数据！**

---

## 主要特性

1. **多平台支持** - 同时支持问卷星、腾讯问卷、Credamo见数三大平台
2. **Fluent 界面** - 通过可视化 UI 向导完成所有操作
3. **支持二维码解析** - 拖入问卷二维码图片自动转换为链接
4. **定制答案比例** - 支持自定义各选项权重与多选题命中概率分布
5. **指定ip地区** - 支持随机IP或指定特定地区IP提交
6. **配置导入导出** - 保存配置文件便于后续复用，跨设备同步

## 开始使用

> [!TIP]
> **下载安装包：** 前往 [Release](https://github.com/SurveyController/SurveyController/releases/latest) 下载最新版本 .exe 安装包，安装后直接运行即可

## 使用方法

1. **输入问卷** - 粘贴问卷链接，或上传/拖入二维码图片
2. **自动解析** - 点击 `自动配置问卷`，自动识别平台和题目结构
3. **调整配置** - 在配置向导中，拖动滑块对各题设置答案权重和概率分布
4. **设置运行参数** - 指定目标提交份数、并发数、随机IP等设置项
5. **启动任务** - 点击 `开始执行` 并等待任务完成

## 关键配置说明

| 配置项 | 说明 |
|--------|------|
| **目标份数** | 计划提交的问卷总数。建议先测试 3~5 份，确认配置没问题后再增加 |
| **并发数** | 同时提交的任务数量。并发越高速度越快，但失败率也可能更高 |
| **AI 填空** | 开启后可自动生成填空题内容。需要先确认 AI 配置可用 |
| **随机 IP** | 使用代理 IP 模拟不同地区访问。会消耗随机 IP 额度或自备代理资源 |
| **User-Agent** | HTTP 请求标识，决定问卷后台看到的访问设备来源 |
| **作答时长** | 控制每份问卷提交时的作答时长参数 |

详细配置项请参考[教程文档](https://surveydoc.hungrym0.com/runtime.html)。

## 技术架构

```mermaid
flowchart TB
  ui["desktop/native-cs<br/>C# / .NET WinUI 3 原生壳"]
  service["AppService<br/>应用层编排"]
  proxy["packages/proxycore<br/>代理租约 / 池 / 随机 IP"]
  survey["packages/surveycore<br/>公开 API / 模型 / 编排"]
  configio["configio<br/>配置读写"]
  reversefill["reversefill<br/>Excel 反填预览"]
  providers["credamo / tencent / wjx<br/>平台解析与提交"]
  internal["internal/model<br/>internal/httpjson"]

  ui --> service
  service --> proxy
  service --> survey
  service --> configio
  service --> reversefill
  survey --> providers
  providers --> internal
  proxy --> service
  survey --> service
  reversefill --> service
```

```mermaid
sequenceDiagram
  participant F as WinUI 原生壳
  participant A as AppService
  participant P as packages/proxycore
  participant S as packages/surveycore
  participant X as 平台实现

  F->>A: 读取状态 / 保存配置 / 启动任务
  A->>P: 查询代理状态 / 申请执行参数
  A->>S: 解析问卷 / 生成默认配置 / 运行任务
  S->>X: 调用 credamo / tencent / wjx 适配器
  X-->>S: 返回解析结果、运行结果、事件
  S-->>A: 返回配置、结果、事件
  A-->>F: 更新界面状态
```

## 交流群

如有疑问或需要技术支持，可加入QQ群：
346131215

<img width="256" alt="qq" src="assets/community_qr.png" />

## 参与贡献

欢迎提交 Pull Request，改进方向包括但不限于：
- 增加对更多题型的支持
- 增加对更多问卷平台的支持
- 性能优化与代码重构

## 贡献者

感谢以下贡献者对本项目的支持：

<div style="display: flex; gap: 10px;">
  <a href="https://github.com/shiaho777">
    <img src="https://github.com/shiaho777.png" width="50" height="50" alt="shiaho777" style="border-radius: 50%;" />
  </a>
  <a href="https://github.com/BingBuLiang">
    <img src="https://github.com/BingBuLiang.png" width="50" height="50" alt="BingBuLiang" style="border-radius: 50%;" />
  </a>
  <a href="https://github.com/dAwn-Rebirth">
    <img src="https://github.com/dAwn-Rebirth.png" width="50" height="50" alt="dAwn-Rebirth" style="border-radius: 50%;" />
  </a>
  <a href="https://github.com/Moyuin-aka">
    <img src="https://github.com/Moyuin-aka.png" width="50" height="50" alt="Moyuin-aka" style="border-radius: 50%;" />
  </a>
  <a href="https://github.com/zioug">
    <img src="https://github.com/zioug.png" width="50" height="50" alt="zioug" style="border-radius: 50%;" />
  </a>
  <a href="https://github.com/qintaiyang">
    <img src="https://github.com/qintaiyang.png" width="50" height="50" alt="qintaiyang" style="border-radius: 50%;" />
  </a>
  <a href="https://github.com/LING71671">
    <img src="https://github.com/LING71671.png" width="50" height="50" alt="LING71671" style="border-radius: 50%;" />
  </a>
</div>
