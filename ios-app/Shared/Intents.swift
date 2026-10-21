import AppIntents
import WidgetKit

/// The buttons of the widgets: they run in the widget itself, so a tap does its job at once without opening anything.
struct ToggleEntityIntent: AppIntent {
    static var title: LocalizedStringResource = "Toggle"
    static var isDiscoverable: Bool { false }

    @Parameter(title: "Entity") var entityID: String

    init() {}
    init(entityID: String) { self.entityID = entityID }

    func perform() async throws -> some IntentResult {
        Haptic.tap()
        let domain = entityID.split(separator: ".").first.map(String.init) ?? ""
        switch domain {
        case "script", "scene": try await HAClient.shared.callService(domain, "turn_on", ["entity_id": entityID])
        case "button", "input_button": try await HAClient.shared.callService(domain, "press", ["entity_id": entityID])
        default: try await HAClient.shared.callService("homeassistant", "toggle", ["entity_id": entityID])
        }
        try? await Task.sleep(nanoseconds: 600_000_000)
        return .result()
    }
}

struct AdjustThermostatIntent: AppIntent {
    static var title: LocalizedStringResource = "Change the temperature"
    static var isDiscoverable: Bool { false }

    @Parameter(title: "Thermostat") var entityID: String
    @Parameter(title: "Steps") var steps: Int

    init() {}
    init(entityID: String, steps: Int) { self.entityID = entityID; self.steps = steps }

    func perform() async throws -> some IntentResult {
        Haptic.tap()
        let e = try await HAClient.shared.state(entityID)
        let info = ThermoInfo(e, entityID: entityID)
        guard let t = info.target else { return .result() }
        let next = Swift.max(info.min, Swift.min(info.max, t + Double(steps) * info.step))
        try await HAClient.shared.callService("climate", "set_temperature", ["entity_id": entityID, "temperature": next])
        try? await Task.sleep(nanoseconds: 800_000_000)
        return .result()
    }
}

struct FeedIntent: AppIntent {
    static var title: LocalizedStringResource = "Feed"
    static var isDiscoverable: Bool { false }

    @Parameter(title: "Entity") var entityID: String

    init() {}
    init(entityID: String) { self.entityID = entityID }

    func perform() async throws -> some IntentResult {
        Haptic.tap()
        // Fed less than 10 minutes ago: the first tap only asks ("tap again to feed anyway"), the second one feeds.
        if let last = (try? await HAClient.shared.state(entityID))?.attributes["last_triggered"]?.string.flatMap(HADate.parse),
           Date().timeIntervalSince(last) < FeedGuard.tooSoon, !FeedGuard.isArmed(entityID) {
            FeedGuard.arm(entityID)
            WidgetCenter.shared.reloadTimelines(ofKind: "OkieFeeder")
            return .result()
        }
        FeedGuard.disarm(entityID)
        let domain = entityID.split(separator: ".").first.map(String.init) ?? "script"
        if domain == "button" || domain == "input_button" { try await HAClient.shared.callService(domain, "press", ["entity_id": entityID]) }
        else { try await HAClient.shared.callService(domain, "turn_on", ["entity_id": entityID]) }
        try? await Task.sleep(nanoseconds: 1_200_000_000)
        return .result()
    }
}

/// Remembers for a short while that the first tap was made, so the second tap feeds. (UserDefaults of the process the button runs in.)
enum FeedGuard {
    static let tooSoon: TimeInterval = WidgetSpec.Feeder.againMinutes * 60
    static let armedFor: TimeInterval = WidgetSpec.Feeder.armedSeconds
    private static func key(_ id: String) -> String { "feedArmed." + id }
    static func armedAt(_ id: String) -> Date? {
        let t = UserDefaults.standard.double(forKey: key(id))
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }
    static func isArmed(_ id: String) -> Bool { armedAt(id).map { Date().timeIntervalSince($0) < armedFor } ?? false }
    static func arm(_ id: String) { UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: key(id)) }
    static func disarm(_ id: String) { UserDefaults.standard.removeObject(forKey: key(id)) }
}
