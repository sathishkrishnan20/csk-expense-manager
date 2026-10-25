# Expense Manager

An iOS app that looks and works like the web Expense Manager, with everything stored on
your phone. Import your bank statement CSV and AI files each transaction under **your
own categories** (anything that does not fit goes to **Others : Uncategorised**).

Design and the reasons behind it: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Pages

- **Home**: account balance, income and expense totals, recent transactions.
- **Transactions**: every transaction; tap one to edit or delete it.
- **+** (centre button): **Credit** and **Debit** (add by hand, meant for cash) and **Import** (bank CSV).
- **Charts**: income vs expenses and expenses by category, sub category, payment method or payer for a date range.
- **Config** has five sections: **Payment Modes**, **Categories** (add / edit / delete), **AI** (provider and API key), **Export and Import** (a backup file of all your data) and **Re-classify Uncategorised**.

## Run it

```bash
npm install
npm start
```

Press `i` for the iOS simulator, or open the project in Expo Go on your iPhone. Then:

1. **Config > AI**: pick Gemini or Claude and paste your API key. Gemini keys come from
   Google AI Studio and have a free tier. Claude keys come from the Anthropic Console and
   are billed per use, separately from a claude.ai subscription.
2. **+ > Import**: choose the statement CSV. The summary shows how many rows were saved,
   skipped as already imported, or not saved.
3. After adding categories in Config, use **Config > Re-classify Uncategorised** to
   re-run AI on imported rows that ended up in Others : Uncategorised.

## Checks

```bash
npm run typecheck
npm test
```

## Things to know

- Only CSV is supported. If your bank gives a real Excel file, save or export it as CSV.
- Each new transaction's payee, UPI note, narration and amount is sent to the AI provider
  you chose. Nothing else leaves the phone. The key stays in the iOS Keychain.
- If an import stops partway (bad key, quota), fix the cause and upload the same file
  again. Saved rows are skipped; deleted rows are not brought back.
- The default categories come from the web app's live Config and include a few personal
  entries; see `src/domain/masterData.ts` before publishing the repository.
- Model ids are in `src/llm/providers.ts`.
- Nothing has been committed to git yet.
