import AppIntents
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

  @Parameter(title: "Message")
  var text: String

  @MainActor
  func perform() async throws -> some IntentResult {
    await AppIntentDispatcher.shared.dispatch(
      name: "addBankSms",
      params: ["text": .string(text)]
    )
    return .result()
  }
}
