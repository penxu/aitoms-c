import { RoomApplication } from "@/components/room/room-application";
import { getCatalogStats, getRecentProjects, countProjects } from "@/lib/room/queries";
export const dynamic = "force-dynamic";
export default function Page() {
  try { return <RoomApplication initialTotal={countProjects()} initialProjects={getRecentProjects(3)} stats={getCatalogStats()} />; }
  catch { return <RoomApplication initialProjects={[]} stats={{total:0,categories:[]}} initialError="读取项目失败，请重试。" />; }
}
