/**
 * The couple's own RSVP questions — "Which entrée?", "A song that gets you
 * dancing?", "Will you need the shuttle?" — and the answers to them.
 *
 * Pure: no DOM, no database. The question builder (Admin → RSVPs → Questions),
 * the public form, `/api/rsvp`, the admin summaries and the seating export all
 * read these functions, so they agree on what a question is and what a valid
 * answer looks like. Covered by `npm run check:rsvp`.
 *
 * Where things live:
 * - the questions: `site.json` → `rsvpQuestions` (public, like the rest of the form)
 * - a person's answers: on their entry in `rsvps.dietary_restrictions`, as
 *   `answers` — the entry is already one per attending person, matched by name,
 *   and renames already carry it
 * - the household's answers: `rsvps.answers`
 *
 * Answers are keyed by the question's id and an option's id, never by their
 * wording, so the couple can reword a question or a dish without losing a
 * single answer.
 */

export type QuestionType = 'yes_no' | 'choice' | 'multi' | 'text';
export type QuestionScope = 'person' | 'household';

export interface QuestionOption {
    id: string;
    label: string;
    /** Under the label: "Pan-seared, lemon butter, seasonal greens". */
    description?: string;
}

export interface RsvpQuestion {
    id: string;
    label: string;
    help?: string;
    type: QuestionType;
    /** Asked once per attending person, or once for the household. */
    scope: QuestionScope;
    required: boolean;
    /** Hidden from the form; its answers are kept and still shown to the couple. */
    hidden?: boolean;
    /** choice / multi only. */
    options?: QuestionOption[];
    /**
     * The entrée: a per-person single choice whose answers the kitchen counts.
     * At most one question has it.
     */
    meal?: boolean;
    /** Household questions: ask only when someone in the party is coming. Default true. */
    onlyIfAttending?: boolean;
}

export type AnswerValue = boolean | string | string[];
export type Answers = Record<string, AnswerValue>;

export const QUESTION_TYPES: { type: QuestionType; label: string; hint: string }[] = [
    { type: 'choice', label: 'Pick one', hint: 'A list where they choose a single option' },
    { type: 'multi', label: 'Pick any', hint: 'A list where they tick as many as apply' },
    { type: 'yes_no', label: 'Yes or no', hint: 'Two buttons' },
    { type: 'text', label: 'Short answer', hint: 'A line of their own words' },
];

export const MAX_QUESTIONS = 20;
export const MAX_OPTIONS = 12;
export const MAX_TEXT_ANSWER = 500;

/** A short id that is unlikely to repeat; not a secret. */
export function newId(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const ID = /^[a-z0-9_-]{1,40}$/i;

/**
 * The questions as stored: anything malformed dropped, ids kept, and the rules
 * between fields enforced — only a per-person single choice can be the meal,
 * and only one question can be.
 */
export function cleanQuestions(raw: unknown): RsvpQuestion[] {
    if (!Array.isArray(raw)) return [];
    const out: RsvpQuestion[] = [];
    const seen = new Set<string>();
    let mealTaken = false;
    for (const item of raw.slice(0, MAX_QUESTIONS)) {
        if (!item || typeof item !== 'object') continue;
        const q = item as Record<string, unknown>;
        const id = typeof q.id === 'string' && ID.test(q.id) && !seen.has(q.id) ? q.id : null;
        const type = QUESTION_TYPES.some(t => t.type === q.type) ? (q.type as QuestionType) : null;
        if (!id || !type) continue;
        seen.add(id);
        const scope: QuestionScope = q.scope === 'household' ? 'household' : 'person';
        const question: RsvpQuestion = {
            id,
            label: str(q.label, 200),
            type,
            scope,
            required: q.required === true,
        };
        const help = str(q.help, 400);
        if (help) question.help = help;
        if (q.hidden === true) question.hidden = true;
        if (scope === 'household') question.onlyIfAttending = q.onlyIfAttending !== false;
        if (type === 'choice' || type === 'multi') {
            const optSeen = new Set<string>();
            question.options = (Array.isArray(q.options) ? q.options : [])
                .slice(0, MAX_OPTIONS)
                .flatMap((o): QuestionOption[] => {
                    if (!o || typeof o !== 'object') return [];
                    const opt = o as Record<string, unknown>;
                    const oid = typeof opt.id === 'string' && ID.test(opt.id) && !optSeen.has(opt.id) ? opt.id : null;
                    if (!oid) return [];
                    optSeen.add(oid);
                    const description = str(opt.description, 200);
                    return [{ id: oid, label: str(opt.label, 120), ...(description ? { description } : {}) }];
                });
        }
        if (q.meal === true && type === 'choice' && scope === 'person' && !mealTaken) {
            question.meal = true;
            mealTaken = true;
        }
        out.push(question);
    }
    return out;
}

/** The questions a guest is shown: not hidden, and with a label to show. */
export function askedQuestions(questions: RsvpQuestion[], scope: QuestionScope): RsvpQuestion[] {
    return questions.filter(q => q.scope === scope && !q.hidden && q.label.trim() !== ''
        && (q.type === 'yes_no' || q.type === 'text' || (q.options ?? []).some(o => o.label.trim())));
}

/** One answer, checked against its question; undefined when it is not a valid answer. */
export function cleanAnswer(q: RsvpQuestion, value: unknown): AnswerValue | undefined {
    switch (q.type) {
        case 'yes_no':
            return typeof value === 'boolean' ? value : undefined;
        case 'text': {
            const text = str(value, MAX_TEXT_ANSWER);
            return text ? text : undefined;
        }
        case 'choice':
            return typeof value === 'string' && (q.options ?? []).some(o => o.id === value) ? value : undefined;
        case 'multi': {
            if (!Array.isArray(value)) return undefined;
            const valid = new Set((q.options ?? []).map(o => o.id));
            const picked = [...new Set(value.filter((v): v is string => typeof v === 'string' && valid.has(v)))];
            return picked.length ? picked : undefined;
        }
    }
}

/**
 * Answers as sent by the form, cleaned: only questions of this scope that
 * exist, only valid values. `previous` keeps answers to questions the form did
 * not ask (hidden ones, or ones added after the form loaded) so re-sending an
 * RSVP never wipes what the couple can still see.
 */
export function cleanAnswers(
    questions: RsvpQuestion[],
    scope: QuestionScope,
    raw: unknown,
    previous?: unknown,
): Answers {
    const out: Answers = {};
    const asked = new Set(askedQuestions(questions, scope).map(q => q.id));
    const prev = previous && typeof previous === 'object' && !Array.isArray(previous) ? previous as Record<string, unknown> : {};
    const given = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    for (const q of questions) {
        if (q.scope !== scope) continue;
        // An asked question's answer is whatever the form says now — including
        // nothing. One the form never showed keeps its previous answer.
        const source = asked.has(q.id) ? given[q.id] : prev[q.id];
        const value = cleanAnswer(q, source);
        if (value !== undefined) out[q.id] = value;
    }
    return out;
}

export function isAnswered(value: AnswerValue | undefined): boolean {
    if (value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    return value !== '';
}

/** Required questions in `questions` with no answer in `answers`. */
export function missingRequired(questions: RsvpQuestion[], answers: Answers | undefined): RsvpQuestion[] {
    return questions.filter(q => q.required && !isAnswered(answers?.[q.id]));
}

/** An answer in words: "Salmon", "Yes", "Vegan, Gluten free". */
export function formatAnswer(q: RsvpQuestion, value: AnswerValue | undefined): string {
    if (value === undefined) return '';
    if (q.type === 'yes_no') return value === true ? 'Yes' : value === false ? 'No' : '';
    if (q.type === 'text') return typeof value === 'string' ? value : '';
    const label = (id: string) => q.options?.find(o => o.id === id)?.label || 'a removed option';
    if (Array.isArray(value)) return value.map(label).join(', ');
    return typeof value === 'string' ? label(value) : '';
}

/** The meal question, if the couple has one. */
export function mealQuestion(questions: RsvpQuestion[]): RsvpQuestion | null {
    return questions.find(q => q.meal) ?? null;
}

/* ── Tallies for the couple ─────────────────────────────────────────────── */

export interface Respondent {
    /** Who answered: a person, or the household's name for a household question. */
    name: string;
    household: string;
    answers?: Answers;
}

export interface OptionCount { id: string; label: string; count: number; names: string[] }

export interface QuestionTally {
    question: RsvpQuestion;
    /** People (or households) who were asked and answered. */
    answered: number;
    /** Asked but left blank. */
    unanswered: string[];
    /** choice / multi / yes_no: one row per option, in the question's order. */
    options: OptionCount[];
    /** text: every answer, with who gave it. */
    texts: { name: string; text: string }[];
}

/**
 * How a question was answered, across everyone it was asked of. `respondents`
 * is people for a per-person question and households for a household one.
 */
export function tallyQuestion(q: RsvpQuestion, respondents: Respondent[]): QuestionTally {
    const tally: QuestionTally = { question: q, answered: 0, unanswered: [], options: [], texts: [] };
    if (q.type === 'yes_no') {
        tally.options = [
            { id: 'yes', label: 'Yes', count: 0, names: [] },
            { id: 'no', label: 'No', count: 0, names: [] },
        ];
    } else if (q.type !== 'text') {
        tally.options = (q.options ?? []).map(o => ({ id: o.id, label: o.label, count: 0, names: [] }));
    }
    for (const r of respondents) {
        const value = r.answers?.[q.id];
        if (!isAnswered(value)) { tally.unanswered.push(r.name); continue; }
        tally.answered += 1;
        if (q.type === 'text') { tally.texts.push({ name: r.name, text: String(value) }); continue; }
        const ids = q.type === 'yes_no' ? [value ? 'yes' : 'no'] : Array.isArray(value) ? value : [String(value)];
        for (const id of ids) {
            const row = tally.options.find(o => o.id === id);
            if (row) { row.count += 1; row.names.push(r.name); }
        }
    }
    return tally;
}

/* ── Starting points ────────────────────────────────────────────────────── */

export interface QuestionTemplate { key: string; title: string; blurb: string; make: () => RsvpQuestion }

const opt = (label: string, description?: string): QuestionOption => ({
    id: newId('o'), label, ...(description ? { description } : {}),
});

/** Common questions, one tap away, each already worded and editable. */
export const QUESTION_TEMPLATES: QuestionTemplate[] = [
    {
        key: 'meal', title: 'Entrée choice', blurb: 'Each guest picks a dish; the kitchen gets the counts',
        make: () => ({
            id: newId('q'), label: 'Which entrée would you like?', type: 'choice', scope: 'person', required: true, meal: true,
            options: [opt('Chicken'), opt('Fish'), opt('Vegetarian')],
        }),
    },
    {
        key: 'song', title: 'Song request', blurb: 'One song that gets them on the dance floor',
        make: () => ({
            id: newId('q'), label: 'What song will get you on the dance floor?', type: 'text', scope: 'household',
            required: false, onlyIfAttending: true,
        }),
    },
    {
        key: 'shuttle', title: 'Shuttle', blurb: 'Who needs a ride between the hotel and the venue',
        make: () => ({
            id: newId('q'), label: 'Will you take the shuttle from the hotel?', type: 'yes_no', scope: 'person', required: false,
        }),
    },
    {
        key: 'events', title: 'Other events', blurb: 'Which of the weekend’s other events they’ll join',
        make: () => ({
            id: newId('q'), label: 'Which other events will you join us for?', type: 'multi', scope: 'person', required: false,
            options: [opt('Welcome drinks'), opt('Rehearsal dinner'), opt('Farewell brunch')],
        }),
    },
    {
        key: 'drink', title: 'Welcome drink', blurb: 'With or without alcohol, for the toast',
        make: () => ({
            id: newId('q'), label: 'Your welcome drink?', type: 'choice', scope: 'person', required: false,
            options: [opt('Sparkling wine'), opt('Something without alcohol')],
        }),
    },
    {
        key: 'blank', title: 'Your own question', blurb: 'Start from nothing',
        make: () => ({ id: newId('q'), label: '', type: 'choice', scope: 'person', required: false, options: [opt(''), opt('')] }),
    },
];
