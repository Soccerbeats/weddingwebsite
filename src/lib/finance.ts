/**
 * Finance calculation engine.
 *
 * Every derived number in the finance suite is computed here — item totals,
 * category rollups, deficits, per-payer shares, payment plans. Nothing derived
 * is ever stored, which is what keeps the numbers from drifting the way the
 * original spreadsheet did (its receipt log said $6,880 received while its
 * contributions block said $6,200).
 *
 * These are pure functions: no HTTP, no React, no database.
 */

export type QtySource = 'manual' | 'adults' | 'minors' | 'total';

export interface FinanceSettings {
    adult_count: number;
    minor_count: number;
    /** null → derive the horizon from the wedding date */
    plan_horizon_months: number | null;
    paycheck_interval_days: number;
}

export interface SubItem {
    id: number;
    item_id: number;
    name: string;
    unit_cost: number;
    quantity: number;
    sort_order: number;
}

export interface BudgetItem {
    id: number;
    category_id: number;
    name: string;
    unit_cost: number;
    quantity: number;
    qty_source: QtySource;
    use_subitems: boolean;
    is_paid: boolean;
    notes: string | null;
    sort_order: number;
    subitems: SubItem[];
}

export interface Category {
    id: number;
    name: string;
    sort_order: number;
    items: BudgetItem[];
}

export interface Payer {
    id: number;
    name: string;
    /** 0 means this payer funds nothing — their spend shows as a credit */
    share_pct: number;
    sort_order: number;
}

export interface Purchase {
    id: number;
    payer_id: number | null;
    item_id: number | null;
    /**
     * Set instead of `item_id` when a payment covers a whole section rather than
     * one line — a venue installment paying down venue + catering + bar + tax at
     * once. Mutually exclusive with `item_id`, enforced by the API.
     */
    category_id: number | null;
    description: string;
    amount: number;
    purchased_on: string | null;
    notes: string | null;
}

export interface Receipt {
    id: number;
    contributor_id: number;
    amount: number;
    received_on: string | null;
    /** optional earmark to a budget line, e.g. Kim's $1,200 → Dress */
    item_id: number | null;
    /** or to a whole section, e.g. Rob's $5,000 → the venue bill */
    category_id: number | null;
    note: string | null;
}

export interface Contributor {
    id: number;
    name: string;
    pledged: number;
    notes: string | null;
    sort_order: number;
    receipts: Receipt[];
}

export const DEFAULT_SETTINGS: FinanceSettings = {
    adult_count: 0,
    minor_count: 0,
    plan_horizon_months: null,
    paycheck_interval_days: 14,
};

const DAYS_PER_MONTH = 30.4375;

function num(value: unknown): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
}

/** Round to cents, avoiding float dust like 7923.129999999999. */
export function money(value: number): number {
    return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Resolve a line's quantity. `qty_source` lets Dinner track the adult count and
 * Dinner Kids track the minor count, the way the spreadsheet's formulas did.
 */
export function effectiveQuantity(item: BudgetItem, settings: FinanceSettings): number {
    switch (item.qty_source) {
        case 'adults': return num(settings.adult_count);
        case 'minors': return num(settings.minor_count);
        case 'total': return num(settings.adult_count) + num(settings.minor_count);
        default: return num(item.quantity);
    }
}

export function subItemTotal(sub: SubItem): number {
    return money(num(sub.unit_cost) * num(sub.quantity));
}

/**
 * A line is either a flat cost × quantity, or the sum of its sub-items — which
 * is how the Appetizers line reaches $1,700 from six component dishes.
 */
export function itemTotal(item: BudgetItem, settings: FinanceSettings): number {
    if (item.use_subitems) {
        return money((item.subitems || []).reduce((sum, s) => sum + subItemTotal(s), 0));
    }
    return money(num(item.unit_cost) * effectiveQuantity(item, settings));
}

export function categoryTotal(category: Category, settings: FinanceSettings): number {
    return money((category.items || []).reduce((sum, i) => sum + itemTotal(i, settings), 0));
}

export function budgetTotal(categories: Category[], settings: FinanceSettings): number {
    return money(categories.reduce((sum, c) => sum + categoryTotal(c, settings), 0));
}

/**
 * A contributor may hand over more than they pledged — Kim pledged $1,200 but
 * gave $1,880 across two receipts. Taking the greater of the two keeps that
 * over-delivery in the optimistic projection instead of discarding it.
 */
export function contributorExpected(contributor: Contributor): number {
    const received = contributorReceived(contributor);
    return money(Math.max(num(contributor.pledged), received));
}

export function contributorReceived(contributor: Contributor): number {
    return money((contributor.receipts || []).reduce((sum, r) => sum + num(r.amount), 0));
}

export interface PlanBreakdown {
    perMonth: number;
    perPaycheck: number;
    perDay: number;
}

export interface PayerSummary {
    id: number;
    name: string;
    sharePct: number;
    /** true when this payer funds none of the deficit — a helper, not a debtor */
    isContributorOnly: boolean;
    /** share of the deficit if every pledge lands */
    sharePledged: number;
    /** share of the deficit counting only cash in hand */
    shareCash: number;
    /** every dollar this payer has laid out, budgeted or not */
    spent: number;
    /**
     * The part of `spent` attached to a budget line or section. Only this counts
     * against their share: buying something that isn't in the budget doesn't
     * discharge a budget obligation.
     */
    spentOnBudget: number;
    /** negative means this payer is ahead of their share */
    remainingPledged: number;
    remainingCash: number;
    planPledged: PlanBreakdown;
    planCash: PlanBreakdown;
}

export interface ItemSummary {
    id: number;
    name: string;
    categoryId: number;
    categoryName: string;
    total: number;
    /** share of the grand total, matching the spreadsheet's % column */
    pct: number;
    /** paid from a payer's own pocket */
    ownSpent: number;
    /** gift money earmarked here — it paid this bill just the same */
    giftApplied: number;
    /** ownSpent + giftApplied: everything that has gone to this line */
    paid: number;
    /** paid − budgeted; positive is an overrun */
    variance: number;
    isPaid: boolean;
}

export interface CategorySummary {
    id: number;
    name: string;
    total: number;
    pct: number;
    /**
     * Everything that has gone to this section's bill, whoever's money it was:
     * lump-sum installments + line-level payments + earmarked gift money.
     */
    paid: number;
    /** paid out of a payer's own pocket (installments + line-level) */
    ownSpent: number;
    /** own-pocket installments against the section as a whole */
    directSpent: number;
    /** own-pocket payments tagged to individual lines */
    itemSpent: number;
    /** gift money earmarked to this section or its lines */
    giftApplied: number;
    /** budget − paid; negative means the section is overpaid */
    remaining: number;
    /** how far through the section's budget the payments have got */
    paidPct: number;
    /** lump-sum payments against the section: own installments + earmarked gifts */
    installmentCount: number;
}

export interface FinanceSummary {
    budgetTotal: number;
    /**
     * Paid by the payers themselves. Deliberately excludes gift money, because
     * the deficit has already subtracted contributions — counting them here too
     * would double-count and understate what's left to pay.
     */
    outOfPocketTotal: number;
    /**
     * The part of `outOfPocketTotal` attached to a budget line or section.
     *
     * Budget-progress figures use this, never the raw total. Spending on
     * something that isn't in the budget can't reduce what the budget still
     * owes — counting it made the headline "still owed" disagree with the sum of
     * its own sections by exactly the untracked amount.
     */
    budgetedOutOfPocket: number;
    /** received gift money that has been earmarked to a section or line */
    giftAppliedTotal: number;
    /** everything paid toward the budget so far, from any source */
    paidTotal: number;
    /** all cash out, including spending that isn't in the budget */
    cashOutTotal: number;
    /** received gift money not yet earmarked anywhere — cash still in hand */
    giftUnapplied: number;
    /** budget − paidTotal: what the vendors are still owed */
    billRemaining: number;
    /** true when contributions already exceed the whole budget */
    isOverFunded: boolean;
    /** shares don't add up, so part of the deficit is assigned to nobody */
    unallocatedDeficitCash: number;
    pledgedTotal: number;
    receivedTotal: number;
    outstandingPledges: number;
    /** budget − pledges, i.e. what the couple covers if everything lands */
    deficitPledged: number;
    /** budget − cash received, the conservative figure */
    deficitCash: number;
    /** deficit minus what the payers have already paid out of pocket */
    stillToSpendPledged: number;
    stillToSpendCash: number;
    categories: CategorySummary[];
    items: ItemSummary[];
    payers: PayerSummary[];
    unlinkedSpend: number;
    paidItemCount: number;
    itemCount: number;
    horizon: { days: number; months: number; paychecks: number; derived: boolean };
}

function buildPlan(amount: number, horizon: { days: number; months: number; paychecks: number }): PlanBreakdown {
    // A payer who is already ahead owes nothing per period, not a negative amount.
    const owed = Math.max(0, amount);
    return {
        perMonth: horizon.months > 0 ? money(owed / horizon.months) : money(owed),
        perPaycheck: horizon.paychecks > 0 ? money(owed / horizon.paychecks) : money(owed),
        perDay: horizon.days > 0 ? money(owed / horizon.days) : money(owed),
    };
}

/**
 * Time left to spread payments over. Derived from the real wedding date so the
 * plan tightens on its own as the date approaches — the spreadsheet hard-coded
 * "12 Months" and never updated it.
 */
export function computeHorizon(
    settings: FinanceSettings,
    weddingDate: string | null | undefined,
    now: Date,
): { days: number; months: number; paychecks: number; derived: boolean } {
    const interval = num(settings.paycheck_interval_days) || 14;
    let days: number;
    let derived: boolean;

    if (settings.plan_horizon_months != null && num(settings.plan_horizon_months) > 0) {
        days = num(settings.plan_horizon_months) * DAYS_PER_MONTH;
        derived = false;
    } else {
        const target = weddingDate ? new Date(weddingDate) : null;
        const valid = target && !isNaN(target.getTime());
        days = valid ? (target.getTime() - now.getTime()) / 86_400_000 : 0;
        derived = true;
    }

    days = Math.max(0, days);
    return {
        days: Math.ceil(days),
        months: days / DAYS_PER_MONTH,
        paychecks: days / interval,
        derived,
    };
}

export interface SummaryInput {
    categories: Category[];
    payers: Payer[];
    purchases: Purchase[];
    contributors: Contributor[];
    settings: FinanceSettings;
    weddingDate?: string | null;
    now?: Date;
}

export function buildSummary(input: SummaryInput): FinanceSummary {
    const { categories, payers, purchases, contributors, settings } = input;
    const now = input.now ?? new Date();

    const total = budgetTotal(categories, settings);

    const spentByItem = new Map<number, number>();
    const spentByCategory = new Map<number, number>();
    const installmentsByCategory = new Map<number, number>();
    let unlinkedSpend = 0;
    let outOfPocketTotal = 0;
    let budgetedOutOfPocket = 0;
    const spentByPayer = new Map<number, number>();
    const budgetedByPayer = new Map<number, number>();
    for (const p of purchases) {
        const amount = num(p.amount);
        outOfPocketTotal += amount;
        const attributed = p.item_id != null || p.category_id != null;
        if (attributed) budgetedOutOfPocket += amount;
        if (p.payer_id != null) {
            spentByPayer.set(p.payer_id, (spentByPayer.get(p.payer_id) ?? 0) + amount);
            if (attributed) {
                budgetedByPayer.set(p.payer_id, (budgetedByPayer.get(p.payer_id) ?? 0) + amount);
            }
        }
        // item_id wins over category_id so a payment is never counted twice.
        if (p.item_id != null) {
            spentByItem.set(p.item_id, (spentByItem.get(p.item_id) ?? 0) + amount);
        } else if (p.category_id != null) {
            spentByCategory.set(p.category_id, (spentByCategory.get(p.category_id) ?? 0) + amount);
            installmentsByCategory.set(p.category_id, (installmentsByCategory.get(p.category_id) ?? 0) + 1);
        } else {
            unlinkedSpend += amount;
        }
    }
    outOfPocketTotal = money(outOfPocketTotal);
    budgetedOutOfPocket = money(budgetedOutOfPocket);

    // Earmarked gift money paid a vendor bill exactly like an own-pocket payment
    // did — Rob's $5,000 went to the venue. It counts toward the bill, but never
    // toward a payer's out-of-pocket total.
    const giftByItem = new Map<number, number>();
    const giftByCategory = new Map<number, number>();
    let giftAppliedTotal = 0;
    let giftUnapplied = 0;
    for (const c of contributors) {
        for (const r of c.receipts || []) {
            const amount = num(r.amount);
            if (r.item_id != null) {
                giftByItem.set(r.item_id, (giftByItem.get(r.item_id) ?? 0) + amount);
                giftAppliedTotal += amount;
            } else if (r.category_id != null) {
                giftByCategory.set(r.category_id, (giftByCategory.get(r.category_id) ?? 0) + amount);
                installmentsByCategory.set(r.category_id, (installmentsByCategory.get(r.category_id) ?? 0) + 1);
                giftAppliedTotal += amount;
            } else {
                giftUnapplied += amount;
            }
        }
    }
    giftAppliedTotal = money(giftAppliedTotal);
    giftUnapplied = money(giftUnapplied);

    const pct = (value: number) => (total > 0 ? money((value / total) * 100) : 0);

    const items: ItemSummary[] = [];
    const categorySummaries: CategorySummary[] = [];
    let paidItemCount = 0;
    let itemCount = 0;

    for (const category of categories) {
        let itemSpent = 0;
        let itemGift = 0;
        for (const item of category.items || []) {
            const lineTotal = itemTotal(item, settings);
            const ownSpent = money(spentByItem.get(item.id) ?? 0);
            const giftApplied = money(giftByItem.get(item.id) ?? 0);
            const paid = money(ownSpent + giftApplied);
            itemSpent += ownSpent;
            itemGift += giftApplied;
            itemCount += 1;
            if (item.is_paid) paidItemCount += 1;
            items.push({
                id: item.id,
                name: item.name,
                categoryId: category.id,
                categoryName: category.name,
                total: lineTotal,
                pct: pct(lineTotal),
                ownSpent,
                giftApplied,
                paid,
                variance: money(paid - lineTotal),
                isPaid: item.is_paid,
            });
        }
        const catTotal = categoryTotal(category, settings);
        const directSpent = money(spentByCategory.get(category.id) ?? 0);
        const directGift = money(giftByCategory.get(category.id) ?? 0);
        const ownSpent = money(directSpent + itemSpent);
        const giftApplied = money(directGift + itemGift);
        const paid = money(ownSpent + giftApplied);
        categorySummaries.push({
            id: category.id,
            name: category.name,
            total: catTotal,
            pct: pct(catTotal),
            paid,
            ownSpent,
            directSpent,
            itemSpent: money(itemSpent),
            giftApplied,
            remaining: money(catTotal - paid),
            paidPct: catTotal > 0 ? money((paid / catTotal) * 100) : 0,
            installmentCount: installmentsByCategory.get(category.id) ?? 0,
        });
    }

    const pledgedTotal = money(contributors.reduce((sum, c) => sum + contributorExpected(c), 0));
    const receivedTotal = money(contributors.reduce((sum, c) => sum + contributorReceived(c), 0));

    const deficitPledged = money(total - pledgedTotal);
    const deficitCash = money(total - receivedTotal);

    const horizon = computeHorizon(settings, input.weddingDate, now);

    // Shares are normalised so the split always accounts for the whole deficit,
    // even if the percentages the user typed don't add up to exactly 100.
    const shareSum = payers.reduce((sum, p) => sum + num(p.share_pct), 0);
    const payerSummaries: PayerSummary[] = payers.map((payer) => {
        const weight = shareSum > 0 ? num(payer.share_pct) / shareSum : 0;
        const sharePledged = money(deficitPledged * weight);
        const shareCash = money(deficitCash * weight);
        const spent = money(spentByPayer.get(payer.id) ?? 0);
        const spentOnBudget = money(budgetedByPayer.get(payer.id) ?? 0);
        const remainingPledged = money(sharePledged - spentOnBudget);
        const remainingCash = money(shareCash - spentOnBudget);
        return {
            id: payer.id,
            name: payer.name,
            sharePct: num(payer.share_pct),
            isContributorOnly: num(payer.share_pct) <= 0,
            sharePledged,
            shareCash,
            spent,
            spentOnBudget,
            remainingPledged,
            remainingCash,
            planPledged: buildPlan(remainingPledged, horizon),
            planCash: buildPlan(remainingCash, horizon),
        };
    });

    const paidTotal = money(budgetedOutOfPocket + giftAppliedTotal);
    const allocated = money(payerSummaries.reduce((sum, p) => sum + p.shareCash, 0));

    return {
        budgetTotal: total,
        outOfPocketTotal,
        budgetedOutOfPocket,
        giftAppliedTotal,
        paidTotal,
        cashOutTotal: money(outOfPocketTotal + giftAppliedTotal),
        giftUnapplied,
        billRemaining: money(total - paidTotal),
        isOverFunded: deficitCash < 0,
        unallocatedDeficitCash: money(deficitCash - allocated),
        pledgedTotal,
        receivedTotal,
        outstandingPledges: money(pledgedTotal - receivedTotal),
        deficitPledged,
        deficitCash,
        stillToSpendPledged: money(deficitPledged - budgetedOutOfPocket),
        stillToSpendCash: money(deficitCash - budgetedOutOfPocket),
        categories: categorySummaries,
        items,
        payers: payerSummaries,
        unlinkedSpend: money(unlinkedSpend),
        paidItemCount,
        itemCount,
        horizon,
    };
}

export function formatMoney(value: number): string {
    const n = num(value);
    const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${n < 0 ? '-' : ''}$${s}`;
}
