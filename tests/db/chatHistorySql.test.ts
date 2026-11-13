import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { AssetDb } from "../../src/db/assetSql";
import { deleteAllThreadsSql, deleteOldThreadsSql, deleteThreadSql, listThreadsSql, loadThreadSql, saveThreadSql } from "../../src/db/chatHistorySql";
import { CHAT_HISTORY_SQL } from "../../src/db/schemaSql";
import { historyCutoff, toRows } from "../../src/domain/chatHistory";

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

const fresh = () => {
  const raw = new DatabaseSync(":memory:");
  raw.exec(CHAT_HISTORY_SQL);
  return { raw, db: adapter(raw) };
};
const rows = (...texts: string[]) => toRows(texts.map((text, i) => ({ role: i % 2 === 0 ? "user" : "assistant", text }) as const), () => "not_saved", () => undefined);
const age = (raw: DatabaseSync, id: string, when: string) => raw.prepare("UPDATE chat_threads SET updated_at = ? WHERE id = ?").run(when, id);

test("a chat is saved, listed newest first with its message count, and loaded back message by message", async () => {
  const { raw, db } = fresh();
  await saveThreadSql(db, "t1", "First chat", "main", rows("hello", "hi there"));
  await saveThreadSql(db, "t2", "Second chat", "goa", rows("a", "b", "c"));
  age(raw, "t1", "2026-11-01 10:00:00");
  age(raw, "t2", "2026-11-05 10:00:00");

  const list = await listThreadsSql(db);
  assert.deepEqual(list.map((t) => [t.id, t.title, t.groupId, t.messages]), [["t2", "Second chat", "goa", 3], ["t1", "First chat", "main", 2]]);
  const loaded = await loadThreadSql(db, "t1");
  assert.equal(loaded?.groupId, "main");
  assert.deepEqual(loaded?.rows.map((r) => [r.seq, r.role, r.text]), [[0, "user", "hello"], [1, "assistant", "hi there"]]);
  assert.equal(await loadThreadSql(db, "nothing"), null);
});

test("saving a chat again replaces its messages, keeps its title and group, and moves its last-message time", async () => {
  const { raw, db } = fresh();
  await saveThreadSql(db, "t1", "Original title", "main", rows("one", "two"));
  age(raw, "t1", "2026-01-01 00:00:00");
  await saveThreadSql(db, "t1", "A different title", "goa", rows("one", "two", "three"));

  const [thread] = await listThreadsSql(db);
  assert.deepEqual([thread.title, thread.groupId, thread.messages], ["Original title", "main", 3]);
  assert.ok(thread.updatedAt > "2026-06-01"); // moved to now
  assert.equal((await listThreadsSql(db)).length, 1);
});

test("the cleanup removes the chats whose last message is more than 30 days old, with their messages, and nothing else", async () => {
  const { raw, db } = fresh();
  const now = new Date("2026-11-11T12:00:00Z");
  const cutoff = historyCutoff(now); // 2026-10-12 12:00:00
  await saveThreadSql(db, "old", "Old", null, rows("a", "b"));
  await saveThreadSql(db, "edge-older", "Just over", null, rows("a"));
  await saveThreadSql(db, "edge-newer", "Just inside", null, rows("a"));
  await saveThreadSql(db, "recent", "Recent", null, rows("a", "b", "c"));
  age(raw, "old", "2026-08-01 08:00:00");
  age(raw, "edge-older", "2026-10-12 11:59:59");
  age(raw, "edge-newer", "2026-10-12 12:00:00");
  age(raw, "recent", "2026-11-10 08:00:00");

  assert.equal(await deleteOldThreadsSql(db, cutoff), 2);
  assert.deepEqual((await listThreadsSql(db)).map((t) => t.id).sort(), ["edge-newer", "recent"]);
  const left = raw.prepare("SELECT thread_id, COUNT(*) AS n FROM chat_messages GROUP BY thread_id ORDER BY thread_id").all().map((r) => ({ ...r }));
  assert.deepEqual(left, [{ thread_id: "edge-newer", n: 1 }, { thread_id: "recent", n: 3 }]);
  assert.equal(await deleteOldThreadsSql(db, cutoff), 0); // running it again removes nothing
});

test("one chat, or all of them, can be deleted by the owner", async () => {
  const { raw, db } = fresh();
  await saveThreadSql(db, "t1", "One", null, rows("a", "b"));
  await saveThreadSql(db, "t2", "Two", null, rows("a"));
  await deleteThreadSql(db, "t1");
  assert.deepEqual((await listThreadsSql(db)).map((t) => t.id), ["t2"]);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM chat_messages").get() as { n: number }).n, 1);
  await deleteAllThreadsSql(db);
  assert.equal((await listThreadsSql(db)).length, 0);
  assert.equal((raw.prepare("SELECT COUNT(*) AS n FROM chat_messages").get() as { n: number }).n, 0);
});

test("the tables keep their named checks and the script can run again", () => {
  const { raw } = fresh();
  raw.exec(CHAT_HISTORY_SQL); // IF NOT EXISTS: a second run changes nothing
  const sql = (raw.prepare("SELECT sql FROM sqlite_master WHERE name = 'chat_messages'").get() as { sql: string }).sql;
  assert.match(sql, /CONSTRAINT chat_messages_role_check CHECK/);
  assert.match(sql, /CONSTRAINT chat_messages_proposal_state_check CHECK/);
  assert.doesNotMatch(sql.replace(/CONSTRAINT \w+ CHECK/g, ""), /CHECK/); // no unnamed check is left
  assert.throws(() => raw.prepare("INSERT INTO chat_messages (thread_id, seq, role, text) VALUES ('t', 0, 'system', 'x')").run());
  assert.throws(() => raw.prepare("INSERT INTO chat_messages (thread_id, seq, role, text, proposal_state) VALUES ('t', 0, 'user', 'x', 'maybe')").run());
});
