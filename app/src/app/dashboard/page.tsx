import type { Metadata } from "next";
import { DashboardPage } from "@/components/dashboard/dashboard-page";

export const metadata: Metadata = {
  title: "工作台 · Atoms",
  description: "描述你的想法，Atoms 的 AI 团队会先给出方案，再构建可运行的应用。",
};

export default function Page() {
  return <DashboardPage />;
}
