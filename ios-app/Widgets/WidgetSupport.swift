import AppIntents
import SwiftUI
import WidgetKit

// MARK: pickers (what the widget settings list)

/// One small entity type per widget kind: the picker shows the friendly names, the widget only keeps the entity id.
protocol HAOption: AppEntity where ID == String {
    var name: String { get }
    init(id: String, name: String)
    static var domains: Set<String> { get }
    static func accepts(_ e: HAEntity) -> Bool
}
extension HAOption {
    static func accepts(_ e: HAEntity) -> Bool { domains.contains(e.domain) }
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)", subtitle: "\(id)") }
}

enum HAOptions {
    static func list<T: HAOption>(_ type: T.Type) async -> [T] {
        guard let all = try? await HAClient.shared.states() else { return [] }
        return all.filter { T.accepts($0) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
            .map { T(id: $0.entityId, name: $0.name) }
    }
    /// Offline, the picker still resolves what was chosen before (named by its id).
    static func resolve<T: HAOption>(_ ids: [String], as type: T.Type) async -> [T] {
        let known = await list(type)
        return ids.map { id in known.first { $0.id == id } ?? T(id: id, name: id) }
    }
}

struct ClimateOption: HAOption {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Thermostat"
    static var defaultQuery = ClimateQuery()
    static var domains: Set<String> { ["climate"] }
    var id: String
    var name: String
    init(id: String, name: String) { self.id = id; self.name = name }
}
struct ClimateQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ClimateOption] { await HAOptions.resolve(identifiers, as: ClimateOption.self) }
    func suggestedEntities() async throws -> [ClimateOption] { await HAOptions.list(ClimateOption.self) }
}

/// Lights, switches, scripts and scenes: everything a round button can toggle or run.
struct ControlOption: HAOption {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Light or button"
    static var defaultQuery = ControlQuery()
    static var domains: Set<String> { ["light", "switch", "script", "scene", "input_boolean", "fan", "button", "input_button"] }
    var id: String
    var name: String
    init(id: String, name: String) { self.id = id; self.name = name }
}
struct ControlQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [ControlOption] { await HAOptions.resolve(identifiers, as: ControlOption.self) }
    func suggestedEntities() async throws -> [ControlOption] { await HAOptions.list(ControlOption.self) }
}

struct FeederOption: HAOption {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Feeder script"
    static var defaultQuery = FeederQuery()
    static var domains: Set<String> { ["script", "button", "input_button"] }
    var id: String
    var name: String
    init(id: String, name: String) { self.id = id; self.name = name }
}
struct FeederQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [FeederOption] { await HAOptions.resolve(identifiers, as: FeederOption.self) }
    func suggestedEntities() async throws -> [FeederOption] { await HAOptions.list(FeederOption.self) }
}

struct CalendarOption: HAOption {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Calendar"
    static var defaultQuery = CalendarQuery()
    static var domains: Set<String> { ["calendar"] }
    var id: String
    var name: String
    init(id: String, name: String) { self.id = id; self.name = name }

    static func accepts(_ e: HAEntity) -> Bool { e.domain == "calendar" && !CalendarRules.isHidden(id: e.entityId, name: e.name) }
}
struct CalendarQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [CalendarOption] { await HAOptions.resolve(identifiers, as: CalendarOption.self) }
    func suggestedEntities() async throws -> [CalendarOption] { await HAOptions.list(CalendarOption.self) }
}

// MARK: configuration

struct ThermostatConfig: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Thermostat"
    static var description = IntentDescription("Choose the thermostat to show.")
    @Parameter(title: "Thermostat") var thermostat: ClimateOption?
    init() {}
}

struct LightsConfig: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Lights"
    static var description = IntentDescription("Pick up to four lights, switches or scripts. Left empty, it shows the usual ones.")
    @Parameter(title: "Button 1") var first: ControlOption?
    @Parameter(title: "Button 2") var second: ControlOption?
    @Parameter(title: "Button 3") var third: ControlOption?
    @Parameter(title: "Button 4") var fourth: ControlOption?
    @Parameter(title: "Design", default: .dark) var design: LightsDesign
    init() {}
    var chosen: [String] { [first, second, third, fourth].compactMap { $0?.id } }
}

struct FeederConfig: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Feeder"
    static var description = IntentDescription("Choose the script that feeds the pets.")
    @Parameter(title: "Script") var feeder: FeederOption?
    @Parameter(title: "Design", default: .classic) var design: FeederDesign
    init() {}
}

struct CalendarConfig: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Calendar"
    static var description = IntentDescription("Choose the calendars to show. Left empty, it shows all of them.")
    @Parameter(title: "Calendars") var calendars: [CalendarOption]?
    init() {}
}

// MARK: shared bits of the faces

/// Shown by every widget until the app has been signed in once (the sign-in is shared through the keychain).
struct NeedsSignIn: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "lock.fill").font(.title2).foregroundStyle(Okie.amber)
            Text("Open Okie Home and sign in").font(.system(size: 13, weight: .semibold)).multilineTextAlignment(.center).foregroundStyle(.white.opacity(0.85))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

extension View {
    /// The warm smoky glass behind every widget.
    func okieWidgetBackground() -> some View { containerBackground(for: .widget) { GlassBackground() } }
}

struct WeatherOption: HAOption {
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Weather"
    static var defaultQuery = WeatherQuery()
    static var domains: Set<String> { ["weather"] }
    var id: String
    var name: String
    init(id: String, name: String) { self.id = id; self.name = name }
}
struct WeatherQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [WeatherOption] { await HAOptions.resolve(identifiers, as: WeatherOption.self) }
    func suggestedEntities() async throws -> [WeatherOption] { await HAOptions.list(WeatherOption.self) }
}

struct WeatherConfig: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Weather"
    static var description = IntentDescription("Choose the weather place to show.")
    @Parameter(title: "Weather") var weather: WeatherOption?
    init() {}
}
