# Delta: Project Workspace（项目工作区与 Harness 工具集）

**Change ID:** `bootstrap-atoms-ai-builder`
**Affects:** 服务端文件系统 `WORKSPACE_ROOT/`、AI 工具集、文件 API

---

## ADDED

### Requirement: 项目目录创建

用户创建项目时，在服务器 `WORKSPACE_ROOT/{projectId}/` 生成独立文件夹，作为该项目全部文件的唯一根目录。

#### Scenario: 创建项目
- GIVEN 用户提交新项目
- WHEN 项目记录写入数据库
- THEN `WORKSPACE_ROOT/{projectId}/` 目录已创建，且路径记录在 projects 表

### Requirement: Harness 工具集

为 AI 提供对标 harness agent 的全套工具：

- 文件：`read_file`、`write_file`、`edit_file`（行级 diff）、`list_files`（树形）、`search_files`（glob+grep）、`delete_file`
- 执行：`run_command`（cwd 锁定项目目录）
- 项目：`init_project`（脚手架）、`install_deps`
- 运行时：`start_service`、`stop_service`、`restart_service`（定义见 runtime-proxy）

#### Scenario: 读取文件
- GIVEN AI 调用 `read_file` 且路径合法
- WHEN 工具执行
- THEN 返回文件内容（超大文件截断并提示）

#### Scenario: 写入新文件
- GIVEN AI 调用 `write_file` 写入不存在的路径
- WHEN 父目录不存在
- THEN 自动创建父目录并写入成功

#### Scenario: 执行命令
- GIVEN AI 调用 `run_command "npm install"`
- WHEN 命令在项目目录执行
- THEN 返回 stdout/stderr/exitCode；超过超时时间强制终止并返回已截断输出

### Requirement: 路径安全（防逃逸）

所有文件/命令工具强制限制在项目目录内。

#### Scenario: 拒绝目录逃逸
- GIVEN AI 调用 `read_file("../../etc/passwd")` 或经符号链接指向目录外
- WHEN 工具执行路径校验
- THEN 拒绝执行并返回错误信息，不产生任何副作用

#### Scenario: 命令黑名单
- GIVEN `run_command` 收到黑名单命令（如 `rm -rf /`、`shutdown`）
- WHEN 执行前校验
- THEN 拒绝执行并返回拒绝原因

### Requirement: 在线文件编辑（人类侧）

工作台提供文件树与在线编辑器，用户（非 AI）也可查看/修改项目文件。

#### Scenario: 浏览文件树
- GIVEN 项目已存在
- WHEN 用户打开工作台文件树
- THEN 通过 `GET /api/projects/{id}/files` 展示完整目录树

#### Scenario: 人工编辑文件
- GIVEN 用户在编辑器中修改并保存
- WHEN `PUT /api/projects/{id}/files` 提交
- THEN 文件写入成功，同样受路径安全校验约束
