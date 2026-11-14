# Project Workspace Specification

> 来源：change `bootstrap-atoms-ai-builder`（2026-11-12 归档）
> 影响范围：服务端 `WORKSPACE_ROOT/`、AI 工具集、文件 API

## Requirements

### Requirement: 项目目录创建

用户创建项目时，在服务器 `WORKSPACE_ROOT/{projectId}/` 生成独立文件夹，作为该项目全部文件的唯一根目录。

实现位置：`app/src/lib/workspace/paths.ts`、`app/src/app/api/projects/route.ts`

#### Scenario: 创建项目
- GIVEN 用户提交新项目
- WHEN 项目记录写入数据库
- THEN `WORKSPACE_ROOT/{projectId}/` 目录已创建，且路径记录在 `projects.workspacePath`

### Requirement: Harness 工具集

为 AI 提供对标 harness agent 的全套工具：

- 文件：`read_file`、`write_file`、`edit_file`（精确字符串替换）、`list_files`（树形）、`search_files`（glob + 内容匹配）、`delete_file`
- 执行：`run_command`（cwd 锁定项目目录）、`install_deps`
- 项目：`init_project`（`static` / `vite` 脚手架）
- 运行时：`start_service`、`stop_service`、`restart_service`（见 runtime-proxy）

实现位置：`app/src/lib/ai/tools.ts`

#### Scenario: 读取文件
- GIVEN AI 调用 `read_file` 且路径合法
- WHEN 工具执行
- THEN 返回文件内容（超限截断并提示总长度）

#### Scenario: 写入新文件
- GIVEN AI 调用 `write_file` 写入不存在的路径
- WHEN 父目录不存在
- THEN 自动创建父目录并写入成功

#### Scenario: 精确编辑
- GIVEN AI 调用 `edit_file` 且 `oldString` 在文件中出现多次
- WHEN `replaceAll` 为 false
- THEN 拒绝执行并提示需提供更多上下文

#### Scenario: 执行命令
- GIVEN AI 调用 `run_command "npm install"`
- WHEN 命令在项目目录执行
- THEN 返回 stdout/stderr/exitCode；超时则强制终止整个进程组并返回已截断输出

### Requirement: 路径安全（防逃逸）

所有文件/命令工具强制限制在项目目录内。

#### Scenario: 拒绝目录逃逸
- GIVEN AI 调用 `read_file("../../etc/passwd")` 或经符号链接指向目录外
- WHEN 工具执行 realpath 校验
- THEN 拒绝执行并返回错误信息，不产生任何副作用

#### Scenario: 命令黑名单
- GIVEN `run_command` 收到黑名单命令（如 `rm -rf /`、`shutdown`、`curl | sh`）
- WHEN 执行前校验
- THEN 拒绝执行并返回拒绝原因

### Requirement: 在线文件编辑（人类侧）

工作台提供文件树与在线编辑器，用户（非 AI）也可查看/修改项目文件。

#### Scenario: 浏览文件树
- GIVEN 项目已存在
- WHEN 用户打开工作台文件树
- THEN 通过 `GET /api/projects/{id}/files` 展示完整目录树（忽略 `node_modules` 等）

#### Scenario: 人工编辑文件
- GIVEN 用户在编辑器中修改并保存
- WHEN `PUT /api/projects/{id}/files` 提交
- THEN 文件写入成功，同样受路径安全校验约束
