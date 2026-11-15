# 默认开发预览

## 修改范围

用户线上生成应用在 `/_global-error` 的生产预渲染报错，明确要求直接 dev 预览。本地核对发现三个隐式生产入口：生成 verify 无条件 build，聊天/页面 start_service 的 refreshProjectPreview 无条件构建 Next，runner 发现旧 BUILD_ID 时优先 start。

默认 preview 模式现已统一为：准备依赖、源码快照与必要类型检查 → `next dev --webpack` → 隔离临时服务首页检查 → 同模式切换正式预览。候选和最终进程都注入 development 与应用子路径；不再等待生产全站预渲染。聊天规范明确不为打开预览而主动调用 build。

报告新增 previewMode，开发预览的 build 检查为 skipped，页面标题使用“应用预览已就绪”，完成摘要明确未生产构建。full 模式仍构建并运行生产产物；release 发布引擎未改动，继续生产构建。已有预览快照、失败回滚、隔离和业务数据目录保护不变。

开发服务仍从当前工作区创建的独立候选源码运行；后续工作区修改通过启动/刷新切换新快照，不能把 Next 自身支持 HMR 误解成自动把工作区写入同步到旧候选。

## 验证

- 回归先观察四项失败，再实现：旧 BUILD_ID 抢回生产模式、聊天刷新隐式构建、生成验证无条件构建、报告虚称生产构建成功；另补候选命令/环境一致性断言。
- 完整测试 290 项通过，0 失败、0 跳过；日志 `/tmp/atoms-dev-preview-tests.log`。
- 类型检查和 lint 成功，日志 `/tmp/atoms-dev-preview-{typecheck,lint}.log`。
- 独立临时 Next dev 应用实际运行：`/p/dev-smoke/` 首页、JavaScript 资源和 API 均成功，未创建生产 `.next/BUILD_ID`。
- 真实 headless Chrome 完成页面 hydration、计数按钮交互及候选文件修改后的 dev HMR 更新；日志 `/tmp/atoms-dev-preview-smoke.log`。测试服务、浏览器与临时目录已关闭清理。
- 平台自身的生产构建成功，日志 `/tmp/atoms-dev-preview-platform-build.log`；这是平台部署检查，与生成应用默认不做生产构建是两个不同对象。

## 线上应用

本次仅修改本地平台源码，尚未更新或重启用户服务器。线上更新平台代码并重新构建平台、重启正确服务用户后生效。保持 `GENERATION_VERIFICATION_MODE=preview`（不设置也是默认值）；不要将平台自身 NODE_ENV 改成 development，只有生成应用的子进程使用开发环境。

已有源码无需重新生成：对生成流水线失败项目重试运行验证；对聊天实现完成的工程直接点击启动/重新运行或调用 start_service。生产预渲染问题没有被伪称修复，发布时仍需单独处理。

独立只读审查未发现实质问题，已复核全部预览入口、模式一致性、环境/子路径、报告、旧预览回滚和生产发布边界。
