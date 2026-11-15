export const RELEASE_STAGES = ['queued','snapshotting','installing','building','starting','checking','published','failed','interrupted'] as const;
export type ReleaseStatus = typeof RELEASE_STAGES[number];
export interface Release {
 id:string; projectId:string; sourceHash:string; status:ReleaseStatus;
 artifactPath:string; createdAt:number; finishedAt:number|null; error:string|null;
}
export interface ReleaseEvent {id:number;releaseId:string;message:string;createdAt:number}

export function publicRelease(release:Release):Omit<Release,'artifactPath'> {
 const {id,projectId,sourceHash,status,createdAt,finishedAt,error}=release;
 return {id,projectId,sourceHash,status,createdAt,finishedAt,error};
}
