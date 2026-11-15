import { listFiles } from "@/lib/workspace/files";
import { getLatestGenerationRun } from "@/lib/db/generation";
import { notFound } from "next/navigation";
import type { UIMessage } from "ai";
import { Workspace } from "@/components/workspace/workspace";
import { getOrCreateMainThread, getProject, listThreadMessages } from "@/lib/db/queries";
import { isModelConfigured } from "@/lib/ai/model";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { projectId } = await params;
  const { q } = await searchParams;

  const project = getProject(projectId);
  if (!project) notFound();

  const threadId = getOrCreateMainThread(projectId);
  const messages = listThreadMessages(threadId).map(
    // 历史数据里可能有 system 角色（早期的生成摘要），统一按 assistant 呈现
    (m) => ({ id: m.id, role: m.role === "system" ? "assistant" : m.role, parts: m.parts }) as unknown as UIMessage,
  );

  return (
    <Workspace
      project={{
        id: project.id,
        name: project.name,
        status: project.status,
        assignedPort: project.assignedPort,
      }}
      hasExistingWork={messages.length > 0 || listFiles(projectId, 0).length > 0 || Boolean(getLatestGenerationRun(projectId))}
      initialMessages={messages}
      initialQuery={q}
      modelConfigured={isModelConfigured()}
    />
  );
}
