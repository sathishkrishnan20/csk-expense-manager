import AlarmKit
import Foundation
internal import ExpoModulesCore

/// Reads back, from iOS itself, the alarms this app has scheduled with AlarmKit, for the "Alarms set on this iPhone" list
/// (src/app/train-set.tsx). AlarmKit's `AlarmManager.alarms` returns only the alarms that belong to the calling app, so it can never list
/// anything from the Clock app or from another app. The `expo-alarm-kit` package does not expose it (its own `getAllAlarms` reads an App Group
/// list that this app never sets up), which is why this small module exists.
///
/// Returns one entry per alarm: `id` (the UUID the app scheduled it under, see alarmUuid in src/domain/trainAlarms.ts), `state`
/// ("scheduled", "countdown", "paused", "alerting" or "unknown") and, for an alarm set for a fixed moment, `epochSeconds`.
/// Keep the module name and the function name the same as in src/alarms/alarmKit.ts. The file name must match the class name.
final class TrainAlarmReader: Module {
  public func definition() -> ExpoModulesCore.ModuleDefinition {
    Name("TrainAlarmReader")

    AsyncFunction("getScheduledAlarms") { () async throws -> [[String: Any]] in
      guard #available(iOS 26.0, *) else { return [] }
      let alarms = try AlarmManager.shared.alarms
      return alarms.map { alarm in
        var item: [String: Any] = ["id": alarm.id.uuidString]
        switch alarm.state {
        case .scheduled: item["state"] = "scheduled"
        case .countdown: item["state"] = "countdown"
        case .paused: item["state"] = "paused"
        case .alerting: item["state"] = "alerting"
        @unknown default: item["state"] = "unknown"
        }
        if let schedule = alarm.schedule, case .fixed(let date) = schedule {
          item["epochSeconds"] = date.timeIntervalSince1970
        }
        return item
      }
    }
  }
}
