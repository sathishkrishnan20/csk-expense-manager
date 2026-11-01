# Backup server (Cloudflare Worker + KV)

Stores the app's cloud backups. It holds one encrypted text blob per backup id and cannot read any of it: the app
compresses and encrypts the backup on the phone and names it with a hash derived from the owner's recovery code
(see `src/domain/cloudBackup.ts` and `docs/ARCHITECTURE.md`, "Cloud backup").

```
PUT    /backup/<id>   save (replace) the blob      id = 64 lowercase hex characters, body = base64 text, at most 10,000,000 characters
GET    /backup/<id>   the blob, with an x-updated-at header; 404 if none
DELETE /backup/<id>   remove it
```

## Set up (once, about five minutes, free, no card)

1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. From this folder:

   ```bash
   npx wrangler login
   npx wrangler kv namespace create ExpenseManagerBackups
   ```

3. Paste the `id` that the second command prints into `wrangler.toml` (replace `REPLACE_WITH_THE_ID_FROM_WRANGLER`). Copy only the `id`: wrangler also prints a `binding = "..."` line, but leave `binding = "BACKUPS"` as it is, because the Worker code reads it by that name. `ExpenseManagerBackups` is just the store's name in your Cloudflare dashboard.
4. Deploy:

   ```bash
   npx wrangler deploy
   ```

   It prints the address, like `https://expense-manager-backup.<your-name>.workers.dev`.
5. In the project folder create a file named `.env` containing that address, then restart Expo (`npx expo start -c`):

   ```
   EXPO_PUBLIC_BACKUP_URL=https://expense-manager-backup.<your-name>.workers.dev
   ```

Open the address in a browser: it should say "Expense Manager backup server".

## Free-tier limits (Cloudflare changes these; check the KV pricing page)

- About 1,000 KV writes a day for the whole account. One backup is one write, so roughly 1,000 backups a day across all users.
  If the app outgrows that, move the storage to D1 (about 100,000 writes a day free); the app does not change.
- 1 GB of storage in total. A backup is a few hundred KB, and a new backup replaces the old one.
- 100,000 requests a day, 25 MiB per value (this Worker accepts at most about 7.5 MB of sealed data).

## Things to know

- There are no accounts. Whoever knows an id can read, replace or delete that blob, and the id is the hash of a 160-bit
  secret, so it cannot be guessed. The blob is encrypted, so reading it needs the recovery code as well.
- Nothing expires. A backup that is never touched again stays until it is deleted.
- Anyone who finds the address can store junk under random ids. The size cap and the check that a body looks like a
  sealed backup limit the damage; add a Cloudflare rate-limiting rule in the dashboard if it is ever abused.
