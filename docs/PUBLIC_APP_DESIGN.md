# Design: from a personal app to a public one (Indian banks)

Status: **proposal, nothing built yet.** Written 2026-10-25 after the owner decided the app
should be usable by everyone, for Indian bank accounts only. Users bring their own AI key
for now; an app-provided AI comes later. This extends `ARCHITECTURE.md`; where they
disagree, this file is the plan and `ARCHITECTURE.md` is what exists today.

> **Update 2026-10-26 (supersedes the server parts below).** The owner decided against the email
> server: banks send statements about once a month and the owner has to handle them anyway, so one
> Share tap does the job without AWS, a domain or any stored data. Plan now: statements are shared
> from Mail/Files to the app (built), PDFs are unlocked and read on the device with passwords the
> user saves under Config > Statement passwords (built, ICICI savings layout only), and the email
> dead-drop (section 3 path B, section 4.2 and 4.3, phase 3) is **dropped** unless users ask for it
> later. Still to do from this document: neutral default categories, onboarding, AI setup wizard,
> consent screens, app lock, more banks, a preview-before-save screen, store release.

## 1. Goals and non-goals

Goals (v1)
- Anyone with an Indian bank account can install the app and have their statements
  categorised into their own categories, without sending their data to us.
- Statement import that needs as little effort as possible: share the emailed statement
  to the app, later fully automatic by email.
- Keeps working with zero cost to us at small scale and a small cost at large scale.

Non-goals (v1)
- Credit-card statements, investments, bills, shared budgets, multiple currencies.
- Our own AI (bring your own key first).
- A web version for the public (it exists in code but is not a product target; see 9).
- Accounts, sign-up with email/phone, social features.

## 2. Principles that stay

1. **Local-first.** Transactions live in SQLite on the user's device. The server never
   holds readable financial data.
2. **Minimum data on the server.** Only what email delivery needs, for a few days.
3. **The user chooses where data goes** (which AI, and they are told what is sent).
4. **Exports are human-readable** (CSV) so users are never locked in.

## 3. The big picture

```
Bank --email--> user's mailbox --forward rule--> u-<id>@mail.<domain>
                                                      |
                                              AWS SES (receiving)
                                                      |
                                   S3 (raw mail, deleted within a day)
                                                      |
                          one Lambda: "ingest" extracts the PDF attachment
                                                      |
                        S3 "inbox/<userId>/<msgId>.pdf" (still locked by the
                        bank's password, which the server never knows), 7-day expiry
                                                      |
   App (on open) --HTTPS + device token--> same Lambda: list / download / delete
                                                      |
   On the phone: unlock PDF with the user's password -> read the table ->
   preview -> categorise with the user's own AI key -> SQLite
```

Two import paths share the same on-device pipeline:
- **Path A, manual (no server, ships first):** in Mail/Files, Share the statement to the
  app. Works for xls, csv and pdf.
- **Path B, automatic (needs the server):** the flow above, fed into the same pipeline.

## 4. Decisions

### 4.1 Distribution
- iOS: Apple Developer Program ($99/year) and App Store review. TestFlight for beta
  (up to 10,000 testers, builds last 90 days). Required: privacy policy URL, App Privacy
  answers, and in-app deletion of anything we store about the user (see 7).
- Android: Play Console ($25 once). The Expo code base already targets it; needs a share
  intent filter for PDFs and a check of `expo-secure-store` behaviour.
- AltStore/free signing remain for the owner's own copy only.

### 4.2 Identity
No sign-up in v1. On first use of the email feature the app calls `POST /register`; the
server creates `userId`, a random inbox address and a random secret token, and returns them.
Only a hash of the token is stored. The app keeps the token in the Keychain/Keystore.
- Lost phone = lost inbox; the user registers again and re-points the forwarding rule.
  Acceptable for v1; accounts (Sign in with Apple/Google) can come later. Note that Apple
  requires Sign in with Apple whenever another third-party sign-in is offered.
- Deleting the registration deletes the inbox and every stored attachment.

### 4.3 Email ingestion (the one Lambda)
One Lambda function, several triggers, in its own `backend/` folder (SST, as chosen
earlier), region `ap-south-1` (Mumbai), where SES can receive mail (confirmed in the AWS
endpoints list).
- **Trigger 1, S3 (new raw mail):** look up the recipient in DynamoDB; unknown recipients
  are dropped. Accept only mail that passes SES's DKIM/spam verdicts and whose `From` domain
  is on a bank allowlist. Keep **only the PDF/xls attachment** (drop the body and headers,
  which contain names), store it under `inbox/<userId>/`, record metadata (time, size,
  sender domain), delete the raw mail.
- **Trigger 2, Function URL (the app):** `POST /register`, `GET /inbox`,
  `GET /inbox/:id` (short-lived pre-signed S3 URL), `DELETE /inbox/:id`, and
  `DELETE /me`. Every call except register needs the device token.
- **Trigger 3, schedule/TTL:** expire attachments after 7 days (S3 lifecycle plus a
  DynamoDB TTL attribute).
- Stores: S3 (private, encrypted), DynamoDB (users, inbox metadata). No logs of content.
- Why the server cannot read statements: the attachment is still protected by the bank's
  password, and the password lives only on the phone.
- Forwarding: Gmail (and Outlook/Yahoo) filter that forwards bank mail to the user's
  address. Gmail first sends a confirmation message to that address; the app must be able to
  show it (treat the first message from the provider as a "confirmation code" item).
- Known risks: forwarded mail may fail DKIM in some setups (test with real forwards);
  mail bombs cost about $0.10 per 1,000 received (accept, and cap with per-user quotas).

### 4.4 Reading statements on the device
Needed because the server cannot read them. Three steps:
1. **Unlock.** Ask for the password once per bank, store it in the Keychain/Keystore,
   show the bank's usual password rule as a hint (for example name + date of birth).
2. **Extract text with positions.** First choice `pdf.js` (`pdfjs-dist`) because it handles
   password-protected PDFs, returns x/y positions (needed to rebuild table columns), and
   one code base serves iOS, Android and web. Risk: it needs polyfills under Hermes and has
   never been run here, so the first task is a **spike**. Fallback: a small native module
   (PDFKit on iOS, a PDF library on Android) with the same interface.
3. **Parse to rows.** A parser per bank (detect by header text, map columns by x position),
   producing the same row type the CSV/XLS importer already uses (`ParsedTransaction`), so
   dedupe, categorising and storage are unchanged.
- **Trust checks.** Every parser verifies the running balance (opening + credits - debits
  = closing, and row by row). A mismatch blocks the import and shows what is wrong.
- **Preview before saving** (new screen): count, date range, totals, a few rows, and
  anything suspicious. The user confirms.
- **Unsupported bank/layout:** offer "ask the AI to read this" as an explicit opt-in. It
  sends the statement text (balances included) to the user's chosen AI, so it needs a clear
  consent screen. Also offer "send us the layout" (redacted text only, user-reviewed).
- First banks: the owner's (ICICI, from the narration format) plus the big ones by
  customer count (HDFC, SBI, Axis, Kotak). Order them by what testers actually use.
- Existing CSV/XLS import stays; those need no password.

### 4.5 AI (bring your own key now, ours later)
- The provider layer already exists (Gemini, Claude, ChatGPT, Ollama). For the public:
  a **setup wizard** (pick an AI, a link to get the key, paste, "Test key" button, plain
  explanation of cost and of what is sent) and Gemini's free tier as the suggested start.
- Later "managed AI" is one more provider that calls our backend with the device token
  (the `LlmCall` seam is already there). Cost is small: roughly 5 batches of 20 for 100
  transactions at flash-lite-class prices is a fraction of a rupee per user per month.
  The real work is quotas, abuse control and billing (App Store subscription or credits).
- Apple allows bring-your-own-key apps; the friction, not the rules, is the risk.

### 4.6 Privacy and compliance (India)
- India's DPDP Act applies once we handle personal data. With local-first plus a
  seven-day encrypted dead-drop, our footprint is small, but we still need: a privacy
  notice, consent for AI processing (shown before first use, naming the provider), a way to
  delete server-side data (`DELETE /me`), a grievance contact, and a breach plan.
- Statements never leave the device unlocked, except to the user's own AI provider.
- No analytics by default. Crash reports opt-in and scrubbed.

### 4.7 What must change in the app before strangers use it
- **Neutral default categories.** `DEFAULT_CATEGORIES` in `src/domain/masterData.ts` still
  contains the owner's own entries ("Dinesh", "Fertility Care", "Marriage"). Replace with a
  generic Indian set. Same review for `DEFAULT_PAYMENT_METHODS`.
- Onboarding (what it does, privacy, AI setup), an optional app lock (Face ID), and clear
  empty/error states. Rupee formatting already uses Indian grouping.
- Remove owner-specific text and files from the repo before publishing it.
- Backups: CSV export exists; add a reminder (see the earlier "last exported" idea).

## 5. Phases

| Phase | What | Needs |
|---|---|---|
| 1 Shareable | Neutral defaults, onboarding, AI wizard + test key, consent screens, app lock, share-sheet import for xls/csv, privacy policy, TestFlight beta | Apple account |
| 2 PDF | pdf.js spike, password handling, 2-3 bank parsers with fixtures, balance checks, preview screen, share-sheet PDF import | sample statements from testers (redacted) |
| 3 Email | `backend/` (SST): SES, S3, DynamoDB, the Lambda; register/sync in the app; forwarding wizard; quotas and cleanup | AWS account, a domain, MX record |
| 4 Grow | More banks, AI fallback parser, Android release, managed AI + subscription | usage data |

Phase 1 and the share-sheet part of Phase 2 deliver most of the value with no server.

## 6. Risks (and the first thing to do about each)

| Risk | First step |
|---|---|
| pdf.js does not run well in Hermes | Spike in Phase 2 before any parser work; fallback native module |
| Bank layouts change or differ by account type | Fixtures per bank, balance checks, easy "report this layout" |
| Forwarded mail fails DKIM/allowlist | Test real Gmail/Outlook forwards early in Phase 3 |
| Non-technical users cannot get an AI key | Wizard, Gemini free tier, later managed AI |
| App Review questions | Clear privacy answers, in-app deletion, no hidden behaviour |
| Spam or abuse of the inbox addresses | Unknown recipients dropped, per-user quotas, allowlist |
| Weak PDF passwords (name + birth date) | Server never has them; attachments expire in 7 days |

## 7. Costs (rough)

- Fixed: Apple $99/year, Play $25 once, a domain, EAS builds if used.
- Variable at small scale: effectively zero. SES receiving is about $0.10 per 1,000 emails;
  S3, Lambda and DynamoDB are far inside free allowances for a few thousand users.
- Later: managed AI (small per user) plus store fees on subscriptions.

## 8. Open questions for the owner

1. Pay for the Apple Developer account now (needed for any public iOS release)?
2. Android in v1, or iOS first?
3. Which banks first? Start with the owner's and two more with real testers.
4. App name, domain and region for the backend (the plan assumes ap-south-1).
5. Anonymous device registration (this plan) or accounts from the start?
6. Is a free app enough for now, or should a paid tier be designed in?

## 9. Not part of this plan

The browser build (`npm run web`) stays a developer convenience. Public web would need
account sign-in, hosting headers, and a different key-protection story, and is not planned.
