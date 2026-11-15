import { publicRelease } from '@/lib/releases/types';
import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries';
import { releases } from '@/lib/releases/context';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string;releaseId:string}>}) {
 const {id,releaseId}=await params;const release=releases.get(releaseId);
 if(!getProject(id)||!release||release.projectId!==id)return NextResponse.json({error:'发布版本不存在'},{status:404});
 const visibleRelease=publicRelease(release);
 const after=Number(new URL(req.url).searchParams.get('after')??0);
 return NextResponse.json({release:visibleRelease,events:releases.events(releaseId,Number.isSafeInteger(after)&&after>=0?after:0)},{headers:{'cache-control':'no-store'}});
}
