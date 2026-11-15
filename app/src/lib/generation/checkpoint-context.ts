import{sqlite}from'@/lib/db';import{FileCheckpoints}from'./file-checkpoints';
let store:FileCheckpoints|undefined;
export function fileCheckpoints():FileCheckpoints{return store??=new FileCheckpoints(sqlite)}
