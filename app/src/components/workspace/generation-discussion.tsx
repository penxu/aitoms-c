"use client";
import "./generation-discussion.css";
import { useRef, useState } from 'react';
import { ArrowRight, Check, MessageCircle, Sparkles } from 'lucide-react';
import type { DiscussionAnswers, DiscussionRecord } from '@/lib/generation/discussion-schema';
import { normalizeAnswers } from '@/lib/generation/discussion-schema';
export function GenerationDiscussion({ discussion, onAnswer, onCancel }: {
    discussion: DiscussionRecord;
    onAnswer: (answers: DiscussionAnswers, recommended: boolean) => Promise<void>;
    onCancel?: () => void;
}) {
    const [answers, setAnswers] = useState<DiscussionAnswers>({});
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const submitting = useRef(false);
    async function submit(recommended: boolean) {
        if (submitting.current)
            return;
        try {
            const normalized = normalizeAnswers(discussion.assessment, answers, recommended);
            if (discussion.assessment.finalConfirmation && normalized.final_scope?.optionId === 'custom' && !normalized.final_scope.text)
                throw new Error('请写下你的最终决定，再确认继续');
            submitting.current = true;
            setBusy(true);
            setError('');
            await onAnswer(normalized, recommended);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : '提交失败，请重试');
        }
        finally {
            submitting.current = false;
            setBusy(false);
        }
    }
    return <section className="discussion-card" aria-label="应用设计讨论" aria-busy={busy}>
  <header className="discussion-header"><span className="discussion-mark"><MessageCircle size={20}/></span><div><span className="discussion-eyebrow">DESIGN TOGETHER · {discussion.assessment.finalConfirmation ? '最终方案确认' : `第 ${discussion.version} 轮讨论`}</span><h2>先聊清楚，再开始创造。</h2></div><span className="discussion-status">等待你的选择</span></header>
  <p className="discussion-understanding">{discussion.assessment.summary}</p>
  {discussion.assessment.known.length > 0 && <div className="discussion-known"><strong>已经明确</strong>{discussion.assessment.known.map((item, i) => <p key={i}><Check size={13}/>{item}</p>)}</div>}
  <form onSubmit={e => { e.preventDefault(); void submit(false); }}>
   {discussion.assessment.questions.map((q, i) => <fieldset key={q.id} disabled={busy} className="discussion-question"><legend><span>{String(i + 1).padStart(2, '0')}</span>{q.title}</legend><p className="discussion-reason">{q.reason}</p><div className="discussion-options">{q.options.map(o => <label key={o.id} className="discussion-option" data-selected={answers[q.id]?.optionId === o.id}><input type="radio" name={`${discussion.runId}-${discussion.version}-${q.id}`} value={o.id} checked={answers[q.id]?.optionId === o.id} onChange={() => setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], optionId: o.id } }))}/><span><strong>{o.label}{o.id === q.recommendedId && <em>推荐</em>}</strong><small>{o.description}</small></span></label>)}</div><label className="discussion-custom">{answers[q.id]?.optionId ? '补充你的想法（可选）' : '也可以直接告诉我你的想法'}<textarea maxLength={2000} rows={2} value={answers[q.id]?.text ?? ''} placeholder="这些选项不适合？写下你的需求，也可以补充限制或偏好…" onChange={e => setAnswers(a => ({ ...a, [q.id]: { ...a[q.id], text: e.target.value } }))}/></label></fieldset>)}
   {error && <p role="alert" className="feedback-error">{error}</p>}
   <div className="discussion-actions"><button type="submit" disabled={busy} className="action-primary">{busy ? '正在提交…' : '确认选择并继续'}<ArrowRight size={15}/></button><button type="button" disabled={busy} onClick={() => void submit(true)} className="action-secondary"><Sparkles size={14}/>采用推荐方案继续</button>{onCancel && <button type="button" disabled={busy} onClick={onCancel} className="discussion-cancel">取消任务</button>}</div>
  </form><footer>只确认影响应用方向的决定。你的回答会用于页面规划与代码实现。</footer>
 </section>;
}
