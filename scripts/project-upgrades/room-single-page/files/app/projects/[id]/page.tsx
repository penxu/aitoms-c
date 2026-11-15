import { RoomApplication } from "@/components/room/room-application";
import { getCatalogStats, getRecentProjects, countProjects } from "@/lib/room/queries";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{id:string}> }) {
 const {id}=await params;const initialPath=`/projects/${id}`;
 try {return <RoomApplication initialTotal={countProjects()} initialProjects={getRecentProjects(3)} stats={getCatalogStats()} initialPath={initialPath} />;}
 catch {return <RoomApplication initialProjects={[]} stats={{total:0,categories:[]}} initialPath={initialPath} initialError="读取项目失败，请重试。" />;}
}
