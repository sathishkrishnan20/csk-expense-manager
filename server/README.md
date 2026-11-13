# Backup server (Cloudflare Worker + KV)

Stores the app's cloud backups. It holds one encrypted text blob per backup id and cannot read any of it: the app
compresses and encrypts the backup on the phone and names it with a hash derived from the owner's recovery code
(see `src/domain/cloudBackup.ts` and `docs/ARCHITECTURE.md`, "Cloud backup").

```
PUT    /backup/<id>   save (replace) the blob      id = 64 lowercase hex characters, body = base64 text, at most 10,000,000 characters
GET    /backup/<id>   the blob, with an x-updated-at header; 404 if none
DELETE /backup/<id>   remove it

GET    /mail/<token>        the statement PDFs waiting in a savings inbox (see "Savings inbox" below)
GET    /mail/<token>/<id>   one PDF
DELETE /mail/<token>/<id>   remove it
```

## Set up (once, about five minutes, free, no card)

1. Create a free account at <https://dash.cloudflare.com/sign-up>.
2. From this folder:

   ```bash
   npx wrangler login
   npx wrangler kv namespace create CskManagerBackups
   ```

3. Paste the `id` that the second command prints into `wrangler.toml` (replace `REPLACE_WITH_THE_ID_FROM_WRANGLER`). Copy only the `id`: wrangler also prints a `binding = "..."` line, but leave `binding = "BACKUPS"` as it is, because the Worker code reads it by that name. `CskManagerBackups` is just the store's name in your Cloudflare dashboard.
4. Deploy:

   ```bash
   npx wrangler deploy
   ```

   It prints the address, like `https://csk-manager-backup.<your-name>.workers.dev`.
5. In the project folder create a file named `.env` containing that address, then restart Expo (`npx expo start -c`):

   ```
   EXPO_PUBLIC_BACKUP_URL=https://csk-manager-backup.<your-name>.workers.dev
   ```

Open the address in a browser: it should say "CSK Manager backup server".

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

## Savings inbox (a statement that arrives by email)

The same Worker can receive an email and keep its PDF attachment until the app collects it, so the monthly mutual fund statement (CAS) reaches the Savings page without
any tapping. The PDF is locked by the sender with the owner's PAN and the password stays on the phone, so the server only holds a file it cannot read. A PDF is kept for 30
days at most (`KEEP_SECONDS` in `src/mail.ts`) and the app deletes it as soon as it has imported it. Code: `src/mail.ts`; the app side is `src/import/savingsMail.ts`.

Set up once, after the backup server above works (the domain must be in the **same Cloudflare account** as the Worker):

1. In the Cloudflare dashboard open your domain, then Email, then Email Routing, and turn it on. Under Destination addresses add your own Gmail address and click the link
   Cloudflare emails you.
2. From the project folder (not this one) run `npm install`: the Worker bundles the email parser `postal-mime` from the project's `node_modules`.
3. From this folder set the secrets. `FORWARD_TO` is your own address (the one you verified in step 1): an email that is not a statement, such as the confirmation code Gmail
   sends when you add a forwarding address, is passed on to it, so it is not lost. `ALLOWED_SENDERS` is optional and lists the sender domains whose PDFs are kept (the sender of
   your statement, for example `cdslstatement.com`); without it any PDF sent to your private address is kept.

   ```bash
   npx wrangler secret put FORWARD_TO
   npx wrangler secret put ALLOWED_SENDERS
   ```

4. Deploy again: `npx wrangler deploy`.
5. Back in Email Routing, open Routing rules, edit the **Catch-all address**, set the action to **Send to a Worker**, choose `csk-manager-backup`, and enable it. (The Worker
   refuses any address that is not a private savings address, so a catch-all is safe.)
6. In the app: Config > Savings by email. Enter the domain and tap Create my address. Then, in Gmail, add that address as a forwarding address (the confirmation code arrives
   in your own inbox through `FORWARD_TO`) and make a filter that forwards the statement sender's emails that have an attachment to it.

To check it, forward last month's statement email to the address by hand, then open Savings in the app.

An email with no attachment is kept too, as text, when it talks about units and a NAV (a fund house's purchase confirmation); any other email is passed on to `FORWARD_TO`. After changing the Worker, deploy it
again with `npx wrangler deploy` from this folder.

Limits: PDFs up to 4 MB, up to 5 per email, up to 30 waiting per address. Each PDF is one KV write, so the free allowance (about 1,000 writes a day) is far more than needed.
