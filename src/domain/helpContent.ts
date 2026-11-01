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
            "Anything the AI cannot place, an expense or a credit, goes to Others : Uncategorised. It never puts an entry in a category you do not have. Instead it can suggest one: see AI suggestions under Categories and Re-classify.",
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
          text: "Everything you have so far is in Main. A group has its own incomes and expenses, for a month, a trip, an event, or a second bank account. Groups are made from an entry: add a credit or debit and tick \"Create a group for this entry\" (below). You can change a group's name, dates and the group it sits under later from its options button.",
        },
        {
          bullets: [
            "Open a group from the Groups strip on Home. It works like Main: the same pages (Overview, Transactions, Charts) in the menu button at the top, the same + button for Credit, Debit and Import, and Main in that menu to go back. Everything you add or import there goes into that group.",
            "When you import, the Import screen shows which group it is going into: every row in the file goes into that group, whether it is an expense, an income or a transfer.",
            "A group's balance is its own incomes minus its own expenses, plus the balances of the groups under it. So a group inside \"Nov Month Expenses\" counts in Nov's balance, and Nov counts in Main's Account Balance. Put salary in Main and everything else in groups, and Main shows what is left. The Income and Expenses cards on a group also include everything under it, so an expense added in a subgroup shows in every group above it, and income minus expenses is the balance. (An entry that created a group counts as an expense in the parent and its opening income counts as income in the group, so both cards include that amount; the balance is unaffected.) The Transactions list of each group shows only its own entries. A group set to \"None (kept separate)\", such as a second bank account, stays out of Main's balance.",
            "Adding an entry? Tick \"Create a group for this entry\" to make a group at the same time, in Main or inside any group. The entry stays where it is and the new group sits under it (a \"Day to day\" entry in Nov Month Expenses can create a Day to day group under Nov). The group is named Category - Subcategory (or the description), starts on the entry's date, ends on the last day of that month, and starts with an income equal to the amount. If the entry is an expense, that income cancels the expense in the group above. If the entry is an income, the group shows the amount to spend, but the group above still counts that money only once (so a ₹2.5 lakh income and a group made from it show ₹2.5 lakh in Main, not ₹5 lakh). Everything is filled in for you and can be changed, and the group can be edited later from its options button.",
            "Importing the same statement again into the same group skips rows already there. The same file imported into two groups is kept in both.",
            "Close a group to hide it from Home and the pickers (it stays under Closed and can be reopened). Delete removes the group and its transactions. Closing, reopening or deleting a group does the same to the groups under it, and deleting tells you how many first.",
            "Choose which group the app opens on: on the Groups page tap the home icon on a group (or, in its options, Show on Home). Home, Transactions and Charts then show that group, the + button adds to it, and Main is just another group in the Groups section that you tap to open. Tap the home icon on that group again, or on Main, to go back. If that group is closed or deleted, the app opens on Main.",
            "The Add form also has a Group field, so you can put one entry into a different group (a subgroup too) without opening it first. Added from inside a group, the entry goes into that group.",
            "Pin a group (its options button, or the pin on the Groups page) to show it first in Home's Groups strip, at any depth. A group's own Overview shows its subgroups.",
          ],
        },
        {
          text: "To repeat entries, such as monthly rent or EMIs: touch and hold a row in Transactions (or in a group), tick more rows, use Select all to take everything the filters show, then Duplicate. Choose how many months later, or one date for all; the copies go into the same group unless you pick another. You can change each amount or leave a row out before creating them. If the original entry created a group, each copy can create a new group too: its name (with the new month added), dates and starting income are shown for you to change, and a name that already exists must be changed first. Untick it to copy only the entry. Copies are hand entries; if you duplicate into Main with a future date and import the bank statement later, the real rows are added as well.",
        },
      ],
    },
    {
      id: "gifts",
      title: "Gifts",
      blocks: [
        {
          text: "A record of gold and money your relatives gave at functions (a marriage, a hair offering and so on), and what you gave back at theirs. It is for your information only: Gifts are not transactions and are never part of any balance, group, chart or category, and nothing in them is sent to the AI.",
        },
        {
          bullets: [
            "Open Gifts from the menu: tap the menu button at the top left of Home, then Gifts. It lists every gift like Transactions does, newest occasion first.",
            "Search by name, occasion or what was given (typing a person's name lists everything they gave and received), or filter by occasion and Received / Given.",
            "Add gift: pick the occasion, or choose + New occasion and type its name. A new occasion takes the date you enter as its date, and later gifts in it show that date, locked. To change it, tap Change the occasion date; that moves every gift in the occasion.",
            "Each gift is Received or Given, and one kind of thing: Cash, Gold, Silver or Other. Gold and silver are in grams (or a rupee worth, such as 2000 worth of silver), and you can note the price per gram that day to see what it was worth then. For a gift of two things, such as cash and a ring, add two entries. Save & next keeps the occasion for the next person.",
            "Import list brings in a notebook or sheet in one go. Paste it, or choose a CSV or Excel file: a line with just a name is a heading (an occasion), and the lines under it are a name and a gift (\"Kannaki 3 gram gold\", \"Ramesh 100000Rs\", \"Nisha Bangle\"). You can fix each occasion's name, date and Received / Given, and leave gifts out, before saving. A weight like 1G is read as gold, and a gift it cannot read (such as 1000 or 500) is kept as a note for you to fix.",
            "Gifts are included in Export and in Cloud backup.",
          ],
        },
      ],
    },
    {
      id: "assets",
      title: "Assets",
      blocks: [
        {
          text: "A record of what you own: gold, land, mutual funds and anything else. It is for your information only: Assets are not transactions and are never part of any balance, group, chart or category, nothing in them is sent to the AI, and nothing is valued (you note what you paid, not what it is worth now).",
        },
        {
          bullets: [
            "Open Assets from the menu: tap the menu button at the top left of Home, then Assets. Search by name, lender or description, filter by type, and choose Holding, Pledged, Sold or All.",
            "Add asset: pick the type, then the name and, if you want, the quantity, the amount paid, the date and a description. Gold is in grams (with its purity, 22K for example), land in cent, acre, sq ft or ground, and a mutual fund in units. Add each physical piece as its own entry. Save & next keeps the type for the next one.",
            "Pledged (adagu): on a gold entry, set Pledged to Yes and enter who it is pledged to; that is the only thing required. The ticket number, the pledged and due dates, the loan amount and a purpose or note are optional. The whole piece counts as pledged and shows in amber on its card, with how many days are left to the due date. When you take it back, set Pledged to No.",
            "On a gold gift you received, Add to assets starts an asset from it with the weight and the giver filled in. A gift can be added only once; after that the gift shows In your assets, and opens it.",
            "Mutual funds, NPS and similar holdings cannot be read from any app or API, so note what you invested yourself and look up today's value at your bank or fund provider.",
            "Assets are included in Export and in Cloud backup.",
          ],
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
            "When the AI cannot place an entry it also suggests a category and subcategory, for expenses and for credits (credits go under Income). After Re-classify, if some entries could not be placed, the app opens the suggestions straight away with how many were categorised and how many were not. After an import, the result has a Review button. The suggestions are kept only until you close the app, so review them while you are there; anything you leave stays in Others : Uncategorised, and a later Re-classify asks the AI again. When you have answered them all, the screen offers buttons back to Home or Config. For each entry you can change the names, then Approve, which adds the category or subcategory to your list and files the entry under it, or Reject, which leaves it in Others : Uncategorised. Entries with the same suggestion sit together so you can approve them all at once.",
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
            "Home: the group you chose as Home (Main unless you chose another): its balance, incomes and expenses (including the groups under it), the Groups section (pinned groups, Main and your other groups; tap one to open it), and its recent transactions.",
            "Transactions: the entries of the Home group, newest first (the Group filter at the top changes that: tick one or several groups, or All groups, and each row then shows its group; See All on Home always starts on the Home group again). Tap Filters to narrow by date range, credit or debit, category, subcategory, or categorised and uncategorised. Tap a row to edit or delete it.",
            "Charts: pick a date range and group your expenses by category, subcategory, payment method or payer. The Group filter at the top chooses which groups are charted: it starts on the Home group, and you can tick several groups or choose All groups.",
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
            ? "Your transactions, categories and payment modes are stored in this browser, in a private database for this web address. They are not uploaded anywhere unless you use Cloud backup. Clearing this site's data in the browser deletes them, and the phone app and other browsers have their own separate copies. Use Export and Import, or Cloud backup, to move data or keep a copy."
            : "Your transactions, categories and payment modes are stored in a database file inside this app on your iPhone. They are not uploaded anywhere unless you use Cloud backup. Deleting the app deletes them. Use Export and Import, or Cloud backup, to keep a copy or to move data to another device.",
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
            "Config > Export and Import > Export saves everything (transactions, groups, gifts, assets, categories, payment modes) as one CSV file" +
              (web ? ", downloaded by the browser." : ", using the share sheet (Save to Files, AirDrop)."),
            "Open it in Excel: your transactions are on the left, then your category list, then your payment modes, then your groups, then your gifts, then your assets, separated by empty columns. Each transaction's Group Id says which group it belongs to. Keep the column headings as they are.",
            "Import adds whatever is missing from such a file. It never changes or removes what is already here, so it is safe to run twice. You can add rows in Excel before importing; leave Category and Subcategory empty to have the AI fill them in later.",
            "Your API key is not part of the file. Enter it again on the new device.",
            "Export now and then, or use Cloud backup below. Export is also how you move data between the phone and a browser.",
            "Config > Cloud backup and restore keeps an encrypted copy on a free backup server. It is not automatic: press Back up to cloud when you want a copy. The first time it makes a recovery code and shows it; write it down. Backing up again replaces the earlier copy. The copy is encrypted on this phone before it is sent, so the server cannot read it and holds no name, email or phone number. To get it back on a new phone, open Cloud backup and restore, choose Restore from cloud and type the recovery code (it always asks). Restore only adds what is missing, and the copy you restored from stays as it was. The new phone makes its own recovery code the first time it backs up, so the two phones then back up separately.",
            "Keep the recovery code away from this phone (a password manager or paper). Without it nobody can open your cloud copy, and anyone who has it can. You can show the code again on the phone that made it. Delete the cloud copy any time from the same screen.",
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
