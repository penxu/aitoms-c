import { publicRelease } from '@/lib/releases/types';
import { NextResponse } from 'next/server';
import { getProject } from '@/lib/db/queries';
import { beginRelease,releaseOverview } from '@/lib/releases/pipeline';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 if(!getProject(id))return NextResponse.json({error:'项目不存在'},{status:404});
 return NextResponse.json(releaseOverview(id),{headers:{'cache-control':'no-store'}});
}
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}) {
 const {id}=await params;
 if(!getProject(id))return NextResponse.json({error:'项目不存在'},{status:404});
 try {const release=publicRelease(beginRelease(id));return NextResponse.json({release},{status:202});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:String(error)},{status:409});}
}
