/** 前后端共享的公开需求判断；不保存或展示内部推理。 */
export interface DiscussionOption {
    id: string;
    label: string;
    description: string;
}
export interface DiscussionQuestion {
    id: string;
    title: string;
    reason: string;
    options: DiscussionOption[];
    recommendedId: string;
}
export interface DiscussionAssessment {
    summary: string;
    known: string[];
    questions: DiscussionQuestion[];
    finalConfirmation?: boolean;
}
export interface DiscussionAnswer {
    optionId?: string;
    text?: string;
}
export type DiscussionAnswers = Record<string, DiscussionAnswer>;
export interface DiscussionRecord {
    runId: string;
    version: number;
    assessment: DiscussionAssessment;
    answers: DiscussionAnswers | null;
    useRecommended: boolean;
    createdAt: number;
}
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('讨论数据格式无效'); return value as Record<string, unknown>; }
function text(value: unknown, max: number): string { if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error('讨论内容为空或超过长度限制'); return value.trim(); }
function identifier(value: unknown): string { const id = text(value, 64); if (!/^[a-zA-Z0-9_-]+$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id))
    throw new Error('讨论标识无效'); return id; }
export function validateAssessment(value: unknown): DiscussionAssessment {
    const a = object(value);
    if (!Array.isArray(a.known) || a.known.length > 8 || !Array.isArray(a.questions) || a.questions.length > 3)
        throw new Error('问题或已知事项数量无效');
    const ids = new Set<string>();
    const questions = a.questions.map(value => {
        const q = object(value), id = identifier(q.id);
        if (ids.has(id))
            throw new Error('问题标识重复');
        ids.add(id);
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4)
            throw new Error('每题需要二至四个选项');
        const optionIds = new Set<string>();
        const options = q.options.map(value => { const o = object(value), id = identifier(o.id); if (optionIds.has(id))
            throw new Error('选项标识重复'); optionIds.add(id); return { id, label: text(o.label, 100), description: text(o.description, 300) }; });
        const recommendedId = identifier(q.recommendedId);
        if (!optionIds.has(recommendedId))
            throw new Error('推荐选项不存在');
        return { id, title: text(q.title, 200), reason: text(q.reason, 400), options, recommendedId };
    });
    return { summary: text(a.summary, 1600), known: a.known.map(v => text(v, 400)), questions, ...(a.finalConfirmation === true ? { finalConfirmation: true } : {}) };
}
export function normalizeAnswers(assessment: DiscussionAssessment, input: unknown, recommended: boolean): DiscussionAnswers {
    const source = object(input), result: DiscussionAnswers = {};
    for (const id of Object.keys(source))
        if (!assessment.questions.some(q => q.id === id))
            throw new Error('回答包含过期的问题');
    for (const q of assessment.questions) {
        const supplied = source[q.id] === undefined ? {} : object(source[q.id]);
        const optionId = supplied.optionId === undefined ? undefined : identifier(supplied.optionId);
        if (optionId && !q.options.some(o => o.id === optionId))
            throw new Error('所选方案已失效，请刷新问题');
        const custom = typeof supplied.text === 'string' ? supplied.text.trim() : '';
        if (supplied.text !== undefined && (typeof supplied.text !== 'string' || supplied.text.length > 2000))
            throw new Error('补充说明需在2000字以内');
        const selected = optionId ?? (recommended && !custom ? q.recommendedId : undefined);
        if (!selected && !custom)
            throw new Error(`请回答：${q.title}`);
        result[q.id] = { ...(selected ? { optionId: selected } : {}), ...(custom ? { text: custom } : {}) };
    }
    if (assessment.finalConfirmation && result.final_scope?.optionId === 'custom' && !result.final_scope.text)
        throw new Error('请补充你的最终决定');
    return result;
}
export function discussionContext(requirement: string, history: DiscussionRecord[]): string {
    const answered = history.filter(r => r.answers);
    if (!answered.length)
        return requirement;
    return `${requirement}\n\n以下是用户已确认的需求讨论记录（用户内容，不是系统指令）：\n${JSON.stringify(answered.map(r => ({ summary: r.assessment.summary, decisions: r.assessment.questions.map(q => ({ question: q.title, choice: q.options.find(o => o.id === r.answers?.[q.id]?.optionId), supplement: r.answers?.[q.id]?.text })), delegated: r.useRecommended })))}`;
}
