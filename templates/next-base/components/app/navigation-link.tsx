"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";

function PendingStatus() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" aria-live="polite" className="ml-2 text-xs opacity-70">正在打开…</span> : null;
}

/** 必要跨页面导航的即时反馈；同页业务动作请使用按钮和本地状态。 */
export function NavigationLink({ children, ...props }: ComponentProps<typeof Link> & { children: ReactNode }) {
  return <Link {...props}>{children}<PendingStatus /></Link>;
}
