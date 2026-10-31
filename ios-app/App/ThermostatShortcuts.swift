import AppIntents

/// The thermostat for Siri and Shortcuts: on the Apple Watch (say "Hey Siri, set the thermostat in Okie Home", or run the shortcuts from the Shortcuts app / a watch face complication) and on the phone.
/// They run on the iPhone with the sign-in of the app, so no watch app has to be installed.
enum ThermostatLookup {
    /// The thermostat the intents talk to: the widget's own one when it exists, otherwise the first one of the house.
    static func entity() async throws -> HAEntity {
        if let e = try? await HAClient.shared.state(WidgetSpec.Thermostat.entity), !e.isUnavailable { return e }
        guard let e = try await HAClient.shared.states().first(where: { $0.domain == "climate" }) else { throw ThermostatError.none }
        return e
    }
}

enum ThermostatError: Error, CustomLocalizedStringResourceConvertible {
    case none, notSignedIn
    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .none: return "I found no thermostat in Home Assistant."
        case .notSignedIn: return "Open Okie Home once and sign in first."
        }
    }
}

private func run(_ work: () async throws -> String) async throws -> String {
    do { return try await work() }
    catch HAError.notSignedIn { throw ThermostatError.notSignedIn }
}

struct SetThermostatIntent: AppIntent {
    static var title: LocalizedStringResource = "Set the thermostat"
    static var description = IntentDescription("Sets the target temperature.")
    static var openAppWhenRun = false

    @Parameter(title: "Temperature") var temperature: Int

    static var parameterSummary: some ParameterSummary { Summary("Set the thermostat to \(\.$temperature)") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = try await run {
            let e = try await ThermostatLookup.entity()
            let info = ThermoInfo(e, entityID: e.entityId)
            let t = Swift.max(info.min, Swift.min(info.max, Double(temperature)))
            try await HAClient.shared.callService("climate", "set_temperature", ["entity_id": e.entityId, "temperature": t])
            return "\(info.name) is set to \(ThermoInfo.fmt(t)) degrees."
        }
        return .result(dialog: "\(text)")
    }
}

struct ChangeThermostatIntent: AppIntent {
    static var title: LocalizedStringResource = "Warmer or cooler"
    static var description = IntentDescription("Moves the target temperature up or down by some degrees.")
    static var openAppWhenRun = false

    @Parameter(title: "Degrees (negative is cooler)", default: 1) var degrees: Int

    static var parameterSummary: some ParameterSummary { Summary("Change the thermostat by \(\.$degrees) degrees") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = try await run {
            let e = try await ThermostatLookup.entity()
            let info = ThermoInfo(e, entityID: e.entityId)
            guard let now = info.target else { return "\(info.name) has no target right now." }
            let t = Swift.max(info.min, Swift.min(info.max, now + Double(degrees)))
            try await HAClient.shared.callService("climate", "set_temperature", ["entity_id": e.entityId, "temperature": t])
            return "\(info.name) is set to \(ThermoInfo.fmt(t)) degrees."
        }
        return .result(dialog: "\(text)")
    }
}

enum ThermostatMode: String, AppEnum {
    case heat, cool, auto, off
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Mode"
    static var caseDisplayRepresentations: [ThermostatMode: DisplayRepresentation] = [.heat: "Heating", .cool: "Cooling", .auto: "Heat and cool", .off: "Off"]
}

struct SetThermostatModeIntent: AppIntent {
    static var title: LocalizedStringResource = "Thermostat mode"
    static var description = IntentDescription("Heating, cooling, heat and cool, or off.")
    static var openAppWhenRun = false

    @Parameter(title: "Mode") var mode: ThermostatMode

    static var parameterSummary: some ParameterSummary { Summary("Set the thermostat mode to \(\.$mode)") }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = try await run {
            let e = try await ThermostatLookup.entity()
            let have = e.attributes["hvac_modes"]?.array?.compactMap { $0.string } ?? []
            var m = mode.rawValue
            if m == "auto", have.contains("heat_cool"), !have.contains("auto") { m = "heat_cool" }
            try await HAClient.shared.callService("climate", "set_hvac_mode", ["entity_id": e.entityId, "hvac_mode": m])
            return "\(e.name) is now on \(m == "off" ? "off" : m.replacingOccurrences(of: "_", with: " "))."
        }
        return .result(dialog: "\(text)")
    }
}

struct ThermostatStatusIntent: AppIntent {
    static var title: LocalizedStringResource = "How warm is it"
    static var description = IntentDescription("Tells the temperature in the house and what the thermostat is doing.")
    static var openAppWhenRun = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = try await run {
            let e = try await ThermostatLookup.entity()
            let i = ThermoInfo(e, entityID: e.entityId)
            let now = i.current.map { "It is \(ThermoInfo.fmt($0)) degrees. " } ?? ""
            let goal = i.target.map { " Target \(ThermoInfo.fmt($0))." } ?? ""
            return "\(now)\(i.name): \(i.status).\(goal)"
        }
        return .result(dialog: "\(text)")
    }
}

struct OkieShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: SetThermostatIntent(), phrases: ["Set the thermostat in \(.applicationName)", "Set the temperature in \(.applicationName)"], shortTitle: "Set temperature", systemImageName: "thermometer.medium")
        AppShortcut(intent: ChangeThermostatIntent(), phrases: ["Change the thermostat in \(.applicationName)", "Warmer in \(.applicationName)"], shortTitle: "Warmer or cooler", systemImageName: "plusminus")
        AppShortcut(intent: SetThermostatModeIntent(), phrases: ["Thermostat mode in \(.applicationName)"], shortTitle: "Thermostat mode", systemImageName: "flame")
        AppShortcut(intent: ThermostatStatusIntent(), phrases: ["How warm is it in \(.applicationName)", "Thermostat status in \(.applicationName)"], shortTitle: "How warm is it", systemImageName: "thermometer")
    }
}
