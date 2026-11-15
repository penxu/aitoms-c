import {pruneCandidates} from "../candidate-retention";
import { fileCheckpoints } from "../checkpoint-context";
import { checkpointHash } from "../file-checkpoints";
import { checkCandidate } from "../candidate-checks";
import type { AcceptanceResult } from "../acceptance";
import { ensureProjectDependencies } from "../scaffold";
import { prepareCandidate } from "../candidate-snapshot";
import { checkImportClosure } from "../import-closure";
import { infrastructureFailure } from "../infrastructure-errors";
import { pnpmShellCommand } from "@/lib/workspace/toolchain";
import { withBuildSlot } from "@/lib/workspace/build-queue";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { waitForHealth } from "../health";
import { createVerificationReport } from "../verification-report";
import { computeProjectHash } from "@/lib/packages/source";
import { projectRoot, resolveInsideProject } from "@/lib/workspace/paths";
import { generateText } from "ai";
import { getModel } from "@/lib/ai/model";
import { config } from "@/lib/config";
import { addRunTokens } from "@/lib/db/generation";
import { restartService } from "@/lib/runner";
import { runCommand } from "@/lib/workspace/command";
import { ensureWorkspaceRuntime } from "@/lib/workspace/execution";
import {sanitizeInstallOutput} from '../install-progress';
import { readFile, writeFile } from "@/lib/workspace/files";
import { REPAIR_SYSTEM_PROMPT, repairUserPrompt } from "../prompts";
import {
  excerptWithLineNumbers,
  findLineOf,
  parseNextBuildDiagnostics,
  parseTscDiagnostics,
  resolveGeneratedDiagnostics,
  type Diagnostic,
} from "../diagnostics";
import { applyRepairFix, parseRepairOutput } from "../repair-output";
import { normalizeSource } from "../source-normalize";
import { isSafePlanPath } from "../plan-schema";
import { isProtectedPath } from "../contracts";
import { collectExports } from "../source-index";
import type { StageContext, StageResult } from "../types";
import { writeFileAtomic, checkTemplateContract } from "./build";

/** 安装/构建超时（10 分钟） */
const BUILD_TIMEOUT_MS = 600_000;
/** 交给修复流程的错误日志长度 */
const ERROR_TAIL_CHARS = 24000;
/** 修复轮数上限 */
const MAX_REPAIR_ROUNDS = 3;

export { waitForHealth } from "../health";

type AttemptResult =
  | { status: "ok"; acceptance?: AcceptanceResult[] }
  | { status: "aborted" }
  | { status: "failed"; log: string };

function tail(text: string): string {
  const value = text.trim();
  return value.length <= ERROR_TAIL_CHARS ? value : value.slice(value.length - ERROR_TAIL_CHARS);
}

function errorLogOf(stdout: string, stderr: string): string {
  return tail([stdout.trim(), stderr.trim()].filter(Boolean).join("\n"));
}

/** 安装依赖：优先命中模板 node_modules 缓存 */
async function installDependencies(ctx: StageContext, dataDir: string): Promise<AttemptResult> {
  ctx.log("info", "校验依赖指纹并安装工程依赖");
  let lastLog=0;
  const result = await ensureProjectDependencies(ctx.projectId, ctx.signal, { ATOMS_DATA_DIR: dataDir, DATABASE_PATH: path.join(dataDir, "app.db") },".",[],message=>{
    if(Date.now()-lastLog>=2000){ctx.log("info",sanitizeInstallOutput(message).trim().slice(-1000));lastLog=Date.now();}
  });
  if (result.aborted || ctx.signal.aborted) return { status: "aborted" };
  if (result.exitCode !== 0) return { status: "failed", log: `[dependencies]\n${errorLogOf(result.stdout, result.stderr)}` };
  return { status: "ok" };
}

/** 参与归一的项目源码范围与上限 */
const SOURCE_DIRS = ["app", "components", "lib"];
const SOURCE_FILE = /\.(ts|tsx)$/;
const MAX_SOURCE_FILES = 200;
const MAX_SOURCE_BYTES = 400_000;

/**
 * 构建前的确定性兜底：把历史文件里的 UI 变体与导入统一成模板约定。
 * 老项目或续跑时 BUILD 可能不重跑，只有这一遍能保证磁盘上的代码符合约定。
 */
function normalizeProjectSources(ctx: StageContext): void {
  const root = projectRoot(ctx.projectId);
  const changed: string[] = [];
  let visited = 0;

  const walk = (dir: string) => {
    if (visited >= MAX_SOURCE_FILES) return;
    if (fs.existsSync(dir) && fs.lstatSync(dir).isSymbolicLink()) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= MAX_SOURCE_FILES) return;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (entry.isSymbolicLink() || !SOURCE_FILE.test(entry.name)) continue;
      visited += 1;
      try {
        if (fs.statSync(abs).size > MAX_SOURCE_BYTES) continue;
        const raw = fs.readFileSync(abs, "utf8");
        const rel = path.relative(root, abs).split(path.sep).join("/");
        const normalized = normalizeSource(rel, raw);
        if (normalized.content === raw) continue;
        ctx.signal.throwIfAborted();
        fs.writeFileSync(abs, normalized.content, "utf8");
        fileCheckpoints().recordRepair(ctx.projectId,checkpointHash(JSON.stringify({plan:ctx.plan,requirement:ctx.requirement})),rel,normalized.content,ctx.runId);
        changed.push(rel);
      } catch {
        /* 单个文件失败不影响整体构建 */
      }
    }
  };

  for (const dir of SOURCE_DIRS) walk(path.join(root, dir));

  if (changed.length > 0) {
    const sample = changed.slice(0, 3).join("、");
    ctx.log(
      "info",
      `构建前统一 UI 约定：${changed.length} 个文件（${sample}${changed.length > 3 ? " 等" : ""}）`,
    );
  }
}

/**
 * 开发预览：源码就是产物，不建快照、不起临时验收服务、不跑生产构建。
 * 只做一次类型检查，然后启动唯一的 next dev；页面编译交给浏览器首次访问，
 * 前端用加载态覆盖等待，临时首页验收不再阻断预览。
 */
async function startDevelopmentPreview(ctx: StageContext, dataDir: string): Promise<AttemptResult> {
  normalizeProjectSources(ctx);
  const imports = checkImportClosure(projectRoot(ctx.projectId));
  if (imports.length) return { status: "failed", log: `[imports]\n${imports.join("\n")}` };

  const checked = await withBuildSlot(async (): Promise<AttemptResult> => {
    ctx.log("info", "执行 pnpm exec tsc --noEmit");
    const tsc = await runCommand(ctx.projectId, `${pnpmShellCommand()} exec tsc --noEmit`, {
      cwd: ".",
      timeoutMs: BUILD_TIMEOUT_MS,
      signal: ctx.signal,
      env: { ATOMS_DATA_DIR: dataDir, DATABASE_PATH: path.join(dataDir, "app.db") },
    });
    if (tsc.aborted) return { status: "aborted" };
    if (tsc.exitCode !== 0) {
      return { status: "failed", log: `[tsc]\n${errorLogOf(tsc.stdout, tsc.stderr)}` };
    }
    return { status: "ok" };
  });
  if (checked.status !== "ok") return checked;

  ctx.log("info", "类型检查通过，启动开发预览；页面首次访问时在后台编译，无需等待");
  try {
    // runner 内部只等端口监听，不会主动请求页面；编译由浏览器首次访问触发。
    await restartService(ctx.projectId, {
      sourceDir: ".",
      validate: async (_result, serviceSignal) => {
        AbortSignal.any([ctx.signal, serviceSignal]).throwIfAborted();
      },
    });
  } catch (error) {
    if (ctx.signal.aborted) return { status: "aborted" };
    return { status: "failed", log: `[start]\n${error instanceof Error ? error.message : String(error)}` };
  }

  try{await pruneCandidates(ctx.projectId,0);}catch(error){ctx.log("warn",`历史预览缓存暂未回收：${String(error)}`);}
  ctx.log("info", "开发预览已启动，页面编译完成后会自动显示");
  return { status: "ok", acceptance: [] };
}

/** 构建并启动服务，最后探活 /api/health */
async function buildAndStart(ctx: StageContext, dataDir: string): Promise<AttemptResult> {
  ctx.emit({ type: "stage", stage: "verify", status: "running" });

  // 默认的开发预览模式：一条启动链路，不再「先起临时服务验收、再起正式预览」。
  if (config.generationVerificationMode !== "full") {
    return startDevelopmentPreview(ctx, dataDir);
  }

  let candidate: { relativeRoot: string; absoluteRoot: string } | undefined;
  const compiled = await withBuildSlot(async (): Promise<AttemptResult> => {
    if (ctx.signal.aborted) return { status: "aborted" };
    normalizeProjectSources(ctx);
    const imports = checkImportClosure(projectRoot(ctx.projectId));
    if (imports.length) return { status: "failed", log: `[imports]\n${imports.join("\n")}` };
    ctx.log("info", "创建独立构建快照，当前预览继续运行");
    candidate = await prepareCandidate(ctx.projectId, ctx.runId, ctx.signal, message=>ctx.log("info",sanitizeInstallOutput(message).trim().slice(-1000)));
    if (ctx.signal.aborted) return { status: "aborted" };

    // 先单独做类型检查：next build 的类型错误输出不完整，单独跑 tsc 能给修复阶段精确的 file:line
    ctx.log("info", "执行 pnpm exec tsc --noEmit");
    const tsc = await runCommand(ctx.projectId, `${pnpmShellCommand()} exec tsc --noEmit`, {
      cwd: candidate.relativeRoot,
      timeoutMs: BUILD_TIMEOUT_MS,
      signal: ctx.signal,
      env: { ATOMS_DATA_DIR: dataDir, DATABASE_PATH: path.join(dataDir, "app.db") },
    });
    if (tsc.aborted) return { status: "aborted" };
    if (tsc.exitCode !== 0) {
      return { status: "failed", log: `[tsc]\n${errorLogOf(tsc.stdout, tsc.stderr)}` };
    }

    if (config.generationVerificationMode !== "full") {
      ctx.log("info", "类型检查通过，直接启动开发预览，跳过生产构建与全站预渲染");
      return { status: "ok" };
    }

    ctx.log("info", "类型检查通过，执行隔离生产构建");
    const build = await runCommand(ctx.projectId, `${pnpmShellCommand()} build --webpack`, {
      cwd: candidate.relativeRoot,
      timeoutMs: BUILD_TIMEOUT_MS,
      signal: ctx.signal,
      // 浏览器端请求需要构建期就知道部署前缀
      env: { ATOMS_DATA_DIR: dataDir, DATABASE_PATH: path.join(dataDir, "app.db"), NODE_ENV: "production", ATOMS_BASE_PATH: `/p/${ctx.projectId}`, NEXT_PUBLIC_ATOMS_BASE_PATH: `/p/${ctx.projectId}` },
    });
    if (build.aborted) return { status: "aborted" };
    if (build.exitCode !== 0) {
      return { status: "failed", log: `[pnpm build]\n${errorLogOf(build.stdout, build.stderr)}` };
    }

    return { status: "ok" };
  });
  if (compiled.status !== "ok") return compiled;
  if (ctx.signal.aborted) return { status: "aborted" };

  let acceptance: AcceptanceResult[];
  try { acceptance = await checkCandidate(ctx, candidate!.relativeRoot, dataDir); }
  catch (error) { return { status: "failed", log: `[acceptance]\n${error instanceof Error ? error.message : String(error)}` }; }
  if (ctx.signal.aborted) return { status: "aborted" };
  ctx.log("info", "候选检查通过，切换稳定预览版本");
  try {
    await restartService(ctx.projectId, {
      sourceDir: candidate!.relativeRoot,
      validate: async (result, serviceSignal) => {
        const signal = AbortSignal.any([ctx.signal, serviceSignal]);
        signal.throwIfAborted();
        if (!await waitForHealth(result.port, 60_000, `/p/${ctx.projectId}`, signal)) {
          ctx.signal.throwIfAborted();
          throw new Error(`正式预览健康检查失败（端口 ${result.port}）`);
        }
        ctx.signal.throwIfAborted();
      },
    });
  } catch (error) {
    if (ctx.signal.aborted) return { status: "aborted" };
    return { status: "failed", log: `[start]\n${error instanceof Error ? error.message : String(error)}` };
  }

  try{await pruneCandidates(ctx.projectId,0);}catch(error){ctx.log("warn",`历史预览缓存暂未回收：${String(error)}`);}
  return { status: "ok", acceptance };
}

/**
 * 从结构化诊断里定位报错文件，只截取报错行附近的上下文（带行号），
 * 便于修复模型原样复制 find 片段，而不是面对整篇文件猜位置。
 */
async function collectErrorContext(
  projectId: string,
  log: string,
  diagnostics: Diagnostic[],
): Promise<{ path: string; excerpt: string }[]> {
  const usable = (rel: string) => isSafePlanPath(rel) && !isProtectedPath(rel);

  const targets = new Map<string, number>();
  for (const item of diagnostics) {
    if (!usable(item.file) || targets.has(item.file)) continue;
    targets.set(item.file, item.line);
    if (targets.size >= 3) break;
  }

  // 没有可解析的诊断（例如 pnpm install / 启动失败）时，退回按日志里的文件名匹配
  if (targets.size === 0) {
    const candidates = [
      ...log.matchAll(/\.\/([\w\-./[\]]+\.(?:tsx?|jsx?|json|css))/g),
      ...log.matchAll(/([\w\-./[\]]+\.(?:tsx?|jsx?))\(\d+,\d+\)/g),
    ];
    for (const match of candidates) {
      const rel = match[1];
      if (!usable(rel) || targets.has(rel)) continue;
      targets.set(rel, 1);
      if (targets.size >= 3) break;
    }
  }

  const files: { path: string; excerpt: string }[] = [];
  for (const [rel, line] of targets) {
    try {
      const content = await readFile(projectId, rel, { complete: true });
      // 预渲染错误只给到页级，需要在文件里定位真正涉及的调用
      const target = line > 1 ? line : findLineOf(content, /useSearchParams\(|useParams\(/);
      files.push({ path: rel, excerpt: excerptWithLineNumbers(content, target, 12) });
    } catch {
      /* 文件不存在则跳过 */
    }
  }
  return files;
}

/** 让模型按 file:line 产出最小替换片段并写入 */
async function repair(ctx: StageContext, log: string): Promise<AttemptResult> {
  const plan = ctx.plan;
  const planSummary = plan
    ? plan.items.map((item) => `- ${item.path}（${item.purpose}）`).join("\n")
    : "（无计划信息）";

  // tsc 报错 + next build 预渲染报错；.next/types 的校验错误回溯到真实路由文件
  const diagnostics = resolveGeneratedDiagnostics(
    [...parseTscDiagnostics(log, 20), ...parseNextBuildDiagnostics(log)],
    projectRoot(ctx.projectId),
  );
  for (const match of log.matchAll(/^([\w./[\]-]+\.tsx?): 找不到模块/gm)) diagnostics.push({ file: match[1], line: 1, column: 1, code: "MISSING_IMPORT", message: "依赖文件不存在" });
  const missingFiles = [...log.matchAll(/找不到模块 @\/([\w./[\]-]+)/g)].map(match => {
    const target = match[1];return plan?.items.find(item => item.path.replace(/\.tsx?$/, "") === target)?.path ?? `${target}${target.startsWith("components/") ? ".tsx" : ".ts"}`;
  });
  const files = await collectErrorContext(ctx.projectId, tail(log), diagnostics);
  if(log.startsWith("[acceptance]")) {
    const targets=plan?.items.slice(0,20)??[];
    let budget=200000;
    for(const item of targets) if(!files.some(file=>file.path===item.path)) {
      try {if(budget<=0)break;const excerpt=fs.readFileSync(resolveInsideProject(ctx.projectId,item.path),"utf8").slice(0,Math.min(24000,budget));files.push({path:item.path,excerpt});budget-=excerpt.length;}catch{}
    }
  }
  const sourceVersion = computeProjectHash(projectRoot(ctx.projectId));
  // 给模型一份真实的导出清单，避免它在 getFeedbackForEvent / getFeedbackByEvent 之间反复改名
  const exportsIndex = collectExports(projectRoot(ctx.projectId));

  try {
    const result = await generateText({
      model: getModel("repair"),
      system: REPAIR_SYSTEM_PROMPT,
      prompt: repairUserPrompt({
        errorLog: tail(log),
        planSummary: planSummary + `\n\n可执行验收契约：${JSON.stringify(plan?.acceptance ?? [])}`,
        files,
        diagnostics,
        missingFiles,
        exports: exportsIndex,
      }),
      temperature: 0.2,
      abortSignal: ctx.signal,
      timeout: { totalMs: config.generationModelTimeoutMs, firstChunkMs: config.modelFirstChunkTimeoutMs, chunkMs: config.modelChunkTimeoutMs },
    });
    if (ctx.signal.aborted) return { status: "aborted" };
    if (sourceVersion !== computeProjectHash(projectRoot(ctx.projectId))) return {status:"failed",log:"自动修复等待期间源码已被其他修改，已保留现有代码，请重新验证"};
    addRunTokens(ctx.runId, {
      input: result.usage.inputTokens,
      output: result.usage.outputTokens,
    });

    const parsed = parseRepairOutput(result.text);
    if (parsed.truncated) {
      ctx.log("warn", "修复输出被截断，已丢弃末尾不完整的片段");
    }
    if (parsed.fixes.length === 0) {
      ctx.log("warn", "自动修复没有给出可用的修改片段");
      return { status: "failed", log };
    }

    let written = 0;
    for (const fix of parsed.fixes) {
      if (ctx.signal.aborted) return { status: "aborted" };
      if (!isSafePlanPath(fix.path)) {
        ctx.log("warn", `忽略修复建议中的非法路径：${fix.path}`);
        continue;
      }
      // 只挡脚手架文件；报错发生在历史文件里时也必须允许修复，不能再按当前计划裁剪
      if (isProtectedPath(fix.path)) {
        ctx.log("warn", `忽略对受保护文件的修复建议：${fix.path}`);
        continue;
      }

      let current: string;
      try {
        current = readFile(ctx.projectId, fix.path, { complete: true });
      } catch {
        if (fs.existsSync(resolveInsideProject(ctx.projectId, fix.path, {allowMissing:true}))) {ctx.log("warn",`无法完整读取现有修复目标，已保留：${fix.path}`);continue;}
        if (!fix.content || (!missingFiles.includes(fix.path) && !plan?.items.some(item => item.path === fix.path))) {
          ctx.log("warn", `修复目标文件不存在且没有完整创建内容：${fix.path}`);continue;
        }
        current = "";
      }

      const applied = applyRepairFix(current, fix);
      if (applied.applied === 0) {
        ctx.log("warn", `${fix.path} 的修复片段与现有内容不匹配，已跳过`);
        continue;
      }

      const normalized = normalizeSource(fix.path, applied.content);
      if (normalized.notes.length > 0) {
        ctx.log("info", `自动归一 UI 约定：${normalized.notes.join("，")}`);
      }

      const violation = checkTemplateContract(fix.path, normalized.content);
      if (violation) {
        ctx.log("warn", `忽略破坏模板契约的修复：${violation}`);
        continue;
      }

      ctx.emit({ type: "file", path: fix.path, status: "writing" });
      try {
        if (ctx.signal.aborted) return { status: "aborted" };
        writeFileAtomic(ctx.projectId, fix.path, normalized.content);
        fileCheckpoints().recordRepair(ctx.projectId,checkpointHash(JSON.stringify({plan:ctx.plan,requirement:ctx.requirement})),fix.path,normalized.content,ctx.runId);
        ctx.emit({ type: "file", path: fix.path, status: "done" });
        written += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.emit({ type: "file", path: fix.path, status: "failed", error: message });
      }
    }

    if (written === 0) return { status: "failed", log };
    ctx.log("info", `已修复 ${written} 个文件`);
    return { status: "ok" };
  } catch (error) {
    if (ctx.signal.aborted) return { status: "aborted" };
    ctx.log("warn", `自动修复失败：${error instanceof Error ? error.message : String(error)}`);
    return { status: "failed", log };
  }
}

/**
 * VERIFY 阶段：安装依赖 → 构建 → 启动 → 探活。
 * 失败时把错误日志交给模型修复，最多 3 轮；成功后服务保持运行。
 */
async function verifyProject(ctx: StageContext, dataDir: string): Promise<StageResult> {
  if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

  let installed = false;

  for (let round = 0; round <= MAX_REPAIR_ROUNDS; round += 1) {
    if (ctx.signal.aborted) return { ok: false, error: "cancelled" };

    if (!installed) {
      const prep = await installDependencies(ctx, dataDir);
      if (prep.status === "aborted") return { ok: false, error: "cancelled" };
      if (prep.status === "ok") {
        installed = true;
      } else {
        ctx.log("warn", `依赖安装失败：${prep.log.split("\n").slice(0, 3).join(" ")}`);
        return { ok: false, error: infrastructureFailure(prep.log) ?? `依赖安装失败，请检查工具链或网络：${prep.log}` };
      }
    }

    const attempt = await buildAndStart(ctx, dataDir);
    if (attempt.status === "aborted") return { ok: false, error: "cancelled" };
    if (attempt.status === "ok") {
      if (ctx.signal.aborted) return { ok: false, error: "cancelled" };
      let spec = "";
      try { spec = readFile(ctx.projectId, ".atoms/SPEC.md"); } catch { /* Legacy project. */ }
      const report = createVerificationReport({
        runId: ctx.runId,
        sourceHash: computeProjectHash(projectRoot(ctx.projectId)),
        spec,
        acceptance: attempt.acceptance,
        expectedChecks: ctx.plan?.acceptance?.map(check => check.id),
        developmentPreview: config.generationVerificationMode !== "full",
      });
      writeFile(ctx.projectId, ".atoms/VERIFICATION.json", JSON.stringify(report, null, 2));
      ctx.log("info", report.businessVerified ? "计划内业务验收与技术检查均已通过，详见 .atoms/VERIFICATION.json" : report.previewMode === "development" ? "开发预览已启动：仅确认端口监听，页面在浏览器首次访问时编译；未执行生产构建与业务验收，详见 .atoms/VERIFICATION.json" : "技术和页面检查已通过；完整业务流程尚未验收，详见 .atoms/VERIFICATION.json");
      return { ok: true };
    }

    const infrastructureError = infrastructureFailure(attempt.log);
    if (infrastructureError) return { ok: false, error: infrastructureError };

    ctx.log("warn", `构建或启动失败：${attempt.log.split("\n").slice(0, 3).join(" ")}`);
    if (round === MAX_REPAIR_ROUNDS) {
      return { ok: false, error: `构建或启动失败：${attempt.log}` };
    }

    ctx.log("info", `进入第 ${round + 1} 轮自动修复`);
    const beforeRepair = computeProjectHash(projectRoot(ctx.projectId));
    const fixed = await repair(ctx, attempt.log);
    if (fixed.status === "aborted") return { ok: false, error: "cancelled" };
    if (fixed.status === "failed" || beforeRepair === computeProjectHash(projectRoot(ctx.projectId))) return { ok: false, error: `自动修复未产生有效修改，已停止重复构建：${fixed.status === "failed" ? fixed.log : attempt.log}` };
  }

  return { ok: false, error: "构建或启动失败：修复轮次已用尽" };
}

/** Build-time data access must never touch preview or production databases. */
export async function runVerifyStage(ctx: StageContext): Promise<StageResult> {
  if (ctx.signal.aborted) return { ok: false, error: "cancelled" };
  ctx.log("info", "代码已生成并保存，正在准备运行环境；首次准备可能需要下载工具链");
  try {
    const runtime = await ensureWorkspaceRuntime(projectRoot(ctx.projectId), ctx.signal);
    if (ctx.signal.aborted) return { ok: false, error: "cancelled" };
    ctx.log("info", `运行环境已就绪（${runtime.backend}），开始安装依赖与验证`);
  } catch (error) {
    if (ctx.signal.aborted) return { ok: false, error: "cancelled" };
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `代码已生成并保存，运行环境准备失败：${message}。修复环境后可仅重试运行验证，无需重新生成代码。` };
  }
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "atoms-verify-"));
  try {
    return await verifyProject(ctx, dataDir);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
