# Codex Usage Badge Windows Launcher v1.1.0

为 Codex Usage Badge 提供带连接参数的固定启动入口，避免普通图标启动后自动加载被键鼠操作打断。

这是第三方 Windows 安装整合包，不是 OpenAI 官方插件，也不是 Codex 插件市场中的技能插件。

## 下载

[下载 Windows 安装包 v1.1.0](https://github.com/yilinhuang313-cloud/codex-usage-badge-windows/raw/refs/heads/main/downloads/CodexUsageBadge-Windows-Launcher-1.1.0.zip) · [SHA-256 校验文件](https://github.com/yilinhuang313-cloud/codex-usage-badge-windows/blob/main/downloads/SHA256SUMS.txt)

## 安装和使用

1. 在 Windows 10/11 中安装并登录 Codex 桌面客户端，至少启动过一次。
2. 下载并**完整解压**本安装包，双击根目录 `Install.cmd`。
3. 安装完成后，从托盘或菜单**完全退出 Codex**。
4. 从桌面或开始菜单打开 **Codex (Usage Badge)**。
5. 将这个新入口固定到任务栏，替换原来的入口；以后都使用新入口启动。

安装器会安装上游后台，创建当前用户的 Windows 登录启动项，以及桌面、开始菜单快捷方式，无需管理员权限。快捷方式启动后台并带连接参数启动 Codex。已经运行且没有连接参数的 Codex 需要先完全退出。

**普通 Store 图标、旧任务栏入口、文件或协议链接不会自动变成新入口。** 使用这些入口仍可能无法显示用量条。本整合包不强制关闭正在工作的 Codex。

## 功能

原扩展提供额度圆环、项目颜色、会话 Token 指示。本包添加固定启动快捷方式，以及**逐轮回复用量明细**。

- 每条最终 AI 回复的操作栏旁显示“本轮 xx Token”，点击查看输入、缓存、输出、推理和时长。
- 对照页面稳定的轮次标识读取本机 JSONL 会话记录，不按消息顺序猜测；缺失、冲突、部分记录分别提示。
- 一轮有多次模型请求时汇总其记录值；输入包含缓存，推理单列供参考，总量不重复相加。合成的“上下文已满”占位计数会被排除。
- 额度显示为“期间账户额度变化（参考）”，并非本条精确扣费。并行聊天、更新延迟和百分比精度会影响它；窗口重置或基线不足时显示暂无数据。
- 统计只读本地已有记录，不为查看用量调用模型，不额外消耗模型 Token；但电脑会有少量 CPU/磁盘开销。
- 显示的是本地该轮保存的用量，不是账单或后台全部工作负载的保证值；没有关联记录的云端、远程或子任务不作估算。

该模块可连接主窗口和独立聊天窗口。当前轮次还没有最终回复操作栏时，不显示一个虚构的已完成计数。

## 更新、诊断和卸载

- `Status.cmd`：查看后台和连接状态。
- 根目录 `Uninstall.cmd`：停止两个后台，卸载上游后台，并移除本包创建且仍指向本安装的快捷方式；保留源码、配置和备份以便恢复，不删除会话记录。残留模块不会继续随登录启动。
- 上游 v0.10.1 默认每 6 小时检查原项目的 Windows 发布，升级其后台。此自动更新来源仍是原项目，不是本仓库。
- v1.1.0 的逐轮模块独立安装到 `%LOCALAPPDATA%\CodexUsageBadgeLauncher`，其专用登录启动项和启动入口不在上游替换目录中。快捷方式先启动本模块，再委托上游固定路径的管理器启动 Codex，原项目自动更新不会覆盖它。
- 重新运行新版 `Install.cmd` 会安装更新并备份旧版逐轮模块；更新本机已有的“Codex（带用量条）”入口时只修改仍归属于本项目的快捷方式。
- 运行环境需要 Node.js 24+（支持 `node:sqlite`）和 Codex CLI；优先使用桌面客户端已下载的运行时。
- 某些 Codex 或 Microsoft Store 更新可能改变兼容性；遇到问题请重新安装本整合包并查看上游文档。

## 源码与验证

`Manage-Launcher.ps1` 是安装入口，`addons/reply-usage/` 为新增模块，`vendor/` 是未修改的原版 Windows 发布包文件。未打包任何用户配置、登录凭据、聊天记录或运行日志。

运行快捷方式生命周期测试：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\test-shortcuts.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\test-addon-install.ps1
node --test tests/reply-*.test.cjs
```

上述测试使用合成记录或独立临时目录，不改动真实桌面或用户会话。另有可选集成测试 `node tests/test-live-renderer.cjs`，需要已开启本地扩展连接的 Codex；它只创建和移除临时不可见 iframe，验证消息对应、弹窗、关闭和重复注入。真实用户环境已检查主窗口和独立窗口的记录匹配；未做跨设备或整机重启回归。

## 来源与许可证

基于 [jaykinhoo9/codex-usage-badge](https://github.com/jaykinhoo9/codex-usage-badge)，原版 Windows **v0.10.1**，MIT 许可证。完整来源和原版 ZIP 校验值见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。所有上游版权和许可证均保留。
