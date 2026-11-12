"use client";

import { AssistantRuntimeProvider, ThreadPrimitive, ComposerPrimitive, MessagePrimitive } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/ai-sdk";
import { AssistantChatTransport } from "@assistant-ui/ai-sdk";
import type { UIMessage } from "ai";

export function ChatPanel({
  projectId,
  initialMessages,
  locked = false,
  onToolFinished,
}: {
  projectId: string;
  initialMessages: UIMessage[];
  /** 生成流水线进行中：禁止继续对话 */
  locked?: boolean;
  onToolFinished?: () => void;
}) {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: { projectId },
    }),
    messages: initialMessages,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex h-full flex-col bg-white">
        <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-5 py-6">
          <ThreadPrimitive.Empty>
            <div className="mx-auto max-w-md pt-16 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#4267ff] to-[#b88ade] text-white">
                ✦
              </div>
              <h3 className="text-[15px] font-semibold text-[#0c0c0c]">告诉 AI 你想构建什么</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#0c0c0c]/55">
                描述需求后，AI 会在项目目录中创建文件、编写代码并启动服务。
              </p>
            </div>
          </ThreadPrimitive.Empty>

          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            <ThreadPrimitive.Messages>
              {({ message }) => <ChatMessage message={message} onToolFinished={onToolFinished} />}
            </ThreadPrimitive.Messages>
          </div>
          <ThreadPrimitive.ScrollToBottom className="sticky bottom-2 ml-auto flex h-8 w-8 items-center justify-center rounded-full border border-black/10 bg-white text-xs shadow-sm" />
        </ThreadPrimitive.Viewport>

        <div className="border-t border-black/8 bg-white px-5 py-4">
          {locked ? (
            <p className="mx-auto mb-2 max-w-2xl text-[12px] text-[#7b4fb0]">
              生成中，完成后再继续对话
            </p>
          ) : null}
          <ComposerPrimitive.Root className="mx-auto flex max-w-2xl items-end gap-2 rounded-2xl border border-black/10 bg-[#fafaf9] p-2 focus-within:border-[#4267ff]/50">
            <ComposerPrimitive.Input
              placeholder={locked ? "生成中，完成后再继续对话" : "描述需求，或让 AI 修改代码…"}
              className="max-h-40 min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] outline-none placeholder:text-black/35 disabled:opacity-50"
              rows={1}
              disabled={locked}
              autoFocus={!locked}
            />
            <ComposerPrimitive.Send
              disabled={locked}
              className="flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-[#4267ff] text-white transition hover:bg-[#2f50f0] disabled:opacity-40"
            >
              ↑
            </ComposerPrimitive.Send>
          </ComposerPrimitive.Root>
          <p className="mx-auto mt-2 max-w-2xl text-center text-[11.5px] text-black/35">
            AI 拥有该项目目录的读写权限，请勿上传敏感信息
          </p>
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
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
    <MessagePrimitive.Root className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-md bg-[#4267ff] px-4 py-2.5 text-[14px] leading-relaxed text-white"
            : "w-full max-w-[92%] rounded-2xl rounded-bl-md border border-black/8 bg-white px-4 py-3 text-[14px] leading-relaxed text-[#0c0c0c]"
        }
      >
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

  if (done && onFinished) {
    // 工具执行完成后通知外层刷新文件树/预览
    queueMicrotask(() => onFinished());
  }

  return (
    <div className="my-2 rounded-xl border border-black/8 bg-[#fafaf9] px-3 py-2">
      <div className="flex items-center gap-2 text-[12.5px]">
        <span
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            done ? "bg-[#2dbb5c]" : "animate-pulse bg-[#4267ff]"
          }`}
        />
        <span className="font-medium text-[#0c0c0c]">{TOOL_LABELS[name] ?? name}</span>
        {target ? (
          <code className="max-w-[260px] truncate rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px] text-black/55">
            {target}
          </code>
        ) : null}
      </div>
    </div>
  );
}

/** 轻量 Markdown 渲染：代码块 + 段落 */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/```/);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        if (i % 2 === 1) {
          const body = block.replace(/^[a-zA-Z0-9]*\n/, "");
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg bg-[#0d0d12] px-3 py-2.5 font-mono text-[12px] leading-relaxed text-[#c8c8d4]"
            >
              <code>{body}</code>
            </pre>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </div>
  );
}
