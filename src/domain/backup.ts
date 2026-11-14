// The export/import file: a CSV that opens in Excel, with everything stored on the device.
// The AI API key is deliberately not part of it.
//
// Layout (one header row, then one row per line of data, blocks side by side):
//   [ transactions ... ] 5 empty columns [ Category List | Subcategory List | Subcategory Description ] 5 empty columns [ Payment Mode List ]
//   5 empty columns [ Groups Id | Name | Start Date | End Date | Status | Parent Id | Pinned | Held ]
//   5 empty columns [ Occasions Id | Title | Date | Status ] 5 empty columns [ Gifts Id | Occasion Id | Occasion | Name | Direction | Type | Value | Unit | Rate | Note | Status | Created | Updated ]
//   5 empty columns [ Assets Id | Type | Name | Quantity | Unit | Purity | Invested | Acquired | Description | Gift Id | Lender | Ticket | Pledged On | Due On | Loan | Pledge Note | Status | Created | Updated ]
//   5 empty columns [ Journeys Id | Label | Date | Booking | Alarm Times | Note | Created | Booked | PNR ]
//   5 empty columns [ Asset For List ] 5 empty columns [ Asset Item List ]
//   5 empty columns [ Exchanges Id | Date | Shop | Extra | Note | Status | Created | Updated ]
//   5 empty columns [ Savings Months Kind | Account | Month | Own | Employer | Pension | Source | Credited ]
//   5 empty columns [ Savings Accounts Kind | Account | Label | Status | As Of | FY | Value | Invested | XIRR | Own | Employer | Pension | Auto Add | Auto From | Est Own | Est Employer | Est Pension ]
//   5 empty columns [ Savings Holdings Kind | Account | Code | Name | Units E4 | NAV E4 | Value | Invested | As Of | NAV Date | Live NAV E4 | Live NAV Date ]
//   5 empty columns [ Template Groups Id | Parent Id | Name | Sort | Opening Income | Funds Here | Home ]
//   5 empty columns [ Template Lines Id | Group Id | Sort | Direction | Category | Subcategory | Payee | Payment Method | Description | Amount | Day | Creates Group Id ]
//   5 empty columns [ Template Setups Month | Template Group Id | Group Id | Funds Here ]
// Version 10 added the three monthly-template blocks (domain/monthTemplate.ts). A file without them restores with no template.
// Version 9 added the three Savings blocks at the end (mutual fund, NPS and PF figures; see domain/savings.ts). A file without them restores with no savings.
// Version 8 added Booked and PNR to each journey (the last two columns of the journeys block; a file without them restores every journey as not
// booked). Version 7 added For, Item and Exchange to each asset (the Assets block ends with Assets For | Assets Item | Assets Exchange Id), the two
// lists behind the For and Item dropdowns, and the exchanges with a shop. A file without them (version 6 or older) restores with each asset's
// old name split into For and Item (domain/assets.ts, deriveForAndItem), no exchanges, and the lists made from the assets.
// Files made before gifts existed have neither block (version 3 added them); they restore with no gifts. Files made before assets
// existed have no assets block (version 4); they restore with no assets. Files made before train journeys were included have no
// journeys block (version 5); they restore with none. Only journeys still ahead are written (one that is over has no alarm to set).
// Files without a Subcategory Description column (made before descriptions existed) simply have none.
// Version 1 files have no Group Id column and no groups block; their transactions all go to Main. Files without Parent Id and
// Pinned (made before groups could sit inside groups) restore every group as a separate one, not pinned.
// Columns are found by their header names, so reordering them in Excel does not matter.
// Files from the first version of the app were JSON; those are still read.

import Papa from "papaparse";
import { BOOKINGS, MAX_ALARMS, bookingInfo, normalisePnr, normalizeTimes, validatePnr, type Booking } from "./trainAlarms";
import { monthFromWords } from "./pdfLines";
import type { MonthRow, SavingsAccount, SavingsHolding } from "./savings";
import type { MonthSetup, TemplateGroup, TemplateLine } from "./monthTemplate";
import { ASSET_TYPES, ASSET_UNITS, GOLD_PURITIES, deriveForAndItem, normaliseAsset, type AssetFields, type AssetStatus } from "./assets";
import { gramsInputText, parseGramsInput, type GiftDirection, type GiftType, type GiftUnit } from "./gifts";
import { MAIN_GROUP_ID, type GroupStatus } from "./groups";
import { cleanDescription } from "./masterData";
import { parseAmountPaise, parseDate } from "./statementParser";
import { PENDING_AI, fallbackFor } from "./taxonomy";
import { isTransactionSource, parseSourceText, type TransactionSource } from "./transactionSource";

export const BACKUP_FORMAT = "csk-manager-backup";
// The name the first version (JSON files) wrote when the app was called Expense Manager; such files still restore.
const LEGACY_BACKUP_FORMAT = "expense-manager-backup";
// 6: the Source column can also be "Sms" (an entry made by the automatic bank SMS route); an older app refuses a newer file cleanly.
// 7: assets have a For and an Item (and the name is made from them), pieces can belong to an exchange with a shop, and the file carries the
// For and Item lists and the exchanges.
// 8: journeys can be booked, with an optional PNR.
// 9: Savings (mutual fund, NPS and PF figures, the PF accounts and the units of each fund and NPS scheme).
// 10: the monthly template (its groups, their entries, and which month each group was set up for).
export const BACKUP_VERSION = 10;

export interface BackupTransaction {
  id: string;
  dedupeKey: string | null;
  source: TransactionSource; // written when the row is first inserted and never changed (see domain/transactionSource.ts)
  status: "ACTIVE" | "DELETED";
  txnDate: string;
  direction: "debit" | "credit";
  amountPaise: number;
  balancePaise: number | null;
  category: string;
  subcategory: string;
  payee: string | null;
  paymentMethod: string | null;
  description: string | null;
  narration: string | null;
  vpa: string | null;
  note: string | null;
  payeeBank: string | null;
  upiRef: string | null;
  classifiedBy: string;
  groupId: string;
  createdGroupId: string | null; // the group this entry was used to create
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BackupGroup {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  status: GroupStatus;
  parentId: string | null; // the group it sits under, if any
  pinned: boolean;
  heldPaise: number; // opening income taken from money the parent already has (see domain/groups.ts)
}

export interface BackupGiftOccasion {
  id: string;
  title: string;
  occasionDate: string;
  status: "ACTIVE" | "DELETED";
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BackupGift {
  id: string;
  occasionId: string;
  name: string;
  direction: GiftDirection;
  type: GiftType;
  value: number | null; // paise when unit is INR, milligrams when unit is g
  unit: GiftUnit;
  ratePaise: number | null;
  note: string | null;
  status: "ACTIVE" | "DELETED";
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BackupAsset extends Omit<AssetFields, "status"> {
  id: string;
  giftId: string | null; // the gift it was added from
  status: AssetStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BackupAssetExchange {
  id: string;
  exchangeDate: string; // yyyy-mm-dd
  shop: string | null;
  extraPaise: number | null;
  note: string | null;
  status: "ACTIVE" | "DELETED";
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BackupJourney {
  id: string;
  label: string;
  journeyDate: string; // yyyy-mm-dd
  booking: Booking;
  alarmTimes: string[]; // "HH:MM", in time order
  note: string | null;
  booked: boolean;
  pnr: string | null; // only on a booked journey
  createdAt: string | null;
}

// Savings as stored: one figure per kind, account and month, the PF and NPS accounts, and the units of each fund and NPS scheme.
export interface BackupSavings {
  months: MonthRow[];
  accounts: SavingsAccount[];
  holdings: SavingsHolding[];
}

export const emptySavings = (): BackupSavings => ({ months: [], accounts: [], holdings: [] });

// The monthly template as stored: its groups, their entries, and the groups each month's set-up made.
export interface BackupMonthTemplate {
  groups: TemplateGroup[];
  lines: TemplateLine[];
  setups: MonthSetup[];
}

export const emptyMonthTemplate = (): BackupMonthTemplate => ({ groups: [], lines: [], setups: [] });

export interface BackupCategory {
  category: string;
  subcategory: string;
  description?: string; // what belongs in the subcategory (for the AI); absent when there is none
}

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  categories: BackupCategory[];
  paymentMethods: string[];
  groups: BackupGroup[];
  giftOccasions: BackupGiftOccasion[];
  gifts: BackupGift[];
  assets: BackupAsset[];
  assetOptions: { for: string[]; item: string[] }; // the lists behind the For and Item dropdowns
  assetExchanges: BackupAssetExchange[];
  journeys: BackupJourney[];
  savings: BackupSavings;
  monthTemplate: BackupMonthTemplate;
  transactions: BackupTransaction[];
}

export class BackupError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const optionalString = (v: unknown): string | null | undefined =>
  v === undefined || v === null ? null : typeof v === "string" ? v : undefined; // undefined = invalid

function readTransaction(raw: unknown): BackupTransaction | null {
  if (!isObject(raw)) return null;
  const t = raw;

  if (!nonEmpty(t.id) || !nonEmpty(t.category) || !nonEmpty(t.subcategory) || !nonEmpty(t.classifiedBy)) return null;
  if (!isTransactionSource(t.source)) return null;
  if (t.status !== "ACTIVE" && t.status !== "DELETED") return null;
  if (t.direction !== "debit" && t.direction !== "credit") return null;
  if (typeof t.txnDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(t.txnDate)) return null;
  if (typeof t.amountPaise !== "number" || !Number.isSafeInteger(t.amountPaise) || t.amountPaise <= 0) return null;
  if (t.balancePaise != null && (typeof t.balancePaise !== "number" || !Number.isSafeInteger(t.balancePaise))) return null;

  const strings = {
    dedupeKey: optionalString(t.dedupeKey),
    payee: optionalString(t.payee),
    paymentMethod: optionalString(t.paymentMethod),
    description: optionalString(t.description),
    narration: optionalString(t.narration),
    vpa: optionalString(t.vpa),
    note: optionalString(t.note),
    payeeBank: optionalString(t.payeeBank),
    upiRef: optionalString(t.upiRef),
    createdGroupId: optionalString(t.createdGroupId),
    createdAt: optionalString(t.createdAt),
    updatedAt: optionalString(t.updatedAt),
  };
  if (Object.values(strings).some((v) => v === undefined)) return null;
  const groupId = optionalString(t.groupId);
  if (groupId === undefined) return null;

  return {
    id: t.id,
    groupId: groupId || MAIN_GROUP_ID,
    source: t.source,
    status: t.status,
    txnDate: t.txnDate,
    direction: t.direction,
    amountPaise: t.amountPaise,
    balancePaise: (t.balancePaise as number | null | undefined) ?? null,
    category: t.category,
    subcategory: t.subcategory,
    classifiedBy: t.classifiedBy,
    ...(strings as Record<keyof typeof strings, string | null>),
  };
}

const GROUP_STATUSES: GroupStatus[] = ["ACTIVE", "CLOSED", "DELETED"];
const isoDateOrNull = (v: unknown): string | null | undefined =>
  v === undefined || v === null || v === "" ? null : typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined;

function readGroup(raw: unknown): BackupGroup | null {
  if (!isObject(raw) || !nonEmpty(raw.id) || !nonEmpty(raw.name)) return null;
  const status = GROUP_STATUSES.find((s) => s === raw.status) ?? "ACTIVE";
  const startDate = isoDateOrNull(raw.startDate);
  const endDate = isoDateOrNull(raw.endDate);
  if (startDate === undefined || endDate === undefined) return null;
  return {
    id: raw.id,
    name: raw.name.trim(),
    startDate,
    endDate,
    status,
    parentId: optionalString(raw.parentId) ?? null,
    pinned: raw.pinned === true,
    heldPaise: typeof raw.heldPaise === "number" && Number.isSafeInteger(raw.heldPaise) && raw.heldPaise > 0 ? raw.heldPaise : 0,
  };
}

const GIFT_TYPES_SET: readonly GiftType[] = ["cash", "gold", "silver", "other"];
const isPositiveInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v > 0;

function readGiftOccasion(raw: unknown): BackupGiftOccasion | null {
  if (!isObject(raw) || !nonEmpty(raw.id) || !nonEmpty(raw.title)) return null;
  const occasionDate = isoDateOrNull(raw.occasionDate);
  if (!occasionDate) return null;
  const createdAt = optionalString(raw.createdAt);
  const updatedAt = optionalString(raw.updatedAt);
  if (createdAt === undefined || updatedAt === undefined) return null;
  return { id: raw.id, title: raw.title.trim(), occasionDate, status: raw.status === "DELETED" ? "DELETED" : "ACTIVE", createdAt, updatedAt };
}

function readGift(raw: unknown): BackupGift | null {
  if (!isObject(raw) || !nonEmpty(raw.id) || !nonEmpty(raw.occasionId) || !nonEmpty(raw.name)) return null;
  if (raw.direction !== "received" && raw.direction !== "given") return null;
  const type = GIFT_TYPES_SET.find((t) => t === raw.type);
  if (!type) return null;
  if (raw.value != null && !isPositiveInt(raw.value)) return null;
  if (raw.ratePaise != null && !isPositiveInt(raw.ratePaise)) return null;
  const note = optionalString(raw.note);
  const createdAt = optionalString(raw.createdAt);
  const updatedAt = optionalString(raw.updatedAt);
  if (note === undefined || createdAt === undefined || updatedAt === undefined) return null;
  return {
    id: raw.id,
    occasionId: raw.occasionId,
    name: raw.name.trim(),
    direction: raw.direction,
    type,
    value: (raw.value as number | null | undefined) ?? null,
    unit: raw.unit === "g" ? "g" : "INR",
    ratePaise: (raw.ratePaise as number | null | undefined) ?? null,
    note,
    status: raw.status === "DELETED" ? "DELETED" : "ACTIVE",
    createdAt,
    updatedAt,
  };
}

const ASSET_TYPE_VALUES = ASSET_TYPES.map((t) => t.value);
const ASSET_UNIT_VALUES = ASSET_UNITS.map((u) => u.value);

function readAsset(raw: unknown): BackupAsset | null {
  if (!isObject(raw) || !nonEmpty(raw.id) || !nonEmpty(raw.name)) return null;
  const type = ASSET_TYPE_VALUES.find((t) => t === raw.type);
  if (!type) return null;
  const unit = raw.unit == null || raw.unit === "" ? null : (ASSET_UNIT_VALUES.find((u) => u === raw.unit) ?? undefined);
  if (unit === undefined) return null;
  if (raw.quantity != null && !isPositiveInt(raw.quantity)) return null;
  if (raw.investedPaise != null && !isPositiveInt(raw.investedPaise)) return null;
  if (raw.loanPaise != null && !isPositiveInt(raw.loanPaise)) return null;
  const purityK = raw.purityK == null ? null : (GOLD_PURITIES.find((k) => k === raw.purityK) ?? undefined);
  if (purityK === undefined) return null;

  const acquiredDate = isoDateOrNull(raw.acquiredDate);
  const pledgedDate = isoDateOrNull(raw.pledgedDate);
  const dueDate = isoDateOrNull(raw.dueDate);
  if (acquiredDate === undefined || pledgedDate === undefined || dueDate === undefined) return null;

  const strings = {
    description: optionalString(raw.description),
    giftId: optionalString(raw.giftId),
    lender: optionalString(raw.lender),
    ticketNo: optionalString(raw.ticketNo),
    pledgeNote: optionalString(raw.pledgeNote),
    forName: optionalString(raw.forName),
    item: optionalString(raw.item),
    exchangeId: optionalString(raw.exchangeId),
    createdAt: optionalString(raw.createdAt),
    updatedAt: optionalString(raw.updatedAt),
  };
  if (Object.values(strings).some((v) => v === undefined)) return null;
  const s = strings as Record<keyof typeof strings, string | null>;

  const status: AssetStatus = raw.status === "DELETED" ? "DELETED" : raw.status === "SOLD" ? "SOLD" : "ACTIVE";
  // Same rules as the form: the unit follows the type, and only gold has purity or a pledge.
  const fields = normaliseAsset({
    type,
    forName: s.forName,
    item: s.item,
    name: raw.name,
    exchangeId: s.exchangeId,
    status: status === "SOLD" ? "SOLD" : "ACTIVE",
    quantity: (raw.quantity as number | null | undefined) ?? null,
    unit,
    purityK,
    investedPaise: (raw.investedPaise as number | null | undefined) ?? null,
    acquiredDate,
    description: s.description,
    lender: s.lender,
    ticketNo: s.ticketNo,
    pledgedDate,
    dueDate,
    loanPaise: (raw.loanPaise as number | null | undefined) ?? null,
    pledgeNote: s.pledgeNote,
  });
  return { ...fields, id: raw.id, giftId: s.giftId, status, createdAt: s.createdAt, updatedAt: s.updatedAt };
}

// An asset from a file made before For and Item (version 6 or older) has only its name. All the names of the file are split together, so a name
// that starts with a For seen on the other pieces ("Thishi Ear Ring") is split too; the pieces that already have a For or an Item are left alone.
function fillLegacyNames(assets: BackupAsset[]): BackupAsset[] {
  if (!assets.some((a) => a.forName === null && a.item === null)) return assets;
  const derived = deriveForAndItem(assets.map((a) => a.name));
  return assets.map((a, i) => {
    if (a.forName !== null || a.item !== null) return a;
    const fields = normaliseAsset({ ...a, status: a.status === "SOLD" ? "SOLD" : "ACTIVE", forName: derived[i].forName, item: derived[i].item });
    return { ...a, forName: fields.forName, item: fields.item, name: fields.name };
  });
}

// The lists behind the For and Item dropdowns when the file has none: the names the pieces use, in the order they appear.
function optionsFromAssets(assets: readonly BackupAsset[]): { for: string[]; item: string[] } {
  const uniq = (names: (string | null)[]) => [...new Set(names.filter((n): n is string => n !== null))];
  return { for: uniq(assets.map((a) => a.forName)), item: uniq(assets.map((a) => a.item)) };
}

function readAssetExchange(raw: unknown): BackupAssetExchange | null {
  if (!isObject(raw) || !nonEmpty(raw.id)) return null;
  const exchangeDate = isoDateOrNull(raw.exchangeDate);
  if (!exchangeDate) return null;
  if (raw.extraPaise != null && !isPositiveInt(raw.extraPaise)) return null;
  const shop = optionalString(raw.shop);
  const note = optionalString(raw.note);
  const createdAt = optionalString(raw.createdAt);
  const updatedAt = optionalString(raw.updatedAt);
  if ([shop, note, createdAt, updatedAt].some((v) => v === undefined)) return null;
  return {
    id: raw.id,
    exchangeDate,
    shop: (shop as string | null)?.trim() || null,
    extraPaise: (raw.extraPaise as number | null | undefined) ?? null,
    note: (note as string | null)?.trim() || null,
    status: raw.status === "DELETED" ? "DELETED" : "ACTIVE",
    createdAt: createdAt as string | null,
    updatedAt: updatedAt as string | null,
  };
}

const BOOKING_VALUES = BOOKINGS.map((b) => b.value);

// ---- Savings ---------------------------------------------------------------------------------------------------------------------------------

const nonNegInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
const anyInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
const monthOrNull = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);

function readSavingsMonth(raw: unknown): MonthRow | null {
  if (!isObject(raw)) return null;
  const kind = raw.kind === "mf" || raw.kind === "nps" || raw.kind === "pf" ? raw.kind : null;
  const month = monthOrNull(raw.month);
  const source = raw.source === "estimate" ? "estimate" : raw.source === "statement" ? "statement" : null;
  const own = nonNegInt(raw.ownPaise ?? 0);
  const employer = nonNegInt(raw.employerPaise ?? 0);
  const pension = nonNegInt(raw.pensionPaise ?? 0);
  if (!kind || !month || !source || own === null || employer === null || pension === null || typeof raw.account !== "string") return null;
  const credited = isoDateOrNull(raw.creditedDate);
  if (credited === undefined) return null;
  return { kind, account: raw.account, month, ownPaise: own, employerPaise: employer, pensionPaise: pension, source, creditedDate: credited };
}

function readSavingsAccount(raw: unknown): SavingsAccount | null {
  if (!isObject(raw) || !nonEmpty(raw.account)) return null;
  const kind = raw.kind === "pf" || raw.kind === "nps" ? raw.kind : null;
  const asOf = isoDateOrNull(raw.asOf);
  const autoFrom = raw.autoFrom === null || raw.autoFrom === undefined ? null : monthOrNull(raw.autoFrom);
  const nullableInt = (v: unknown): number | null | undefined => (v === null || v === undefined ? null : anyInt(v) ?? undefined);
  const value = nullableInt(raw.valuePaise);
  const invested = nullableInt(raw.investedPaise);
  const own = nullableInt(raw.ownPaise);
  const employer = nullableInt(raw.employerPaise);
  const pension = nullableInt(raw.pensionPaise);
  const fy = nullableInt(raw.fy);
  const estOwn = nonNegInt(raw.estOwnPaise ?? 0);
  const estEmployer = nonNegInt(raw.estEmployerPaise ?? 0);
  const estPension = nonNegInt(raw.estPensionPaise ?? 0);
  if (!kind || asOf === undefined || autoFrom === undefined || [value, invested, own, employer, pension, fy].includes(undefined) || estOwn === null || estEmployer === null || estPension === null) return null;
  return {
    kind,
    account: raw.account,
    label: optionalString(raw.label) ?? null,
    status: raw.status === "CLOSED" ? "CLOSED" : "ACTIVE",
    asOf,
    fy: fy as number | null,
    valuePaise: value as number | null,
    investedPaise: invested as number | null,
    xirr: optionalString(raw.xirr) ?? null,
    ownPaise: own as number | null,
    employerPaise: employer as number | null,
    pensionPaise: pension as number | null,
    autoAdd: raw.autoAdd === true && kind === "pf",
    autoFrom: raw.autoAdd === true && kind === "pf" ? autoFrom : null,
    estOwnPaise: estOwn,
    estEmployerPaise: estEmployer,
    estPensionPaise: estPension,
  };
}

function readSavingsHolding(raw: unknown): SavingsHolding | null {
  if (!isObject(raw) || !nonEmpty(raw.code) || !nonEmpty(raw.name) || typeof raw.account !== "string") return null;
  const kind = raw.kind === "mf" || raw.kind === "nps" ? raw.kind : null;
  const units = anyInt(raw.unitsE4);
  const nav = anyInt(raw.navE4);
  const value = anyInt(raw.valuePaise);
  const asOf = isoDateOrNull(raw.asOf);
  const navDate = isoDateOrNull(raw.navDate);
  const liveDate = isoDateOrNull(raw.liveNavDate);
  const invested = raw.investedPaise === null || raw.investedPaise === undefined ? null : anyInt(raw.investedPaise);
  const live = raw.liveNavE4 === null || raw.liveNavE4 === undefined ? null : anyInt(raw.liveNavE4);
  if (!kind || units === null || nav === null || value === null || !asOf || navDate === undefined || liveDate === undefined || invested === undefined || live === undefined) return null;
  return { kind, account: raw.account, code: raw.code, name: raw.name, unitsE4: units, navE4: nav, valuePaise: value, investedPaise: invested, asOf, navDate, liveNavE4: live, liveNavDate: live === null ? null : liveDate };
}

// ---- Monthly template ------------------------------------------------------------------------------------------------------------------------

const isDirection = (v: unknown): v is "credit" | "debit" => v === "credit" || v === "debit";
const dayOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 31 ? v : null);

function readTemplateGroup(raw: Record<string, unknown>): TemplateGroup | null {
  const sort = anyInt(raw.sort);
  if (!nonEmpty(raw.id) || !nonEmpty(raw.name) || sort === null) return null;
  return { id: raw.id, parentId: nonEmpty(raw.parentId) ? raw.parentId : null, name: raw.name, sort, openingIncome: raw.openingIncome === true, fundsHere: raw.fundsHere === true, home: raw.home === true };
}

function readTemplateLine(raw: Record<string, unknown>): TemplateLine | null {
  const day = dayOrNull(raw.day);
  const sort = anyInt(raw.sort);
  const amount = raw.amountPaise === null ? null : typeof raw.amountPaise === "number" && raw.amountPaise > 0 ? raw.amountPaise : undefined;
  if (!nonEmpty(raw.id) || !nonEmpty(raw.groupId) || !nonEmpty(raw.category) || !nonEmpty(raw.subcategory) || !nonEmpty(raw.payee) || !isDirection(raw.direction) || day === null || sort === null || amount === undefined) return null;
  return {
    id: raw.id,
    groupId: raw.groupId,
    sort,
    direction: raw.direction,
    category: raw.category,
    subcategory: raw.subcategory,
    payee: raw.payee,
    paymentMethod: nonEmpty(raw.paymentMethod) ? raw.paymentMethod : null,
    description: nonEmpty(raw.description) ? raw.description : null,
    amountPaise: amount,
    day,
    createsGroupId: nonEmpty(raw.createsGroupId) ? raw.createsGroupId : null,
  };
}

function readMonthSetup(raw: Record<string, unknown>): MonthSetup | null {
  const month = monthOrNull(raw.month);
  if (!month || !nonEmpty(raw.templateGroupId) || !nonEmpty(raw.groupId)) return null;
  return { month, templateGroupId: raw.templateGroupId, groupId: raw.groupId, fundsHere: raw.fundsHere === true };
}

function readSavings(raw: unknown, onSkip: () => void): BackupSavings {
  const out = emptySavings();
  if (!isObject(raw)) return out;
  for (const [list, read, into] of [
    [raw.months, readSavingsMonth, out.months],
    [raw.accounts, readSavingsAccount, out.accounts],
    [raw.holdings, readSavingsHolding, out.holdings],
  ] as const) {
    for (const item of Array.isArray(list) ? list : []) {
      const value = (read as (v: unknown) => unknown)(item);
      if (value) (into as unknown[]).push(value);
      else onSkip();
    }
  }
  return out;
}

function readJourney(raw: unknown): BackupJourney | null {
  if (!isObject(raw) || !nonEmpty(raw.id) || !nonEmpty(raw.label)) return null;
  const booking = BOOKING_VALUES.find((b) => b === raw.booking);
  const journeyDate = isoDateOrNull(raw.journeyDate);
  if (!booking || !journeyDate) return null;
  if (raw.alarmTimes != null && !(Array.isArray(raw.alarmTimes) && raw.alarmTimes.every((t) => typeof t === "string"))) return null;
  const note = optionalString(raw.note);
  const createdAt = optionalString(raw.createdAt);
  const pnr = optionalString(raw.pnr);
  if (note === undefined || createdAt === undefined || pnr === undefined) return null;
  if (raw.booked != null && typeof raw.booked !== "boolean") return null;
  // A PNR that is not 10 digits is left out rather than refusing the journey; only a booked journey keeps one.
  const booked = raw.booked === true;
  return {
    id: raw.id,
    label: raw.label.trim(),
    journeyDate,
    booking,
    alarmTimes: normalizeTimes((raw.alarmTimes as string[] | null | undefined) ?? []).slice(0, MAX_ALARMS),
    note,
    booked,
    pnr: pnr !== null && validatePnr(pnr) === null ? normalisePnr(pnr, booked) : null,
    createdAt,
  };
}

export interface ParsedBackup {
  backup: Backup;
  skipped: number;
}

// Reads a backup file (CSV, or the JSON of the first version). A wrong file or a newer
// format is an error; individual bad rows are skipped and counted so one damaged line
// does not block a restore.
export function parseBackup(text: string): ParsedBackup {
  const body = text.replace(/^\uFEFF/, "");
  return body.trimStart().startsWith("{") ? parseJsonBackup(body) : parseCsvBackup(body);
}

function parseJsonBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError("This is not a valid backup file (it is not JSON).");
  }
  if (!isObject(raw) || raw.format !== BACKUP_FORMAT && raw.format !== LEGACY_BACKUP_FORMAT) {
    throw new BackupError("This is not a CSK Manager backup file.");
  }
  if (typeof raw.version !== "number" || raw.version > BACKUP_VERSION) {
    throw new BackupError("This backup was made by a newer version of the app. Update the app and try again.");
  }
  if (!Array.isArray(raw.transactions) || !Array.isArray(raw.categories) || !Array.isArray(raw.paymentMethods)) {
    throw new BackupError("The backup file is incomplete.");
  }

  let skipped = 0;
  const transactions: BackupTransaction[] = [];
  for (const item of raw.transactions) {
    const t = readTransaction(item);
    if (t) transactions.push(t);
    else skipped++;
  }

  const categories: Backup["categories"] = [];
  for (const item of raw.categories) {
    if (isObject(item) && nonEmpty(item.category) && nonEmpty(item.subcategory)) {
      const description = typeof item.description === "string" ? cleanDescription(item.description) : "";
      categories.push({ category: item.category, subcategory: item.subcategory, ...(description ? { description } : {}) });
    } else skipped++;
  }

  const paymentMethods: string[] = [];
  for (const item of raw.paymentMethods) {
    if (nonEmpty(item)) paymentMethods.push(item);
    else skipped++;
  }

  const groups: BackupGroup[] = [];
  for (const item of Array.isArray(raw.groups) ? raw.groups : []) {
    const g = readGroup(item);
    if (g) groups.push(g);
    else skipped++;
  }

  const giftOccasions: BackupGiftOccasion[] = [];
  for (const item of Array.isArray(raw.giftOccasions) ? raw.giftOccasions : []) {
    const o = readGiftOccasion(item);
    if (o) giftOccasions.push(o);
    else skipped++;
  }
  const gifts: BackupGift[] = [];
  for (const item of Array.isArray(raw.gifts) ? raw.gifts : []) {
    const g = readGift(item);
    if (g) gifts.push(g);
    else skipped++;
  }

  const assets: BackupAsset[] = [];
  for (const item of Array.isArray(raw.assets) ? raw.assets : []) {
    const a = readAsset(item);
    if (a) assets.push(a);
    else skipped++;
  }

  const assetExchanges: BackupAssetExchange[] = [];
  for (const item of Array.isArray(raw.assetExchanges) ? raw.assetExchanges : []) {
    const x = readAssetExchange(item);
    if (x) assetExchanges.push(x);
    else skipped++;
  }
  const filledAssets = fillLegacyNames(assets);
  const rawOptions = isObject(raw.assetOptions) ? raw.assetOptions : {};
  const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter(nonEmpty).map((n) => n.trim()) : []);
  const assetOptions = { ...optionsFromAssets(filledAssets) };
  for (const kind of ["for", "item"] as const) assetOptions[kind] = [...new Set([...names(rawOptions[kind]), ...assetOptions[kind]])];

  const journeys: BackupJourney[] = [];
  for (const item of Array.isArray(raw.journeys) ? raw.journeys : []) {
    const j = readJourney(item);
    if (j) journeys.push(j);
    else skipped++;
  }

  const savings = readSavings(raw.savings, () => skipped++);
  return {
    backup: {
      format: BACKUP_FORMAT,
      version: raw.version,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
      categories,
      paymentMethods,
      groups,
      giftOccasions,
      gifts,
      assets: filledAssets,
      assetOptions,
      assetExchanges,
      journeys,
      savings,
      monthTemplate: emptyMonthTemplate(),
      transactions,
    },
    skipped,
  };
}

export function backupFileName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `csk-manager-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.csv`;
}

// ---------------------------------------------------------------------------------------------
// CSV

const GAP_COLUMNS = 5;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-10-23" -> "23-Oct-2026". The month name keeps the date unambiguous (day first or
// month first) whichever way Excel or the reader's regional settings show it.
function csvDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${MONTH_NAMES[Number(m) - 1] ?? m}-${y}`;
}

const rupees = (paise: number): string => (paise / 100).toFixed(2);

// Excel runs a cell that starts with = + - @ as a formula, and bank text is arbitrary, so
// text cells that start that way get a leading ' (removed again on import).
const FORMULA_START = /^[=+\-@\t\r]/;
const guard = (v: string | null): string => (v === null ? "" : FORMULA_START.test(v) ? `'${v}` : v);
const unguard = (v: string): string => (/^'[=+\-@\t\r]/.test(v) ? v.slice(1) : v);

const cap = (v: string): string => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase();

interface Column {
  header: string;
  write: (t: BackupTransaction) => string;
}

// Readable columns first, bank details and technical ones (needed to restore exactly) last.
const COLUMNS: Column[] = [
  { header: "Date", write: (t) => csvDate(t.txnDate) },
  { header: "Type", write: (t) => cap(t.direction) },
  { header: "Amount", write: (t) => rupees(t.amountPaise) },
  { header: "Category", write: (t) => guard(t.category) },
  { header: "Subcategory", write: (t) => guard(t.subcategory) },
  { header: "Payee", write: (t) => guard(t.payee) },
  { header: "Payment Method", write: (t) => guard(t.paymentMethod) },
  { header: "Description", write: (t) => guard(t.description) },
  { header: "Balance", write: (t) => (t.balancePaise === null ? "" : rupees(t.balancePaise)) },
  { header: "Status", write: (t) => cap(t.status) },
  { header: "Classified By", write: (t) => guard(t.classifiedBy) },
  { header: "Source", write: (t) => cap(t.source) },
  { header: "UPI Id", write: (t) => guard(t.vpa) },
  { header: "Note", write: (t) => guard(t.note) },
  { header: "Payee Bank", write: (t) => guard(t.payeeBank) },
  { header: "Bank Narration", write: (t) => guard(t.narration) },
  { header: "Group Id", write: (t) => guard(t.groupId) },
  { header: "Created Group Id", write: (t) => guard(t.createdGroupId) },
  { header: "Id", write: (t) => guard(t.id) },
  { header: "Bank Key", write: (t) => guard(t.dedupeKey) },
  { header: "Created", write: (t) => t.createdAt ?? "" },
  { header: "Updated", write: (t) => t.updatedAt ?? "" },
];

const CATEGORY_LIST = "Category List";
const SUBCATEGORY_LIST = "Subcategory List";
const SUBCATEGORY_DESCRIPTION = "Subcategory Description";
const PAYMENT_LIST = "Payment Mode List";

// The groups block, after the payment modes.
const GROUP_COLUMNS = [
  { header: "Groups Id", write: (g: BackupGroup) => guard(g.id) },
  { header: "Groups Name", write: (g: BackupGroup) => guard(g.name) },
  { header: "Groups Start Date", write: (g: BackupGroup) => (g.startDate ? csvDate(g.startDate) : "") },
  { header: "Groups End Date", write: (g: BackupGroup) => (g.endDate ? csvDate(g.endDate) : "") },
  { header: "Groups Status", write: (g: BackupGroup) => cap(g.status) },
  { header: "Groups Parent Id", write: (g: BackupGroup) => guard(g.parentId) },
  { header: "Groups Pinned", write: (g: BackupGroup) => (g.pinned ? "Yes" : "") },
  { header: "Groups Held", write: (g: BackupGroup) => (g.heldPaise > 0 ? rupees(g.heldPaise) : "") },
];

// The gifts blocks, after the groups.
const GIFT_OCCASION_COLUMNS = [
  { header: "Occasions Id", write: (o: BackupGiftOccasion) => guard(o.id) },
  { header: "Occasions Title", write: (o: BackupGiftOccasion) => guard(o.title) },
  { header: "Occasions Date", write: (o: BackupGiftOccasion) => csvDate(o.occasionDate) },
  { header: "Occasions Status", write: (o: BackupGiftOccasion) => cap(o.status) },
];

// The value is written in its own unit (rupees, or grams), the unit next to it.
const giftValueText = (g: BackupGift): string => (g.value === null ? "" : g.unit === "g" ? gramsInputText(g.value) : rupees(g.value));

const GIFT_COLUMNS = [
  { header: "Gifts Id", write: (g: BackupGift) => guard(g.id) },
  { header: "Gifts Occasion Id", write: (g: BackupGift) => guard(g.occasionId) },
  { header: "Gifts Occasion", write: (g: BackupGift, titles: ReadonlyMap<string, string>) => guard(titles.get(g.occasionId) ?? "") },
  { header: "Gifts Name", write: (g: BackupGift) => guard(g.name) },
  { header: "Gifts Direction", write: (g: BackupGift) => cap(g.direction) },
  { header: "Gifts Type", write: (g: BackupGift) => cap(g.type) },
  { header: "Gifts Value", write: giftValueText },
  { header: "Gifts Unit", write: (g: BackupGift) => g.unit },
  { header: "Gifts Rate", write: (g: BackupGift) => (g.ratePaise === null ? "" : rupees(g.ratePaise)) },
  { header: "Gifts Note", write: (g: BackupGift) => guard(g.note) },
  { header: "Gifts Status", write: (g: BackupGift) => cap(g.status) },
  { header: "Gifts Created", write: (g: BackupGift) => g.createdAt ?? "" },
  { header: "Gifts Updated", write: (g: BackupGift) => g.updatedAt ?? "" },
];

// The assets block, after the gifts. Quantity is written in its own unit (grams, units, cent...), the unit next to it.
const assetQuantityText = (a: BackupAsset): string => (a.quantity === null ? "" : gramsInputText(a.quantity));

const ASSET_COLUMNS = [
  { header: "Assets Id", write: (a: BackupAsset) => guard(a.id) },
  { header: "Assets Type", write: (a: BackupAsset) => a.type },
  { header: "Assets Name", write: (a: BackupAsset) => guard(a.name) },
  { header: "Assets Quantity", write: assetQuantityText },
  { header: "Assets Unit", write: (a: BackupAsset) => a.unit ?? "" },
  { header: "Assets Purity", write: (a: BackupAsset) => (a.purityK === null ? "" : String(a.purityK)) },
  { header: "Assets Invested", write: (a: BackupAsset) => (a.investedPaise === null ? "" : rupees(a.investedPaise)) },
  { header: "Assets Acquired", write: (a: BackupAsset) => (a.acquiredDate ? csvDate(a.acquiredDate) : "") },
  { header: "Assets Description", write: (a: BackupAsset) => guard(a.description) },
  { header: "Assets Gift Id", write: (a: BackupAsset) => guard(a.giftId) },
  { header: "Assets Lender", write: (a: BackupAsset) => guard(a.lender) },
  { header: "Assets Ticket", write: (a: BackupAsset) => guard(a.ticketNo) },
  { header: "Assets Pledged On", write: (a: BackupAsset) => (a.pledgedDate ? csvDate(a.pledgedDate) : "") },
  { header: "Assets Due On", write: (a: BackupAsset) => (a.dueDate ? csvDate(a.dueDate) : "") },
  { header: "Assets Loan", write: (a: BackupAsset) => (a.loanPaise === null ? "" : rupees(a.loanPaise)) },
  { header: "Assets Pledge Note", write: (a: BackupAsset) => guard(a.pledgeNote) },
  { header: "Assets Status", write: (a: BackupAsset) => cap(a.status) },
  { header: "Assets Created", write: (a: BackupAsset) => a.createdAt ?? "" },
  { header: "Assets Updated", write: (a: BackupAsset) => a.updatedAt ?? "" },
  // Added in version 7, after the rest so a file read by an older app still lines up.
  { header: "Assets For", write: (a: BackupAsset) => guard(a.forName) },
  { header: "Assets Item", write: (a: BackupAsset) => guard(a.item) },
  { header: "Assets Exchange Id", write: (a: BackupAsset) => guard(a.exchangeId) },
];

// The train journeys block, after the assets. Alarm times are written "07:45 07:55 07:58 08:00" (a space between), the booking as its
// name (Advance booking, Tatkal AC, Tatkal Non AC).
const JOURNEY_COLUMNS = [
  { header: "Journeys Id", write: (j: BackupJourney) => guard(j.id) },
  { header: "Journeys Label", write: (j: BackupJourney) => guard(j.label) },
  { header: "Journeys Date", write: (j: BackupJourney) => csvDate(j.journeyDate) },
  { header: "Journeys Booking", write: (j: BackupJourney) => bookingInfo(j.booking).label },
  { header: "Journeys Alarm Times", write: (j: BackupJourney) => j.alarmTimes.join(" ") },
  { header: "Journeys Note", write: (j: BackupJourney) => guard(j.note) },
  { header: "Journeys Created", write: (j: BackupJourney) => j.createdAt ?? "" },
  // Added in version 8, after the rest so a file read by an older app still lines up.
  { header: "Journeys Booked", write: (j: BackupJourney) => (j.booked ? "Yes" : "") },
  { header: "Journeys PNR", write: (j: BackupJourney) => guard(j.pnr) },
];

// The exchanges with a shop, after the journeys, and the two lists behind the For and Item dropdowns.
const ASSET_FOR_LIST = "Asset For List";
const ASSET_ITEM_LIST = "Asset Item List";
const EXCHANGE_COLUMNS = [
  { header: "Exchanges Id", write: (x: BackupAssetExchange) => guard(x.id) },
  { header: "Exchanges Date", write: (x: BackupAssetExchange) => csvDate(x.exchangeDate) },
  { header: "Exchanges Shop", write: (x: BackupAssetExchange) => guard(x.shop) },
  { header: "Exchanges Extra", write: (x: BackupAssetExchange) => (x.extraPaise === null ? "" : rupees(x.extraPaise)) },
  { header: "Exchanges Note", write: (x: BackupAssetExchange) => guard(x.note) },
  { header: "Exchanges Status", write: (x: BackupAssetExchange) => cap(x.status) },
  { header: "Exchanges Created", write: (x: BackupAssetExchange) => x.createdAt ?? "" },
  { header: "Exchanges Updated", write: (x: BackupAssetExchange) => x.updatedAt ?? "" },
];

// The Savings blocks, after the exchanges. A month is written "Oct-2026" and a date "23-Oct-2026" (so Excel cannot turn them into something else);
// amounts are in rupees; units and NAVs are the whole numbers the app keeps (x 10,000).
const csvMonth = (m: string): string => `${MONTH_NAMES[Number(m.slice(5)) - 1]}-${m.slice(0, 4)}`;
const paiseOrBlank = (v: number | null): string => (v === null ? "" : rupees(v));
const intOrBlank = (v: number | null): string => (v === null ? "" : String(v));
const SAVINGS_MONTH_COLUMNS = [
  { header: "Savings Months Kind", write: (m: MonthRow) => m.kind },
  { header: "Savings Months Account", write: (m: MonthRow) => guard(m.account) },
  { header: "Savings Months Month", write: (m: MonthRow) => csvMonth(m.month) },
  { header: "Savings Months Own", write: (m: MonthRow) => rupees(m.ownPaise) },
  { header: "Savings Months Employer", write: (m: MonthRow) => rupees(m.employerPaise) },
  { header: "Savings Months Pension", write: (m: MonthRow) => rupees(m.pensionPaise) },
  { header: "Savings Months Source", write: (m: MonthRow) => m.source },
  { header: "Savings Months Credited", write: (m: MonthRow) => (m.creditedDate ? csvDate(m.creditedDate) : "") },
];
const SAVINGS_ACCOUNT_COLUMNS = [
  { header: "Savings Accounts Kind", write: (a: SavingsAccount) => a.kind },
  { header: "Savings Accounts Account", write: (a: SavingsAccount) => guard(a.account) },
  { header: "Savings Accounts Label", write: (a: SavingsAccount) => guard(a.label) },
  { header: "Savings Accounts Status", write: (a: SavingsAccount) => cap(a.status) },
  { header: "Savings Accounts As Of", write: (a: SavingsAccount) => (a.asOf ? csvDate(a.asOf) : "") },
  { header: "Savings Accounts FY", write: (a: SavingsAccount) => intOrBlank(a.fy) },
  { header: "Savings Accounts Value", write: (a: SavingsAccount) => paiseOrBlank(a.valuePaise) },
  { header: "Savings Accounts Invested", write: (a: SavingsAccount) => paiseOrBlank(a.investedPaise) },
  { header: "Savings Accounts XIRR", write: (a: SavingsAccount) => guard(a.xirr) },
  { header: "Savings Accounts Own", write: (a: SavingsAccount) => paiseOrBlank(a.ownPaise) },
  { header: "Savings Accounts Employer", write: (a: SavingsAccount) => paiseOrBlank(a.employerPaise) },
  { header: "Savings Accounts Pension", write: (a: SavingsAccount) => paiseOrBlank(a.pensionPaise) },
  { header: "Savings Accounts Auto Add", write: (a: SavingsAccount) => (a.autoAdd ? "Yes" : "") },
  { header: "Savings Accounts Auto From", write: (a: SavingsAccount) => (a.autoFrom ? csvMonth(a.autoFrom) : "") },
  { header: "Savings Accounts Est Own", write: (a: SavingsAccount) => rupees(a.estOwnPaise) },
  { header: "Savings Accounts Est Employer", write: (a: SavingsAccount) => rupees(a.estEmployerPaise) },
  { header: "Savings Accounts Est Pension", write: (a: SavingsAccount) => rupees(a.estPensionPaise) },
];
const SAVINGS_HOLDING_COLUMNS = [
  { header: "Savings Holdings Kind", write: (h: SavingsHolding) => h.kind },
  { header: "Savings Holdings Account", write: (h: SavingsHolding) => guard(h.account) },
  { header: "Savings Holdings Code", write: (h: SavingsHolding) => guard(h.code) },
  { header: "Savings Holdings Name", write: (h: SavingsHolding) => guard(h.name) },
  { header: "Savings Holdings Units E4", write: (h: SavingsHolding) => String(h.unitsE4) },
  { header: "Savings Holdings NAV E4", write: (h: SavingsHolding) => String(h.navE4) },
  { header: "Savings Holdings Value", write: (h: SavingsHolding) => rupees(h.valuePaise) },
  { header: "Savings Holdings Invested", write: (h: SavingsHolding) => paiseOrBlank(h.investedPaise) },
  { header: "Savings Holdings As Of", write: (h: SavingsHolding) => csvDate(h.asOf) },
  { header: "Savings Holdings NAV Date", write: (h: SavingsHolding) => (h.navDate ? csvDate(h.navDate) : "") },
  { header: "Savings Holdings Live NAV E4", write: (h: SavingsHolding) => intOrBlank(h.liveNavE4) },
  { header: "Savings Holdings Live NAV Date", write: (h: SavingsHolding) => (h.liveNavDate ? csvDate(h.liveNavDate) : "") },
];

// The monthly-template blocks, after Savings. Amounts are in rupees; an empty group amount means "asked each month"; Yes marks a switch that is on.
const yes = (v: boolean): string => (v ? "Yes" : "");
const TEMPLATE_GROUP_COLUMNS = [
  { header: "Template Groups Id", write: (g: TemplateGroup) => g.id },
  { header: "Template Groups Parent Id", write: (g: TemplateGroup) => g.parentId ?? "" },
  { header: "Template Groups Name", write: (g: TemplateGroup) => guard(g.name) },
  { header: "Template Groups Sort", write: (g: TemplateGroup) => String(g.sort) },
  { header: "Template Groups Opening Income", write: (g: TemplateGroup) => yes(g.openingIncome) },
  { header: "Template Groups Funds Here", write: (g: TemplateGroup) => yes(g.fundsHere) },
  { header: "Template Groups Home", write: (g: TemplateGroup) => yes(g.home) },
];
const TEMPLATE_LINE_COLUMNS = [
  { header: "Template Lines Id", write: (l: TemplateLine) => l.id },
  { header: "Template Lines Group Id", write: (l: TemplateLine) => l.groupId },
  { header: "Template Lines Sort", write: (l: TemplateLine) => String(l.sort) },
  { header: "Template Lines Direction", write: (l: TemplateLine) => cap(l.direction) },
  { header: "Template Lines Category", write: (l: TemplateLine) => guard(l.category) },
  { header: "Template Lines Subcategory", write: (l: TemplateLine) => guard(l.subcategory) },
  { header: "Template Lines Payee", write: (l: TemplateLine) => guard(l.payee) },
  { header: "Template Lines Payment Method", write: (l: TemplateLine) => guard(l.paymentMethod) },
  { header: "Template Lines Description", write: (l: TemplateLine) => guard(l.description) },
  { header: "Template Lines Amount", write: (l: TemplateLine) => paiseOrBlank(l.amountPaise) },
  { header: "Template Lines Day", write: (l: TemplateLine) => String(l.day) },
  { header: "Template Lines Creates Group Id", write: (l: TemplateLine) => l.createsGroupId ?? "" },
];
const TEMPLATE_SETUP_COLUMNS = [
  { header: "Template Setups Month", write: (m: MonthSetup) => csvMonth(m.month) },
  { header: "Template Setups Template Group Id", write: (m: MonthSetup) => m.templateGroupId },
  { header: "Template Setups Group Id", write: (m: MonthSetup) => m.groupId },
  { header: "Template Setups Funds Here", write: (m: MonthSetup) => yes(m.fundsHere) },
];

export function serializeBackup(backup: Backup): string {
  const blanks = (n: number) => Array<string>(n).fill("");
  const header = [
    ...COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    CATEGORY_LIST,
    SUBCATEGORY_LIST,
    SUBCATEGORY_DESCRIPTION,
    ...blanks(GAP_COLUMNS),
    PAYMENT_LIST,
    ...blanks(GAP_COLUMNS),
    ...GROUP_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ...GIFT_OCCASION_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ...GIFT_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ...ASSET_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ...JOURNEY_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ASSET_FOR_LIST,
    ...blanks(GAP_COLUMNS),
    ASSET_ITEM_LIST,
    ...blanks(GAP_COLUMNS),
    ...EXCHANGE_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ...SAVINGS_MONTH_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ...SAVINGS_ACCOUNT_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ...SAVINGS_HOLDING_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ...TEMPLATE_GROUP_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ...TEMPLATE_LINE_COLUMNS.map((c) => c.header),
    ...blanks(GAP_COLUMNS),
    ...TEMPLATE_SETUP_COLUMNS.map((c) => c.header),
  ];

  const titles = new Map(backup.giftOccasions.map((o) => [o.id, o.title]));
  const count = Math.max(
    backup.transactions.length,
    backup.categories.length,
    backup.paymentMethods.length,
    backup.groups.length,
    backup.giftOccasions.length,
    backup.gifts.length,
    backup.assets.length,
    backup.journeys.length,
    backup.assetOptions.for.length,
    backup.assetOptions.item.length,
    backup.assetExchanges.length,
    backup.savings.months.length,
    backup.savings.accounts.length,
    backup.savings.holdings.length,
    backup.monthTemplate.groups.length,
    backup.monthTemplate.lines.length,
    backup.monthTemplate.setups.length,
  );
  const rows: string[][] = [header];
  for (let i = 0; i < count; i++) {
    const t = backup.transactions[i];
    const c = backup.categories[i];
    const g = backup.groups[i];
    const o = backup.giftOccasions[i];
    const gift = backup.gifts[i];
    const asset = backup.assets[i];
    const journey = backup.journeys[i];
    const exchange = backup.assetExchanges[i];
    const savingsMonth = backup.savings.months[i];
    const savingsAccount = backup.savings.accounts[i];
    const savingsHolding = backup.savings.holdings[i];
    const templateGroup = backup.monthTemplate.groups[i];
    const templateLine = backup.monthTemplate.lines[i];
    const templateSetup = backup.monthTemplate.setups[i];
    rows.push([
      ...(t ? COLUMNS.map((col) => col.write(t)) : blanks(COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      c ? guard(c.category) : "",
      c ? guard(c.subcategory) : "",
      c?.description ? guard(c.description) : "",
      ...blanks(GAP_COLUMNS),
      guard(backup.paymentMethods[i] ?? null),
      ...blanks(GAP_COLUMNS),
      ...(g ? GROUP_COLUMNS.map((col) => col.write(g)) : blanks(GROUP_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      ...(o ? GIFT_OCCASION_COLUMNS.map((col) => col.write(o)) : blanks(GIFT_OCCASION_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      ...(gift ? GIFT_COLUMNS.map((col) => col.write(gift, titles)) : blanks(GIFT_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      ...(asset ? ASSET_COLUMNS.map((col) => col.write(asset)) : blanks(ASSET_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      ...(journey ? JOURNEY_COLUMNS.map((col) => col.write(journey)) : blanks(JOURNEY_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      guard(backup.assetOptions.for[i] ?? null),
      ...blanks(GAP_COLUMNS),
      guard(backup.assetOptions.item[i] ?? null),
      ...blanks(GAP_COLUMNS),
      ...(exchange ? EXCHANGE_COLUMNS.map((col) => col.write(exchange)) : blanks(EXCHANGE_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      ...(savingsMonth ? SAVINGS_MONTH_COLUMNS.map((col) => col.write(savingsMonth)) : blanks(SAVINGS_MONTH_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      ...(savingsAccount ? SAVINGS_ACCOUNT_COLUMNS.map((col) => col.write(savingsAccount)) : blanks(SAVINGS_ACCOUNT_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      ...(savingsHolding ? SAVINGS_HOLDING_COLUMNS.map((col) => col.write(savingsHolding)) : blanks(SAVINGS_HOLDING_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      ...(templateGroup ? TEMPLATE_GROUP_COLUMNS.map((col) => col.write(templateGroup)) : blanks(TEMPLATE_GROUP_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      ...(templateLine ? TEMPLATE_LINE_COLUMNS.map((col) => col.write(templateLine)) : blanks(TEMPLATE_LINE_COLUMNS.length)),
      ...blanks(GAP_COLUMNS),
      ...(templateSetup ? TEMPLATE_SETUP_COLUMNS.map((col) => col.write(templateSetup)) : blanks(TEMPLATE_SETUP_COLUMNS.length)),
    ]);
  }
  // The BOM makes Excel read the file as UTF-8 (names and notes in other scripts).
  return "\uFEFF" + Papa.unparse(rows, { newline: "\r\n" });
}

// Rows typed into Excel have no Id, so one is made from the row's content. The same row in the
// same file always gets the same Id, which keeps importing the file twice harmless.
function contentId(parts: (string | number)[], seen: Map<string, number>): string {
  const text = parts.join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const base = h.toString(16).padStart(8, "0");
  const n = seen.get(base) ?? 0;
  seen.set(base, n + 1);
  return `x-${base}-${n}`;
}

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?/;

function parseCsvBackup(text: string): ParsedBackup {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimitersToGuess: [",", ";", "\t"] });
  const rows = parsed.data;
  if (rows.length === 0) throw new BackupError("The file is empty.");

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const at = (name: string) => header.indexOf(name.toLowerCase());
  const required = ["Date", "Type", "Amount", "Category", "Subcategory"];
  if (required.some((name) => at(name) < 0)) {
    throw new BackupError("This is not a CSK Manager backup file (its Date, Type, Amount, Category and Subcategory columns were not found).");
  }

  const idx = Object.fromEntries(COLUMNS.map((c) => [c.header, at(c.header)])) as Record<string, number>;
  const categoryList = at(CATEGORY_LIST);
  const subcategoryList = at(SUBCATEGORY_LIST);
  const descriptionList = at(SUBCATEGORY_DESCRIPTION);
  const paymentList = at(PAYMENT_LIST);
  const groupCols = GROUP_COLUMNS.map((c) => at(c.header));
  const occasionCols = GIFT_OCCASION_COLUMNS.map((c) => at(c.header));
  const giftCols = GIFT_COLUMNS.map((c) => at(c.header));
  const assetCols = ASSET_COLUMNS.map((c) => at(c.header));
  const journeyCols = JOURNEY_COLUMNS.map((c) => at(c.header));
  const forListCol = at(ASSET_FOR_LIST);
  const itemListCol = at(ASSET_ITEM_LIST);
  const exchangeCols = EXCHANGE_COLUMNS.map((c) => at(c.header));
  const savingsMonthCols = SAVINGS_MONTH_COLUMNS.map((c) => at(c.header));
  const savingsAccountCols = SAVINGS_ACCOUNT_COLUMNS.map((c) => at(c.header));
  const savingsHoldingCols = SAVINGS_HOLDING_COLUMNS.map((c) => at(c.header));
  const templateGroupCols = TEMPLATE_GROUP_COLUMNS.map((c) => at(c.header));
  const templateLineCols = TEMPLATE_LINE_COLUMNS.map((c) => at(c.header));
  const templateSetupCols = TEMPLATE_SETUP_COLUMNS.map((c) => at(c.header));
  const cell = (row: string[], i: number) => (i < 0 ? "" : unguard((row[i] ?? "").trim()));

  let skipped = 0;
  const transactions: BackupTransaction[] = [];
  const categories: Backup["categories"] = [];
  const paymentMethods: string[] = [];
  const groups: BackupGroup[] = [];
  const giftOccasions: BackupGiftOccasion[] = [];
  const gifts: BackupGift[] = [];
  const assets: BackupAsset[] = [];
  const journeys: BackupJourney[] = [];
  const assetExchanges: BackupAssetExchange[] = [];
  const savings = emptySavings();
  const monthTemplate = emptyMonthTemplate();
  const listedFor: string[] = [];
  const listedItem: string[] = [];
  const seen = new Map<string, number>();

  for (const row of rows.slice(1)) {
    const values = COLUMNS.map((c) => cell(row, idx[c.header]));
    if (values.some((v) => v !== "")) {
      const t = readCsvTransaction((name) => cell(row, idx[name]), seen);
      if (t) transactions.push(t);
      else skipped++;
    }

    const cat = cell(row, categoryList);
    const sub = cell(row, subcategoryList);
    const note = cleanDescription(cell(row, descriptionList));
    if (cat && sub) categories.push({ category: cat, subcategory: sub, ...(note ? { description: note } : {}) });
    else if (cat || sub) skipped++;

    const method = cell(row, paymentList);
    if (method) paymentMethods.push(method);

    const [gId, gName, gStart, gEnd, gStatus, gParent, gPinned, gHeld] = groupCols.map((i) => cell(row, i));
    if (gId || gName) {
      const startDate = gStart ? parseDate(gStart) : null;
      const endDate = gEnd ? parseDate(gEnd) : null;
      if (gId && gName && (!gStart || startDate) && (!gEnd || endDate)) {
        groups.push({
          id: gId,
          name: gName,
          startDate,
          endDate,
          status: /^deleted$/i.test(gStatus) ? "DELETED" : /^closed$/i.test(gStatus) ? "CLOSED" : "ACTIVE",
          parentId: gParent && gParent !== gId ? gParent : null,
          pinned: /^(yes|true|1)$/i.test(gPinned),
          heldPaise: gHeld ? Math.max(parseAmountPaise(gHeld) ?? 0, 0) : 0,
        });
      } else skipped++;
    }

    const [oId, oTitle, oDate, oStatus] = occasionCols.map((i) => cell(row, i));
    if (oId || oTitle) {
      const occasion = readGiftOccasion({ id: oId, title: oTitle, occasionDate: oDate ? parseDate(oDate) : null, status: /^deleted$/i.test(oStatus) ? "DELETED" : "ACTIVE" });
      if (occasion) giftOccasions.push(occasion);
      else skipped++;
    }

    // The "Gifts Occasion" title column is for reading in Excel; the occasion is found by its id.
    const [fId, fOccasionId, , fName, fDirection, fType, fValue, fUnit, fRate, fNote, fStatus, fCreated, fUpdated] = giftCols.map((i) => cell(row, i));
    if (fId || fOccasionId || fName) {
      const unit = /^g$/i.test(fUnit) ? "g" : "INR";
      const value = fValue === "" ? null : unit === "g" ? parseGramsInput(fValue) : parseAmountPaise(fValue);
      const rate = fRate === "" ? null : parseAmountPaise(fRate);
      const gift =
        (fValue === "" || value) && (fRate === "" || rate)
          ? readGift({
              id: fId,
              occasionId: fOccasionId,
              name: fName,
              direction: fDirection.toLowerCase(),
              type: fType.toLowerCase(),
              value,
              unit,
              ratePaise: rate,
              note: fNote === "" ? null : fNote,
              status: /^deleted$/i.test(fStatus) ? "DELETED" : "ACTIVE",
              createdAt: TIMESTAMP.test(fCreated) ? fCreated : null,
              updatedAt: TIMESTAMP.test(fUpdated) ? fUpdated : null,
            })
          : null;
      if (gift) gifts.push(gift);
      else skipped++;
    }

    const [aId, aType, aName, aQuantity, aUnit, aPurity, aInvested, aAcquired, aDescription, aGiftId, aLender, aTicket, aPledgedOn, aDueOn, aLoan, aNote, aStatus, aCreated, aUpdated, aFor, aItem, aExchange] =
      assetCols.map((i) => cell(row, i));
    if (aId || aName) {
      const quantity = aQuantity === "" ? null : parseGramsInput(aQuantity);
      const invested = aInvested === "" ? null : parseAmountPaise(aInvested);
      const loan = aLoan === "" ? null : parseAmountPaise(aLoan);
      const acquired = aAcquired === "" ? null : parseDate(aAcquired);
      const pledgedOn = aPledgedOn === "" ? null : parseDate(aPledgedOn);
      const dueOn = aDueOn === "" ? null : parseDate(aDueOn);
      const readable =
        (aQuantity === "" || quantity) && (aInvested === "" || invested) && (aLoan === "" || loan) &&
        (aAcquired === "" || acquired) && (aPledgedOn === "" || pledgedOn) && (aDueOn === "" || dueOn);
      const asset = readable
        ? readAsset({
            id: aId,
            type: aType.toLowerCase().replace(/\s+/g, "_"),
            name: aName,
            quantity,
            unit: aUnit.toLowerCase(),
            purityK: aPurity === "" ? null : Number(aPurity.replace(/k$/i, "")),
            investedPaise: invested,
            acquiredDate: acquired,
            description: aDescription === "" ? null : aDescription,
            giftId: aGiftId === "" ? null : aGiftId,
            lender: aLender === "" ? null : aLender,
            ticketNo: aTicket === "" ? null : aTicket,
            pledgedDate: pledgedOn,
            dueDate: dueOn,
            loanPaise: loan,
            pledgeNote: aNote === "" ? null : aNote,
            forName: aFor === "" ? null : aFor,
            item: aItem === "" ? null : aItem,
            exchangeId: aExchange === "" ? null : aExchange,
            status: /^deleted$/i.test(aStatus) ? "DELETED" : /^sold$/i.test(aStatus) ? "SOLD" : "ACTIVE",
            createdAt: TIMESTAMP.test(aCreated) ? aCreated : null,
            updatedAt: TIMESTAMP.test(aUpdated) ? aUpdated : null,
          })
        : null;
      if (asset) assets.push(asset);
      else skipped++;
    }

    const listedForName = cell(row, forListCol);
    if (listedForName) listedFor.push(listedForName);
    const listedItemName = cell(row, itemListCol);
    if (listedItemName) listedItem.push(listedItemName);

    const [xId, xDate, xShop, xExtra, xNote, xStatus, xCreated, xUpdated] = exchangeCols.map((i) => cell(row, i));
    if (xId || xDate) {
      const date = xDate === "" ? null : parseDate(xDate);
      const extra = xExtra === "" ? null : parseAmountPaise(xExtra);
      const exchange =
        date && (xExtra === "" || extra)
          ? readAssetExchange({
              id: xId,
              exchangeDate: date,
              shop: xShop === "" ? null : xShop,
              extraPaise: extra,
              note: xNote === "" ? null : xNote,
              status: /^deleted$/i.test(xStatus) ? "DELETED" : "ACTIVE",
              createdAt: TIMESTAMP.test(xCreated) ? xCreated : null,
              updatedAt: TIMESTAMP.test(xUpdated) ? xUpdated : null,
            })
          : null;
      if (exchange) assetExchanges.push(exchange);
      else skipped++;
    }

    const [jId, jLabel, jDate, jBooking, jTimes, jNote, jCreated, jBooked, jPnr] = journeyCols.map((i) => cell(row, i));
    if (jId || jLabel) {
      const date = jDate === "" ? null : parseDate(jDate);
      const wanted = jBooking.toLowerCase().replace(/[\s_]+/g, " ").trim();
      const booking = BOOKINGS.find((b) => b.label.toLowerCase() === wanted || b.value.replace(/_/g, " ") === wanted);
      const journey = date
        ? readJourney({
            id: jId,
            label: jLabel,
            journeyDate: date,
            booking: booking?.value,
            alarmTimes: jTimes.split(/[\s,;]+/).filter((t) => t !== ""),
            note: jNote === "" ? null : jNote,
            booked: /^(yes|true|y|booked)$/i.test(jBooked),
            pnr: jPnr === "" ? null : jPnr,
            createdAt: TIMESTAMP.test(jCreated) ? jCreated : null,
          })
        : null;
      if (journey) journeys.push(journey);
      else skipped++;
    }

    const [smKind, smAccount, smMonth, smOwn, smEmployer, smPension, smSource, smCredited] = savingsMonthCols.map((i) => cell(row, i));
    if (smKind || smMonth) {
      const month = monthFromWords(smMonth) ?? (monthOrNull(smMonth) ? smMonth : null);
      const own = parseAmountPaise(smOwn === "" ? "0" : smOwn);
      const employer = parseAmountPaise(smEmployer === "" ? "0" : smEmployer);
      const pension = parseAmountPaise(smPension === "" ? "0" : smPension);
      const credited = smCredited === "" ? null : parseDate(smCredited);
      const m = readSavingsMonth({ kind: smKind.toLowerCase(), account: smAccount, month, ownPaise: own, employerPaise: employer, pensionPaise: pension, source: smSource.toLowerCase(), creditedDate: credited });
      if (m) savings.months.push(m);
      else skipped++;
    }

    const [saKind, saAccount, saLabel, saStatus, saAsOf, saFy, saValue, saInvested, saXirr, saOwn, saEmployer, saPension, saAuto, saAutoFrom, saEstOwn, saEstEmployer, saEstPension] = savingsAccountCols.map((i) => cell(row, i));
    if (saKind || saAccount) {
      const money = (t: string): number | null | undefined => (t === "" ? null : (parseAmountPaise(t) ?? undefined));
      const autoFrom = saAutoFrom === "" ? null : (monthFromWords(saAutoFrom) ?? (monthOrNull(saAutoFrom) ? saAutoFrom : undefined));
      const a = readSavingsAccount({
        kind: saKind.toLowerCase(),
        account: saAccount,
        label: saLabel === "" ? null : saLabel,
        status: /^closed$/i.test(saStatus) ? "CLOSED" : "ACTIVE",
        asOf: saAsOf === "" ? null : parseDate(saAsOf),
        fy: saFy === "" ? null : Number(saFy),
        valuePaise: money(saValue),
        investedPaise: money(saInvested),
        xirr: saXirr === "" ? null : saXirr,
        ownPaise: money(saOwn),
        employerPaise: money(saEmployer),
        pensionPaise: money(saPension),
        autoAdd: /^(yes|true|y)$/i.test(saAuto),
        autoFrom,
        estOwnPaise: money(saEstOwn) ?? 0,
        estEmployerPaise: money(saEstEmployer) ?? 0,
        estPensionPaise: money(saEstPension) ?? 0,
      });
      if (a) savings.accounts.push(a);
      else skipped++;
    }

    const [shKind, shAccount, shCode, shName, shUnits, shNav, shValue, shInvested, shAsOf, shNavDate, shLiveNav, shLiveDate] = savingsHoldingCols.map((i) => cell(row, i));
    if (shKind || shCode) {
      const h = readSavingsHolding({
        kind: shKind.toLowerCase(),
        account: shAccount,
        code: shCode,
        name: shName,
        unitsE4: shUnits === "" ? null : Number(shUnits),
        navE4: shNav === "" ? null : Number(shNav),
        valuePaise: parseAmountPaise(shValue),
        investedPaise: shInvested === "" ? null : parseAmountPaise(shInvested),
        asOf: shAsOf === "" ? null : parseDate(shAsOf),
        navDate: shNavDate === "" ? null : parseDate(shNavDate),
        liveNavE4: shLiveNav === "" ? null : Number(shLiveNav),
        liveNavDate: shLiveDate === "" ? null : parseDate(shLiveDate),
      });
      if (h) savings.holdings.push(h);
      else skipped++;
    }

    const [tgId, tgParent, tgName, tgSort, tgOpening, tgFunds, tgHome] = templateGroupCols.map((i) => cell(row, i));
    if (tgId || tgName) {
      const g = readTemplateGroup({ id: tgId, parentId: tgParent, name: tgName, sort: tgSort === "" ? 0 : Number(tgSort), openingIncome: /^yes$/i.test(tgOpening), fundsHere: /^yes$/i.test(tgFunds), home: /^yes$/i.test(tgHome) });
      if (g) monthTemplate.groups.push(g);
      else skipped++;
    }

    const [tlId, tlGroup, tlSort, tlDirection, tlCategory, tlSubcategory, tlPayee, tlMethod, tlDescription, tlAmount, tlDay, tlCreates] = templateLineCols.map((i) => cell(row, i));
    if (tlId || tlPayee) {
      const l = readTemplateLine({
        id: tlId, groupId: tlGroup, sort: tlSort === "" ? 0 : Number(tlSort), direction: tlDirection.toLowerCase(), category: tlCategory, subcategory: tlSubcategory, payee: tlPayee,
        paymentMethod: tlMethod, description: tlDescription, amountPaise: tlAmount === "" ? null : parseAmountPaise(tlAmount) ?? 0, day: Number(tlDay), createsGroupId: tlCreates,
      });
      if (l) monthTemplate.lines.push(l);
      else skipped++;
    }

    const [tsMonth, tsTemplateGroup, tsGroup, tsFunds] = templateSetupCols.map((i) => cell(row, i));
    if (tsMonth || tsGroup) {
      const month = monthFromWords(tsMonth) ?? (monthOrNull(tsMonth) ? tsMonth : null);
      const m = readMonthSetup({ month, templateGroupId: tsTemplateGroup, groupId: tsGroup, fundsHere: /^yes$/i.test(tsFunds) });
      if (m) monthTemplate.setups.push(m);
      else skipped++;
    }
  }

  const filledAssets = fillLegacyNames(assets);
  const fromAssets = optionsFromAssets(filledAssets);
  return {
    backup: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: "",
      categories,
      paymentMethods,
      groups,
      giftOccasions,
      gifts,
      assets: filledAssets,
      assetOptions: { for: [...new Set([...listedFor, ...fromAssets.for])], item: [...new Set([...listedItem, ...fromAssets.item])] },
      assetExchanges,
      journeys,
      savings,
      monthTemplate,
      transactions,
    },
    skipped,
  };
}

function readCsvTransaction(get: (column: string) => string, seen: Map<string, number>): BackupTransaction | null {
  const txnDate = parseDate(get("Date"));
  if (!txnDate) return null;

  const type = get("Type").toLowerCase();
  const direction = /^(debit|expense|dr|d)$/.test(type) ? "debit" : /^(credit|income|cr|c)$/.test(type) ? "credit" : null;
  if (!direction) return null;

  const amountPaise = parseAmountPaise(get("Amount"));
  if (amountPaise === null || amountPaise <= 0) return null;

  const balanceText = get("Balance");
  const balancePaise = balanceText === "" ? null : parseAmountPaise(balanceText);
  if (balanceText !== "" && balancePaise === null) return null;

  // Both blank means "categorise later": the AI fills it in on the next Re-classify.
  let category = get("Category");
  let subcategory = get("Subcategory");
  if (!category !== !subcategory) return null;
  const pending = !category;
  if (pending) ({ category, subcategory } = fallbackFor(direction));

  const orNull = (v: string) => (v === "" ? null : v);
  const payee = orNull(get("Payee"));
  const paymentMethod = orNull(get("Payment Method"));
  const description = orNull(get("Description"));
  const dedupeKey = orNull(get("Bank Key"));
  const created = get("Created");
  const updated = get("Updated");

  const id =
    get("Id") ||
    contentId([txnDate, direction, amountPaise, payee ?? "", paymentMethod ?? "", description ?? "", category, subcategory], seen);

  return {
    id,
    groupId: get("Group Id") || MAIN_GROUP_ID,
    createdGroupId: orNull(get("Created Group Id")),
    dedupeKey,
    source: parseSourceText(get("Source")),
    status: /^deleted$/i.test(get("Status")) ? "DELETED" : "ACTIVE",
    txnDate,
    direction,
    amountPaise,
    balancePaise,
    category,
    subcategory,
    payee,
    paymentMethod,
    description,
    narration: orNull(get("Bank Narration")),
    vpa: orNull(get("UPI Id")),
    note: orNull(get("Note")),
    payeeBank: orNull(get("Payee Bank")),
    // A key imported into a group carries the group id in front (see scopedKey).
    upiRef: dedupeKey?.match(/(?:^|\|)upi:(\d{12}):/)?.[1] ?? null,
    classifiedBy: pending ? PENDING_AI : get("Classified By") || "manual",
    createdAt: TIMESTAMP.test(created) ? created : null,
    updatedAt: TIMESTAMP.test(updated) ? updated : null,
  };
}
