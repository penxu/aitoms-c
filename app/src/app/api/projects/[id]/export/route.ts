import path from 'node:path';
import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries';
import { projectRoot } from '@/lib/workspace/paths';
import { createProjectArchive } from '@/lib/packages/archive';
import { releases } from '@/lib/releases/context';
export const runtime='nodejs';
export const maxDuration=120;
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params;const project=getProject(id);
 if(!project)return NextResponse.json({error:'项目不存在'},{status:404});
 const url=new URL(req.url);const kind=url.searchParams.get('kind')??'source';
 if(kind!=='source'&&kind!=='deploy')return NextResponse.json({error:'无效的下载类型'},{status:400});
 const releaseId=url.searchParams.get('releaseId')??undefined;
 const release=releaseId?releases.get(releaseId):undefined;
 if(releaseId&&(!release||release.projectId!==id))return NextResponse.json({error:'发布版本不存在'},{status:404});
 if(kind==='deploy'&&(!release||release.status!=='published'))return NextResponse.json({error:'请选择成功发布的固定版本'},{status:409});
 try {
  const archive=await createProjectArchive(release?path.join(release.artifactPath,'.source'):projectRoot(id),{projectId:id,kind,releaseId,verified:release?.status==='published',expectedHash:release?.sourceHash},req.signal);
  const filename=encodeURIComponent(`${project.name||id}-${kind}-${releaseId?.slice(-8)??'draft'}.zip`);
  return new Response(new Uint8Array(archive),{headers:{'content-type':'application/zip','content-disposition':`attachment; filename*=UTF-8''${filename}`,'content-length':String(archive.length),'cache-control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:500});}
}
