import type {Release} from './types.ts';
/** Input is newest first. Never remove the active release or a queued job's source. */
export function retentionCandidates(history:Release[],activeId:string|undefined,inFlight:Set<string>):Release[] {
 return history.filter(r=>r.status==='published').slice(5).filter(r=>r.id!==activeId&&!inFlight.has(r.id));
}
