'use client';

import { parseMarkdown } from '@/lib/honeymoonMarkdown';
import type { Block, Inline } from '@/lib/honeymoonMarkdown';

/**
 * Notes, rendered.
 *
 * Built from the parsed tree rather than an HTML string, so nothing pasted from
 * the internet is ever handed to `dangerouslySetInnerHTML` — links are the only
 * thing that reaches an attribute, and the parser has already refused anything
 * that is not http(s) or mailto.
 */
export default function Markdown({ source, className = '' }: {
    source: string;
    className?: string;
}) {
    const blocks = parseMarkdown(source);
    if (!blocks.length) return null;
    return (
        <div className={`space-y-2 ${className}`}>
            {blocks.map((block, index) => <BlockView key={index} block={block} />)}
        </div>
    );
}

function BlockView({ block }: { block: Block }) {
    switch (block.kind) {
        case 'h':
            return block.level === 2
                ? (
                    <h4 className="text-sm font-semibold text-gray-900">
                        <Spans spans={block.spans} />
                    </h4>
                )
                : (
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <Spans spans={block.spans} />
                    </h5>
                );
        case 'ul':
            return (
                <ul className="list-disc pl-5 space-y-0.5">
                    {block.items.map((item, index) => (
                        <li key={index}><Spans spans={item} /></li>
                    ))}
                </ul>
            );
        case 'ol':
            return (
                <ol className="list-decimal pl-5 space-y-0.5">
                    {block.items.map((item, index) => (
                        <li key={index}><Spans spans={item} /></li>
                    ))}
                </ol>
            );
        case 'quote':
            return (
                <blockquote className="border-l-2 border-gray-200 pl-3 text-gray-600 italic">
                    <Spans spans={block.spans} />
                </blockquote>
            );
        default:
            return <p><Spans spans={block.spans} /></p>;
    }
}

function Spans({ spans }: { spans: Inline[] }) {
    return (
        <>
            {spans.map((span, index) => {
                switch (span.kind) {
                    case 'strong':
                        return <strong key={index} className="font-semibold">{span.text}</strong>;
                    case 'em':
                        return <em key={index}>{span.text}</em>;
                    case 'code':
                        return (
                            <code
                                key={index}
                                className="rounded bg-gray-100 px-1 py-0.5 text-[0.9em]"
                            >
                                {span.text}
                            </code>
                        );
                    case 'link':
                        return (
                            <a
                                key={index}
                                href={span.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent underline decoration-dotted"
                            >
                                {span.text}
                            </a>
                        );
                    default:
                        return <span key={index}>{span.text}</span>;
                }
            })}
        </>
    );
}
