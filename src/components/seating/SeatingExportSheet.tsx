'use client';

import {
    DIET_CODES, DIET_LABELS, NO_RESTRICTION_LABEL, alphabetical, freeSeats, grandTotal,
    seatedPeople, sortedVendors, tally, tallyChips, tallyParts, vendorMeals,
    type DietCode, type ExportOptions, type ExportPerson, type ExportTable, type ExportVendor,
    type SeatingExportData,
} from '@/lib/seatingExport';

/**
 * The seating chart as a sheet of paper.
 *
 * One component, drawn twice: shrunk inside the export dialog as the preview,
 * and full size portalled to `<body>` as the thing that actually prints. That is
 * the whole point — a preview rendered by different code from the printout is a
 * preview you cannot trust, and the reason to look before printing 30 pages is
 * to trust it.
 *
 * No colour is load-bearing: restrictions are letter codes with a legend, so the
 * sheet survives the black-and-white printer at a venue.
 */

const CODE_CLASS: Record<DietCode, string> = {
    VEG: 'text-green-700 border-green-700',
    VGN: 'text-teal-700 border-teal-700',
    GF: 'text-amber-700 border-amber-700',
    NUT: 'text-red-700 border-red-700',
    OTH: 'text-slate-600 border-slate-600',
};

function Chip({ code }: { code: DietCode }) {
    return (
        <span
            className={`inline-block px-1 rounded border text-[9px] font-mono leading-4 tracking-wide ${CODE_CLASS[code]}`}
            title={DIET_LABELS[code]}
        >
            {code}
        </span>
    );
}

/** A person's — or a vendor's — restrictions, as chips. A dash is the chicken. */
function Diet({ diet }: { diet: DietCode[] }) {
    if (diet.length === 0) return <span className="text-gray-300">—</span>;
    return (
        <span className="inline-flex gap-1 flex-wrap justify-end">
            {diet.map(code => <Chip key={code} code={code} />)}
        </span>
    );
}

function TallyLine({ people, seatCount, compact = false, lead }: {
    people: { diet: DietCode[] }[];
    seatCount?: number | null;
    compact?: boolean;
    /** What the leading number counts. "seated" unless told otherwise. */
    lead?: string;
}) {
    const t = tally(people);

    // Counts only: the codes are drawn as the very chips the legend defines, so
    // the green box beside "3" and the green box in the legend are visibly the
    // same mark. Spelled in plain grey text they were not.
    if (compact) {
        return (
            <p className="mt-1 px-2 py-1 bg-gray-50 rounded text-[11px] text-gray-700 flex flex-wrap items-center gap-x-2.5 gap-y-1 tabular-nums">
                {tallyChips(t).map(({ code, count }) => (
                    <span key={code ?? 'none'} className="inline-flex items-center gap-1">
                        <span className={code ? 'font-semibold text-gray-900' : 'text-gray-400'}>{count}</span>
                        {code
                            ? <Chip code={code} />
                            : <span className="text-gray-400">{NO_RESTRICTION_LABEL.toLowerCase()}</span>}
                    </span>
                ))}
            </p>
        );
    }

    const parts = tallyParts(t, seatCount ?? null, lead);
    return (
        <p className="mt-1.5 px-3 py-1.5 gap-x-4 bg-gray-50 rounded text-[11px] text-gray-700 flex flex-wrap gap-y-0.5 tabular-nums">
            {parts.map((part, i) => {
                const [n, ...rest] = part.split(' ');
                const last = i === parts.length - 1;
                return (
                    <span key={part} className={last ? 'text-gray-400' : undefined}>
                        <span className={last ? undefined : 'font-semibold text-gray-900'}>{n}</span>
                        {' '}{rest.join(' ')}
                    </span>
                );
            })}
        </p>
    );
}

function Roster({ people, options, withSeat }: {
    people: ExportPerson[];
    options: ExportOptions;
    withSeat: boolean;
}) {
    return (
        <table className="w-full mt-2 text-[11.5px] border-collapse">
            <thead>
                <tr className="text-[9px] uppercase tracking-widest text-gray-400">
                    {withSeat && <th className="text-left font-semibold pb-1 pr-2 w-9">Seat</th>}
                    <th className="text-left font-semibold pb-1 pr-2">Name</th>
                    {!withSeat && <th className="text-left font-semibold pb-1 pr-2">Table</th>}
                    {options.household && <th className="text-left font-semibold pb-1 pr-2">Household</th>}
                    {options.side && <th className="text-left font-semibold pb-1 pr-2">Side</th>}
                    <th className="text-right font-semibold pb-1">Dietary</th>
                </tr>
            </thead>
            <tbody>
                {people.map((person, i) => (
                    <tr key={`${person.table_name}-${person.seat}-${person.name}-${i}`} className="border-t border-gray-100 align-top">
                        {withSeat && <td className="py-1 pr-2 font-mono text-gray-400 tabular-nums">{person.seat ?? '—'}</td>}
                        <td className="py-1 pr-2 font-medium text-gray-900">
                            {person.name}
                            {person.rsvp_status === 'declined' && (
                                <span className="ml-1.5 text-[9px] uppercase tracking-wide text-red-700">not coming</span>
                            )}
                            {person.note && <span className="block text-[10px] italic text-gray-500">{person.note}</span>}
                        </td>
                        {!withSeat && (
                            <td className="py-1 pr-2 text-gray-500">
                                {person.table_name ?? 'Not seated'}
                                {person.seat !== null && <span className="text-gray-400"> · {person.seat}</span>}
                            </td>
                        )}
                        {options.household && <td className="py-1 pr-2 text-gray-500">{person.household}</td>}
                        {options.side && <td className="py-1 pr-2 text-gray-500">{person.side ?? '—'}</td>}
                        <td className="py-1 text-right whitespace-nowrap"><Diet diet={person.diet} /></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

function TableBlock({ table, options, compact = false }: {
    table: ExportTable;
    options: ExportOptions;
    /** The two-column counts sheet, where every line has to earn its width. */
    compact?: boolean;
}) {
    const free = freeSeats(table);
    // Counts only is a heading and one line of numbers, so it does not need the
    // breathing room a roster does — and the point of that mode is fitting.
    const spacing = compact ? 'mb-3' : options.detail === 'counts' ? 'mb-4' : 'mb-7';
    return (
        <section className={`${spacing} break-inside-avoid ${options.pageBreak ? 'break-after-page last:break-after-auto' : ''}`}>
            <div className="flex items-baseline gap-2 border-b border-gray-300 pb-1">
                <h3 className="font-serif text-base font-semibold text-gray-900">{table.name}</h3>
                <span className="text-[10px] uppercase tracking-widest text-gray-400">{table.table_type}</span>
                <span className="ml-auto font-mono text-[11px] text-gray-500 tabular-nums">
                    {table.people.length}/{table.seat_count}
                </span>
            </div>
            {options.detail !== 'names' && (
                <TallyLine people={table.people} seatCount={table.seat_count} compact={compact} />
            )}
            {options.detail !== 'counts' && table.people.length > 0 && (
                <Roster people={table.people} options={options} withSeat />
            )}
            {table.people.length === 0 && <p className="mt-2 text-[11px] italic text-gray-400">Nobody seated here yet.</p>}
            {options.empty && free > 0 && (
                <p className="mt-1.5 text-[11px] text-gray-400">{free} empty seat{free === 1 ? '' : 's'}</p>
            )}
        </section>
    );
}

function Tile({ label, value, lead = false }: { label: string; value: number; lead?: boolean }) {
    return (
        <div className="bg-white px-3 py-2">
            <div className="text-[9px] text-gray-500 leading-tight">{label}</div>
            <div
                className="font-serif text-xl font-semibold tabular-nums"
                style={lead ? { color: 'var(--accent)' } : undefined}
            >
                {value}
            </div>
        </div>
    );
}

/**
 * The whole-wedding numbers, on page one.
 *
 * Guests and vendors are counted apart, because a vendor meal is usually its own
 * line on its own contract and often its own (cheaper) plate — so totalling them
 * silently would hand a caterer a number that is wrong for both. The grand total
 * sits underneath so that nobody has to add the two tiles up by hand either.
 */
function Kitchen({ people, vendors, showVendors }: {
    people: ExportPerson[];
    vendors: ExportVendor[];
    showVendors: boolean;
}) {
    const t = tally(people);
    const fed = vendorMeals(vendors);
    const vt = tally(fed);
    const withVendors = showVendors && vendors.length > 0;
    const GRID = 'grid grid-cols-4 sm:grid-cols-7 gap-px bg-gray-200 border border-gray-200 rounded overflow-hidden';
    const ROW_LABEL = 'text-[9px] uppercase tracking-widest text-gray-400 mb-1.5';
    return (
        <section className="mb-6 break-inside-avoid">
            <h3 className="text-[9px] uppercase tracking-widest text-gray-400 mb-2">For the kitchen</h3>
            {withVendors && <p className={ROW_LABEL}>Guests</p>}
            <div className={GRID}>
                <Tile label="Seated" value={t.total} lead />
                {DIET_CODES.map(code => <Tile key={code} label={DIET_LABELS[code]} value={t[code]} />)}
                <Tile label={NO_RESTRICTION_LABEL} value={t.none} />
            </div>
            {withVendors && (
                <>
                    {/* The same seven columns as the guests above, so the two
                        rows read straight down: a caterer comparing "how many
                        vegetarian" across them is looking at one column, not
                        hunting two differently-shaped summaries. */}
                    <p className={`${ROW_LABEL} mt-3`}>Vendors</p>
                    <div className={GRID}>
                        <Tile label="Vendor plates" value={fed.length} lead />
                        {DIET_CODES.map(code => <Tile key={code} label={DIET_LABELS[code]} value={vt[code]} />)}
                        <Tile label={NO_RESTRICTION_LABEL} value={vt.none} />
                    </div>
                    <p className="mt-2 text-[10px] text-gray-500 tabular-nums">
                        <span className="font-semibold text-gray-800">
                            {grandTotal(people, vendors)} plates in total
                        </span>
                        {' — '}{t.total} guest{t.total === 1 ? '' : 's'}
                        {' and '}{fed.length} vendor{fed.length === 1 ? '' : 's'}
                        {vendors.length > fed.length && (
                            <span className="text-gray-400">
                                {' '}({vendors.length - fed.length} vendor
                                {vendors.length - fed.length === 1 ? '' : 's'} not eating)
                            </span>
                        )}
                    </p>
                </>
            )}
        </section>
    );
}

/**
 * The vendors, as their own block at the end of the sheet.
 *
 * Deliberately not folded into a table roster: a vendor has no chair, and the
 * question this block answers is the planner's — who is in the building, and
 * which of them is being fed. A vendor whose contract has no meal in it is still
 * listed, greyed, because "the DJ is not eating" is exactly the thing somebody
 * asks at six o'clock.
 */
function Vendors({ vendors, compact = false }: {
    vendors: ExportVendor[];
    /** Counts only: the tally, and the names of whoever is *not* being fed. */
    compact?: boolean;
}) {
    const list = sortedVendors(vendors);
    const fed = vendorMeals(list);
    const unfed = list.filter(v => !v.needs_meal);

    // Counts only suppresses guest names, so printing a full vendor roster in
    // the same document would be the sheet disagreeing with itself — and it is
    // the single tallest block on a page that is meant to be one page. What
    // survives is the part a count cannot carry: who is *not* getting a plate.
    if (compact) {
        return (
            <section className="mb-4 break-inside-avoid">
                <div className="flex items-baseline gap-2 border-b border-gray-300 pb-1">
                    <h3 className="font-serif text-base font-semibold text-gray-900">Vendors</h3>
                    <span className="text-[10px] uppercase tracking-widest text-gray-400">not seated</span>
                    <span className="ml-auto font-mono text-[11px] text-gray-500 tabular-nums">
                        {fed.length}/{list.length} eating
                    </span>
                </div>
                {fed.length > 0 && <TallyLine people={fed} compact />}
                {unfed.length > 0 && (
                    <p className="mt-1 text-[10px] text-gray-500">
                        No meal: {unfed.map(v => v.name).join(', ')}
                    </p>
                )}
            </section>
        );
    }

    return (
        <section className="mb-7 break-inside-avoid">
            <div className="flex items-baseline gap-2 border-b border-gray-300 pb-1">
                <h3 className="font-serif text-base font-semibold text-gray-900">Vendors</h3>
                <span className="text-[10px] uppercase tracking-widest text-gray-400">not seated</span>
                <span className="ml-auto font-mono text-[11px] text-gray-500 tabular-nums">
                    {fed.length}/{list.length} eating
                </span>
            </div>
            {fed.length > 0 && <TallyLine people={fed} lead="plates" />}
            {list.length === 0 ? (
                <p className="mt-2 text-[11px] italic text-gray-400">No vendors added yet.</p>
            ) : (
                <table className="w-full mt-2 text-[11.5px] border-collapse">
                    <thead>
                        <tr className="text-[9px] uppercase tracking-widest text-gray-400">
                            <th className="text-left font-semibold pb-1 pr-2">Role</th>
                            <th className="text-left font-semibold pb-1 pr-2">Name</th>
                            <th className="text-left font-semibold pb-1 pr-2 w-14">Meal</th>
                            <th className="text-right font-semibold pb-1">Dietary</th>
                        </tr>
                    </thead>
                    <tbody>
                        {list.map(vendor => (
                            <tr key={vendor.id} className="border-t border-gray-100 align-top">
                                <td className="py-1 pr-2 text-gray-500">{vendor.role || '—'}</td>
                                <td className={`py-1 pr-2 font-medium ${vendor.needs_meal ? 'text-gray-900' : 'text-gray-400'}`}>
                                    {vendor.name}
                                    {vendor.company && <span className="text-gray-400"> · {vendor.company}</span>}
                                    {vendor.note && <span className="block text-[10px] italic text-gray-500">{vendor.note}</span>}
                                </td>
                                <td className="py-1 pr-2 text-[10px] uppercase tracking-wide text-gray-500">
                                    {vendor.needs_meal ? 'Yes' : 'No'}
                                </td>
                                <td className="py-1 text-right whitespace-nowrap">
                                    {vendor.needs_meal ? <Diet diet={vendor.diet} /> : <span className="text-gray-300">—</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}

function Legend() {
    return (
        <div className="mb-5 px-3 py-2 bg-gray-50 rounded flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-600">
            {DIET_CODES.map(code => (
                <span key={code} className="inline-flex items-center gap-1.5">
                    <Chip code={code} />{DIET_LABELS[code]}
                </span>
            ))}
        </div>
    );
}

function SheetHeader({ data, subtitle }: { data: SeatingExportData; subtitle: string }) {
    const printed = new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    const meta = [subtitle, data.date, data.venue, `Printed ${printed}`].filter(Boolean) as string[];
    return (
        <header className="border-b-2 border-gray-900 pb-3 mb-5">
            <h2 className="font-serif text-xl font-semibold text-gray-900">{data.title}</h2>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[10px] text-gray-500">
                {meta.map(m => <span key={m}>{m}</span>)}
            </div>
        </header>
    );
}

/**
 * Where the printed copy starts a new page.
 *
 * Only drawn in the preview: on paper the break is the break, and a dashed line
 * across the top of a page would be a printed dashed line. On screen it is the
 * only way to see a page break at all.
 */
function PageBreak() {
    return (
        <div className="flex items-center gap-3 my-4 text-[9px] uppercase tracking-widest text-gray-400">
            <span className="flex-1 border-t border-dashed border-gray-300" />
            new page
            <span className="flex-1 border-t border-dashed border-gray-300" />
        </div>
    );
}

export default function SeatingExportSheet({ data, options, preview = false }: {
    data: SeatingExportData;
    options: ExportOptions;
    /** Draw the page breaks, which paper shows by simply being a new sheet. */
    preview?: boolean;
}) {
    const seated = seatedPeople(data);
    const showNames = options.detail !== 'counts';
    const showTables = options.sections === 'table' || options.sections === 'both';
    const showList = options.sections === 'list' || options.sections === 'both';
    // Counts only is a narrow column of headings and numbers — a page of it is
    // mostly margin, and thirteen tables run onto a second sheet for no reason.
    // Two columns puts a normal wedding on one page. Not when every table is
    // meant to start its own page, where columns would be arguing with that.
    // Counts only is a heading and one line of numbers per table. Two columns put
    // a normal wedding on one page; thirteen tables plus the kitchen summary and
    // the vendors no longer did, and a third column is free width rather than a
    // compromise — at 703px a column is still 215px, which the chips fit in.
    const countsMode = options.detail === 'counts' && !options.pageBreak;
    const columns = countsMode ? (data.tables.length > 8 ? 3 : 2) : 1;
    const twoColumn = countsMode;

    return (
        <div className="bg-white text-gray-900 p-8 text-[12px] leading-relaxed">
            {showTables && (
                <>
                    <SheetHeader data={data} subtitle="Seating chart · by table" />
                    {options.kitchen && (
                        <Kitchen people={seated} vendors={data.vendors} showVendors={options.vendors} />
                    )}
                    {(showNames || twoColumn) && <Legend />}
                    {data.tables.length === 0 && (
                        <p className="text-[11px] italic text-gray-400">No tables on the plan yet.</p>
                    )}
                    <div className={countsMode ? `${columns === 3 ? 'columns-3 gap-x-5' : 'columns-2 gap-x-8'}` : undefined}>
                    {data.tables.map((table, i) => (
                        <div key={table.id} className={twoColumn ? 'break-inside-avoid' : undefined}>
                            {preview && options.pageBreak && i > 0 && <PageBreak />}
                            <TableBlock table={table} options={options} compact={twoColumn} />
                        </div>
                    ))}
                    {options.unseated && data.unseated.length > 0 && (
                        <section className={`${twoColumn ? 'mb-4' : 'mb-7'} break-inside-avoid`}>
                            <div className="flex items-baseline gap-2 border-b border-gray-300 pb-1">
                                <h3 className="font-serif text-base font-semibold text-gray-900">Not seated yet</h3>
                                <span className="ml-auto font-mono text-[11px] text-gray-500 tabular-nums">
                                    {data.unseated.length}
                                </span>
                            </div>
                            {options.detail !== 'names' && <TallyLine people={data.unseated} compact={twoColumn} />}
                            {showNames && <Roster people={data.unseated} options={options} withSeat={false} />}
                        </section>
                    )}
                    </div>
                </>
            )}

            {showList && preview && showTables && <PageBreak />}
            {showList && (
                <div className={showTables ? 'break-before-page pt-2' : ''}>
                    <SheetHeader data={data} subtitle="Seating chart · every guest, A–Z" />
                    {options.kitchen && !showTables && (
                        <Kitchen people={seated} vendors={data.vendors} showVendors={options.vendors} />
                    )}
                    {options.detail !== 'names' && <TallyLine people={seated} />}
                    {showNames ? (
                        <>
                            <div className="mt-4"><Legend /></div>
                            <Roster
                                people={alphabetical(data, options.unseated)}
                                options={options}
                                withSeat={false}
                            />
                        </>
                    ) : (
                        <p className="mt-2 text-[11px] italic text-gray-400">
                            Counts only — turn on “Every name” to list the guests here.
                        </p>
                    )}
                </div>
            )}

            {/* Once, at the end, whichever sections are on — a vendor belongs to
                no table and sorts under no surname, so there is nowhere else for
                the block to sit and no reason to print it twice. */}
            {options.vendors && (
                <div className={(showTables || showList) ? (countsMode ? 'mt-4' : 'mt-8 pt-2') : ''}>
                    <Vendors vendors={data.vendors} compact={countsMode} />
                </div>
            )}

            <p className="mt-6 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
                Dietary answers come from the RSVP form. A dash means nothing was reported —
                that plate is the {NO_RESTRICTION_LABEL.toLowerCase()}.
            </p>
        </div>
    );
}
