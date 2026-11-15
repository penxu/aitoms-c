import type { Metadata } from "next";
import { ResourcesPage } from "@/components/resources/resources-page";

export const metadata: Metadata = {
  title: "资源 · Atoms",
};

export default function Page() {
  return <ResourcesPage />;
}
