import { bookingFromColumns, bookingInfo, bookingToColumns, normalizeTimes, type JourneyFields } from "../domain/trainAlarms";
import { getDb } from "./database";

// Train journeys are information only: nothing here touches transactions, groups or balances (see domain/trainAlarms.ts).
// Saving or deleting one changes which alarms are wanted; alarms/sync.ts rebuilds the alarms from these rows.

export interface JourneyRecord extends JourneyFields {
  id: string;
  note: string | null;
  createdAt: string;
}

interface JourneyRow {
  id: string;
  label: string;
  journey_date: string;
  advance: number;
  tatkal: string;
  alarm_times: string;
  note: string | null;
  created_at: string;
}

// The times the owner chose, or the booking's usual times for a journey saved before they could be edited.
function readTimes(r: JourneyRow): string[] {
  const times = normalizeTimes(r.alarm_times.split(","));
  return times.length > 0 ? times : bookingInfo(bookingFromColumns(r.advance !== 0, r.tatkal)).defaultTimes;
}

const toRecord = (r: JourneyRow): JourneyRecord => ({
  id: r.id,
  label: r.label,
  journeyDate: r.journey_date,
  booking: bookingFromColumns(r.advance !== 0, r.tatkal),
  alarmTimes: readTimes(r),
  note: r.note,
  createdAt: r.created_at,
});

const SELECT = "SELECT id, label, journey_date, advance, tatkal, alarm_times, note, created_at FROM train_journeys WHERE status = 'ACTIVE'";

const newId = (): string => `tj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Soonest journey first.
export async function listJourneys(): Promise<JourneyRecord[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<JourneyRow>(`${SELECT} ORDER BY journey_date, created_at`);
  return rows.map(toRecord);
}

export async function getJourney(id: string): Promise<JourneyRecord | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<JourneyRow>(`${SELECT} AND id = ?`, [id]);
  return row ? toRecord(row) : null;
}

// Ids of journeys that were deleted, so their alarms can still be cancelled by a later sync.
export async function listDeletedJourneyIds(): Promise<string[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string }>("SELECT id FROM train_journeys WHERE status = 'DELETED'");
  return rows.map((r) => r.id);
}

export interface JourneyInput extends JourneyFields {
  note: string | null;
}

// Adds a journey, or updates one when `id` is given. Returns its id.
export async function saveJourney(input: JourneyInput, id?: string): Promise<string> {
  const db = await getDb();
  const columns = bookingToColumns(input.booking);
  const values = [
    input.label.trim(),
    input.journeyDate,
    columns.advance ? 1 : 0,
    columns.tatkal,
    normalizeTimes(input.alarmTimes).join(","),
    input.note?.trim() || null,
  ];
  if (id) {
    await db.runAsync(
      "UPDATE train_journeys SET label = ?, journey_date = ?, advance = ?, tatkal = ?, alarm_times = ?, note = ?, updated_at = datetime('now') WHERE id = ?",
      [...values, id],
    );
    return id;
  }
  const created = newId();
  await db.runAsync("INSERT INTO train_journeys (id, label, journey_date, advance, tatkal, alarm_times, note) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    created,
    ...values,
  ]);
  return created;
}

// Soft delete, like transactions and gifts.
export async function deleteJourney(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync("UPDATE train_journeys SET status = 'DELETED', updated_at = datetime('now') WHERE id = ?", [id]);
}
