import type Database from 'better-sqlite3';
import { normalizeAnswers, validateAssessment } from './discussion-schema.ts';
import type { DiscussionAnswers, DiscussionAssessment, DiscussionRecord } from './discussion-schema.ts';
interface Row {
    run_id: string;
    version: number;
    assessment_json: string;
    answers_json: string | null;
    use_recommended: number;
    created_at: number;
}
function decode(r: Row): DiscussionRecord { return { runId: r.run_id, version: r.version, assessment: JSON.parse(r.assessment_json), answers: r.answers_json ? JSON.parse(r.answers_json) : null, useRecommended: r.use_recommended === 1, createdAt: r.created_at }; }
export class DiscussionStore {
    private db: Database.Database;
    constructor(db: Database.Database) { this.db = db; db.exec(`CREATE TABLE IF NOT EXISTS generation_discussions(run_id TEXT NOT NULL,version INTEGER NOT NULL,assessment_json TEXT NOT NULL,answers_json TEXT,use_recommended INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,PRIMARY KEY(run_id,version)); CREATE UNIQUE INDEX IF NOT EXISTS idx_runs_unfinished ON generation_runs(project_id) WHERE status IN ('running','waiting');`); }
    history(runId: string): DiscussionRecord[] { return (this.db.prepare('SELECT * FROM generation_discussions WHERE run_id=? ORDER BY version').all(runId) as Row[]).map(decode); }
    copyAnswers(fromRunId: string, toRunId: string): void {
        this.db.prepare('INSERT INTO generation_discussions(run_id,version,assessment_json,answers_json,use_recommended,created_at) SELECT ?,version,assessment_json,answers_json,use_recommended,created_at FROM generation_discussions WHERE run_id=? AND answers_json IS NOT NULL').run(toRunId, fromRunId);
    }
    pending(runId: string): DiscussionRecord | null { return this.history(runId).find(r => !r.answers) ?? null; }
    pause(runId: string, input: DiscussionAssessment): DiscussionRecord {
        const assessment = validateAssessment(input);
        if (!assessment.questions.length)
            throw new Error('没有需要回答的问题');
        return this.db.transaction(() => {
            const row = this.db.prepare('SELECT status FROM generation_runs WHERE id=?').get(runId) as {
                status: string;
            } | undefined;
            if (row?.status !== 'running')
                throw new Error('当前任务已结束，无法发起讨论');
            const existing = this.pending(runId);
            if (existing)
                return existing;
            const version = this.history(runId).length + 1;
            this.db.prepare('INSERT INTO generation_discussions(run_id,version,assessment_json,created_at) VALUES(?,?,?,?)').run(runId, version, JSON.stringify(assessment), Date.now());
            this.db.prepare("UPDATE generation_runs SET status='waiting',finished_at=NULL WHERE id=? AND status='running'").run(runId);
            return this.pending(runId)!;
        })();
    }
    answer(runId: string, version: number, input: unknown, recommended: boolean): {
        reused: boolean;
        answers: DiscussionAnswers;
    } {
        return this.db.transaction(() => {
            const row = this.db.prepare('SELECT status FROM generation_runs WHERE id=?').get(runId) as {
                status: string;
            } | undefined;
            if (!row || !['waiting', 'running'].includes(row.status))
                throw new Error('任务已结束，回答未提交');
            const history = this.history(runId), current = history.at(-1);
            if (!current || current.version !== version)
                throw new Error('问题已更新，请查看最新问题');
            const answers = normalizeAnswers(current.assessment, input, recommended);
            if (current.answers) {
                if (JSON.stringify(current.answers) === JSON.stringify(answers) && current.useRecommended === recommended)
                    return { reused: true, answers };
                throw new Error('这组问题已提交了其他回答，请查看最新状态');
            }
            if (row.status !== 'waiting')
                throw new Error('任务状态已改变，请刷新');
            this.db.prepare('UPDATE generation_discussions SET answers_json=?,use_recommended=? WHERE run_id=? AND version=? AND answers_json IS NULL').run(JSON.stringify(answers), recommended ? 1 : 0, runId, version);
            this.db.prepare("UPDATE generation_runs SET status='running',finished_at=NULL,error=NULL WHERE id=? AND status='waiting'").run(runId);
            return { reused: false, answers };
        })();
    }
}
