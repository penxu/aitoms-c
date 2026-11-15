import { publicRelease } from '@/lib/releases/types';
import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries';
import { beginRelease,releases } from '@/lib/releases/pipeline';
export const runtime='nodejs';
export async function POST(_req:Request,{params}:{params:Promise<{id:string;releaseId:string}>}) {
 const {id,releaseId}=await params;const target=releases.get(releaseId);
 if(!getProject(id)||!target||target.projectId!==id)return NextResponse.json({error:'发布版本不存在'},{status:404});
 try {const release=publicRelease(beginRelease(id,releaseId));return NextResponse.json({release},{status:202});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:409});}
}
