import AppIntents
import Foundation
internal import ExpoAppIntents

/// The "Add bank SMS" action in the Shortcuts app. An automation "When I get a message containing ..." runs it with the
/// message as its input; the text is queued on the phone and the app turns it into a transaction (src/import/phoneInbox.ts,
/// src/import/smsCapture.ts). The app does not open: JavaScript is not running here, so the text waits in the queue until
/// the app next starts or comes to the front. Keep the dispatch name and the "text" key the same as in phoneInbox.ts.
struct AddBankSmsIntent: AppIntent {
  static let title: LocalizedStringResource = "Add bank SMS"
  static let description = IntentDescription(
    "Adds the payment in a bank message to CSK Manager. Use it in an automation that runs when a bank message arrives."
  )

  // Shortcuts does not fill this in by itself (tried `inputConnectionBehavior: .connectToPreviousIntentResult` on the owner's phone: no
  // change), so the steps in Config > Bank SMS tell the owner to tap the field, Select Variable, then Shortcut Input.
  @Parameter(title: "Message")
  var text: String

  // Stays on the main actor so overlapping runs write the run record (AddBankSmsRunStore) one at a time. It never throws: the text is
  // queued first, then the run is noted, and the only thing logged is the length (never the message).
  @MainActor
  func perform() async throws -> some IntentResult {
    let length = text.count
    let empty = text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    AddBankSmsRunStore.logger.info("Add bank SMS started, \(length, privacy: .public) characters, empty: \(empty, privacy: .public)")
    let id = await AppIntentDispatcher.shared.dispatch(
      name: "addBankSms",
      params: ["text": .string(text)]
    )
    AddBankSmsRunStore.record(AddBankSmsRun(id: id, at: Date().timeIntervalSince1970 * 1000, length: length, empty: empty))
    AddBankSmsRunStore.logger.info("Add bank SMS queued \(id, privacy: .public)")
    return .result()
  }
}
