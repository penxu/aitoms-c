export async function downloadProject(projectId: string, kind: "source" | "deploy", releaseId?: string) {
  const query = new URLSearchParams({ kind });
  if (releaseId) query.set("releaseId", releaseId);
  const res = await fetch(`/api/projects/${projectId}/export?${query}`);
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `下载失败（${res.status}）`);
  }
  const blob = await res.blob();
  if (!blob.size) throw new Error("下载内容为空，请重试。");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${projectId}-${kind}${releaseId ? `-${releaseId}` : "-draft"}.zip`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

