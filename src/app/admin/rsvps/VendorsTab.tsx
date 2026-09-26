'use client';

import { useCallback, useEffect, useState } from 'react';
import DietaryPills from '@/components/admin/DietaryPills';
import { dietCodes, dietNote, isEmptyEntry, type DietaryEntry } from '@/lib/dietary';
import { DIET_LABELS } from '@/lib/dietary';

/**
 * Vendors — the photographer, the DJ, the planner.
 *
 * Kept apart from the guest list on purpose: a vendor is never invited, never
 * RSVPs, never belongs to a party and never takes a chair on the seating chart.
 * The one thing they share with a guest is a plate, so the dietary answer is the
 * same `DietaryEntry` and the same editor — which is how a vendor's nut allergy
 * reaches the kitchen sheet by exactly the route a guest's does.
 *
 * One row is one person. A DJ who brings an assistant is two rows sharing a
 * company, because one row with a headcount of two cannot say which of them is
 * the one who eats no gluten.
 */

export interface Vendor {
    id: number;
    name: string;
    role: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    needs_meal: boolean;
    dietary: DietaryEntry | null;
    notes: string | null;
}

interface VendorForm {
    id: number | null;
    name: string;
    role: string;
    company: string;
    email: string;
    phone: string;
    needs_meal: boolean;
    dietary: DietaryEntry;
    notes: string;
}

const EMPTY_FORM: VendorForm = {
    id: null,
    name: '',
    role: '',
    company: '',
    email: '',
    phone: '',
    needs_meal: true,
    dietary: {},
    notes: '',
};

/** The roles a wedding actually books, offered as a datalist — never enforced. */
const COMMON_ROLES = [
    'Photographer', 'Videographer', 'DJ', 'Band', 'Planner', 'Coordinator',
    'Officiant', 'Caterer', 'Florist', 'Baker', 'Hair', 'Makeup', 'Transport', 'Security',
];

const INPUT = 'w-full px-4 py-2.5 border border-gray-200 rounded-2xl bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all';
const LABEL = 'block text-xs font-medium text-gray-500 mb-1.5';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return <div><label className={LABEL}>{label}</label>{children}</div>;
}

export default function VendorsTab() {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState<VendorForm | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/vendors');
            if (!res.ok) throw new Error('Failed to load vendors');
            setVendors(await res.json());
            setError(null);
        } catch {
            setError('Could not load the vendors.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const openNew = () => setForm({ ...EMPTY_FORM });

    const openEdit = (vendor: Vendor) => setForm({
        id: vendor.id,
        name: vendor.name,
        role: vendor.role ?? '',
        company: vendor.company ?? '',
        email: vendor.email ?? '',
        phone: vendor.phone ?? '',
        needs_meal: vendor.needs_meal !== false,
        dietary: vendor.dietary ?? {},
        notes: vendor.notes ?? '',
    });

    const save = async () => {
        if (!form || !form.name.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/admin/vendors', {
                method: form.id === null ? 'POST' : 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, dietary: form.dietary }),
            });
            if (!res.ok) throw new Error('Failed to save');
            setForm(null);
            await refresh();
        } catch {
            setError('Could not save that vendor.');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (vendor: Vendor) => {
        if (!confirm(`Remove ${vendor.name} from the vendors?`)) return;
        try {
            await fetch(`/api/admin/vendors?id=${vendor.id}`, { method: 'DELETE' });
            await refresh();
        } catch {
            setError('Could not remove that vendor.');
        }
    };

    const fed = vendors.filter(v => v.needs_meal !== false);

    return (
        <div>
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div>
                    <h2 className="font-serif text-xl font-bold text-gray-800">Vendors</h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        {loading
                            ? 'Loading…'
                            : `${vendors.length} vendor${vendors.length === 1 ? '' : 's'} · ${fed.length} eating`}
                        {' · '}
                        <span className="text-gray-400">
                            They take no chairs — turn on “Vendors” when you export the seating chart.
                        </span>
                    </p>
                </div>
                <button
                    onClick={openNew}
                    className="ml-auto px-5 py-2.5 rounded-full bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
                >
                    + Add vendor
                </button>
            </div>

            {error && (
                <p className="mb-4 px-4 py-2.5 rounded-2xl bg-red-50 text-xs text-red-700">{error}</p>
            )}

            {!loading && vendors.length === 0 && (
                <div className="px-6 py-12 text-center bg-gray-50 rounded-3xl">
                    <p className="text-sm text-gray-500">No vendors yet.</p>
                    <p className="text-xs text-gray-400 mt-1">
                        Add the photographer, the DJ, the planner — anyone who is at the wedding
                        working, and who may need feeding.
                    </p>
                </div>
            )}

            {vendors.length > 0 && (
                <div className="overflow-x-auto bg-white rounded-3xl border border-gray-100">
                    <table className="min-w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Contact</th>
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Meal</th>
                                <th className="px-4 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dietary</th>
                                <th className="px-4 sm:px-6 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {vendors.map(vendor => {
                                const codes = dietCodes(vendor.dietary);
                                return (
                                    <tr key={vendor.id} className="hover:bg-gray-50/70 transition-colors">
                                        <td className="px-4 sm:px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                                            {vendor.role || '—'}
                                        </td>
                                        <td className="px-4 sm:px-6 py-4">
                                            <div className="text-sm font-medium text-gray-900">{vendor.name}</div>
                                            {vendor.company && (
                                                <div className="text-xs text-gray-400">{vendor.company}</div>
                                            )}
                                            {vendor.notes && (
                                                <div className="text-xs text-gray-400 italic mt-0.5 max-w-[22rem] truncate" title={vendor.notes}>
                                                    {vendor.notes}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 sm:px-6 py-4 text-xs text-gray-500">
                                            {vendor.email && <div className="truncate max-w-[14rem]">{vendor.email}</div>}
                                            {vendor.phone && <div>{vendor.phone}</div>}
                                            {!vendor.email && !vendor.phone && '—'}
                                        </td>
                                        <td className="px-4 sm:px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                                vendor.needs_meal !== false
                                                    ? 'bg-green-50 text-green-700'
                                                    : 'bg-gray-100 text-gray-400'
                                            }`}>
                                                {vendor.needs_meal !== false ? 'Eating' : 'No meal'}
                                            </span>
                                        </td>
                                        <td className="px-4 sm:px-6 py-4">
                                            {codes.length === 0 ? (
                                                <span className="text-xs text-gray-300">—</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {codes.map(code => (
                                                        <span
                                                            key={code}
                                                            title={DIET_LABELS[code]}
                                                            className="px-2 py-0.5 rounded-full bg-gray-900 text-white text-[10px] font-mono"
                                                        >
                                                            {code}
                                                        </span>
                                                    ))}
                                                    {dietNote(vendor.dietary) && (
                                                        <span className="text-[10px] text-gray-400 italic self-center">
                                                            {dietNote(vendor.dietary)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 sm:px-6 py-4 text-right whitespace-nowrap">
                                            <button
                                                onClick={() => openEdit(vendor)}
                                                className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => remove(vendor)}
                                                className="px-3 py-1.5 rounded-full text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {form && (
                <div
                    className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label={form.id === null ? 'Add vendor' : 'Edit vendor'}
                    onClick={e => { if (e.target === e.currentTarget) setForm(null); }}
                >
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center">
                            <h3 className="font-serif text-lg font-bold text-gray-800">
                                {form.id === null ? 'Add vendor' : form.name || 'Edit vendor'}
                            </h3>
                            <button
                                onClick={() => setForm(null)}
                                className="ml-auto w-8 h-8 rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-4">
                            <Field label="Name">
                                <input
                                    autoFocus
                                    className={INPUT}
                                    value={form.name}
                                    onChange={e => setForm({ ...form, name: e.target.value })}
                                    placeholder="Who they are"
                                />
                            </Field>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Role">
                                    <input
                                        className={INPUT}
                                        list="vendor-roles"
                                        value={form.role}
                                        onChange={e => setForm({ ...form, role: e.target.value })}
                                        placeholder="Photographer"
                                    />
                                    <datalist id="vendor-roles">
                                        {COMMON_ROLES.map(role => <option key={role} value={role} />)}
                                    </datalist>
                                </Field>
                                <Field label="Company">
                                    <input
                                        className={INPUT}
                                        value={form.company}
                                        onChange={e => setForm({ ...form, company: e.target.value })}
                                        placeholder="Who they work for"
                                    />
                                </Field>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Email">
                                    <input
                                        type="email"
                                        className={INPUT}
                                        value={form.email}
                                        onChange={e => setForm({ ...form, email: e.target.value })}
                                    />
                                </Field>
                                <Field label="Phone">
                                    <input
                                        className={INPUT}
                                        value={form.phone}
                                        onChange={e => setForm({ ...form, phone: e.target.value })}
                                    />
                                </Field>
                            </div>

                            <div>
                                <label className="flex items-start gap-2.5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.needs_meal}
                                        onChange={e => setForm({ ...form, needs_meal: e.target.checked })}
                                        className="mt-0.5 accent-gray-900"
                                    />
                                    <span className="text-sm text-gray-700">
                                        Needs a meal
                                        <span className="block text-xs text-gray-400">
                                            Only these count toward the vendor plates on the seating export.
                                        </span>
                                    </span>
                                </label>
                            </div>

                            {form.needs_meal && (
                                <div>
                                    <label className={LABEL}>Food preference</label>
                                    <DietaryPills
                                        entry={form.dietary}
                                        onChange={entry => setForm({ ...form, dietary: entry })}
                                    />
                                    {isEmptyEntry(form.dietary) && (
                                        <p className="mt-2 text-xs text-gray-400">
                                            Nothing selected means the standard plate — the chicken.
                                        </p>
                                    )}
                                </div>
                            )}

                            <Field label="Notes">
                                <textarea
                                    rows={2}
                                    className={INPUT}
                                    value={form.notes}
                                    onChange={e => setForm({ ...form, notes: e.target.value })}
                                    placeholder="Arrival time, where they set up, anything the planner needs"
                                />
                            </Field>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
                            <button
                                onClick={() => setForm(null)}
                                className="px-5 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={save}
                                disabled={saving || !form.name.trim()}
                                className="px-5 py-2.5 rounded-full bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
