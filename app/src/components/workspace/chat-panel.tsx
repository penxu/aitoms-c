"use client";

import { useEffect, useRef, useState } from "react";
import { AssistantRuntimeProvider, ThreadPrimitive, ComposerPrimitive, MessagePrimitive, AuiIf, useAuiState } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/ai-sdk";
import { Sparkles, ArrowUp, ArrowRight, LoaderCircle, Square, MessageSquare } from "lucide-react";
import type { UIMessage } from "ai";
import { currentActivity, inputDestination, type StudioEvent } from "./generation-presentation";
import { formatErrorDetail } from "@/lib/ai/model-errors";
import { GenerationDiscussion } from "./generation-discussion";
import type { DiscussionAnswers } from "@/lib/generation/discussion-schema";
import { GenerationSummary } from "./generation-summary";
import type { GenerationView } from "./generation-timeline";

const EXAMPLES = [
  { label: "预约小工具", text: "做一个宠物美容预约网站，包含服务列表、预约表单和后台查询" },
  { label: "品牌落地页", text: "做一个独立咖啡品牌官网，包含品牌介绍、产品展示和联系表单" },
  { label: "个人作品集", text: "做一个设计师作品集，展示精选项目、个人介绍与联系方式" },
];

export function ChatPanel({
  projectId,
  initialMessages,
  locked = false,
  modelConfigured = true,
  canGenerate = false,
  onGenerate,
  onToolFinished,
  requirement,
  generationView,
  generationEvents = [],
  onOpenProcess,
  onCancel,
  onRetry,
  onAnswer,
}: {
  projectId: string;
  initialMessages: UIMessage[];
  /** 生成流水线进行中：禁止继续对话 */
  locked?: boolean;
  modelConfigured?: boolean;
  /** 项目尚未生成完成，可以接受「对话即生成」 */
  canGenerate?: boolean;
  onGenerate?: (requirement: string) => void;
  onToolFinished?: () => void;
  requirement?: string;
  generationView?: GenerationView | null;
  generationEvents?: StudioEvent[];
  onOpenProcess?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onAnswer?: (answers:DiscussionAnswers,recommended:boolean)=>Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const runtime = useChatRuntime({ transport: new AssistantChatTransport({ api: "/api/chat", body: { projectId } }), messages: initialMessages });

  // 首次输入走分阶段生成；项目完成后才切换到对话式修改
  const destination = inputDestination(modelConfigured, canGenerate);
  const waiting=generationView?.status==="waiting";
  const activity = locked && !waiting ? currentActivity(generationEvents, generationView?.stage ?? null) : null;

  // 需求出现时回到顶部，保证“你的想法 + 需求理解”立刻可见
  const lastScrolledRequirement = useRef<string | null>(null);
  useEffect(() => {
    if (!requirement || lastScrolledRequirement.current === requirement) return;
    lastScrolledRequirement.current = requirement;
    // 等聊天运行时完成首次布局滚动后再回顶
    const timer = setTimeout(() => {
      document.getElementById("studio-chat-viewport")?.scrollTo({ top: 0, behavior: "auto" });
    }, 180);
    return () => clearTimeout(timer);
  }, [requirement]);

  useEffect(()=>{
    if(!waiting)return;
    const timer=setTimeout(()=>{const card=document.querySelector<HTMLElement>(".discussion-card");const viewport=document.getElementById("studio-chat-viewport");if(card&&viewport)viewport.scrollTo({top:card.offsetTop-viewport.offsetTop-16,behavior:"auto"});},200);
    return ()=>clearTimeout(timer);
  },[waiting,generationView?.discussion?.version]);

  function submit() {
    const text = draft.trim();
    if (!text || locked || destination !== "generate") return;
    onGenerate?.(text);
    setDraft("");
  }

  const placeholder = waiting ? "请在上方选择方案或补充需求，再确认继续" : locked
    ? (activity?.title ?? "应用正在构建，你可以查看执行过程…")
    : destination === "generate"
      ? "描述你的想法，剩下的我们一起完成…"
      : destination === "disabled"
        ? "配置模型后，开始你的第一个应用"
        : "继续打磨：调整页面，或添加一个功能…";

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="studio-chat flex h-full w-full min-w-0 max-w-full flex-col">
        <div className="studio-chat-heading">
          <span className="studio-avatar"><Sparkles size={15} /></span>
          <div>
            <strong>与你一起，做点好东西。</strong>
            <span>Atoms · 你的开发伙伴</span>
          </div>
          <span className="studio-chat-indicator">{indicatorText(locked, generationView, activity?.title)}</span>
        </div>

        <ThreadPrimitive.Viewport id="studio-chat-viewport" className="studio-chat-viewport min-w-0 flex-1 overflow-y-auto">
          {!requirement && !generationView && (
            <ThreadPrimitive.Empty>
              <div className="studio-chat-empty">
                <div className="studio-empty-mark"><Sparkles size={28} strokeWidth={1.3} /></div>
                <span className="eyebrow">LET’S MAKE IT REAL</span>
                <h2>你想做一个<br />什么样的应用？</h2>
                <p>从一个小问题、一个灵感开始。<br />我会整理需求、编写代码，陪你看到它运行。</p>
                <div className="studio-examples">
                  {EXAMPLES.map((example) => (
                    <button key={example.label} onClick={() => { setDraft(example.text); document.getElementById("studio-generation-input")?.focus(); }}>
                      <MessageSquare size={13} />{example.label}<ArrowRight size={13} />
                    </button>
                  ))}
                </div>
              </div>
            </ThreadPrimitive.Empty>
          )}

          <div className="mx-auto flex w-full min-w-0 max-w-2xl flex-col gap-5">
            {requirement && <div className="studio-requirement"><span>你的想法</span><p>{requirement}</p></div>}
            {waiting&&generationView?.discussion&&onAnswer&&<GenerationDiscussion key={`${generationView.runId}-${generationView.discussion.version}`} discussion={generationView.discussion} onAnswer={onAnswer} onCancel={onCancel}/>}
            {generationView && !waiting && (
              <GenerationSummary
                view={generationView}
                events={generationEvents}
                onOpenProcess={onOpenProcess}
                onCancel={onCancel}
                onRetry={onRetry}
              />
            )}
            <ThreadPrimitive.Messages>{({ message }) => <ChatMessage message={message} onToolFinished={onToolFinished} />}</ThreadPrimitive.Messages>
            <AuiIf condition={(state) => state.thread.isRunning}>
              <div className="studio-assistant-pending" role="status">
                <span className="studio-avatar"><Sparkles size={14} /></span>
                <div><strong>正在处理你的修改</strong><p>执行工具与回复会显示在这里。</p></div>
                <LoaderCircle size={15} className="animate-spin" />
              </div>
            </AuiIf>
          </div>
          <ThreadPrimitive.ScrollToBottom className="sticky bottom-2 ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white text-xs shadow-sm"><ArrowUp className="rotate-180" size={14} /></ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Viewport>

        <div className="studio-composer-area">
          {!modelConfigured && (
            <div className="studio-model-notice" role="status">模型尚未配置。配置服务器的模型服务后，即可开始构建。</div>
          )}

          {waiting ? <p role="status" className="text-center text-xs leading-6 text-black/45">选择方案或补充想法，确认后继续生成。</p> : destination === "chat" ? (
            <ComposerPrimitive.Root className="studio-composer">
              <ComposerPrimitive.Input aria-label="继续修改应用" placeholder={waiting ? placeholder : locked ? "构建进行中…" : placeholder} className="studio-composer-input" rows={2} disabled={locked} />
              <div className="studio-composer-footer">
                <span><CodeBadge />对话修改</span>
                <AuiIf condition={(state) => !state.thread.isRunning}>
                  <ComposerPrimitive.Send aria-label="发送消息" disabled={locked} className="studio-send"><ArrowUp size={17} /></ComposerPrimitive.Send>
                </AuiIf>
                <AuiIf condition={(state) => state.thread.isRunning}>
                  <ComposerPrimitive.Cancel aria-label="停止回复" className="studio-send"><Square size={12} /></ComposerPrimitive.Cancel>
                </AuiIf>
              </div>
            </ComposerPrimitive.Root>
          ) : (
            <div className="studio-composer">
              <textarea
                id="studio-generation-input"
                aria-label="应用需求"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder={placeholder}
                rows={3}
                disabled={locked || destination === "disabled"}
                className="studio-composer-input"
              />
              <div className="studio-composer-footer">
                <span><Sparkles size={12} />一句话开始构建</span>
                <button className="studio-send" aria-label="开始生成" onClick={submit} disabled={locked || destination === "disabled" || !draft.trim()}>
                  {locked ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowUp size={17} />}
                </button>
              </div>
            </div>
          )}

          <p className="studio-composer-note">
            {waiting ? "任务已暂停，请在上方讨论卡片回答；确认后继续生成" : locked
              ? [activity?.title, activity?.detail].filter(Boolean).join(" · ") || "正在真实执行，阶段与代码会持续更新"
              : destination === "chat"
                ? "Enter 发送 · Shift + Enter 换行"
                : "Enter 开始构建 · Shift + Enter 换行"}
          </p>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

function indicatorText(locked: boolean, view: GenerationView | null | undefined, activity?: string): string {
  if(view?.status==="waiting")return "等待你的选择";
  if (locked) return activity ?? "正在构建";
  if (!view) return "准备就绪";
  if (view.status === "ready") return "已完成";
  if (view.status === "failed") return "生成失败";
  if (view.status === "cancelled") return "已取消";
  if (view.status === "interrupted") return "已中断";
  return "准备就绪";
}

function CodeBadge() {
  return <span className="studio-code-badge">&lt;/&gt;</span>;
}

function ChatMessage({
  message,
  onToolFinished,
}: {
  message: { role: string };
  onToolFinished?: () => void;
}) {
  const isUser = message.role === "user";
  return (
    <MessagePrimitive.Root className={`flex min-w-0 max-w-full ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "min-w-0 max-w-[85%] [overflow-wrap:anywhere] rounded-2xl rounded-br-md bg-[#4267ff] px-4 py-2.5 text-[14px] leading-relaxed text-white"
            : "w-full min-w-0 max-w-[92%] [overflow-wrap:anywhere] rounded-2xl rounded-bl-md border border-black/8 bg-white px-4 py-3 text-[14px] leading-relaxed text-[#0c0c0c]"
        }
      >
        <MessagePrimitive.Error>
          <ChatSendError />
        </MessagePrimitive.Error>
        <MessagePrimitive.Parts
          components={{
            Text: ({ text }: { text: string }) => <RichText text={text} />,
            Reasoning: ({ text }: { text?: string }) => (
              <details className="mb-2 rounded-lg bg-black/4 px-3 py-2 text-[12.5px] text-black/50">
                <summary className="cursor-pointer">思考过程</summary>
                <div className="mt-1 whitespace-pre-wrap">{text}</div>
              </details>
            ),
            tools: {
              Fallback: (props: unknown) => (
                <ToolCallCard props={props as ToolProps} onFinished={onToolFinished} />
              ),
            },
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

/** 发送失败提示：附带服务端返回的真实原因，不再一律归咎于模型配置 */
function ChatSendError() {
  const status = useAuiState((state) => state.message.status);
  const error = status && status.type === "incomplete" ? status.error : undefined;
  const detail = formatErrorDetail(error);
  return (
    <div role="alert" className="feedback-error mb-3">
      <p>消息发送失败。请检查模型配置与连接，然后重试。</p>
      {detail && detail !== "An error occurred." && (
        <p className="mt-1 text-[12px] opacity-80">{detail}</p>
      )}
    </div>
  );
}

interface ToolProps {
  toolName?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status?: { type?: string } | string;
}

const TOOL_LABELS: Record<string, string> = {
  init_project: "初始化项目",
  read_file: "读取文件",
  write_file: "写入文件",
  edit_file: "编辑文件",
  list_files: "列出文件",
  search_files: "搜索文件",
  delete_file: "删除文件",
  run_command: "执行命令",
  install_deps: "安装依赖",
  start_service: "启动服务",
  stop_service: "停止服务",
  restart_service: "重启服务",
};

function toolStatus(status: ToolProps["status"]): string {
  if (typeof status === "string") return status;
  return status?.type ?? "running";
}

function ToolCallCard({ props, onFinished }: { props: ToolProps; onFinished?: () => void }) {
  const name = props.toolName ?? "tool";
  const args = props.args ?? {};
  const state = toolStatus(props.status);
  const done = state === "complete" || state === "result";

  const target =
    (args.path as string) ??
    (args.command as string) ??
    (args.pattern as string) ??
    (args.template as string) ??
    "";

  useEffect(() => {
    if (done) onFinished?.();
  }, [done, onFinished]);

  const detail = typeof props.result === "string" ? props.result : props.result ? JSON.stringify(props.result, null, 2) : typeof args.content === "string" ? args.content : typeof args.newText === "string" ? args.newText : "";
  return (
    <details className="my-2 min-w-0 max-w-full rounded-xl border border-black/8 bg-[#fafaf9] px-3 py-2">
      <summary className="flex min-w-0 cursor-pointer items-center gap-2 text-[12.5px]">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            done ? "bg-[#2dbb5c]" : "animate-pulse bg-[#4267ff]"
          }`}
        />
        <span className="font-medium text-[#0c0c0c]">{TOOL_LABELS[name] ?? name}</span>
        {target ? (
          <code className="min-w-0 max-w-[260px] truncate rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px] text-black/55">
            {target}
          </code>
        ) : null}
      </summary>
      {target && <code className="tool-target">{target}</code>}
      {detail ? <pre className="tool-output">{detail.slice(-4000)}</pre> : <p className="tool-detail-note">{done ? "工具执行完成" : "正在执行，等待工具结果…"}</p>}
    </details>
  );
}

/** 轻量 Markdown 渲染：代码块 + 段落 */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/```/);
  return (
    <div className="min-w-0 max-w-full space-y-2 [overflow-wrap:anywhere]">
      {blocks.map((block, i) => {
        if (i % 2 === 1) {
          const body = block.replace(/^[a-zA-Z0-9]*\n/, "");
          return (
            <pre
              key={i}
              className="max-w-full overflow-x-auto rounded-lg bg-[#0d0d12] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#c8c8d4]"
            >
              <code>{body}</code>
            </pre>
          );
        }
        return (
          <p key={i} className="max-w-full whitespace-pre-wrap [overflow-wrap:anywhere]">
            {block}
          </p>
        );
      })}
    </div>
  );
}
