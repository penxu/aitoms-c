"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, Check, Code2, FileCode2, LoaderCircle } from "lucide-react";
import { latestCodeSnapshots, type StudioEvent } from "./generation-presentation";

export function LiveCodeViewer({ events, running }: { events: StudioEvent[]; running: boolean }) {
  const files = useMemo(() => latestCodeSnapshots(events), [events]);
  const [selected, setSelected] = useState<string | null>(null);
  const [following, setFollowing] = useState(true);
  const viewport = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const latest = files.at(-1);
  const file = files.find((item) => item.path === selected) ?? latest;

  useEffect(() => {
    const node = viewport.current;
    if (node && followRef.current) node.scrollTop = node.scrollHeight;
  }, [file?.content, file?.path]);

  const lines = file ? file.content.split("\n") : [];
  const offset = file ? Math.max(0, (file.totalLines ?? lines.length) - lines.length) : 0;

  return (
    <div className="live-code-viewer">
      <div className="live-code-heading">
        <Code2 size={14} />
        <span>代码现场</span>
        <span className="live-code-status">
          {running ? <><LoaderCircle size={12} className="animate-spin" />实时生成</> : <><Check size={12} />执行记录</>}
        </span>
      </div>

      {files.length ? (
        <>
          <div className="live-code-tabs" role="tablist" aria-label="生成的文件">
            {files.map((item) => (
              <button
                key={item.path}
                role="tab"
                aria-selected={file?.path === item.path}
                title={item.path}
                onClick={() => { setSelected(item.path); followRef.current = true; setFollowing(true); }}
              >
                <FileCode2 size={12} />
                {item.path.split("/").slice(-2).join("/")}
                {item.status === "streaming" && <span className="live-dot" />}
              </button>
            ))}
            <button onClick={() => { setSelected(null); followRef.current = true; setFollowing(true); }} title="跟随最新文件">跟随最新</button>
          </div>

          <div className="live-code-path">
            {file?.path}
            <span data-state={file?.status}>{file?.status === "complete" ? "写入完成" : "正在接收代码"}</span>
          </div>

          <div
            ref={viewport}
            className="live-code-scroll"
            onScroll={(event) => {
              const node = event.currentTarget;
              const next = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
              followRef.current = next;
              setFollowing(next);
            }}
          >
            <pre aria-label="实时生成的代码">
              {lines.map((line, index) => (
                <div className="live-code-line" key={index}>
                  <span className="line-number">{offset + index + 1}</span>
                  <code>{line || " "}</code>
                </div>
              ))}
            </pre>
          </div>

          <div className="live-code-footer">
            <span>{file?.totalLines ?? lines.length} 行 · {(file?.totalChars ?? file?.content.length ?? 0).toLocaleString()} 字符</span>
            {!following && (
              <button onClick={() => { followRef.current = true; setFollowing(true); viewport.current?.scrollTo({ top: viewport.current.scrollHeight }); }}>
                <ArrowDown size={12} />跟随代码
              </button>
            )}
            <span>真实代码 · 最近 18,000 字符</span>
          </div>
        </>
      ) : (
        <div className="live-code-empty">
          <FileCode2 size={30} strokeWidth={1.2} />
          <h4>{running ? "正在准备第一份代码" : "代码，让想法落地。"}</h4>
          <p>{running ? "需求和方案就绪后，新写入的代码会实时出现在这里。" : "开始构建后，在这里查看实际生成的文件与代码。"}</p>
          <div><i /><i /><i /></div>
        </div>
      )}
    </div>
  );
}
