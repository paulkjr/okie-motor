import Foundation

enum HADate {
    private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private static let plain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime]; return f
    }()
    private static let dayOnly: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = .current; return f
    }()
    static func parse(_ s: String?) -> Date? {
        guard let s, !s.isEmpty else { return nil }
        return withFraction.date(from: s) ?? plain.date(from: s) ?? dayOnly.date(from: s)
    }
    static func string(_ d: Date) -> String { plain.string(from: d) }
}

/// One Home Assistant entity state.
struct HAEntity: Identifiable, Hashable {
    var entityId: String
    var state: String
    var attributes: [String: JSONValue]
    var lastChanged: Date?
    var lastUpdated: Date?

    var id: String { entityId }
    var domain: String { String(entityId.split(separator: ".").first ?? "") }
    var name: String { attributes["friendly_name"]?.string ?? entityId }
    var isUnavailable: Bool { state == "unavailable" || state == "unknown" }
    var isOn: Bool { state == "on" }

    func attr(_ key: String) -> JSONValue? { attributes[key] }
    func num(_ key: String) -> Double? { attributes[key]?.double }
}

extension HAEntity: Codable {
    enum CodingKeys: String, CodingKey {
        case entityId = "entity_id", state, attributes, lastChanged = "last_changed", lastUpdated = "last_updated"
    }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        entityId = try c.decode(String.self, forKey: .entityId)
        state = try c.decodeIfPresent(String.self, forKey: .state) ?? "unknown"
        attributes = try c.decodeIfPresent([String: JSONValue].self, forKey: .attributes) ?? [:]
        lastChanged = HADate.parse(try c.decodeIfPresent(String.self, forKey: .lastChanged))
        lastUpdated = HADate.parse(try c.decodeIfPresent(String.self, forKey: .lastUpdated))
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(entityId, forKey: .entityId)
        try c.encode(state, forKey: .state)
        try c.encode(attributes, forKey: .attributes)
        try c.encodeIfPresent(lastChanged.map(HADate.string), forKey: .lastChanged)
        try c.encodeIfPresent(lastUpdated.map(HADate.string), forKey: .lastUpdated)
    }
}

enum CalendarRules {
    /// The robot's own calendar is not for people: it never shows in the app, the pickers or the widgets.
    static func isHidden(id: String, name: String) -> Bool { let s = (id + " " + name).lowercased(); return WidgetSpec.Calendar.hiddenWords.contains { s.contains($0) } }
}

struct CalendarEvent: Identifiable, Hashable {
    var id = UUID()
    var calendar: String
    var summary: String
    var start: Date
    var end: Date
    var allDay: Bool
    var location: String?
}
