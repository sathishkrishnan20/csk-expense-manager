# Expense Manager

An iOS app that looks and works like the web Expense Manager, with everything stored on
your phone. Import your bank statement CSV and AI files each transaction under **your
own categories** (anything that does not fit goes to **Others : Uncategorised**).

Design and the reasons behind it: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Pages

- **Home**: account balance, income and expense totals, recent transactions. While it is empty it shows a short "Get started" card.
- **Transactions**: every transaction (tap one to edit or delete it), with a **Filters** bar for date range, type (debit / credit), category, sub category, and All / Categorised / Uncategorised.
- **+** (centre button): **Credit** and **Debit** (add by hand, meant for cash) and **Import** (bank CSV).
- **Charts**: income vs expenses and expenses by category, sub category, payment method or payer for a date range.
- **How it works** (a row at the bottom of Config, a button on the Home welcome card, and an item in the browser menu): a guide to using the app, where the data is stored and whether the API key is safe.
- **Config** has five sections: **Payment Modes**, **Categories** (add / edit / delete), **AI** (provider and API key), **Export and Import** (a CSV of all your data that opens in Excel) and **Re-classify Uncategorised**.

## Run it

```bash
npm install
npm start
```

Press `i` for the iOS simulator, or open the project in Expo Go on your iPhone. Then:

1. **Config > AI**: pick Gemini, Claude, ChatGPT (OpenAI API) or Ollama. Paste the API key
   (Gemini keys come from Google AI Studio and have a free tier; Claude and OpenAI keys are
   billed per use, separately from a claude.ai / ChatGPT subscription), or for Ollama enter
   the address of your server (on an iPhone: your computer's address on the same Wi-Fi, with
   Ollama started using `OLLAMA_HOST=0.0.0.0`). You can change the model name too. Only the
   selected AI is used; each keeps its own key and model.
2. **+ > Import**: choose the statement CSV. The summary shows how many rows were saved,
   skipped as already imported, or not saved.
3. After adding categories in Config, use **Config > Re-classify Uncategorised** to
   re-run AI on imported rows that ended up in Others : Uncategorised.

### Install on your iPhone (free Apple ID, standalone)

No paid Apple Developer account is needed, but the install expires after 7 days and has to be
renewed by building again. It runs without your Mac or the dev server.

1. Export your data first (**Config > Export and Import**).
2. On the iPhone: Settings > Privacy & Security > Developer Mode, turn it on and restart.
3. Connect the iPhone by cable, trust the computer, and run:

   ```bash
   npm run ios:device
   ```

   This needs Xcode and CocoaPods. The first run creates the `ios/` folder.
4. If it stops at signing: open `ios/*.xcworkspace` in Xcode, select the app target, then
   Signing & Capabilities > tick "Automatically manage signing" and choose your Personal Team.
   If Apple says the bundle id `com.sathish.aiexpensemanager` is taken, change it to a unique one.
5. On the iPhone, trust your Apple ID in Settings > General > VPN & Device Management.
6. Every 7 days run `npm run ios:device` again; installing over the top keeps your data (do not
   delete the app first). EAS cloud builds cannot make an iPhone install without the paid program.

### In a browser (untested)

```bash
npm run web
```

The code is written to run on web too, but that build has not been run yet. Things to know:

- Data lives in the browser's own storage (SQLite in the browser's private file system for
  that address). It is separate from the data on your phone: use **Config > Export and Import**
  to move data between them. Clearing site data deletes it.
- The AI key is encrypted with a **passkey** (Touch ID, Windows Hello or a device PIN) before it
  is stored in the browser: the first **Save key** creates the passkey, and after each page
  reload you press **Unlock with passkey** once. Needs a recent Safari or Chrome. A copy of
  the browser's files is useless without your device; malware running on your computer while
  the app is unlocked could still get the key. If the passkey is deleted from the device,
  use **Forget saved key** and enter the key again. Use a key with a low spend limit.
- The dev server sends the cross-origin isolation headers SQLite needs (`metro.config.js`).
  Any other host would have to send `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` as well.
- Export downloads a file; confirmations use the browser's own dialogs.

## Checks

```bash
npm run typecheck
npm test
```

## Things to know

- Bank statements can be CSV or Excel (.xls, .xlsx).
- Each new transaction's payee, UPI note, narration and amount is sent to the AI provider
  you chose. Nothing else leaves the phone. The key stays in the iOS Keychain.
- If an import stops partway (bad key, quota), fix the cause and upload the same file
  again. Saved rows are skipped. Rows you deleted are not added again automatically; the summary lists them and offers **Add them back and categorise**, which restores them and runs the AI on them again (a category you chose by hand is kept).
- The default categories come from the web app's live Config and include a few personal
  entries; see `src/domain/masterData.ts` before publishing the repository.
- Model ids are in `src/llm/providers.ts`.
- Nothing has been committed to git yet.
