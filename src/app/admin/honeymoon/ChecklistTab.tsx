'use client';

import { useMemo, useState } from 'react';
import {
    DndContext, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { TodoItem } from '@/lib/honeymoon';
import type { HoneymoonApi } from './useHoneymoon';
import { Button, Card, EmptyState, InlineText, Modal, OverflowMenu, TextArea, TextField } from './ui';

/**
 * Everything that has to happen before you go, that isn't a place.
 *
 * Visas, jabs, insurance, currency, the house-sitter. Grouped by whatever you
 * type in the group box, so the structure is yours rather than mine — a fixed
 * set of categories would be wrong for someone else's trip.
 */
export default function ChecklistTab({ api }: { api: HoneymoonApi }) {
    const { data } = api;
    const [text, setText] = useState('');
    const [group, setGroup] = useState('');
    const [hideDone, setHideDone] = useState(false);
    /** The item whose outcome we're asking about, right after it was ticked. */
    const [asking, setAsking] = useState<TodoItem | null>(null);

    const todos = useMemo(() => data?.todos ?? [], [data]);

    const visible = useMemo(
        () => (hideDone ? todos.filter((t) => !t.done) : todos),
        [todos, hideDone],
    );

    /** Grouped by category, in the order the groups first appear. */
    const grouped = useMemo(() => {
        const map = new Map<string, TodoItem[]>();
        for (const todo of visible) {
            const key = todo.category?.trim() || 'General';
            const list = map.get(key);
            if (list) list.push(todo); else map.set(key, [todo]);
        }
        return [...map.entries()];
    }, [visible]);

    const done = todos.filter((t) => t.done).length;
    const pct = todos.length ? Math.round((done / todos.length) * 100) : 0;

    /** Existing groups, offered as you type so they don't fragment on a typo. */
    const groups = useMemo(() => {
        const seen = new Set<string>();
        for (const t of todos) if (t.category?.trim()) seen.add(t.category.trim());
        return [...seen].sort((a, b) => a.localeCompare(b));
    }, [todos]);

    const add = async () => {
        const clean = text.trim();
        if (!clean) return;
        await api.create('todos', {
            text: clean,
            category: group.trim() || 'General',
            // New items land at the bottom of the list.
            sort_order: (todos.at(-1)?.sort_order ?? 0) + 1,
        });
        setText('');
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    );

    const onDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        // Reorder against the full list, not the filtered view, or hiding done
        // items would scramble the order of everything hidden.
        const ids = todos.map((t) => t.id);
        const from = ids.indexOf(Number(active.id));
        const to = ids.indexOf(Number(over.id));
        if (from < 0 || to < 0) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        api.reorder('todos', ids);
    };

    return (
        <div className="space-y-3">
            {/* ---- Add ---- */}
            <Card className="p-3">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_12rem_auto] gap-2">
                    <TextField
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                        placeholder="Renew passports, book airport transfer, tell the bank…"
                    />
                    <TextField
                        list="honeymoon-todo-groups"
                        value={group}
                        onChange={(e) => setGroup(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
                        placeholder="Group (optional)"
                    />
                    <datalist id="honeymoon-todo-groups">
                        {groups.map((g) => <option key={g} value={g} />)}
                    </datalist>
                    <Button tone="primary" onClick={add} disabled={!text.trim()}>Add</Button>
                </div>
            </Card>

            {/* ---- Progress ---- */}
            {todos.length > 0 && (
                <Card className="p-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <span className="text-sm font-medium text-gray-700">
                            {done} of {todos.length} done
                        </span>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400 tabular-nums">{pct}%</span>
                            <Button onClick={() => setHideDone((v) => !v)}>
                                {hideDone ? 'Show done' : 'Hide done'}
                            </Button>
                        </div>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </Card>
            )}

            {/* ---- List ---- */}
            {visible.length === 0 ? (
                <Card>
                    <EmptyState
                        title={todos.length ? 'Everything here is done' : 'Nothing on the list yet'}
                        hint={todos.length
                            ? 'Hit Show done to see what you have ticked off.'
                            : 'Add the first thing above — passports, insurance, jabs.'}
                    />
                </Card>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                    <SortableContext items={todos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-3">
                            {grouped.map(([groupName, items]) => (
                                <Card key={groupName} className="p-3">
                                    <div className="flex items-baseline justify-between gap-2 mb-1.5 px-1">
                                        <h2 className="text-[11px] uppercase tracking-wide text-gray-400 font-semibold">
                                            {groupName}
                                        </h2>
                                        <span className="text-[11px] text-gray-400">
                                            {items.filter((i) => i.done).length}/{items.length}
                                        </span>
                                    </div>
                                    <ul>
                                        {items.map((todo) => (
                                            <TodoRow
                                                key={todo.id}
                                                todo={todo}
                                                api={api}
                                                onTicked={setAsking}
                                            />
                                        ))}
                                    </ul>
                                </Card>
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            )}

            {asking && (
                <ResultPrompt
                    key={asking.id}
                    todo={asking}
                    onClose={() => setAsking(null)}
                    onSave={(result) => {
                        api.update('todos', { id: asking.id, result });
                        setAsking(null);
                    }}
                />
            )}
        </div>
    );
}

/**
 * Asks what happened, straight after an item is ticked.
 *
 * The tick already saved — this only captures the outcome, so closing it without
 * typing leaves the item done rather than undoing your click. That is why there
 * is a Skip rather than a Cancel.
 */
function ResultPrompt({ todo, onClose, onSave }: {
    todo: TodoItem;
    onClose: () => void;
    onSave: (result: string) => void;
}) {
    const [text, setText] = useState(todo.result ?? '');

    return (
        <Modal open onClose={onClose} title={todo.text}>
            <div className="space-y-3">
                <label className="block text-xs font-semibold text-gray-500">
                    How did it go? Booking reference, outcome, anything worth remembering.
                </label>
                <TextArea
                    autoFocus
                    rows={4}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter alone would be a nuisance in a multi-line note.
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(text.trim());
                    }}
                    placeholder="Booked with Garuda, ref XY12AB — paid in full"
                />
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>Skip</Button>
                    <Button tone="primary" onClick={() => onSave(text.trim())}>Save</Button>
                </div>
            </div>
        </Modal>
    );
}

function TodoRow({ todo, api, onTicked }: {
    todo: TodoItem;
    api: HoneymoonApi;
    onTicked: (todo: TodoItem) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: todo.id });

    return (
        <li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={isDragging ? 'opacity-50' : ''}
        >
            <div className="flex items-center gap-2 py-1.5 group">
                <button
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-gray-200 hover:text-gray-400
                        touch-none px-1 opacity-0 group-hover:opacity-100 transition"
                    aria-label="Drag to reorder"
                >
                    ⠿
                </button>
                <input
                    type="checkbox"
                    checked={todo.done}
                    onChange={(e) => {
                        const done = e.target.checked;
                        api.update('todos', { id: todo.id, done });
                        // Ask only on the way in. Un-ticking is a correction, not
                        // an outcome worth writing up.
                        if (done) onTicked(todo);
                    }}
                    aria-label={todo.text}
                    className="w-5 h-5 rounded accent-emerald-600 shrink-0 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                    <InlineText
                        value={todo.text}
                        className={`text-sm -ml-2 ${todo.done ? 'line-through text-gray-400' : 'text-gray-800'}`}
                        onCommit={(text) => {
                            const clean = text.trim();
                            if (clean && clean !== todo.text) api.update('todos', { id: todo.id, text: clean });
                        }}
                    />
                    {todo.result && (
                        <button
                            onClick={() => onTicked(todo)}
                            className="block text-left text-[11px] text-gray-500 px-2 -mt-0.5
                                hover:text-gray-800 truncate max-w-full"
                            title="Edit this note"
                        >
                            ↳ {todo.result}
                        </button>
                    )}
                </div>
                <input
                    type="date"
                    value={todo.due_on ?? ''}
                    onChange={(e) => api.update('todos', { id: todo.id, due_on: e.target.value })}
                    aria-label={`Due date for ${todo.text}`}
                    className="text-xs text-gray-500 bg-transparent rounded-lg px-1 py-1 shrink-0
                        hover:bg-gray-50 focus:bg-white focus:outline-none focus:ring-2
                        focus:ring-accent/30 w-[8.5rem]"
                />
                <OverflowMenu
                    items={[
                        {
                            label: 'Delete',
                            danger: true,
                            onClick: () => {
                                if (confirm(`Delete "${todo.text}"?`)) api.remove('todos', todo.id);
                            },
                        },
                    ]}
                />
            </div>
        </li>
    );
}
