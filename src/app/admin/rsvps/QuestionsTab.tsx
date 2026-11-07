'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AutosaveHeader, useAutosave } from '@/components/admin/useAutosave';
import QuestionField from '@/components/rsvp/QuestionField';
import { toCsv } from '@/lib/mailing';
import {
    MAX_OPTIONS, MAX_QUESTIONS, QUESTION_TEMPLATES, QUESTION_TYPES, askedQuestions, formatAnswer, newId, tallyQuestion,
    type AnswerValue, type Answers, type QuestionType, type Respondent, type RsvpQuestion,
} from '@/lib/rsvpQuestions';

/** What this tab needs of an RSVP row. */
export interface QuestionsRsvp {
    guest_name: string;
    attending: boolean | null;
    dietary_restrictions: unknown;
    answers?: Answers | null;
}

/**
 * Admin → RSVPs → Questions: the couple's own RSVP questions, each with how it
 * has been answered so far, beside a live preview of the form.
 */
export default function QuestionsTab({ rsvps }: { rsvps: QuestionsRsvp[] }) {
    const [questions, setQuestions] = useState<RsvpQuestion[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const [picking, setPicking] = useState(false);

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => setQuestions(Array.isArray(data.rsvpQuestions) ? data.rsvpQuestions : []))
            .finally(() => setLoaded(true));
    }, []);

    const save = useCallback(async (value: RsvpQuestion[]) => {
        const res = await fetch('/api/admin/site-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rsvpQuestions: value }),
        });
        if (!res.ok) throw new Error(String(res.status));
    }, []);
    const { state, retry } = useAutosave({ value: questions, ready: loaded, save });

    // Who each question has been asked of: every attending person for a
    // per-person question, every household that answered for a household one.
    const { people, households } = useMemo(() => {
        const people: Respondent[] = [];
        const households: (Respondent & { attending: boolean })[] = [];
        for (const r of rsvps) {
            if (r.attending === null) continue;
            households.push({ name: r.guest_name, household: r.guest_name, answers: r.answers ?? {}, attending: !!r.attending });
            if (!r.attending || !Array.isArray(r.dietary_restrictions)) continue;
            for (const d of r.dietary_restrictions as { name?: string; answers?: Answers }[]) {
                people.push({ name: d?.name || r.guest_name, household: r.guest_name, answers: d?.answers ?? {} });
            }
        }
        return { people, households };
    }, [rsvps]);

    const respondentsFor = (q: RsvpQuestion): Respondent[] => q.scope === 'person'
        ? people
        : households.filter(h => h.attending || q.onlyIfAttending === false);

    const update = (id: string, patch: Partial<RsvpQuestion>) =>
        setQuestions(prev => prev.map(q => {
            if (q.id === id) return { ...q, ...patch };
            // Only one question can be the meal.
            if (patch.meal) return { ...q, meal: false };
            return q;
        }));
    const move = (id: string, by: -1 | 1) => setQuestions(prev => {
        const i = prev.findIndex(q => q.id === id);
        const j = i + by;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
    });
    const remove = (q: RsvpQuestion) => {
        const answered = tallyQuestion(q, respondentsFor(q)).answered;
        const warning = answered > 0
            ? `Delete “${q.label || 'this question'}”? ${answered} ${answered === 1 ? 'answer' : 'answers'} will no longer be shown. (Hiding it keeps them.)`
            : `Delete “${q.label || 'this question'}”?`;
        if (!confirm(warning)) return;
        setQuestions(prev => prev.filter(x => x.id !== q.id));
    };
    const add = (make: () => RsvpQuestion) => {
        const q = make();
        setQuestions(prev => [...prev.map(x => (q.meal ? { ...x, meal: false } : x)), q]);
        setOpenId(q.id);
        setPicking(false);
    };

    const hasMeal = questions.some(q => q.meal);

    // Every answer as a spreadsheet: one row per guest who is coming, with their
    // household's answers repeated beside them so the sheet sorts and filters.
    const exportCsv = () => {
        const personQs = questions.filter(q => q.scope === 'person');
        const householdQs = questions.filter(q => q.scope === 'household');
        const byHousehold = new Map(households.map(h => [h.household, h.answers ?? {}]));
        const rows = people.map(p => [
            p.household,
            p.name,
            ...personQs.map(q => formatAnswer(q, p.answers?.[q.id])),
            ...householdQs.map(q => formatAnswer(q, byHousehold.get(p.household)?.[q.id])),
        ]);
        const csv = toCsv(['Household', 'Guest', ...personQs.map(q => q.label), ...householdQs.map(q => q.label)], rows);
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `rsvp-answers-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            <AutosaveHeader
                title="RSVP questions"
                subtitle="Ask your guests anything — an entrée, a song request, who needs the shuttle. Changes save themselves."
                state={state}
                onRetry={retry}
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                {/* ── The questions ── */}
                <div className="min-w-0 space-y-3">
                    {questions.length > 0 && people.length > 0 && (
                        <div className="flex justify-end">
                            <button type="button" onClick={exportCsv}
                                className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                                Export answers (CSV)
                            </button>
                        </div>
                    )}
                    {loaded && questions.length === 0 && !picking && (
                        <div className="rounded-3xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
                            <p className="font-serif text-xl text-gray-900">No questions yet</p>
                            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">
                                Your RSVP already asks who’s coming and what they can’t eat. Add anything else you’d like to know.
                            </p>
                            <button type="button" onClick={() => setPicking(true)}
                                className="mt-4 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-accent-dark">
                                Add your first question
                            </button>
                        </div>
                    )}

                    {questions.map((q, index) => (
                        <QuestionCard
                            key={q.id}
                            question={q}
                            index={index}
                            count={questions.length}
                            open={openId === q.id}
                            mealTakenElsewhere={hasMeal && !q.meal}
                            respondents={respondentsFor(q)}
                            onToggle={() => setOpenId(openId === q.id ? null : q.id)}
                            onChange={patch => update(q.id, patch)}
                            onMove={by => move(q.id, by)}
                            onRemove={() => remove(q)}
                        />
                    ))}

                    {picking ? (
                        <TemplatePicker hasMeal={hasMeal} onPick={add} onClose={() => setPicking(false)} />
                    ) : questions.length > 0 && questions.length < MAX_QUESTIONS && (
                        <button type="button" onClick={() => setPicking(true)}
                            className="flex w-full items-center justify-center gap-2 rounded-3xl border border-dashed border-gray-300 bg-white/60 py-4 text-sm font-medium text-gray-600 transition-colors hover:border-accent hover:text-accent-dark">
                            <span aria-hidden className="text-lg leading-none">+</span> Add a question
                        </button>
                    )}
                </div>

                {/* ── What guests see ── */}
                <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
                    <Preview questions={questions} />
                </aside>
            </div>
        </div>
    );
}

/* ── One question: its summary, its editor and its answers ─────────────── */

function QuestionCard({
    question: q, index, count, open, mealTakenElsewhere, respondents, onToggle, onChange, onMove, onRemove,
}: {
    question: RsvpQuestion;
    index: number;
    count: number;
    open: boolean;
    mealTakenElsewhere: boolean;
    respondents: Respondent[];
    onToggle: () => void;
    onChange: (patch: Partial<RsvpQuestion>) => void;
    onMove: (by: -1 | 1) => void;
    onRemove: () => void;
}) {
    const tally = tallyQuestion(q, respondents);
    const typeLabel = QUESTION_TYPES.find(t => t.type === q.type)?.label ?? q.type;
    const hasOptions = q.type === 'choice' || q.type === 'multi';

    const setType = (type: QuestionType) => {
        const patch: Partial<RsvpQuestion> = { type };
        if ((type === 'choice' || type === 'multi') && !(q.options ?? []).length) {
            patch.options = [{ id: newId('o'), label: '' }, { id: newId('o'), label: '' }];
        }
        if (type !== 'choice') patch.meal = false;
        onChange(patch);
    };
    const setOption = (id: string, patch: { label?: string; description?: string }) =>
        onChange({ options: (q.options ?? []).map(o => (o.id === id ? { ...o, ...patch } : o)) });
    const removeOption = (id: string) => {
        const used = tally.options.find(o => o.id === id)?.count ?? 0;
        if (used > 0 && !confirm(`${used} ${used === 1 ? 'guest has' : 'guests have'} chosen this. Remove it anyway?`)) return;
        onChange({ options: (q.options ?? []).filter(o => o.id !== id) });
    };
    const moveOption = (i: number, by: -1 | 1) => {
        const opts = [...(q.options ?? [])];
        const j = i + by;
        if (j < 0 || j >= opts.length) return;
        [opts[i], opts[j]] = [opts[j], opts[i]];
        onChange({ options: opts });
    };

    return (
        <div className={`overflow-hidden rounded-3xl border bg-white transition-shadow ${open ? 'border-gray-300 shadow-lg' : 'border-gray-200 shadow-sm hover:shadow-md'}`}>
            {/* Summary row */}
            <button type="button" onClick={onToggle} aria-expanded={open}
                className="flex w-full items-start gap-3 px-4 py-4 text-left sm:px-5">
                <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    q.hidden ? 'bg-gray-100 text-gray-400' : 'bg-accent/10 text-accent-dark'}`}>
                    {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                    <span className={`block truncate font-medium ${q.label ? (q.hidden ? 'text-gray-400' : 'text-gray-900') : 'italic text-gray-400'}`}>
                        {q.label || 'Untitled question'}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
                        <Chip>{typeLabel}</Chip>
                        <Chip>{q.scope === 'person' ? 'Each guest' : 'Once per household'}</Chip>
                        {q.required && <Chip tone="dark">Required</Chip>}
                        {q.meal && <Chip tone="accent">Kitchen counts</Chip>}
                        {q.hidden && <Chip tone="muted">Hidden</Chip>}
                    </span>
                </span>
                <span className="shrink-0 text-right text-xs text-gray-500">
                    <span className="block font-semibold tabular-nums text-gray-900">{tally.answered}</span>
                    answered
                </span>
            </button>

            {/* Results, always visible once there are any */}
            {tally.answered + tally.unanswered.length > 0 && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 sm:px-5">
                    <Results tally={tally} />
                </div>
            )}

            {open && (
                <div className="space-y-5 border-t border-gray-100 bg-gray-50/60 px-4 py-5 sm:px-5">
                    <Field label="Question">
                        <input value={q.label} autoFocus={!q.label} maxLength={200}
                            onChange={e => onChange({ label: e.target.value })}
                            placeholder="e.g. Which entrée would you like?" className={inputClass} />
                    </Field>
                    <Field label="A line of help" hint="optional">
                        <input value={q.help ?? ''} maxLength={400}
                            onChange={e => onChange({ help: e.target.value })}
                            placeholder="e.g. All dishes come with seasonal vegetables" className={inputClass} />
                    </Field>

                    <div className="grid gap-5 sm:grid-cols-2">
                        <Field label="Answer with">
                            <Segmented
                                value={q.type}
                                options={QUESTION_TYPES.map(t => ({ value: t.type, label: t.label, title: t.hint }))}
                                onChange={setType}
                            />
                        </Field>
                        <Field label="Who answers">
                            <Segmented
                                value={q.scope}
                                options={[
                                    { value: 'person', label: 'Each guest', title: 'Everyone who is coming answers for themself' },
                                    { value: 'household', label: 'Household', title: 'Answered once for the whole invitation' },
                                ]}
                                onChange={scope => onChange({ scope, ...(scope === 'household' ? { meal: false, onlyIfAttending: q.onlyIfAttending ?? true } : {}) })}
                            />
                        </Field>
                    </div>

                    {hasOptions && (
                        <Field label="Options" hint={q.type === 'choice' ? 'they pick one' : 'they pick any'}>
                            <div className="space-y-2">
                                {(q.options ?? []).map((o, i) => (
                                    <div key={o.id} className="flex items-start gap-2 rounded-2xl border border-gray-200 bg-white p-2">
                                        <div className="flex flex-col">
                                            <IconButton label="Move up" disabled={i === 0} onClick={() => moveOption(i, -1)}>↑</IconButton>
                                            <IconButton label="Move down" disabled={i === (q.options ?? []).length - 1} onClick={() => moveOption(i, 1)}>↓</IconButton>
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <input value={o.label} maxLength={120} placeholder={`Option ${i + 1}`}
                                                onChange={e => setOption(o.id, { label: e.target.value })}
                                                className="block w-full rounded-xl border-0 bg-transparent px-2 py-1 text-sm font-medium text-gray-900 placeholder-gray-400 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent/30" />
                                            <input value={o.description ?? ''} maxLength={200} placeholder="Description (optional)"
                                                onChange={e => setOption(o.id, { description: e.target.value })}
                                                className="block w-full rounded-xl border-0 bg-transparent px-2 py-1 text-xs text-gray-600 placeholder-gray-400 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-accent/30" />
                                        </div>
                                        <IconButton label={`Remove ${o.label || 'option'}`} onClick={() => removeOption(o.id)}>×</IconButton>
                                    </div>
                                ))}
                                {(q.options ?? []).length < MAX_OPTIONS && (
                                    <button type="button"
                                        onClick={() => onChange({ options: [...(q.options ?? []), { id: newId('o'), label: '' }] })}
                                        className="rounded-full px-3 py-1.5 text-xs font-medium text-accent-dark hover:bg-accent/10">
                                        + Add an option
                                    </button>
                                )}
                            </div>
                        </Field>
                    )}

                    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
                        <Toggle checked={q.required} onChange={required => onChange({ required })}
                            label="Required" hint="They can’t send their RSVP without answering." />
                        {q.type === 'choice' && q.scope === 'person' && (
                            <Toggle checked={!!q.meal} onChange={meal => onChange({ meal })}
                                label="This is the meal"
                                hint={mealTakenElsewhere
                                    ? 'Moves the kitchen counts here from your other meal question.'
                                    : 'Counts each dish per table in the seating chart’s kitchen export.'} />
                        )}
                        {q.scope === 'household' && (
                            <Toggle checked={q.onlyIfAttending !== false} onChange={only => onChange({ onlyIfAttending: only })}
                                label="Only if someone is coming" hint="Skip it for a household that declines." />
                        )}
                        <Toggle checked={!!q.hidden} onChange={hidden => onChange({ hidden })}
                            label="Hide from the form" hint="Guests stop seeing it; the answers you have stay here." />
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex gap-1">
                            <button type="button" disabled={index === 0} onClick={() => onMove(-1)} className={ghostButton}>Move up</button>
                            <button type="button" disabled={index === count - 1} onClick={() => onMove(1)} className={ghostButton}>Move down</button>
                        </div>
                        <div className="flex gap-1">
                            <button type="button" onClick={onRemove} className={`${ghostButton} text-red-600 hover:bg-red-50`}>Delete</button>
                            <button type="button" onClick={onToggle}
                                className="rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-700">Done</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ── How a question has been answered ─────────────────────────────────── */

function Results({ tally }: { tally: ReturnType<typeof tallyQuestion> }) {
    const [showWaiting, setShowWaiting] = useState(false);
    const max = Math.max(1, ...tally.options.map(o => o.count));
    return (
        <div className="space-y-2">
            {tally.options.map(o => (
                <div key={o.id} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-xs" title={o.names.join(', ')}>
                    <span className="truncate text-gray-700">{o.label || 'Untitled'}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-gray-100">
                        <span className="block h-full rounded-full bg-accent transition-[width] duration-500"
                            style={{ width: `${(o.count / max) * 100}%` }} />
                    </span>
                    <span className="w-6 text-right font-semibold tabular-nums text-gray-900">{o.count}</span>
                </div>
            ))}
            {tally.texts.length > 0 && (
                <ul className="max-h-48 space-y-1.5 overflow-auto pr-1">
                    {tally.texts.map((t, i) => (
                        <li key={i} className="rounded-xl bg-gray-50 px-3 py-2 text-xs">
                            <span className="text-gray-900">“{t.text}”</span>
                            <span className="ml-1.5 text-gray-400">— {t.name}</span>
                        </li>
                    ))}
                </ul>
            )}
            {tally.unanswered.length > 0 && (
                <p className="text-xs text-gray-500">
                    <button type="button" onClick={() => setShowWaiting(v => !v)} className="font-medium text-amber-700 hover:underline">
                        {tally.unanswered.length} haven’t answered
                    </button>
                    {showWaiting && <span className="ml-1">· {tally.unanswered.join(', ')}</span>}
                </p>
            )}
        </div>
    );
}

/* ── Adding a question ─────────────────────────────────────────────────── */

function TemplatePicker({ hasMeal, onPick, onClose }: { hasMeal: boolean; onPick: (make: () => RsvpQuestion) => void; onClose: () => void }) {
    return (
        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-lg sm:p-5">
            <div className="mb-3 flex items-baseline justify-between">
                <p className="text-sm font-semibold text-gray-900">Start from…</p>
                <button type="button" onClick={onClose} className="text-xs text-gray-500 hover:text-gray-900">Cancel</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                {QUESTION_TEMPLATES.filter(t => !(hasMeal && t.key === 'meal')).map(t => (
                    <button key={t.key} type="button" onClick={() => onPick(t.make)}
                        className="rounded-2xl border border-gray-200 px-4 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-md">
                        <span className="block text-sm font-medium text-gray-900">{t.title}</span>
                        <span className="mt-0.5 block text-xs text-gray-500">{t.blurb}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ── The live preview ──────────────────────────────────────────────────── */

function Preview({ questions }: { questions: RsvpQuestion[] }) {
    const [person, setPerson] = useState<Answers>({});
    const [household, setHousehold] = useState<Answers>({});
    const set = (setter: typeof setPerson) => (qid: string, v: AnswerValue | undefined) => setter(prev => {
        const next = { ...prev };
        if (v === undefined) delete next[qid]; else next[qid] = v;
        return next;
    });
    const personQs = askedQuestions(questions, 'person');
    const householdQs = askedQuestions(questions, 'household');
    return (
        <div className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400">What guests see</p>
            <div className="rounded-3xl border border-accent/40 bg-accent/[0.03] p-4">
                <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">AG</span>
                    <span className="text-sm font-medium text-gray-900">A guest</span>
                    <span className="ml-auto rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-white">✓ Accepts</span>
                </div>
                <div className="mt-4 space-y-5 border-t border-dashed border-gray-200 pt-4">
                    {personQs.length === 0 && <p className="text-xs text-gray-400">Questions for each guest appear here.</p>}
                    {personQs.map(q => (
                        <QuestionField key={q.id} question={q} idPrefix="preview-p" value={person[q.id]} onChange={v => set(setPerson)(q.id, v)} />
                    ))}
                    <p className="text-xs text-gray-400">…then their dietary needs</p>
                </div>
            </div>
            {householdQs.length > 0 && (
                <div className="mt-3 space-y-5 rounded-3xl border border-gray-200 p-4">
                    <p className="text-sm font-semibold text-gray-900">A few things for your party</p>
                    {householdQs.map(q => (
                        <QuestionField key={q.id} question={q} idPrefix="preview-h" value={household[q.id]} onChange={v => set(setHousehold)(q.id, v)} />
                    ))}
                </div>
            )}
        </div>
    );
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

const inputClass = 'block w-full rounded-2xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';
const ghostButton = 'rounded-full px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="mb-1.5 ml-1 text-xs font-medium text-gray-600">
                {label}{hint && <span className="font-normal text-gray-400"> · {hint}</span>}
            </p>
            {children}
        </div>
    );
}

function Chip({ children, tone = 'plain' }: { children: React.ReactNode; tone?: 'plain' | 'dark' | 'accent' | 'muted' }) {
    const tones = {
        plain: 'bg-gray-100 text-gray-600',
        dark: 'bg-gray-900 text-white',
        accent: 'bg-accent/15 text-accent-dark',
        muted: 'bg-gray-50 text-gray-400 ring-1 ring-gray-200',
    };
    return <span className={`rounded-full px-2 py-0.5 ${tones[tone]}`}>{children}</span>;
}

function Segmented<T extends string>({ value, options, onChange }: {
    value: T;
    options: { value: T; label: string; title?: string }[];
    onChange: (value: T) => void;
}) {
    return (
        <div className="flex flex-wrap gap-1 rounded-2xl bg-gray-100 p-1">
            {options.map(o => (
                <button key={o.value} type="button" title={o.title} aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={`flex-1 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                        value === o.value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
    return (
        <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
                <span className="block text-sm font-medium text-gray-800">{label}</span>
                <span className="block text-xs text-gray-500">{hint}</span>
            </span>
            <span className="relative mt-0.5 inline-flex shrink-0">
                <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
                <span className="h-6 w-10 rounded-full bg-gray-200 transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40" />
                <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
            </span>
        </label>
    );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
    return (
        <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
            className="flex size-6 items-center justify-center rounded-full text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-25 disabled:hover:bg-transparent">
            {children}
        </button>
    );
}
