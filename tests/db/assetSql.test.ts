import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { canonicalOption, giveInExchange, migrateAssetsV18, undoExchangeSql, type AssetDb } from "../../src/db/assetSql";
import { ASSET_EXCHANGES_SQL, ASSET_OPTIONS_SQL } from "../../src/db/schemaSql";

// Node's SQLite behind the same small adapter the phone's database uses.
const adapter = (db: DatabaseSync): AssetDb => ({
  all: async <T>(sql: string, params: (string | number | null)[] = []) => db.prepare(sql).all(...params).map((r) => ({ ...r })) as T[],
  first: async <T>(sql: string, params: (string | number | null)[] = []) => {
    const row = db.prepare(sql).get(...params);
    return (row ? { ...row } : null) as T | null;
  },
  run: async (sql, params = []) => {
    db.prepare(sql).run(...params);
  },
});

// The assets table as it was before schema version 18: a typed name and nothing else about For or Item.
const OLD_ASSETS = `
CREATE TABLE assets (
  id             TEXT PRIMARY KEY NOT NULL,
  type           TEXT NOT NULL CHECK (type IN ('gold', 'land', 'mutual_fund', 'other')),
  name           TEXT NOT NULL,
  quantity       INTEGER,
  unit           TEXT CHECK (unit IS NULL OR unit IN ('g', 'units', 'cent', 'acre', 'sqft', 'ground')),
  purity_k       INTEGER,
  invested_paise INTEGER,
  acquired_date  TEXT,
  description    TEXT,
  gift_id        TEXT,
  lender         TEXT,
  ticket_no      TEXT,
  pledged_date   TEXT,
  due_date       TEXT,
  loan_paise     INTEGER,
  pledge_note    TEXT,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SOLD', 'DELETED')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX assets_gift_idx ON assets (gift_id);
`;

const NAMES = ["Thishi Ear Ring", "Thishika", "Thishi - Earring Jodi", "Thishi - Bangles", "Anklet", "Thika - Ear Ring", "Thika - Bangle"];

function oldDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(OLD_ASSETS);
  const insert = db.prepare("INSERT INTO assets (id, type, name, quantity, unit, purity_k, description, status, created_at) VALUES (?, 'gold', ?, ?, 'g', 22, ?, 'ACTIVE', ?)");
  NAMES.forEach((name, i) => insert.run(`a${i}`, name, 4000 + i, i === 0 ? "kept" : null, `2026-11-01 10:0${i}:00`));
  db.prepare("INSERT INTO assets (id, type, name, status, created_at) VALUES ('land', 'land', 'Sivakasi plot', 'SOLD', '2026-11-01 11:00:00')").run();
  return db;
}

test("the migration adds the columns, splits every name once, fills the dropdown lists, and leaves the old name and everything else as it was", async () => {
  const db = oldDatabase();
  const before = db.prepare("SELECT * FROM assets ORDER BY rowid").all().map((r) => ({ ...r }));
  db.exec(ASSET_OPTIONS_SQL);
  db.exec(ASSET_EXCHANGES_SQL);
  await migrateAssetsV18(adapter(db));

  const after = db.prepare("SELECT * FROM assets ORDER BY rowid").all().map((r) => ({ ...r })) as Record<string, unknown>[];
  assert.equal(after.length, before.length);
  for (const [i, row] of after.entries()) {
    const { for_name, item, exchange_id, ...old } = row;
    assert.deepEqual(old, before[i], `row ${i} is unchanged apart from the new columns`); // the name, grams, purity, dates, status: all as they were
    assert.equal(exchange_id, null);
    void for_name; void item;
  }
  assert.deepEqual(after.map((r) => [r.for_name, r.item]), [
    ["Thishi", "Ear Ring"],
    [null, "Thishika"],
    ["Thishi", "Earring Jodi"],
    ["Thishi", "Bangles"],
    [null, "Anklet"],
    ["Thika", "Ear Ring"],
    ["Thika", "Bangle"],
    [null, "Sivakasi plot"],
  ]);
  const options = (kind: string) => db.prepare("SELECT name FROM asset_options WHERE kind = ? ORDER BY sort").all(kind).map((r) => r.name);
  assert.deepEqual(options("for"), ["Thishi", "Thika"]);
  assert.deepEqual(options("item"), ["Ear Ring", "Thishika", "Earring Jodi", "Bangles", "Anklet", "Bangle", "Sivakasi plot"]);
});

test("running the migration again changes nothing, even after the owner has edited a piece", async () => {
  const db = oldDatabase();
  db.exec(ASSET_OPTIONS_SQL);
  await migrateAssetsV18(adapter(db));
  db.prepare("UPDATE assets SET for_name = 'Kid', item = 'Ring' WHERE id = 'a1'").run(); // the owner corrected "Thishika"
  const snapshot = JSON.stringify(db.prepare("SELECT * FROM assets ORDER BY rowid").all());
  await migrateAssetsV18(adapter(db));
  assert.equal(JSON.stringify(db.prepare("SELECT * FROM assets ORDER BY rowid").all()), snapshot);
});

test("a table that already has the columns (a new install) is left alone", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(OLD_ASSETS.replace("name           TEXT NOT NULL,", "name TEXT NOT NULL, for_name TEXT, item TEXT, exchange_id TEXT,"));
  db.exec(ASSET_OPTIONS_SQL);
  db.prepare("INSERT INTO assets (id, type, name, item) VALUES ('x', 'gold', 'Thishi - Ring', 'Ring')").run();
  await migrateAssetsV18(adapter(db));
  assert.deepEqual({ ...db.prepare("SELECT for_name, item FROM assets").get() }, { for_name: null, item: "Ring" }); // not split again
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM asset_options").get()!.n, 0);
});

test("the dropdown lists keep the spelling they already have and take a new name once", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(ASSET_OPTIONS_SQL);
  const a = adapter(db);
  assert.equal(await canonicalOption(a, "for", "  Thishi "), "Thishi");
  assert.equal(await canonicalOption(a, "for", "THISHI"), "Thishi"); // the list's own spelling
  assert.equal(await canonicalOption(a, "item", "Thishi"), "Thishi"); // a separate list
  assert.equal(await canonicalOption(a, "item", "Ear   ring"), "Ear ring"); // spaces tidied
  assert.equal(await canonicalOption(a, "for", "  "), null);
  assert.equal(await canonicalOption(a, "for", null), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM asset_options").get()!.n, 3);
  // the kind is checked by a named constraint
  assert.throws(() => db.prepare("INSERT INTO asset_options (kind, name, sort) VALUES ('who', 'x', 1)").run(), /asset_options_kind_check/);
});

function exchangeDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(OLD_ASSETS);
  db.exec("ALTER TABLE assets ADD COLUMN for_name TEXT; ALTER TABLE assets ADD COLUMN item TEXT; ALTER TABLE assets ADD COLUMN exchange_id TEXT;");
  db.exec(ASSET_EXCHANGES_SQL);
  const insert = db.prepare("INSERT INTO assets (id, type, name, quantity, unit, lender, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
  insert.run("g1", "gold", "Thishi - Bangles", 4000, "g", null, "ACTIVE");
  insert.run("g2", "gold", "Thishi - Chain", 8000, "g", null, "ACTIVE");
  insert.run("pledged", "gold", "Thika - Bangle", 8000, "g", "Muthoot", "ACTIVE");
  insert.run("land", "land", "Plot", 5000, "cent", null, "ACTIVE");
  insert.run("sold", "gold", "Old ring", 2000, "g", null, "SOLD");
  return db;
}

const FIELDS = { exchangeDate: "2026-11-05", shop: "Joyalukkas", extraPaise: 250000, note: null };
const status = (db: DatabaseSync, id: string) => ({ ...db.prepare("SELECT status, exchange_id FROM assets WHERE id = ?").get(id) });

test("giving pieces to a shop records the exchange and takes them out of what is held", async () => {
  const db = exchangeDatabase();
  await giveInExchange(adapter(db), "ax-1", FIELDS, ["g1", "g2"]);
  assert.deepEqual(status(db, "g1"), { status: "SOLD", exchange_id: "ax-1" });
  assert.deepEqual(status(db, "g2"), { status: "SOLD", exchange_id: "ax-1" });
  assert.deepEqual(status(db, "pledged"), { status: "ACTIVE", exchange_id: null });
  assert.deepEqual({ ...db.prepare("SELECT exchange_date, shop, extra_paise, status FROM asset_exchanges WHERE id = 'ax-1'").get() }, { exchange_date: "2026-11-05", shop: "Joyalukkas", extra_paise: 250000, status: "ACTIVE" });
});

test("a piece that is pledged, land, already sold or missing is refused by name, and then nothing is recorded", async () => {
  for (const [id, message] of [["pledged", /Thika - Bangle cannot be given/], ["land", /Plot cannot be given/], ["sold", /Old ring cannot be given/], ["nope", /not there any more/]] as const) {
    const db = exchangeDatabase();
    await assert.rejects(() => giveInExchange(adapter(db), "ax-1", FIELDS, ["g1", id]), message);
    // g1 was fine, but the check runs before anything is written, so it is still held and no exchange exists
    assert.deepEqual(status(db, "g1"), { status: "ACTIVE", exchange_id: null });
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM asset_exchanges").get()!.n, 0);
  }
});

test("undoing an exchange holds the given pieces again, keeps the bought ones as ordinary assets, and removes the record", async () => {
  const db = exchangeDatabase();
  await giveInExchange(adapter(db), "ax-1", FIELDS, ["g1", "g2"]);
  db.prepare("INSERT INTO assets (id, type, name, quantity, unit, exchange_id, status) VALUES ('new', 'gold', 'Thishi - Long chain', 14000, 'g', 'ax-1', 'ACTIVE')").run(); // bought
  db.prepare("INSERT INTO assets (id, type, name, exchange_id, status) VALUES ('other', 'gold', 'Elsewhere', 'ax-2', 'SOLD')").run(); // another exchange
  await undoExchangeSql(adapter(db), "ax-1");
  assert.deepEqual(status(db, "g1"), { status: "ACTIVE", exchange_id: null });
  assert.deepEqual(status(db, "g2"), { status: "ACTIVE", exchange_id: null });
  assert.deepEqual(status(db, "new"), { status: "ACTIVE", exchange_id: null }); // kept
  assert.deepEqual(status(db, "other"), { status: "SOLD", exchange_id: "ax-2" }); // untouched
  assert.equal(db.prepare("SELECT status FROM asset_exchanges WHERE id = 'ax-1'").get()!.status, "DELETED");
  assert.throws(() => db.prepare("INSERT INTO asset_exchanges (id, exchange_date, status) VALUES ('x', '2026-01-01', 'GONE')").run(), /asset_exchanges_status_check/);
});
