# 应用发布与交付

平台沿用首页 → 项目中心 → 工作台。首次需求走阶段化生成，后续对话修改工程。工作台的「交付」页提供生产发布、日志、版本历史、回滚以及源码/部署包下载。

## 本地运行

```sh
cd app
npm install
# 按 .env.example 配置 .env.local，填入实际模型服务参数。
npm run dev
```

没有有效模型时生成和对话返回可操作的 503 配置提示。生成不设置产品 token 配额，模型供应商的上下文、限流和命令超时仍适用。生成期间可取消；刷新工作台会恢复任务。

## 预览与生产发布

- 开发预览 `/p/{projectId}`：读取可变工作区，可停止和重启。
- 生产版本 `/s/{projectId}`：固定源码快照，使用 `next start`；只有生产构建和健康检查通过后才切换。
- 发布失败不改变活动版本，构建日志和失败原因可查看。重复发布请求复用同一个任务。
- 回滚选取历史成功快照重新构建启动，检查后切换。回滚不回滚业务数据库。
- 自动保留最近五个成功版本的文件，活动版本始终保留。更早的记录继续显示，文件已清理的历史版本无法再次回滚。
- 平台启动时标记未完成发布为 interrupted，并检查、恢复活动版本。单机部署不承诺高可用。

发布要求生成工程有 `build`、`start` 脚本、Next.js 依赖及 npm/pnpm 锁文件。旧工程数据库入口必须支持 `ATOMS_DATA_DIR`；未支持时会拒绝发布并提示通过对话修改，不自动改写用户工程。

`.atoms/VERIFICATION.json` 是技术验证报告，区分依赖、类型、构建、预览健康和待人工检查的业务流程。不把健康检查当作全部业务验收。

## 存储与环境隔离

默认以 `data/` 为交付根目录，实际使用 `WORKSPACE_ROOT` 的同级目录：

```text
data/projects/<id>/                 可变开发源码（旧数据保留）
data/releases/<id>/<releaseId>/     固定源码和该版本构建结果
data/runtime/<id>/production/       生产业务数据库
```

生成构建和发布构建使用临时数据库，开发默认使用项目自身 `data/app.db`，生产通过独立 `ATOMS_DATA_DIR` 和 `DATABASE_PATH` 注入。首次发布创建空生产库，开发数据不会自动迁移到线上。生产版本共享该项目生产库，数据库迁移必须向后兼容；检测到 DROP/TRUNCATE 等破坏性迁移会阻止发布。

应用自身第三方变量可由服务器管理员写入 `data/runtime/<id>/env.json`（JSON 字符串键值对象）。不将平台模型密钥注入生产应用，也不读取工程内 `.env*`。内置 PATH、HOME、NODE_OPTIONS、ATOMS_*、数据库路径及端口等运行时设置不允许被覆盖。该文件不进入导出包。

## 下载和独立部署

原导出地址仍可用，默认是当前源码草稿：

```text
GET /api/projects/<id>/export?kind=source
GET /api/projects/<id>/export?kind=deploy&releaseId=<successful-release-id>
```

部署包固定到成功发布版本，包含锁文件、Dockerfile、Compose、环境变量示例、DEPLOYMENT.md 和带源码哈希的 atoms-manifest.json。不再导出 `.git`、真实环境变量、密钥、数据库及 WAL/SHM 文件、依赖、构建缓存、日志或符号链接；原 git 历史仍保留在服务器项目目录。

归档完整生成并检查后才发送下载。源码采用明确目录/文件类型白名单，未允许的资源需移到合适的源码/资源目录并确认不含秘密后再纳入，不能绕过排除规则。

解压后先阅读 DEPLOYMENT.md。本地使用 Node.js 22，按包内锁文件安装依赖，再执行 build/start。容器使用 `docker compose up --build -d`，数据存入 app-data 卷。独立根路径部署不设置 `ATOMS_BASE_PATH`，不能复用平台子路径构建缓存。

包的 manifest 单独标识平台生产构建与健康检查结果，独立服务器运行和业务验证需实际执行，不继承平台的验证结论。

## 公网部署

在已有可信单租户服务器安装平台，配置 `app/deploy/nginx.conf` 并为实际域名配置 TLS。`PUBLIC_APP_ORIGIN=https://your-host` 仅设置显示地址，不自动创建 DNS、证书或云资源。未设置该值或值为 localhost 时只显示本地发布状态。

从服务器外访问 `/s/<id>`、静态资源、页面导航、表单和 API 后，才能确认公网可用。此版本不提供身份认证或不可信代码的容器沙箱，公网多租户运营前需要单独完成隔离及权限工程。

## 验证

```sh
cd app
npm run test:unit
npm run typecheck
npm run lint
npm run build
```

生产构建使用现有 Google Fonts，需要网络。单元测试覆盖归档排除、源码哈希、发布互斥、失败保留旧版、健康检查后切换、重启中断、下载失败及生成验证规则；完整真实应用验收记录见本次 OpenSpec 变更的验证记录。
