import { generateText } from 'ai';
import { getModel } from '@/lib/ai/model';
import { config } from '@/lib/config';
import { sqlite } from '@/lib/db';
import { addRunTokens } from '@/lib/db/generation';
import { DiscussionStore } from './discussion-store';
import { discussionContext, validateAssessment } from './discussion-schema';
import type { DiscussionAssessment } from './discussion-schema';
import type { StageContext, StageResult } from './types';
let store: DiscussionStore | undefined;
export function discussionStore(): DiscussionStore { return store ??= new DiscussionStore(sqlite); }
export function confirmedRequirement(runId: string, requirement: string): string { return discussionContext(requirement, discussionStore().history(runId)); }
const SYSTEM = `你是应用设计伙伴。在实施前认真评估需求的可执行性。只返回JSON，不要输出内部推理链。公开summary应简明说明你理解的目标和有必要确认的关键歧义。
只有目标用户、管理对象、核心业务流程、权限/交易/外部依赖等存在会改变应用用途的重大歧义才提问。不要因一句话短就提问。明确的备忘录、小游戏、作品集等可直接实施；颜色、字体、布局偏好和可逆细节采用合理默认值，绝不例行追问。不得重问用户已回答的内容。用户明确授权你决定的事项使用合理方案。
格式：{"summary":"公开需求理解和判断摘要","known":["已明确的事项"],"questions":[{"id":"稳定英文标识","title":"具体问题","reason":"为什么影响核心方案，以及为何推荐该项","options":[{"id":"a","label":"短选项名","description":"适用情况与取舍"},{"id":"b","label":"另一选项","description":"适用情况与取舍"}],"recommendedId":"a"}]}。
信息充分时questions必须是[]；需要澄清时每轮1至3题，每题2至4个互斥的实质性方案，推荐必须指向存在的选项，known最多8项。问题用中文。不要虚构用户已经确认的决定。`;
export async function runDiscussionStage(ctx: StageContext): Promise<StageResult> {
    const history = discussionStore().history(ctx.runId);
    const last = history.at(-1);
    if (last?.answers) {
        const decisions = last.assessment.questions.map(q => { const a = last.answers![q.id]; const option = q.options.find(o => o.id === a.optionId); return `${q.title}：${[option?.label, a.text].filter(Boolean).join("；")}`; });
        ctx.emit({ type: "assessment", summary: "已记录你的选择，将以此作为应用设计依据。", known: decisions });
    }
    if (last?.answers && (last.useRecommended || last.assessment.finalConfirmation)) {
        ctx.log('info', '已记录你确认的方案，将按这些决定继续生成');
        return { ok: true };
    }
    if (last && !last.answers)
        return { ok: true, waiting: true };
    ctx.log('info', history.length ? '正在核对补充内容与已确认的方案' : '正在分析应用目标、使用者与核心流程');
    const response = await generateText({ model: getModel('spec'), system: SYSTEM, prompt: ctx.requirement, temperature: 0.2, abortSignal: ctx.signal, timeout: { totalMs: config.generationModelTimeoutMs, firstChunkMs: config.modelFirstChunkTimeoutMs, chunkMs: config.modelChunkTimeoutMs } });
    ctx.signal.throwIfAborted();
    addRunTokens(ctx.runId, { input: response.usage.inputTokens, output: response.usage.outputTokens });
    let assessment: DiscussionAssessment;
    try {
        assessment = validateAssessment(JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')));
    }
    catch {
        throw new Error('需求分析返回格式无效，请从需求讨论阶段重试；尚未编写代码');
    }
    delete assessment.finalConfirmation;
    ctx.emit({ type: 'assessment', summary: assessment.summary, known: assessment.known });
    if (!assessment.questions.length) {
        ctx.log('info', '需求已具备实施条件，继续生成应用');
        return { ok: true };
    }
    if (history.length >= 2) {
        const assumptions = assessment.questions.map(q => `${q.title}：${q.options.find(o => o.id === q.recommendedId)!.label}`).join('；');
        assessment = { summary: `${assessment.summary.slice(0, 500)}\n建议采用以下明确假设：${assumptions}`, known: assessment.known, finalConfirmation: true, questions: [{ id: 'final_scope', title: '仍有关键决定需要确认，接下来采用哪种方式？', reason: "以上建议会决定应用的业务范围，只有你确认后才会实施；也可以直接填写你的最终决定。", options: [{ id: 'accept', label: '按上述建议实施', description: '接受已展示的假设，继续生成应用' }, { id: 'custom', label: '按我的补充实施', description: '请在下方写清你的最终决定，再确认继续' }], recommendedId: 'accept' }] };
    }
    const pending = discussionStore().pause(ctx.runId, assessment);
    ctx.emit({ type: 'discussion', discussion: pending });
    return { ok: true, waiting: true };
}
