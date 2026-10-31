import Foundation

/// The dial look you set in the big thermostat (Settings > Dial): the four colours of the scale and where it turns from cool to warm.
/// The big thermostat page saves it here (shared keychain), so the thermostat widget wears the same colours, like the old Scriptable widget did.
struct DialLook {
    var c0 = WidgetSpec.Thermostat.Scale.c0, c1 = WidgetSpec.Thermostat.Scale.c1, c2 = WidgetSpec.Thermostat.Scale.c2, c3 = WidgetSpec.Thermostat.Scale.c3
    var cool = Double(WidgetSpec.Thermostat.Scale.cool), warm = Double(WidgetSpec.Thermostat.Scale.warm)
    /// The light around the dial and its marks (Settings > Dials of the card): softness in px (0 to 160), spread (0 to 60), brightness in % (0 to 100) and the number of marks in % (40 to 160). The defaults are the card's.
    var glowBlur = 80.0, glowSpread = 15.0, glowOpacity = 65.0, ticks = 100.0

    /// How the wheel is drawn for this look, as factors of the default drawing (1 = the design).
    var haze: Double { max(0.05, glowBlur / 80) }
    var brightness: Double { glowOpacity / 65 }
    var tickCount: Int { max(40, Int((197 * ticks / 100).rounded())) }

    /// Changes made on the watch itself (its own settings page); they stay over what the phone sends. Only the watch app writes them.
    static let overrideKey = "dialLookOverride"
    static var overrides: [String: Double] { (UserDefaults.standard.dictionary(forKey: overrideKey) ?? [:]).compactMapValues { ($0 as? NSNumber)?.doubleValue } }
    static func setOverride(_ key: String, _ value: Double?) {
        var o = overrides
        o[key] = value
        UserDefaults.standard.set(o, forKey: overrideKey)
        lock.lock(); cached = nil; lock.unlock()
    }

    private static let account = "dialLook"
    private static let lock = NSLock()
    private static var cached: (at: Date, value: DialLook)?

    /// What the page saved (the whole look object as JSON text), or nil when nothing was saved yet.
    static var savedJSON: String? { Keychain.get(account: account).flatMap { String(data: $0, encoding: .utf8) } }

    /// The look in use: the card's defaults, with whatever was saved over them. Read at most every couple of seconds.
    static var current: DialLook {
        lock.lock(); defer { lock.unlock() }
        if let c = cached, Date().timeIntervalSince(c.at) < 2 { return c.value }
        var v = parse(savedJSON)
        v.apply(overrides)
        cached = (Date(), v)
        return v
    }

    static func parse(_ json: String?) -> DialLook {
        var l = DialLook()
        guard let json, let d = json.data(using: .utf8), let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return l }
        func hex(_ k: String) -> UInt32? {
            guard let s = o[k] as? String, s.count == 7, s.hasPrefix("#") else { return nil }
            return UInt32(s.dropFirst(), radix: 16)
        }
        if let v = hex("c0") { l.c0 = v }
        if let v = hex("c1") { l.c1 = v }
        if let v = hex("c2") { l.c2 = v }
        if let v = hex("c3") { l.c3 = v }
        var nums: [String: Double] = [:]
        for k in ["glowBlur", "glowSpread", "glowOpacity", "ticks"] { if let n = (o[k] as? NSNumber)?.doubleValue { nums[k] = n } }
        l.apply(nums)
        if let c = (o["cool"] as? NSNumber)?.doubleValue, let w = (o["warm"] as? NSNumber)?.doubleValue, c >= 40, c <= 98, w > c, w <= 99 { l.cool = c; l.warm = w }
        return l
    }

    mutating func apply(_ o: [String: Double]) {
        if let v = o["glowBlur"] { glowBlur = min(160, max(0, v)) }
        if let v = o["glowSpread"] { glowSpread = min(60, max(0, v)) }
        if let v = o["glowOpacity"] { glowOpacity = min(100, max(0, v)) }
        if let v = o["ticks"] { ticks = min(160, max(40, v)) }
    }

    private static var lastCard: String?
    /// The look the card has in its own settings (settings.thermo): when the card's look changes (and is not empty) it becomes the look everywhere. The card repeats its look every few seconds
    /// while it is open behind the big thermostat: only a change counts, so what is set in the big thermostat itself stays until the card's look changes again.
    @discardableResult
    static func saveFromCard(_ json: String) -> Bool {
        guard json != lastCard else { return false }
        lastCard = json
        guard let d = json.data(using: .utf8), let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any], !o.isEmpty else { return false }
        return save(json)
    }

    /// Keeps what the page sent; true when it changed (the widgets should then draw again).
    @discardableResult
    static func save(_ json: String) -> Bool {
        guard json != (savedJSON ?? ""), let d = json.data(using: .utf8) else { return false }
        Keychain.set(d, account: account)
        lock.lock(); cached = nil; lock.unlock()
        return true
    }
}
