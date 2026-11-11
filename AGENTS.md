This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Working rules (set by the owner; these override anything below)

- **Make code changes only. Do not run or test the app.** Do not start the dev server, open the iOS simulator or Expo Go, run `expo run:ios`, build the app, take screenshots, or otherwise launch it to check a change. The owner tests the app on their own iPhone.
- The quick static checks are allowed but not required: `npm run typecheck`, and `npm test` (unit tests that run under Node, not in the app). Tests live in `tests/`, mirroring `src/`; do not put test files under `src/` (Expo Router would treat files in `src/app` as routes).
- When you finish, say plainly what you changed and that the change was not run in the app, so the owner knows what to test.

## Platforms: iOS, Android and web

The app runs on iOS today, has a web build, and **Android is planned**. Every `Platform.OS` / `Platform.select` branch must handle `ios`, `android` and `web` explicitly; do not use `!== "web"` as a stand-in for "a phone", and do not let Android fall through to iOS behaviour. Where a feature is not built for a platform yet, say so on screen. Bank SMS on Android will read messages on the phone itself, not through Shortcuts. See `docs/ARCHITECTURE.md` §9.

## Database (SQLite): always name a CHECK constraint

SQLite 3.53 (bundled by `expo-sqlite`) can change a CHECK in place with `ALTER TABLE ... DROP CONSTRAINT <name>` then `ADD CONSTRAINT <name> CHECK (...)`, but **only if the constraint has a name**. An unnamed `CHECK (...)` can never be dropped that way, so widening it forces a full table rebuild (this happened to `transactions.source` in schema version 17). Rules:

- Never write an unnamed CHECK in a `CREATE TABLE` or `ADD COLUMN`. Write `col TEXT NOT NULL CONSTRAINT <col>_check CHECK (col IN (...))` (for example `source_check`) and keep the name unique within the table.
- To change the allowed values of a named CHECK, use the two `ALTER TABLE` statements in a migration step guarded by "is the current CREATE statement still the old one" (see `needsTransactionsRebuild` and `REBUILD_TRANSACTIONS` in `src/db/schemaSql.ts`); do not rebuild the table.
- **Whenever a table has to be rebuilt, for any reason (a new column type, a dropped column, a widened CHECK), write the new definition with EVERY CHECK on that table named** (`CONSTRAINT <col>_check CHECK (...)`), not only the one being changed, and make the rebuild detection (like `needsTransactionsRebuild` in `src/db/schemaSql.ts`) treat a table with any unnamed CHECK as old. That way the next change to its allowed values is an ALTER, not another rebuild. A rebuild copies every row unchanged, runs once, and has a test in `tests/db/` against Node's SQLite.
- Existing databases still hold the older unnamed CHECKs on gifts, assets, train journeys and groups (the transactions table was rebuilt with all three of its checks named in version 17); leave those tables alone until one of them has to be rebuilt anyway, and name all of its checks then.
- Prefer a lookup in code over a CHECK when the values may grow.

## Ask AI: every feature that keeps data registers a capability

Ask AI (the chat, `src/ui/ChatView.tsx` and `src/chat/`) can only look at what a *capability* gives it, so a feature that is not registered is invisible to it. **When you add a feature that stores data the owner might ask about (a new table, list or page), add its capability in the same change:**

- Write `src/chat/capabilities/<feature>.ts`: a `Capability` (`src/domain/chatTools.ts`) with a stable snake_case `id`, a `title`, a one-line `description`, and read-only `tools`. Each tool has a snake_case `name` (unique across the app), a `description` of what it returns and when to use it, `args` (a spec: `string` with optional `options`, `date`, `integer`, `string_list`), and a `run` that returns plain data. Add the capability to `CAPABILITIES` in `src/chat/capabilities/index.ts`; the AI's instructions, the page's note and the tests pick it up from there. There are no on/off switches: every tool is always offered, because the owner is the one asking, so write each tool to return only what it needs to (no internal ids, no bank text).
- Read the data through `ChatData` (`src/chat/types.ts`), adding a method for it and wiring it in `src/chat/data.ts`. Keep the capability file free of database and React Native imports, so it is tested in Node with fake data (`tests/chat/capabilities.test.ts`; `registryProblems` already checks names and descriptions).
- Tools never write. A change the AI suggests is a proposal that waits for the owner's tap (see `ChatProposal` and `acceptProposal`), as with a new subcategory.
- Whatever the AI sends as arguments is checked by `validateArgs` against the tool's spec. **Never put a value the AI wrote into SQL as text**; build the statement from fixed pieces with parameters, as `src/domain/chatQuery.ts` does.
- Keep results short (a few dozen rows at most) and money as text like "₹2,440.00": the AI must not add up numbers itself, so give it totals.
- Mention the new kind of data in the help topic "Ask AI" (`src/domain/helpContent.ts`) and in `docs/ARCHITECTURE.md`.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Typecheck (`npm run typecheck`) is a cheap check you may run before finishing. Do not launch the app to test (see Working rules above).

## Navigation & Routing

- Routes live in `src/app/`, all as screens of one flat root `Stack` (Home, Transactions, Charts, Config, Assets, Gifts, Groups, `add`, `import`, `help`, ...). There is no tab navigator or bottom bar: pages are reached from the menu drawer (`src/ui/AppDrawer.tsx`) and the floating + button (`src/ui/AddMenu.tsx`). Expo Router 58 has no React Navigation; see `docs/ARCHITECTURE.md` §5.
- Read `docs/ARCHITECTURE.md` before changing structure, the LLM providers, `app.json` (do not change `slug` or `ios.bundleIdentifier`), or `metro.config.js`.

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
