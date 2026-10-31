// The text of the in-app guide (the How it works page, opened from Home). Kept as plain data so it can be
// tested and so the wording that depends on the device (iPhone or browser) lives in one place.
export type HelpPlatform = "ios" | "web";

export type HelpBlock = { text: string } | { steps: string[] } | { bullets: string[] };

export interface HelpTopic {
  id: string;
  title: string;
  blocks: HelpBlock[];
}

export function helpTopics(platform: HelpPlatform): HelpTopic[] {
  const web = platform === "web";

  return [
    {
      id: "overview",
      title: "What this app does",
      blocks: [
        {
          text: "A personal expense manager for one person. Download your bank statement, import it, and AI sorts each transaction into your own categories. Cash and other payments are added by hand with the + button. Everything is kept on this device, with no account and no server of ours.",
        },
      ],
    },
    {
      id: "start",
      title: "Getting started",
      blocks: [
        {
          steps: [
            "Config > AI: choose Gemini, Claude, ChatGPT or Ollama. For the first three paste your API key; for Ollama enter the address of your Ollama server. Then press Save.",
            "Config > Categories and Payment Modes: check the lists. They are yours to change, and the AI only picks from them.",
            web
              ? "Import (Import in the left menu): choose the CSV or Excel statement you downloaded from your bank."
              : "+ > Import: choose the CSV or Excel statement you downloaded from your bank.",
            "Open Transactions to review. Tap a row to change its category, or use Config > Re-classify Uncategorised after adding categories.",
          ],
        },
        {
          text: "Gemini keys come from Google AI Studio and have a free tier. Claude keys come from the Anthropic Console, and ChatGPT keys from platform.openai.com; both are billed per use, separately from a claude.ai or ChatGPT subscription. Ollama runs open models on your own computer, so it is free and private, but small models are less accurate.",
        },
      ],
    },
    {
      id: "import",
      title: "Importing a bank statement",
      blocks: [
        {
          bullets: [
            "Works with the CSV, XLS, XLSX or PDF statement from your bank (UPI narrations are read for the payee and your note). In Mail or Files you can tap a statement, then Share, then Expense Manager.",
            "For a locked PDF, save its password under Config > Statement passwords first. The app tries every saved password, and checks that the balances and totals on the statement add up before saving anything; if they do not, nothing is imported.",
            "Rows you imported before are skipped, so importing an overlapping statement is safe. A row you deleted is not added again on its own: the import summary lists such rows and offers Add them back and categorise, so you decide. That restores them and asks the AI again (a category you set by hand is kept).",
            "Debits go to your expense categories; credits go to the subcategories under Income.",
            "Anything the AI cannot place goes to Others : Uncategorised. It never invents a category.",
            "If an import stops part-way (no internet, wrong key, rate limit), fix the cause and import the same file again: saved rows are skipped and the rest are done.",
          ],
        },
      ],
    },
    {
      id: "manual",
      title: "Adding by hand",
      blocks: [
        {
          text: web
            ? "Use Credit or Debit in the left menu, fill in the amount, payee and category, and press Add. This is meant for cash and anything that is not in a bank statement."
            : "Tap + then Credit or Debit, fill in the amount, payee and category, and press Add. This is meant for cash and anything that is not in a bank statement.",
        },
        {
          text: 'No time to pick a category? Tick "Categorise later with AI". The entry shows as "Waiting for AI" until you run Re-classify, which sorts many entries in one go.',
        },
      ],
    },
    {
      id: "list",
      title: "Adding many entries at once",
      blocks: [
        {
          text: web
            ? "Use Add list in the left menu. Paste rows copied from Excel (a payee and an amount on each line), or choose a CSV or Excel file. Download template gives you a CSV to fill in."
            : "Open the + menu and choose Add list. Paste rows copied from Excel (a payee and an amount on each line), or choose a CSV or Excel file. Download template gives you a CSV to fill in.",
        },
        {
          bullets: [
            "Only Payee and Amount are needed. The template's header row is Payee, Amount, Date, Category, Subcategory, Description; all but Payee and Amount are optional, so a line with only a payee and an amount is complete. The header is always shown above the rows box, so pasting never removes it. Without a header row of your own the columns follow that order; paste your own header row first and its columns can be in any order.",
            "Pick a default date and type for rows that have none, and the group the entries go into. Opened from inside a group, it is already set to that group.",
            "A preview lists every row. Rows with a problem (no amount, an amount of 0, an unknown category or a bad date) are marked and left out; untick any row you do not want, or fix the text and the preview updates.",
            "Rows with no category are saved as Categorise later and the AI places them when you run Re-classify. Date is optional too: rows without one get the date you pick on the screen.",
            "Adding a planned month to Main with future dates and importing the bank statement later counts those rows twice, so add planned lists to a group.",
          ],
        },
      ],
    },
    {
      id: "groups",
      title: "Groups",
      blocks: [
        {
          text: "Everything you have so far is in Main. A group is a separate ledger with its own incomes and expenses and its own balance, for a trip, an event, or a second bank account. Create one from Home (New group) or the Groups page; give it a name and, if you like, a start and end date (they are only labels).",
        },
        {
          bullets: [
            "Open a group from the Groups strip on Home. It works like Main: its own bottom tabs (Overview, Transactions, Charts), the same + button for Credit, Debit and Import, and a Main tab to go back. Everything you add or import there goes into that group.",
            "When you import, the Import screen shows which group it is going into: every row in the file goes into that group, whether it is an expense, an income or a transfer.",
            "A group's balance is its incomes minus its expenses. Groups never mix with Main or with each other, and Main's Account Balance covers Main only.",
            "Adding an entry in Main? Tick \"Create a group for this entry\" to make a group at the same time. The entry stays in Main; the group is named Category - Subcategory (or the description), starts on the entry's date, ends on the last day of that month, and starts with an income equal to the amount. Everything is filled in for you and can be changed, and the group can be edited later from its options button.",
            "Importing the same statement again into the same group skips rows already there. The same file imported into two groups is kept in both.",
            "Close a group to hide it from Home and the pickers (it stays under Closed and can be reopened). Delete removes the group and its transactions.",
          ],
        },
        {
          text: "To repeat entries, such as monthly rent or EMIs: touch and hold a row in Transactions (or in a group), tick more rows, use Select all to take everything the filters show, then Duplicate. Choose how many months later, or one date for all; the copies go into the same group unless you pick another. You can change each amount or leave a row out before creating them. If the original entry created a group, each copy can create a new group too: its name (with the new month added), dates and starting income are shown for you to change, and a name that already exists must be changed first. Untick it to copy only the entry. Copies are hand entries; if you duplicate into Main with a future date and import the bank statement later, the real rows are added as well.",
        },
      ],
    },
    {
      id: "categories",
      title: "Categories and Re-classify",
      blocks: [
        {
          bullets: [
            "Add, rename or delete categories and subcategories in Config > Categories. Existing transactions keep their old labels.",
            "Each subcategory has a \"What goes here\" box in its edit form. Write the things that belong in it, such as local dish or product names (for example, Chaats: Dikky poori, Panipoori, roadside food). The AI reads it with the names and places entries much better. It is saved in your backup file too.",
            "Config > Re-classify Uncategorised asks the AI again for imported rows left in Others : Uncategorised and for entries waiting for AI.",
            "A category you choose yourself is never changed by the AI. Changing a category on any transaction makes it yours.",
            "If the AI cannot place a transaction after 3 attempts (the import is the first), it stops asking and moves the transaction to a Couldn't categorise list. Home shows a red card with the count; tap it to choose a category for each one, or find them under Transactions, Filters.",
          ],
        },
      ],
    },
    {
      id: "views",
      title: "Home, Transactions and Charts",
      blocks: [
        {
          bullets: [
            "Home: Account Balance is income minus expenses of Main, your groups with their balances, and your recent transactions below.",
            "Transactions: every entry, newest first. Tap Filters to narrow by date range, credit or debit, category, subcategory, or categorised and uncategorised. Tap a row to edit or delete it.",
            "Charts: pick a date range and group your expenses by category, subcategory, payment method or payer.",
          ],
        },
      ],
    },
    {
      id: "storage",
      title: "Where your data is stored",
      blocks: [
        {
          text: web
            ? "Your transactions, categories and payment modes are stored in this browser, in a private database for this web address. They are not uploaded anywhere. Clearing this site's data in the browser deletes them, and the phone app and other browsers have their own separate copies. Use Export and Import to move data or keep a copy."
            : "Your transactions, categories and payment modes are stored in a database file inside this app on your iPhone. They are not uploaded anywhere. Deleting the app deletes them. Use Export and Import to keep a copy or to move data to another device.",
        },
        {
          bullets: [
            "Amounts are kept exactly, in paise, in rupees only.",
            "There is no account, login, analytics or tracking.",
          ],
        },
      ],
    },
    {
      id: "leaves",
      title: "What leaves this device",
      blocks: [
        {
          text: "Only the AI requests. When the app categorises, it sends the amount, payee, UPI id, note and bank narration of the transactions being sorted (or the payee and description of a hand entry) to the AI you chose: Google for Gemini, Anthropic for Claude, OpenAI for ChatGPT, or your own computer for Ollama. Nothing else is sent. Your balance and the rest of your data are never included. The cloud AIs need internet; Ollama needs to reach your computer.",
        },
        {
          text: "Only one AI is used at a time: the one selected in Config > AI. Each keeps its own key and model, so you can switch between them, and the app never falls back to another one on its own. Every transaction records the model that labelled it.",
        },
      ],
    },
    {
      id: "key",
      title: "Is my API key safe?",
      blocks: [
        {
          text: web
            ? "Reasonably, with one limit. The key is encrypted with a passkey (Touch ID, Windows Hello or your device PIN) before it is saved in this browser, so someone who copies this browser's files cannot read it. After you reload the page, press Unlock with passkey once to use it. It needs a recent Safari or Chrome."
            : "Reasonably, with one limit. The key is kept in the iPhone Keychain, which is encrypted and protected by your device passcode, so other apps cannot read it.",
        },
        {
          bullets: [
            "It is never written to the app's database and never included in an export.",
            "There is no server of ours: the key goes only to the provider you chose (Google, Anthropic or OpenAI), with each categorising request. Ollama needs no key.",
            web
              ? "The limit: malware or a malicious browser extension running on your computer while the key is unlocked could still read it. This app cannot prevent that."
              : "The limit: if someone knows your passcode, or the phone is compromised, the key could be read.",
            "Use a separate key for this app with a low spend limit (Claude) or on the free tier (Gemini). If you lose the device or suspect a leak, delete the key in the provider's console and make a new one.",
            web
              ? "If the passkey is deleted from your device, the saved key cannot be read any more: use Forget saved key and enter it again."
              : "Removing the key: clear the field in Config > AI and press Save key.",
          ],
        },
      ],
    },
    {
      id: "backup",
      title: "Backup, export and import",
      blocks: [
        {
          bullets: [
            "Config > Export and Import > Export saves everything (transactions, groups, categories, payment modes) as one CSV file" +
              (web ? ", downloaded by the browser." : ", using the share sheet (Save to Files, AirDrop)."),
            "Open it in Excel: your transactions are on the left, then your category list, then your payment modes, then your groups, separated by empty columns. Each transaction's Group Id says which group it belongs to. Keep the column headings as they are.",
            "Import adds whatever is missing from such a file. It never changes or removes what is already here, so it is safe to run twice. You can add rows in Excel before importing; leave Category and Subcategory empty to have the AI fill them in later.",
            "Your API key is not part of the file. Enter it again on the new device.",
            "Export now and then. It is the only backup, and it is also how you move data between the phone and a browser.",
          ],
        },
      ],
    },
    {
      id: "trouble",
      title: "If something goes wrong",
      blocks: [
        {
          bullets: [
            '"Add your AI API key in Config": save a key under Config > AI first' + (web ? ", and unlock it if asked." : "."),
            "Import stopped or some rows were not saved: usually no internet, a wrong key, or the provider's free-tier limit. Wait or fix the key, then import the same file again.",
            "Many transactions in Others : Uncategorised: add categories that match your spending, then run Re-classify. Payees that are private people, with no note, often cannot be placed.",
            "A category looks wrong: tap the transaction and change it. The AI will not overrule you.",
            'Added categories since, and want the AI to try an entry again? Tap the entry, set Category to Others and Sub Category to "Recategorise with AI", then run Re-classify. If the AI still cannot place it, it goes back to Others : Uncategorised.',
          ],
        },
      ],
    },
  ];
}
