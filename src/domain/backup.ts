// The export/import file: a CSV that opens in Excel, with everything stored on the device.
// The AI API key is deliberately not part of it.
//
// Layout (one header row, then one row per line of data, blocks side by side):
//   [ transactions ... ] 5 empty columns [ Category List | Subcategory List | Subcategory Description ] 5 empty columns [ Payment Mode List ]
//   5 empty columns [ Groups Id | Name | Start Date | End Date | Status | Parent Id | Pinned | Held ]
//   5 empty columns [ Occasions Id | Title | Date | Status ] 5 empty columns [ Gifts Id | Occasion Id | Occasion | Name | Direction | Type | Value | Unit | Rate | Note | Status | Created | Updated ]
//   5 empty columns [ Assets Id | Type | Name | Quantity | Unit | Purity | Invested | Acquired | Description | Gift Id | Lender | Ticket | Pledged On | Due On | Loan | Pledge Note | Status | Created | Updated ]
//   5 empty columns [ Journeys Id | Label | Date | Booking | Alarm Times | Note | Created ]
// Files made before gifts existed have neither block (version 3 added them); they restore with no gifts. Files made before assets
// existed have no assets block (version 4); they restore with no assets. Files made before train journeys were included have no
// journeys block (version 5); they restore with none. Only journeys still ahead are written (one that is over has no alarm to set).
// Files without a Subcategory Description column (made before descriptions existed) simply have none.
// Version 1 files have no Group Id column and no groups block; their transactions all go to Main. Files without Parent Id and
// Pinned (made before groups could sit inside groups) restore every group as a separate one, not pinned.
// Columns are found by their header names, so reordering them in Excel does not matter.
// Files from the first version of the app were JSON; those are still read.

import Papa from "papaparse";
import { BOOKINGS, MAX_ALARMS, bookingInfo, normalizeTimes, type Booking } from "./trainAlarms";
import { ASSET_TYPES, ASSET_UNITS, GOLD_PURITIES, normaliseAsset, type AssetFields, type AssetStatus } from "./assets";
import { gramsInputText, parseGramsInput, type GiftDirection, type GiftType, type GiftUnit } from "./gifts";
import { MAIN_GROUP_ID, type GroupStatus } from "./groups";
import { cleanDescription } from "./masterData";
import { parseAmountPaise, parseDate } from "./statementParser";
import { PENDING_AI, fallbackFor } from "./taxonomy";

export const BACKUP_FORMAT = "csk-manager-backup";
// The name the first version (JSON files) wrote when the app was called Expense Manager; such files still restore.
const LEGACY_BACKUP_FORMAT = "expense-manager-backup";
export const BACKUP_VERSION = 5;

export interface BackupTransaction {
  id: string;
  dedupeKey: string | null;
  source: "import" | "manual";
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

export interface BackupJourney {
  id: string;
  label: string;
  journeyDate: string; // yyyy-mm-dd
  booking: Booking;
  alarmTimes: string[]; // "HH:MM", in time order
  note: string | null;
  createdAt: string | null;
}

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
  journeys: BackupJourney[];
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
  if (t.source !== "import" && t.source !== "manual") return null;
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
    createdAt: optionalString(raw.createdAt),
    updatedAt: optionalString(raw.updatedAt),
  };
  if (Object.values(strings).some((v) => v === undefined)) return null;
  const s = strings as Record<keyof typeof strings, string | null>;

  const status: AssetStatus = raw.status === "DELETED" ? "DELETED" : raw.status === "SOLD" ? "SOLD" : "ACTIVE";
  // Same rules as the form: the unit follows the type, and only gold has purity or a pledge.
  const fields = normaliseAsset({
    type,
    name: raw.name,
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

const BOOKING_VALUES = BOOKINGS.map((b) => b.value);

function readJourney(raw: unknown): BackupJourney | null {
  if (!isObject(raw) || !nonEmpty(raw.id) || !nonEmpty(raw.label)) return null;
  const booking = BOOKING_VALUES.find((b) => b === raw.booking);
  const journeyDate = isoDateOrNull(raw.journeyDate);
  if (!booking || !journeyDate) return null;
  if (raw.alarmTimes != null && !(Array.isArray(raw.alarmTimes) && raw.alarmTimes.every((t) => typeof t === "string"))) return null;
  const note = optionalString(raw.note);
  const createdAt = optionalString(raw.createdAt);
  if (note === undefined || createdAt === undefined) return null;
  return {
    id: raw.id,
    label: raw.label.trim(),
    journeyDate,
    booking,
    alarmTimes: normalizeTimes((raw.alarmTimes as string[] | null | undefined) ?? []).slice(0, MAX_ALARMS),
    note,
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

  const journeys: BackupJourney[] = [];
  for (const item of Array.isArray(raw.journeys) ? raw.journeys : []) {
    const j = readJourney(item);
    if (j) journeys.push(j);
    else skipped++;
  }

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
      assets,
      journeys,
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

    const [aId, aType, aName, aQuantity, aUnit, aPurity, aInvested, aAcquired, aDescription, aGiftId, aLender, aTicket, aPledgedOn, aDueOn, aLoan, aNote, aStatus, aCreated, aUpdated] =
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
            status: /^deleted$/i.test(aStatus) ? "DELETED" : /^sold$/i.test(aStatus) ? "SOLD" : "ACTIVE",
            createdAt: TIMESTAMP.test(aCreated) ? aCreated : null,
            updatedAt: TIMESTAMP.test(aUpdated) ? aUpdated : null,
          })
        : null;
      if (asset) assets.push(asset);
      else skipped++;
    }

    const [jId, jLabel, jDate, jBooking, jTimes, jNote, jCreated] = journeyCols.map((i) => cell(row, i));
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
            createdAt: TIMESTAMP.test(jCreated) ? jCreated : null,
          })
        : null;
      if (journey) journeys.push(journey);
      else skipped++;
    }
  }

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
      assets,
      journeys,
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
    source: /^import$/i.test(get("Source")) ? "import" : "manual",
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
