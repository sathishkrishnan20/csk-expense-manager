import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { TRAIN_COLUMNS_V19 } from "../../src/db/schemaSql";

// The train_journeys table as it was before schema version 19: no booked flag and no PNR.
const OLD_JOURNEYS = `
CREATE TABLE train_journeys (
  id            TEXT PRIMARY KEY NOT NULL,
  label         TEXT NOT NULL,
  journey_date  TEXT NOT NULL,
  advance       INTEGER NOT NULL DEFAULT 1,
  tatkal        TEXT NOT NULL DEFAULT 'none' CHECK (tatkal IN ('none', 'ac', 'non_ac')),
  alarm_times   TEXT NOT NULL DEFAULT '',
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);`;

const migrate = (db: DatabaseSync) => {
  const have = new Set(db.prepare("SELECT name FROM pragma_table_info('train_journeys')").all().map((c) => c.name));
  for (const [column, sql] of TRAIN_COLUMNS_V19) if (!have.has(column as string)) db.exec(sql);
};

test("every journey saved before the booked flag is not booked and has no PNR, and nothing else changes", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(OLD_JOURNEYS);
  db.prepare("INSERT INTO train_journeys (id, label, journey_date, advance, tatkal, alarm_times, note) VALUES ('a', 'Chennai to Madurai', '2026-12-20', 1, 'none', '07:45,08:00', 'Vaigai')").run();
  db.prepare("INSERT INTO train_journeys (id, label, journey_date, advance, tatkal, status) VALUES ('b', 'Old', '2026-11-02', 0, 'ac', 'DELETED')").run();
  const before = db.prepare("SELECT * FROM train_journeys ORDER BY rowid").all().map((r) => ({ ...r }));

  migrate(db);
  const after = db.prepare("SELECT * FROM train_journeys ORDER BY rowid").all().map((r) => ({ ...r })) as Record<string, unknown>[];
  assert.deepEqual(after.map(({ booked, pnr, ...rest }) => rest), before);
  assert.deepEqual(after.map((r) => [r.booked, r.pnr]), [[0, null], [0, null]]);

  // running it again changes nothing, and a booked journey with a PNR is stored
  db.prepare("UPDATE train_journeys SET booked = 1, pnr = '4521398760' WHERE id = 'a'").run();
  migrate(db);
  assert.deepEqual({ ...db.prepare("SELECT booked, pnr FROM train_journeys WHERE id = 'a'").get() }, { booked: 1, pnr: "4521398760" });
  // a new journey that says nothing about it is not booked
  db.prepare("INSERT INTO train_journeys (id, label, journey_date) VALUES ('c', 'New', '2027-01-01')").run();
  assert.deepEqual({ ...db.prepare("SELECT booked, pnr FROM train_journeys WHERE id = 'c'").get() }, { booked: 0, pnr: null });
});
