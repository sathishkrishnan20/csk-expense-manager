import Foundation
import os

/// One record per run of the "Add bank SMS" action: when iOS ran it, which queue entry it made, and how long the text was. The text
/// itself is never kept here. Config > Bank SMS lists these (src/import/smsRunLog.ts), so a message that iOS never handed to the action
/// shows up as a missing row, and one that was handed over but not saved shows up as a row with no result.
struct AddBankSmsRun: Codable {
  let id: String  // the queue's id for the invocation, the same id JavaScript sees
  let at: Double  // milliseconds since 1970
  let length: Int
  let empty: Bool  // the Message field arrived empty or blank (the Shortcut's field is not set to Shortcut Input)
}

enum AddBankSmsRunStore {
  static let logger = Logger(subsystem: Bundle.main.bundleIdentifier ?? "CSKManager", category: "AddBankSms")

  private static let key = "csk.addBankSms.runs"
  private static let limit = 50

  /// Only called from `AddBankSmsIntent.perform()`, which runs on the main actor, so two overlapping runs write one at a time.
  static func record(_ run: AddBankSmsRun) {
    var runs = read()
    runs.append(run)
    if runs.count > limit { runs.removeFirst(runs.count - limit) }
    guard let data = try? JSONEncoder().encode(runs) else {
      logger.error("Could not save the run record for \(run.id, privacy: .public)")
      return
    }
    UserDefaults.standard.set(data, forKey: key)
  }

  static func read() -> [AddBankSmsRun] {
    guard let data = UserDefaults.standard.data(forKey: key),
      let runs = try? JSONDecoder().decode([AddBankSmsRun].self, from: data)
    else { return [] }
    return runs
  }
}
