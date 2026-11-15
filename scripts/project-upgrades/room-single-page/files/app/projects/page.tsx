import { RoomApplication } from "@/components/room/room-application";
import { getCatalogStats, getRecentProjects, countProjects } from "@/lib/room/queries";
export const dynamic = "force-dynamic";
export default function Page() {
 const initialPath='/projects';
 try {return <RoomApplication initialTotal={countProjects()} initialProjects={getRecentProjects(3)} stats={getCatalogStats()} initialPath={initialPath} />;}
 catch {return <RoomApplication initialProjects={[]} stats={{total:0,categories:[]}} initialPath={initialPath} initialError="读取项目失败，请重试。" />;}
}
