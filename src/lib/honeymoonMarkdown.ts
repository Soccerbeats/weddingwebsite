/**
 * The small amount of Markdown a travel note actually uses.
 *
 * Guide notes have grown long enough that a wall of plain text is hard to read,
 * and the changelog viewer already proved a tiny inline tokeniser is enough:
 * bold, italic, code, links, bullet and numbered lists, headings, and blank
 * lines as paragraphs. Anything else is left as literal text.
 *
 * It renders to a small tree rather than to an HTML string, because a string
 * would mean `dangerouslySetInnerHTML` over text pasted from the internet, and
 * this is not the place to be clever about escaping.
 */

export type Inline =
    | { kind: 'text'; text: string }
    | { kind: 'strong'; text: string }
    | { kind: 'em'; text: string }
    | { kind: 'code'; text: string }
    | { kind: 'link'; text: string; href: string };

export type Block =
    | { kind: 'p'; spans: Inline[] }
    | { kind: 'h'; level: 2 | 3; spans: Inline[] }
    | { kind: 'ul'; items: Inline[][] }
    | { kind: 'ol'; items: Inline[][] }
    | { kind: 'quote'; spans: Inline[] };

/** Only http(s) and mailto links are followed; anything else stays as text. */
function safeHref(raw: string): string | null {
    const url = raw.trim();
    return /^(https?:\/\/|mailto:)/i.test(url) ? url : null;
}

/**
 * Inline spans, in one left-to-right pass.
 *
 * Order matters: code first, so `**` inside backticks stays literal — the same
 * trap the changelog parser documents.
 */
export function parseInline(text: string): Inline[] {
    const spans: Inline[] = [];
    let rest = text;

    const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))/;
    while (rest) {
        const match = pattern.exec(rest);
        if (!match || match.index == null) {
            spans.push({ kind: 'text', text: rest });
            break;
        }
        if (match.index > 0) {
            spans.push({ kind: 'text', text: rest.slice(0, match.index) });
        }
        const token = match[0];
        if (token.startsWith('`')) {
            spans.push({ kind: 'code', text: token.slice(1, -1) });
        } else if (token.startsWith('**')) {
            spans.push({ kind: 'strong', text: token.slice(2, -2) });
        } else if (token.startsWith('[')) {
            const label = /\[([^\]]+)\]/.exec(token)?.[1] ?? '';
            const href = safeHref(/\(([^)\s]+)\)/.exec(token)?.[1] ?? '');
            if (href) spans.push({ kind: 'link', text: label, href });
            else spans.push({ kind: 'text', text: token });
        } else {
            spans.push({ kind: 'em', text: token.slice(1, -1) });
        }
        rest = rest.slice(match.index + token.length);
    }
    return spans.filter((span) => span.kind !== 'text' || span.text !== '');
}

/** A note as blocks. Blank lines separate paragraphs; lists group themselves. */
export function parseMarkdown(source: string): Block[] {
    const lines = (source ?? '').replace(/\r\n?/g, '\n').split('\n');
    const blocks: Block[] = [];
    let paragraph: string[] = [];
    let list: { kind: 'ul' | 'ol'; items: string[] } | null = null;

    const flushParagraph = () => {
        if (!paragraph.length) return;
        blocks.push({ kind: 'p', spans: parseInline(paragraph.join(' ')) });
        paragraph = [];
    };
    const flushList = () => {
        if (!list) return;
        blocks.push({
            kind: list.kind,
            items: list.items.map((item) => parseInline(item)),
        });
        list = null;
    };

    for (const raw of lines) {
        const line = raw.trimEnd();
        if (!line.trim()) {
            flushParagraph();
            flushList();
            continue;
        }
        const heading = /^(#{2,3})\s+(.*)$/.exec(line);
        if (heading) {
            flushParagraph();
            flushList();
            blocks.push({
                kind: 'h',
                level: heading[1].length === 2 ? 2 : 3,
                spans: parseInline(heading[2]),
            });
            continue;
        }
        const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
        if (bullet) {
            flushParagraph();
            if (list?.kind !== 'ul') { flushList(); list = { kind: 'ul', items: [] }; }
            list.items.push(bullet[1]);
            continue;
        }
        const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
        if (numbered) {
            flushParagraph();
            if (list?.kind !== 'ol') { flushList(); list = { kind: 'ol', items: [] }; }
            list.items.push(numbered[1]);
            continue;
        }
        const quote = /^>\s?(.*)$/.exec(line);
        if (quote) {
            flushParagraph();
            flushList();
            blocks.push({ kind: 'quote', spans: parseInline(quote[1]) });
            continue;
        }
        flushList();
        paragraph.push(line.trim());
    }
    flushParagraph();
    flushList();
    return blocks;
}

/** Plain text of a note, for search and for the one-line preview. */
export function markdownToText(source: string): string {
    return parseMarkdown(source)
        .flatMap((block) => (block.kind === 'ul' || block.kind === 'ol'
            ? block.items.flat()
            : block.spans))
        .map((span) => span.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
}
