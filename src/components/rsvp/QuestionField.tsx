'use client';

import type { AnswerValue, RsvpQuestion } from '@/lib/rsvpQuestions';

/**
 * One of the couple's RSVP questions, as a guest answers it.
 *
 * The same component draws the question on the public form and in the
 * builder's live preview (Admin → RSVPs → Questions), so what the couple
 * approves is what their guests see.
 */
export default function QuestionField({
    question,
    value,
    onChange,
    idPrefix,
    missing = false,
}: {
    question: RsvpQuestion;
    value: AnswerValue | undefined;
    onChange: (value: AnswerValue | undefined) => void;
    /** Unique per person, so two guests' copies of a question do not share ids. */
    idPrefix: string;
    /** A required question left blank after trying to send. */
    missing?: boolean;
}) {
    const id = `${idPrefix}-${question.id}`;
    const labelId = `${id}-label`;
    const options = (question.options ?? []).filter(o => o.label.trim());

    return (
        <div>
            <p id={labelId} className="text-sm font-medium text-gray-800">
                {question.label || <span className="text-gray-400">Your question</span>}
                {!question.required && <span className="ml-1.5 font-normal text-gray-400">· optional</span>}
            </p>
            {question.help && <p className="mt-0.5 text-xs text-gray-500">{question.help}</p>}

            <div className="mt-2">
                {question.type === 'yes_no' && (
                    <div role="radiogroup" aria-labelledby={labelId} className="inline-grid grid-cols-2 gap-1 rounded-full bg-gray-100 p-1">
                        {([true, false] as const).map(answer => {
                            const on = value === answer;
                            return (
                                <button
                                    key={String(answer)}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    onClick={() => onChange(on ? undefined : answer)}
                                    className={`min-h-9 min-w-20 rounded-full px-4 text-xs font-semibold transition-all duration-200 ${
                                        on ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    {answer ? 'Yes' : 'No'}
                                </button>
                            );
                        })}
                    </div>
                )}

                {(question.type === 'choice' || question.type === 'multi') && (
                    <div
                        role={question.type === 'choice' ? 'radiogroup' : 'group'}
                        aria-labelledby={labelId}
                        className={`grid gap-2 ${options.length > 1 ? 'sm:grid-cols-2' : ''}`}
                    >
                        {options.map(option => {
                            const picked = Array.isArray(value) ? value : [];
                            const on = question.type === 'choice' ? value === option.id : picked.includes(option.id);
                            const toggle = () => {
                                if (question.type === 'choice') onChange(on ? undefined : option.id);
                                else {
                                    const next = on ? picked.filter(p => p !== option.id) : [...picked, option.id];
                                    onChange(next.length ? next : undefined);
                                }
                            };
                            return (
                                <button
                                    key={option.id}
                                    type="button"
                                    role={question.type === 'choice' ? 'radio' : 'checkbox'}
                                    aria-checked={on}
                                    onClick={toggle}
                                    className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all duration-150 ${
                                        on
                                            ? 'border-accent bg-accent/[0.06] shadow-sm'
                                            : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                >
                                    <span aria-hidden className={`mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors ${
                                        question.type === 'choice' ? 'rounded-full' : 'rounded-[5px]'} ${
                                        on ? 'border-accent bg-accent text-white' : 'border-gray-300 bg-white'}`}>
                                        {on && (
                                            <svg className="size-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </span>
                                    <span className="min-w-0">
                                        <span className={`block text-sm font-medium ${on ? 'text-gray-900' : 'text-gray-700'}`}>{option.label}</span>
                                        {option.description && (
                                            <span className="mt-0.5 block text-xs leading-snug text-gray-500">{option.description}</span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {question.type === 'text' && (
                    <input
                        id={id}
                        type="text"
                        aria-labelledby={labelId}
                        maxLength={500}
                        value={typeof value === 'string' ? value : ''}
                        onChange={e => onChange(e.target.value ? e.target.value : undefined)}
                        className="block w-full rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-accent focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                    />
                )}
            </div>

            {missing && <p className="mt-1.5 text-xs font-medium text-amber-700">Please answer this one.</p>}
        </div>
    );
}
