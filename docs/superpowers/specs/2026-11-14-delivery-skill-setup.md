# OpenSpec / Superpowers 技能安装记录

日期：2026-11-14。

## 官方来源

- OpenSpec：https://github.com/Fission-AI/OpenSpec
- Superpowers：https://github.com/obra/superpowers

## 已安装位置

Codex 技能：`/Users/pen/.codex/skills/`。

Superpowers：brainstorming、writing-plans、executing-plans、test-driven-development、verification-before-completion。通过 Codex skill-installer 官方脚本下载；使用系统证书 `/etc/ssl/cert.pem` 解决 Python 默认 CA 缺失，不关闭 TLS 验证。原有 `/Users/pen/.agents/skills/` 未改动。

OpenSpec：openspec-propose、openspec-explore、openspec-apply-change、openspec-archive-change、openspec-update-change、openspec-sync-specs、openspec-verify-change。官方仓库下载超时后，使用 npm 官方包 2.0.0 的 CLI 和模板生成器生成原版技能。

持久 CLI：`/Users/pen/.codex/tools/openspec/`；命令入口：`/Users/pen/.local/bin/openspec`，已在当前 PATH 中，不修改 shell 配置。验证命令：`openspec --version`。

CLI 在当前 Node 22.19.0 上已成功执行版本、context、new change、status 和 validate。部分交互依赖声明更高的 Node 最低版本，后续若使用交互式菜单出现兼容问题，先更新 Node；本次非交互命令已实测。

## 使用

下一个回合可识别新安装的技能；若列表未刷新，重开聊天后使用。

- 需求提案：`$openspec-propose`。
- 审阅本次提案：`openspec status --change one-prompt-app-delivery`。
- 验证规格：`openspec validate one-prompt-app-delivery --strict`。
- 实施：审阅设计后调用 `$openspec-apply-change`，指定 `one-prompt-app-delivery`。
- 实施前使用 Superpowers writing-plans 形成详细执行计划，实施后使用验证技能核验实际结果。

当前产物为方案、规格及任务清单；4/4 planning artifacts 完成不代表应用实现完成。
