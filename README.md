# Codex Usage Badge Windows Launcher

为 Codex Usage Badge 提供带连接参数的固定启动入口，避免普通图标启动后自动加载被键鼠操作打断。

这是第三方 Windows 安装整合包，不是 OpenAI 官方插件，也不是 Codex 插件市场中的技能插件。

## 下载

[下载 Windows 安装包 v1.0.0](https://github.com/yilinhuang313-cloud/codex-usage-badge-windows/raw/refs/heads/main/downloads/CodexUsageBadge-Windows-Launcher-1.0.0.zip) · [SHA-256 校验文件](https://github.com/yilinhuang313-cloud/codex-usage-badge-windows/blob/main/downloads/SHA256SUMS.txt)

## 安装和使用

1. 在 Windows 10/11 中安装并登录 Codex 桌面客户端，至少启动过一次。
2. 下载并**完整解压**本安装包，双击根目录 `Install.cmd`。
3. 安装完成后，从托盘或菜单**完全退出 Codex**。
4. 从桌面或开始菜单打开 **Codex (Usage Badge)**。
5. 将这个新入口固定到任务栏，替换原来的入口；以后都使用新入口启动。

安装器会安装上游后台，创建当前用户的 Windows 登录启动项，以及桌面、开始菜单快捷方式，无需管理员权限。快捷方式启动后台并带连接参数启动 Codex。已经运行且没有连接参数的 Codex 需要先完全退出。

**普通 Store 图标、旧任务栏入口、文件或协议链接不会自动变成新入口。** 使用这些入口仍可能无法显示用量条。本整合包不强制关闭正在工作的 Codex。

## 功能

原扩展提供额度圆环、项目颜色、会话 Token 指示。本包添加可重复使用的固定启动快捷方式；后台逻辑来自原项目。

## 更新、诊断和卸载

- `Status.cmd`：查看后台和连接状态。
- 根目录 `Uninstall.cmd`：卸载上游后台，并移除本包创建且仍指向本安装的快捷方式；保留上游备份。
- 上游 v0.10.1 默认每 6 小时检查原项目的 Windows 发布，升级其后台。此自动更新来源仍是原项目，不是本仓库。
- 本包的快捷方式指向固定的 `%LOCALAPPDATA%\CodexUsageBadge\manage-windows.ps1`，上游原位更新后仍可使用。
- 运行环境需要 Node.js 24+（支持 `node:sqlite`）和 Codex CLI；优先使用桌面客户端已下载的运行时。
- 某些 Codex 或 Microsoft Store 更新可能改变兼容性；遇到问题请重新安装本整合包并查看上游文档。

## 源码与验证

`Manage-Launcher.ps1` 是本包新增的安装入口，`vendor/` 是原版 Windows 发布包的文件。未打包任何用户配置、登录凭据、聊天记录或运行日志。

运行快捷方式生命周期测试：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\test-shortcuts.ps1
```

测试使用独立临时目录，检查创建、重复安装、参数传递、同名入口保护和卸载归属；不会改动真实桌面或运行中的 Codex。真实使用的启动方式已在 Windows 用户环境验证；打包版本并未在多种设备上完整回归验证。

## 来源与许可证

基于 [jaykinhoo9/codex-usage-badge](https://github.com/jaykinhoo9/codex-usage-badge)，原版 Windows **v0.10.1**，MIT 许可证。完整来源和原版 ZIP 校验值见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。所有上游版权和许可证均保留。
