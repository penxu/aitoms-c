"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { FormField } from "@/components/app/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiPath } from "@/lib/api-path";
import {
  DEFAULT_FLOOR_STYLE,
  DEFAULT_ROOM_SETTINGS,
  DEFAULT_WALL_COLOR,
  FLOOR_STYLE_OPTIONS,
  PROJECT_NAME_MAX_LENGTH,
  ROOM_DIMENSION_MAX_CM,
  ROOM_DIMENSION_MIN_CM,
  ROOM_TYPES,
  WALL_COLOR_OPTIONS,
  validateProjectInput,
} from "@/lib/room/constants";
import type { ApiErrorBody } from "@/lib/room/constants";
import type { CreateProjectResponse, FieldErrors } from "@/lib/room/types";

const CONTROL_CLASS =
  "h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50";

export function ProjectForm({ onCreated, onCancel }: { onCreated?: (id: number) => void; onCancel?: () => void } = {}) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState<string>(DEFAULT_ROOM_SETTINGS.roomType);
  const [widthCm, setWidthCm] = useState<string>(String(DEFAULT_ROOM_SETTINGS.widthCm));
  const [depthCm, setDepthCm] = useState<string>(String(DEFAULT_ROOM_SETTINGS.depthCm));
  const [wallColor, setWallColor] = useState<string>(DEFAULT_WALL_COLOR);
  const [floorStyle, setFloorStyle] = useState<string>(DEFAULT_FLOOR_STYLE);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next: FieldErrors = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function submitProject() {
    if (submitting) return;
    setSubmitError(null);

    const local = validateProjectInput({ name, roomType, widthCm, depthCm, wallColor, floorStyle });
    if (!local.ok) {
      setFieldErrors(local.fieldErrors);
      setSubmitError("请检查标记错误的字段后重新提交");
      return;
    }

    setFieldErrors({});
    setSubmitting(true);

    try {
      const response = await fetch(apiPath("/api/projects"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(local.value),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const body = (data ?? {}) as Partial<ApiErrorBody>;
        if (body.fieldErrors && typeof body.fieldErrors === "object") {
          setFieldErrors(body.fieldErrors);
        }
        setSubmitError(
          typeof body.error === "string" && body.error.length > 0
            ? body.error
            : "创建项目失败，请稍后重试",
        );
        return;
      }

      const created = data as Partial<CreateProjectResponse> | null;
      if (!created || typeof created.id !== "number") {
        setSubmitError("服务端返回的项目编号缺失，请重试");
        return;
      }

      if (onCreated) onCreated(created.id);
      else router.push(`/projects/${created.id}`);
    } catch {
      setSubmitError("网络请求失败，请确认服务已启动后重试（已填写的内容会保留）");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitProject();
  }

  return (
    <Card>
      <CardContent className="grid gap-6 p-6">
        {submitError && (
          <div
            role="alert"
            className="rounded-lg border border-border bg-muted p-4 text-sm text-danger"
          >
            <p className="font-medium">! {submitError}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void submitProject()}
              disabled={submitting}
            >
              重试
            </Button>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} aria-busy={submitting} className="grid gap-6">
          <FormField id="project-name" label="项目名称" hint="例如：主卧改造" error={fieldErrors.name} required>
            <Input
              value={name}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setName(event.target.value);
                clearFieldError("name");
              }}
              placeholder="给这个房间项目起个名字"
              maxLength={PROJECT_NAME_MAX_LENGTH}
              autoComplete="off"
            />
          </FormField>

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField id="project-room-type" label="房间类型" error={fieldErrors.roomType} required>
              <select
                className={CONTROL_CLASS}
                value={roomType}
                onChange={(event) => {
                  setRoomType(event.target.value);
                  clearFieldError("roomType");
                }}
              >
                {ROOM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                id="project-width"
                label="房间宽度"
                hint={`单位：厘米，${ROOM_DIMENSION_MIN_CM}–${ROOM_DIMENSION_MAX_CM}`}
                error={fieldErrors.widthCm}
                required
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={ROOM_DIMENSION_MIN_CM}
                  max={ROOM_DIMENSION_MAX_CM}
                  step={1}
                  value={widthCm}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setWidthCm(event.target.value);
                    clearFieldError("widthCm");
                  }}
                />
              </FormField>

              <FormField
                id="project-depth"
                label="房间进深"
                hint={`单位：厘米，${ROOM_DIMENSION_MIN_CM}–${ROOM_DIMENSION_MAX_CM}`}
                error={fieldErrors.depthCm}
                required
              >
                <Input
                  type="number"
                  inputMode="numeric"
                  min={ROOM_DIMENSION_MIN_CM}
                  max={ROOM_DIMENSION_MAX_CM}
                  step={1}
                  value={depthCm}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    setDepthCm(event.target.value);
                    clearFieldError("depthCm");
                  }}
                />
              </FormField>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              id="project-wall-color"
              label="墙面颜色"
              hint="从预设 6 色中选择，3D 预览会同步应用"
              error={fieldErrors.wallColor}
              required
            >
              <select
                className={CONTROL_CLASS}
                value={wallColor}
                onChange={(event) => {
                  setWallColor(event.target.value);
                  clearFieldError("wallColor");
                }}
              >
                {WALL_COLOR_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}（{option.value}）
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              id="project-floor-style"
              label="地面材质"
              hint="木地板 / 瓷砖 / 地毯"
              error={fieldErrors.floorStyle}
              required
            >
              <select
                className={CONTROL_CLASS}
                value={floorStyle}
                onChange={(event) => {
                  setFloorStyle(event.target.value);
                  clearFieldError("floorStyle");
                }}
              >
                {FLOOR_STYLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Button type="submit" size="md" disabled={submitting}>
              {submitting ? "保存中…" : "创建项目并进入工作台"}
            </Button>
            {onCancel ? <Button type="button" variant="outline" onClick={onCancel}>暂时收起</Button> : <Link href="/projects" className={buttonVariants({ variant: "outline", size: "md" })}>返回项目列表</Link>}
            {submitting && (
              <span role="status" className="text-[13px] text-muted-foreground">
                正在创建项目，请稍候…
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default ProjectForm;