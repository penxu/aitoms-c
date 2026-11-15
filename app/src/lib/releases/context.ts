import { sqlite } from '@/lib/db';
import { ReleaseStore } from './store';
export const releases = new ReleaseStore(sqlite);
