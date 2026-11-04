internal import ExpoModulesCore
import Foundation

/// Lets JavaScript read the run records `AddBankSmsRunStore` keeps (src/import/smsRunLog.ts). Read only. The class name, the file name
/// and the name below must stay the same (Expo inline modules).
final class SmsRunLog: Module {
  public func definition() -> ExpoModulesCore.ModuleDefinition {
    Name("SmsRunLog")

    Function("read") { () -> String in
      let data = (try? JSONEncoder().encode(AddBankSmsRunStore.read())) ?? Data("[]".utf8)
      return String(decoding: data, as: UTF8.self)
    }
  }
}
