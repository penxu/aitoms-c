"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import { EmptyState } from "@/components/app/empty-state";
import { CatalogPanel, readCatalogDragId } from "@/components/studio/catalog-panel";
import { FloorCanvas, type PlacementPatch } from "@/components/studio/floor-canvas";
import { InspectorPanel } from "@/components/studio/inspector-panel";
import { IsometricPreview } from "@/components/studio/isometric-preview";
import { Button } from "@/components/ui/button";
import { apiPath } from "@/lib/api-path";
import { formatClockTime, normalizeRotation, occupiedSize } from "@/lib/room/constants";
import type {
  ApiErrorResponse,
  CatalogItem,
  EditablePlacement,
  PlacementRecord,
  ProjectDetail,
  SavePlacementsResponse,
} from "@/lib/room/types";

export interface StudioClientProps {
  /** 服务端一次性读取的项目详情（项目 + 已保存布局 + 素材库） */
  detail: ProjectDetail;
  onDirtyChange?: (dirty: boolean) => void;
}

/** 把已保存的摆放记录转换为客户端可编辑态（key 用于 React 列表与选中） */
function toEditable(record: PlacementRecord): EditablePlacement {
  return {
    id: record.id,
    key: `saved-${record.id}`,
    catalogId: record.catalogId,
    xCm: record.xCm,
    yCm: record.yCm,
    rotationDeg: record.rotationDeg,
    colorOverride: record.colorOverride,
  };
}

/**
 * 设计工作台客户端容器。
 *
 * 负责：
 * - 管理摆放数组与选中项（含未保存的新增家具，id 为 null）；
 * - 串接素材库（点击/拖拽添加）、俯视画布（拖动/旋转/删除）、属性面板、等距 3D 预览；
 * - 调用 PUT /api/projects/{id}/placements 全量保存，沿用共享 DTO 与错误格式；
 * - 保存期间禁用写操作并显示「保存中…」，成功展示「已保存 · HH:mm」，
 *   失败在顶部给出可读错误 + 重试，并高亮出错条目。
 */
export function StudioClient({ detail, onDirtyChange }: StudioClientProps) {
  const { project, catalog } = detail;

  const [placements, setPlacements] = useState<EditablePlacement[]>(() =>
    detail.placements.map((record) => toEditable(record)),
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<{ message: string; index: number } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  /** 本地新增家具的稳定 key 计数器（仅在事件处理中递增，渲染期不使用随机数） */
  const newKeyRef = useRef(0);

  const catalogById = useMemo(() => {
    const map = new Map<number, CatalogItem>();
    for (const item of catalog) map.set(item.id, item);
    return map;
  }, [catalog]);

  const selected = useMemo(
    () => placements.find((item) => item.key === selectedKey) ?? null,
    [placements, selectedKey],
  );

  /** 在房间中央插入一条待保存的摆放记录（点击或拖拽素材均走此处） */
  function addFromCatalog(item: CatalogItem) {
    if (saving) return;
    const rotationDeg = 0;
    const size = occupiedSize(item.widthCm, item.depthCm, rotationDeg);
    const maxX = Math.max(0, project.widthCm - size.widthCm);
    const maxY = Math.max(0, project.depthCm - size.depthCm);
    const centeredX = Math.min(
      Math.max(0, Math.round((project.widthCm - size.widthCm) / 2)),
      maxX,
    );
    const centeredY = Math.min(
      Math.max(0, Math.round((project.depthCm - size.depthCm) / 2)),
      maxY,
    );

    newKeyRef.current += 1;
    const key = `new-${newKeyRef.current}`;
    setPlacements((prev) => [
      ...prev,
      {
        id: null,
        key,
        catalogId: item.id,
        xCm: centeredX,
        yCm: centeredY,
        rotationDeg,
        colorOverride: null,
      },
    ]);
    setSelectedKey(key);
    setSavedAt(null);
    setDirty(true);
    setErrorKey(null);
  }

  /** 画布/属性面板发起的位置、旋转、颜色修改 */
  function handleChange(key: string, patch: PlacementPatch) {
    if (saving) return;
    setPlacements((prev) =>
      prev.map((item) =>
        item.key === key ? ({ ...item, ...patch } as EditablePlacement) : item,
      ),
    );
    setSavedAt(null);
    setDirty(true);
    setErrorKey((prev) => (prev === key ? null : prev));
  }

  function handleDelete(key: string) {
    if (saving) return;
    setPlacements((prev) => prev.filter((item) => item.key !== key));
    setSelectedKey((prev) => (prev === key ? null : prev));
    setSavedAt(null);
    setDirty(true);
    setErrorKey((prev) => (prev === key ? null : prev));
  }

  /** 属性面板的「顺时针旋转 90°」，旋转后重新钳制在房间范围内 */
  function handleRotateSelected() {
    if (!selected || saving) return;
    const item = catalogById.get(selected.catalogId);
    if (!item) return;
    const rotationDeg = (normalizeRotation(selected.rotationDeg) + 90) % 360;
    const size = occupiedSize(item.widthCm, item.depthCm, rotationDeg);
    const maxX = Math.max(0, project.widthCm - size.widthCm);
    const maxY = Math.max(0, project.depthCm - size.depthCm);
    handleChange(selected.key, {
      rotationDeg,
      xCm: Math.min(selected.xCm, maxX),
      yCm: Math.min(selected.yCm, maxY),
    });
  }

  function handleColorChange(color: string | null) {
    if (!selected) return;
    handleChange(selected.key, { colorOverride: color });
  }

  function handleDeleteSelected() {
    if (!selected) return;
    handleDelete(selected.key);
  }

  /** 空状态的「添加家具」：加入素材库排在最前的一件 */
  function handleQuickAdd() {
    if (saving || catalog.length === 0) return;
    const first = [...catalog].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.id - b.id,
    )[0];
    if (first) addFromCatalog(first);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const catalogId = readCatalogDragId(event.dataTransfer);
    if (catalogId === null) return;
    const item = catalogById.get(catalogId);
    if (item) addFromCatalog(item);
  }

  /** 全量保存布局：PUT 当前 placements，成功后用服务端返回的最新记录替换本地状态 */
  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setErrorKey(null);

    const payload = {
      placements: placements.map((item) => ({
        catalogId: item.catalogId,
        xCm: item.xCm,
        yCm: item.yCm,
        rotationDeg: item.rotationDeg,
        colorOverride: item.colorOverride,
      })),
    };
    const selectedIndex = placements.findIndex((item) => item.key === selectedKey);

    try {
      const response = await fetch(apiPath(`/api/projects/${project.id}/placements`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
        const message = body?.error ?? "保存布局失败，请稍后重试";
        const index = typeof body?.index === "number" ? body.index : -1;
        setSaveError({ message, index });
        if (index >= 0 && index < placements.length) {
          setErrorKey(placements[index].key);
        }
        return;
      }

      const data = (await response.json()) as SavePlacementsResponse;
      const nextEditable = data.placements.map((record) => toEditable(record));
      setPlacements(nextEditable);
      if (selectedIndex >= 0 && selectedIndex < nextEditable.length) {
        setSelectedKey(nextEditable[selectedIndex].key);
      } else {
        setSelectedKey(null);
      }
      setSavedAt(data.updatedAt);
      setDirty(false);
    } catch {
      setSaveError({ message: "网络异常，保存布局失败，请检查连接后重试", index: -1 });
    } finally {
      setSaving(false);
    }
  }

  const isEmpty = placements.length === 0;
  const savedClock = savedAt ? formatClockTime(savedAt) : null;

  return (
    <div className="flex flex-col gap-6">
      {saveError ? (
        <div
          role="alert"
          className="rounded-lg border px-4 py-3"
          style={{ borderColor: "var(--danger)", backgroundColor: "var(--surface)" }}
        >
          <p style={{ margin: 0, color: "var(--danger)", fontSize: 15, lineHeight: 1.6 }}>
            ! {saveError.message}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
              重试
            </Button>
            {errorKey ? (
              <span style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
                已在画布中高亮出错的那件家具，修改后重试即可
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* 素材库：桌面左栏，移动端第三段 */}
        <aside className="order-3 w-full lg:order-1 lg:w-64 lg:shrink-0">
          <CatalogPanel catalog={catalog} onAdd={addFromCatalog} disabled={saving} />
        </aside>

        {/* 画布 + 保存条：桌面中栏，移动端第一段 */}
        <div className="order-1 w-full lg:order-2 lg:min-w-0 lg:flex-1">
          {isEmpty ? (
            <div className="mb-4">
              <EmptyState
                title="还没有家具"
                description="从素材库点击或拖拽家具到画布，确认布局后点击下方「保存布局」写入数据库。"
                action={
                  <Button onClick={handleQuickAdd} disabled={saving || catalog.length === 0}>
                    添加家具
                  </Button>
                }
              />
            </div>
          ) : null}

          <div onDragOver={handleDragOver} onDrop={handleDrop}>
            <FloorCanvas
              roomWidthCm={project.widthCm}
              roomDepthCm={project.depthCm}
              placements={placements}
              catalog={catalog}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onChange={handleChange}
              onDelete={handleDelete}
              errorKey={errorKey}
            />
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleSave} disabled={saving} size="md">
                {saving ? "保存中…" : "保存布局"}
              </Button>
              {savedClock && !saveError && !saving ? (
                <p
                  role="status"
                  aria-live="polite"
                  style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}
                >
                  已保存 · {savedClock}
                </p>
              ) : null}
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted-foreground)" }}>
              共 {placements.length} 件家具 · 修改后点击「保存布局」才会写入数据库，刷新页面按最后一次保存还原。
            </p>
          </div>
        </div>

        {/* 3D 预览 + 属性面板：桌面右栏，移动端第二、四段（contents 打散顺序） */}
        <div className="contents lg:order-3 lg:flex lg:w-80 lg:shrink-0 lg:flex-col lg:gap-6">
          <div className="order-2 w-full">
            <section aria-labelledby="preview-heading" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2
                  id="preview-heading"
                  className="text-[20px] font-semibold leading-tight text-foreground"
                >
                  等距 3D 预览
                </h2>
                <p className="text-[13px] text-muted-foreground">程序化绘制 · 无外部图片</p>
              </div>
              <div className="rounded-lg border border-border bg-surface p-4">
                <IsometricPreview
                  widthCm={project.widthCm}
                  depthCm={project.depthCm}
                  wallColor={project.wallColor}
                  floorStyle={project.floorStyle}
                  placements={placements}
                  catalog={catalog}
                />
              </div>
            </section>
          </div>

          <div className="order-4 w-full">
            <InspectorPanel
              project={project}
              selected={selected}
              catalog={catalog}
              onRotate={handleRotateSelected}
              onColorChange={handleColorChange}
              onDelete={handleDeleteSelected}
              disabled={saving}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudioClient;