import type { MfCas } from "../domain/mfCas";
import { resolveFund, sameUnits, type SipPurchase } from "../domain/fundMail";
import type { NavUpdate } from "../domain/navFiles";
import type { NpsStatement } from "../domain/npsStatement";
import type { PfPassbook } from "../domain/pfPassbook";
import {
  decideMonth,
  estimateMonths,
  looksActive,
  monthOfIso,
  monthsFullyCovered,
  toggledAutoAdd,
  usualAmounts,
  type MonthRow,
  type SavingsAccount,
  type SavingsHolding,
  type SavingsKind,
  type SavingsOverview,
} from "../domain/savings";
import type { AssetDb as SqlDb } from "./assetSql";

// The SQL of Savings, written against the same tiny adapter as assetSql.ts so one body of code runs on the phone (expo-sqlite) and in the tests (Node's
// SQLite, tests/db/savingsSql.test.ts). Every function that writes several rows is meant to run inside the caller's transaction. What each figure means
// and which one wins is in domain/savings.ts. Nothing here touches transactions, groups or balances.
export type { SqlDb };

// What an import did, for the page to say: how many months were new, changed, already the same, or left alone.
export interface ImportReport {
  what: string; // "PF passbook (2026-27)"
  unit?: "month" | "purchase"; // what added, updated and same count: months unless it says purchases
  added: number;
  updated: number;
  same: number;
  kept: number; // a figure the statement could not have had all of, so the stored one stayed
  removed: number; // estimates the passbook replaced by showing nothing for the month, or a month a statement says had no purchase
  notes: string[];
}

const newReport = (what: string): ImportReport => ({ what, added: 0, updated: 0, same: 0, kept: 0, removed: 0, notes: [] });

interface MonthDbRow {
  kind: SavingsKind;
  account: string;
  month: string;
  own_paise: number;
  employer_paise: number;
  pension_paise: number;
  source: "statement" | "estimate";
  credited_date: string | null;
}

const toMonth = (r: MonthDbRow): MonthRow => ({
  kind: r.kind,
  account: r.account,
  month: r.month,
  ownPaise: r.own_paise,
  employerPaise: r.employer_paise,
  pensionPaise: r.pension_paise,
  source: r.source,
  creditedDate: r.credited_date,
});

async function getMonth(db: SqlDb, kind: SavingsKind, account: string, month: string): Promise<MonthRow | undefined> {
  const row = await db.first<MonthDbRow>("SELECT * FROM savings_months WHERE kind = ? AND account = ? AND month = ?", [kind, account, month]);
  return row ? toMonth(row) : undefined;
}

async function putMonth(db: SqlDb, r: MonthRow): Promise<void> {
  await db.run(
    `INSERT INTO savings_months (kind, account, month, own_paise, employer_paise, pension_paise, source, credited_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (kind, account, month) DO UPDATE SET own_paise = excluded.own_paise, employer_paise = excluded.employer_paise,
       pension_paise = excluded.pension_paise, source = excluded.source, credited_date = excluded.credited_date, updated_at = datetime('now')`,
    [r.kind, r.account, r.month, r.ownPaise, r.employerPaise, r.pensionPaise, r.source, r.creditedDate],
  );
}

// Writes a statement's figure for a month by the rule in domain/savings.ts (decideMonth) and counts what happened.
async function putStatementMonth(db: SqlDb, incoming: MonthRow, statementStart: string | null, report: ImportReport): Promise<void> {
  const decision = decideMonth(await getMonth(db, incoming.kind, incoming.account, incoming.month), incoming, statementStart);
  if (decision === "add" || decision === "update") await putMonth(db, incoming);
  if (decision === "add") report.added++;
  else if (decision === "update") report.updated++;
  else if (decision === "same") report.same++;
  else report.kept++;
}

interface AccountDbRow {
  kind: "pf" | "nps";
  account: string;
  label: string | null;
  status: "ACTIVE" | "CLOSED";
  as_of: string | null;
  fy: number | null;
  value_paise: number | null;
  invested_paise: number | null;
  xirr: string | null;
  own_paise: number | null;
  employer_paise: number | null;
  pension_paise: number | null;
  auto_add: number;
  auto_from: string | null;
  est_own_paise: number;
  est_employer_paise: number;
  est_pension_paise: number;
}

const toAccount = (r: AccountDbRow): SavingsAccount => ({
  kind: r.kind,
  account: r.account,
  label: r.label,
  status: r.status,
  asOf: r.as_of,
  fy: r.fy,
  valuePaise: r.value_paise,
  investedPaise: r.invested_paise,
  xirr: r.xirr,
  ownPaise: r.own_paise,
  employerPaise: r.employer_paise,
  pensionPaise: r.pension_paise,
  autoAdd: r.auto_add === 1,
  autoFrom: r.auto_from,
  estOwnPaise: r.est_own_paise,
  estEmployerPaise: r.est_employer_paise,
  estPensionPaise: r.est_pension_paise,
});

async function getAccount(db: SqlDb, kind: "pf" | "nps", account: string): Promise<SavingsAccount | null> {
  const row = await db.first<AccountDbRow>("SELECT * FROM savings_accounts WHERE kind = ? AND account = ?", [kind, account]);
  return row ? toAccount(row) : null;
}

// ---- reading ------------------------------------------------------------------------------------------------------------------------------------

export async function loadOverview(db: SqlDb): Promise<SavingsOverview> {
  const months = await db.all<MonthDbRow>("SELECT * FROM savings_months ORDER BY month DESC, kind, account");
  const accounts = await db.all<AccountDbRow>("SELECT * FROM savings_accounts ORDER BY kind, status, created_at, account");
  const holdings = await db.all<{
    kind: "mf" | "nps";
    account: string;
    code: string;
    name: string;
    units_e4: number;
    nav_e4: number;
    value_paise: number;
    invested_paise: number | null;
    as_of: string;
    nav_date: string | null;
    live_nav_e4: number | null;
    live_nav_date: string | null;
  }>("SELECT * FROM savings_holdings ORDER BY kind, value_paise DESC, name");
  // Purchases told about by a fund house's email since the statement's date, added to each fund's units until the next CAS.
  const pending = await db.all<{ isin: string; folio: string; units: number; paid: number }>(
    `SELECT p.isin AS isin, p.folio AS folio, SUM(p.units_e4) AS units, SUM(p.net_paise + p.stamp_paise) AS paid
     FROM savings_purchases p JOIN savings_holdings h ON h.kind = 'mf' AND h.code = p.isin AND h.account = p.folio
     WHERE p.purchased_on > h.as_of GROUP BY p.isin, p.folio`,
  );
  const pendingOf = new Map(pending.map((p) => [`${p.isin}|${p.folio}`, p]));
  return {
    months: months.map(toMonth),
    accounts: accounts.map(toAccount),
    holdings: holdings.map(
      (h): SavingsHolding => ({
        pendingUnitsE4: h.kind === "mf" ? (pendingOf.get(`${h.code}|${h.account}`)?.units ?? 0) : 0,
        pendingInvestedPaise: h.kind === "mf" ? (pendingOf.get(`${h.code}|${h.account}`)?.paid ?? 0) : 0,
        kind: h.kind,
        account: h.account,
        code: h.code,
        name: h.name,
        unitsE4: h.units_e4,
        navE4: h.nav_e4,
        valuePaise: h.value_paise,
        investedPaise: h.invested_paise,
        asOf: h.as_of,
        navDate: h.nav_date,
        liveNavE4: h.live_nav_e4,
        liveNavDate: h.live_nav_date,
      }),
    ),
  };
}

// ---- PF passbook ----------------------------------------------------------------------------------------------------------------------------------

// Stores a passbook: the account (made the first time, its balances replaced when this passbook is for a later year, or the same year printed later), every
// wage month it lists (the passbook's figure always wins over an estimate), and the removal of estimates for months the passbook is already past but does
// not list (the employer did not pay them). Importing the same passbook again changes nothing.
export async function applyPfPassbook(db: SqlDb, pb: PfPassbook): Promise<ImportReport> {
  const report = newReport(`PF passbook ${pb.fyStart}-${String((pb.fyStart + 1) % 100).padStart(2, "0")}`);
  const latest = pb.contributions.length > 0 ? pb.contributions[pb.contributions.length - 1].month : null;
  const existing = await getAccount(db, "pf", pb.memberId);

  if (!existing) {
    const active = looksActive(latest, pb.printedOn);
    const usual = usualAmounts(pb.contributions);
    await db.run(
      `INSERT INTO savings_accounts (kind, account, label, status, as_of, fy, own_paise, employer_paise, pension_paise, est_own_paise, est_employer_paise, est_pension_paise)
       VALUES ('pf', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pb.memberId, pb.establishmentId, active ? "ACTIVE" : "CLOSED", pb.printedOn, pb.fyStart, pb.closing.ownPaise, pb.closing.employerPaise, pb.closing.pensionPaise,
        active ? usual.own : 0, active ? usual.employer : 0, active ? usual.pension : 0],
    );
    report.notes.push(`New PF account …${pb.memberId.slice(-4)}, marked ${active ? "active" : "closed"}. You can change that on the Savings page.`);
  } else {
    const newer = existing.fy === null || existing.asOf === null || pb.fyStart > existing.fy || (pb.fyStart === existing.fy && pb.printedOn >= existing.asOf);
    if (newer) {
      await db.run(
        "UPDATE savings_accounts SET as_of = ?, fy = ?, own_paise = ?, employer_paise = ?, pension_paise = ?, label = COALESCE(label, ?), updated_at = datetime('now') WHERE kind = 'pf' AND account = ?",
        [pb.printedOn, pb.fyStart, pb.closing.ownPaise, pb.closing.employerPaise, pb.closing.pensionPaise, pb.establishmentId, pb.memberId],
      );
      // Whether the account is still being paid into, and what a month usually is, are read from the passbook every time (never typed): the account is active when
      // the passbook shows a contribution from the last few months, and the usual amounts are the newest month's. A passbook with no contribution at all (a new
      // financial year with nothing credited yet) says nothing about either, so they stay as they were. An account that is no longer active stops adding estimates.
      if (latest) {
        const active = looksActive(latest, pb.printedOn);
        const usual = usualAmounts(pb.contributions);
        await db.run(
          `UPDATE savings_accounts SET status = ?, auto_add = CASE WHEN ? = 1 THEN auto_add ELSE 0 END, auto_from = CASE WHEN ? = 1 THEN auto_from ELSE NULL END,
             est_own_paise = ?, est_employer_paise = ?, est_pension_paise = ? WHERE kind = 'pf' AND account = ?`,
          [active ? "ACTIVE" : "CLOSED", active ? 1 : 0, active ? 1 : 0, active ? usual.own : 0, active ? usual.employer : 0, active ? usual.pension : 0, pb.memberId],
        );
        // Estimates for months the passbook has not reached follow the new usual amounts.
        if (active) {
          await db.run(
            "UPDATE savings_months SET own_paise = ?, employer_paise = ?, pension_paise = ?, updated_at = datetime('now') WHERE kind = 'pf' AND account = ? AND source = 'estimate'",
            [usual.own, usual.employer, usual.pension, pb.memberId],
          );
        }
      }
    } else {
      report.notes.push("This passbook is older than the one already imported, so the balances were kept.");
    }
  }

  for (const c of pb.contributions) {
    await putStatementMonth(db, { kind: "pf", account: pb.memberId, month: c.month, ownPaise: c.ownPaise, employerPaise: c.employerPaise, pensionPaise: c.pensionPaise, source: "statement", creditedDate: c.creditedDate }, null, report);
  }
  if (latest) {
    const listed = pb.contributions.map((c) => c.month);
    const stale = await db.all<{ month: string }>("SELECT month FROM savings_months WHERE kind = 'pf' AND account = ? AND source = 'estimate' AND month <= ?", [pb.memberId, latest]);
    for (const s of stale.filter((m) => !listed.includes(m.month))) {
      await db.run("DELETE FROM savings_months WHERE kind = 'pf' AND account = ? AND month = ?", [pb.memberId, s.month]);
      report.removed++;
    }
  }
  return report;
}

// ---- NPS statement --------------------------------------------------------------------------------------------------------------------------------

export async function applyNpsStatement(db: SqlDb, st: NpsStatement): Promise<ImportReport> {
  const report = newReport("NPS statement");
  const existing = await getAccount(db, "nps", st.pran);
  const newer = !existing || existing.asOf === null || st.periodEnd >= existing.asOf;
  if (!existing) {
    await db.run("INSERT INTO savings_accounts (kind, account, label, status, as_of, value_paise, invested_paise, xirr) VALUES ('nps', ?, 'NPS Tier I', 'ACTIVE', ?, ?, ?, ?)", [st.pran, st.periodEnd, st.valuePaise, st.contributedPaise, st.xirr]);
  } else if (newer) {
    await db.run("UPDATE savings_accounts SET as_of = ?, value_paise = ?, invested_paise = ?, xirr = ?, updated_at = datetime('now') WHERE kind = 'nps' AND account = ?", [st.periodEnd, st.valuePaise, st.contributedPaise, st.xirr, st.pran]);
  } else {
    report.notes.push("This statement is older than the one already imported, so the value and units were kept.");
  }
  if (newer) {
    // The scheme units the statement printed replace the old ones; the live NAV is looked up again.
    await db.run("DELETE FROM savings_holdings WHERE kind = 'nps' AND account = ?", [st.pran]);
    for (const h of st.holdings) {
      await db.run(
        "INSERT INTO savings_holdings (kind, account, code, name, units_e4, nav_e4, value_paise, invested_paise, as_of, nav_date) VALUES ('nps', ?, ?, ?, ?, ?, ?, NULL, ?, ?)",
        [st.pran, h.name, h.name, h.unitsE4, h.navE4, h.valuePaise, st.periodEnd, st.navDate],
      );
    }
  }
  for (const c of st.contributions) {
    await putStatementMonth(db, { kind: "nps", account: st.pran, month: c.month, ownPaise: c.ownPaise, employerPaise: c.employerPaise, pensionPaise: 0, source: "statement", creditedDate: c.creditedDate }, st.periodStart, report);
  }
  return report;
}

// ---- mutual fund CAS ------------------------------------------------------------------------------------------------------------------------------

export async function applyMfCas(db: SqlDb, cas: MfCas): Promise<ImportReport> {
  const report = newReport("Mutual fund statement");
  const latest = await db.first<{ as_of: string | null }>("SELECT MAX(as_of) AS as_of FROM savings_holdings WHERE kind = 'mf'");
  if (!latest?.as_of || cas.valuationDate >= latest.as_of) {
    // A CAS lists every folio that still holds units, so it replaces the whole list.
    await db.run("DELETE FROM savings_holdings WHERE kind = 'mf'");
    for (const h of cas.holdings) {
      await db.run(
        "INSERT INTO savings_holdings (kind, account, code, name, units_e4, nav_e4, value_paise, invested_paise, as_of, nav_date) VALUES ('mf', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [h.folio, h.isin, h.name, h.unitsE4, h.navE4, h.valuePaise, h.investedPaise, cas.valuationDate, cas.valuationDate],
      );
    }
  } else {
    report.notes.push("This statement is older than the one already imported, so the funds and units were kept.");
  }

  // Each month the statement covers from its first day to its last gets one total across every fund. A month it covers only in part is left alone.
  const totals = new Map<string, number>();
  for (const p of cas.purchases) totals.set(monthOfIso(p.date), (totals.get(monthOfIso(p.date)) ?? 0) + p.amountPaise);
  const covered = monthsFullyCovered(cas.periodStart, cas.periodEnd);
  for (const month of covered) {
    const total = totals.get(month) ?? 0;
    if (total === 0) {
      const had = await getMonth(db, "mf", "", month);
      if (had) {
        await db.run("DELETE FROM savings_months WHERE kind = 'mf' AND account = '' AND month = ?", [month]);
        report.removed++;
      }
      continue;
    }
    await putStatementMonth(db, { kind: "mf", account: "", month, ownPaise: total, employerPaise: 0, pensionPaise: 0, source: "statement", creditedDate: null }, null, report);
  }
  // A purchase a confirmation email told about is part of the statement now, for every month the CAS covers (and anything up to its date), so it is dropped.
  await db.run("DELETE FROM savings_purchases WHERE purchased_on <= ?", [cas.valuationDate]);
  for (const month of covered) await db.run("DELETE FROM savings_purchases WHERE substr(purchased_on, 1, 7) = ?", [month]);
  const partial = [...totals.keys()].filter((m) => !covered.includes(m));
  if (partial.length > 0) report.notes.push(`Purchases in ${partial.join(", ")} were not counted: the statement covers only part of that month. A statement for the whole month will add them.`);
  return report;
}

// ---- the PF estimate ------------------------------------------------------------------------------------------------------------------------------

// Adds the estimate rows that are due: for every active PF account whose switch is on, each month from the one it was turned on to this month that has no
// figure yet, with the account's usual amounts. Never changes a month that has a figure. Returns how many were added.
export async function fillEstimates(db: SqlDb, now: Date): Promise<number> {
  let added = 0;
  const rows = await db.all<AccountDbRow>("SELECT * FROM savings_accounts WHERE kind = 'pf' AND status = 'ACTIVE' AND auto_add = 1");
  for (const row of rows) {
    const account = toAccount(row);
    if (account.estOwnPaise + account.estEmployerPaise + account.estPensionPaise === 0) continue;
    const have = new Set((await db.all<{ month: string }>("SELECT month FROM savings_months WHERE kind = 'pf' AND account = ?", [account.account])).map((m) => m.month));
    for (const month of estimateMonths(account, have, now)) {
      await putMonth(db, { kind: "pf", account: account.account, month, ownPaise: account.estOwnPaise, employerPaise: account.estEmployerPaise, pensionPaise: account.estPensionPaise, source: "estimate", creditedDate: null });
      added++;
    }
  }
  return added;
}

// The "add each month" switch of a PF account. Turning it on starts from this month (months it was off for are never filled in) and adds this month's
// estimate at once; turning it off adds nothing more but leaves the estimates already there.
export async function setPfAutoAdd(db: SqlDb, account: string, on: boolean, now: Date): Promise<void> {
  const row = await getAccount(db, "pf", account);
  if (!row) throw new Error("That PF account is not there any more.");
  const next = toggledAutoAdd(row, on, now);
  await db.run("UPDATE savings_accounts SET auto_add = ?, auto_from = ?, updated_at = datetime('now') WHERE kind = 'pf' AND account = ?", [next.autoAdd ? 1 : 0, next.autoFrom, account]);
  if (next.autoAdd) await fillEstimates(db, now);
}

// ---- purchases told about by a fund house's email -------------------------------------------------------------------------------------------------------

interface PurchaseRow {
  id: number;
  isin: string;
  folio: string;
  purchased_on: string;
  units_e4: number;
  net_paise: number;
  stamp_paise: number;
}

// Stores the purchases from a confirmation email (or a fund house's statement PDF) until the next CAS. A purchase belongs to one of the funds in the last CAS (by ISIN, folio or
// name; a fund that is not there is left out and said so), and one dated on or before that CAS is already in it, so it is left out too. Two purchases are the same when the fund,
// the day and the units agree (to the last digit printed), so the same email twice, or a statement that lists an earlier purchase again, adds nothing; two real purchases
// that look identical stay two, because the rows that agree are counted. Then each month that has purchases and no CAS figure gets its total from them.
export async function applySipPurchases(db: SqlDb, purchases: readonly SipPurchase[], what: string): Promise<ImportReport> {
  const report: ImportReport = { ...newReport(what), unit: "purchase" };
  const holdings = await db.all<{ code: string; account: string; name: string; as_of: string }>("SELECT code, account, name, as_of FROM savings_holdings WHERE kind = 'mf'");
  if (holdings.length === 0) {
    report.notes.push("Import your mutual fund statement (CAS) first, so the app knows which funds you hold.");
    return report;
  }
  const refs = holdings.map((h) => ({ code: h.code, account: h.account, name: h.name, asOf: h.as_of }));

  // The purchases of this document, by fund and day, with how many look alike.
  const groups: { isin: string; folio: string; date: string; units: number; count: number; net: number; stamp: number; nav: number | null }[] = [];
  const unknown = new Set<string>();
  for (const p of purchases) {
    const fund = resolveFund(p, refs);
    if (!fund) {
      unknown.add(p.name ?? p.isin ?? p.folio ?? "a fund");
      continue;
    }
    if (p.date <= fund.asOf) {
      report.kept++; // already in the CAS
      continue;
    }
    const same = groups.find((g) => g.isin === fund.code && g.folio === fund.account && g.date === p.date && sameUnits(g.units, p.unitsE4));
    if (same) same.count++;
    else groups.push({ isin: fund.code, folio: fund.account, date: p.date, units: p.unitsE4, count: 1, net: p.netPaise, stamp: p.stampPaise, nav: p.navE4 });
  }
  for (const g of groups) {
    const have = (await db.all<PurchaseRow>("SELECT * FROM savings_purchases WHERE isin = ? AND folio = ? AND purchased_on = ?", [g.isin, g.folio, g.date])).filter((r) => sameUnits(r.units_e4, g.units)).length;
    const missing = Math.max(0, g.count - have);
    for (let i = 0; i < missing; i++) {
      await db.run("INSERT INTO savings_purchases (isin, folio, purchased_on, units_e4, net_paise, stamp_paise, nav_e4) VALUES (?, ?, ?, ?, ?, ?, ?)", [g.isin, g.folio, g.date, g.units, g.net, g.stamp, g.nav]);
    }
    report.added += missing;
    report.same += g.count - missing;
  }
  if (unknown.size > 0) report.notes.push(`Not in your CAS, so left out: ${[...unknown].join(", ")}.`);

  // Months that have purchases and no CAS figure take their total from them (a CAS figure is never touched).
  const months = await db.all<{ month: string; paid: number }>("SELECT substr(purchased_on, 1, 7) AS month, SUM(net_paise + stamp_paise) AS paid FROM savings_purchases GROUP BY month");
  for (const m of months) {
    const had = await getMonth(db, "mf", "", m.month);
    if (had?.source === "statement") continue;
    await putMonth(db, { kind: "mf", account: "", month: m.month, ownPaise: m.paid, employerPaise: 0, pensionPaise: 0, source: "estimate", creditedDate: null });
  }
  return report;
}

// ---- the live NAV ---------------------------------------------------------------------------------------------------------------------------------

// Records the newest NAV found online for each holding (never an older one than the holding already has).
export async function applyLiveNavs(db: SqlDb, updates: readonly NavUpdate[]): Promise<void> {
  for (const u of updates) {
    await db.run(
      "UPDATE savings_holdings SET live_nav_e4 = ?, live_nav_date = ?, updated_at = datetime('now') WHERE kind = ? AND account = ? AND code = ? AND (live_nav_date IS NULL OR live_nav_date <= ?)",
      [u.navE4, u.date, u.kind, u.account, u.code, u.date],
    );
  }
}
