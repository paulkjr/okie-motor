import SwiftUI

/// The thermostat's face: the same rules as the dashboard card (and the old Scriptable widget): the colour follows the target temperature.
struct ThermoInfo {
    var name: String
    var state: String
    var off: Bool
    var unavailable: Bool
    var current: Double?
    var target: Double?
    var min: Double
    var max: Double
    var unit: String          // "°F" or "°C"
    var status: String
    var humidity: Double?
    var step: Double
    var modes: [String]?
    var color: Color
    var entityID: String

    private static func rgb(_ h: UInt32) -> (r: Int, g: Int, b: Int) { (r: Int((h >> 16) & 255), g: Int((h >> 8) & 255), b: Int(h & 255)) }

    private static func mix(_ a: (r: Int, g: Int, b: Int), _ b: (r: Int, g: Int, b: Int), _ t: Double) -> Color {
        let t = Swift.max(0, Swift.min(1, t))
        func m(_ x: Int, _ y: Int) -> Double { (Double(x) + (Double(y) - Double(x)) * t) / 255 }
        return Color(.sRGB, red: m(a.r, b.r), green: m(a.g, b.g), blue: m(a.b, b.b), opacity: 1)
    }
    static func color(for value: Double, min: Double, max: Double, unit: String) -> Color {
        let look = DialLook.current      // the colours you set in the big thermostat's Settings > Dial, over the card's own
        let c0 = rgb(look.c0), c1 = rgb(look.c1), c2 = rgb(look.c2), c3 = rgb(look.c3), cool = look.cool, warm = look.warm
        func f(_ v: Double) -> Double { unit == "°C" ? v * 9 / 5 + 32 : v }
        let v = f(value), lo = f(min), hi = f(max)
        let bo = Swift.max(lo, Swift.min(hi, cool)); var br = Swift.max(lo, Swift.min(hi, warm))
        if br <= bo { br = bo + 1 }
        if v <= bo { return mix(c0, c1, (v - lo) / Swift.max(1, bo - lo)) }
        if v <= br { return mix(c1, c2, (v - bo) / (br - bo)) }
        return mix(c2, c3, (v - br) / Swift.max(1, hi - br))
    }

    init(_ e: HAEntity?, entityID: String, unitSetting: String? = nil) {
        let a = e?.attributes ?? [:]
        let st = e?.state ?? "unavailable"
        let unit = unitSetting ?? (a["temperature_unit"]?.string) ?? "°F"
        self.unit = unit
        self.entityID = entityID
        min = a["min_temp"]?.double ?? (unit == "°F" ? 50 : 7)
        max = a["max_temp"]?.double ?? (unit == "°F" ? 90 : 35)
        current = a["current_temperature"]?.double
        let lo = a["target_temp_low"]?.double, hi = a["target_temp_high"]?.double
        var tgt = a["temperature"]?.double
        if tgt == nil, let lo, let hi { tgt = (lo + hi) / 2 }
        if tgt == nil { tgt = current }
        target = tgt
        state = st
        off = st == "off"
        unavailable = e == nil || st == "unavailable" || st == "unknown"
        name = a["friendly_name"]?.string ?? "Thermostat"
        humidity = a["current_humidity"]?.double
        step = a["target_temp_step"]?.double ?? (unit == "°C" ? 0.5 : 1)
        let all = a["hvac_modes"]?.array?.compactMap { $0.string }
        modes = all?.filter { $0 != "off" && !($0 == "auto" && all?.contains("heat_cool") == true) }   // heat, cool, heat/cool: no separate auto
        let names = ["heat": "Heat", "cool": "Cool", "heat_cool": "Heat/Cool", "auto": "Auto", "dry": "Dry", "fan_only": "Fan"]
        let mode = names[st] ?? st.capitalized
        var s = mode
        switch a["hvac_action"]?.string {
        case "cooling": s = "Cooling"
        case "heating": s = "Heating"
        case "drying": s = "Drying"
        case "fan": s = "Fan"
        case "idle": s = mode + " · idle"
        default: break
        }
        if unavailable { s = "Not reachable" } else if off { s = "Off" }
        status = s
        if unavailable || off || tgt == nil { color = Color(.sRGB, red: 150 / 255, green: 150 / 255, blue: 150 / 255, opacity: 1) }
        else { color = ThermoInfo.color(for: tgt!, min: min, max: max, unit: unit) }
    }

    static func fmt(_ v: Double?) -> String {
        guard let v else { return "–" }
        let r = (v * 10).rounded() / 10
        return r == r.rounded() ? String(Int(r)) : String(format: "%.1f", r)
    }
    var statusLine: String {
        if unavailable { return "Not reachable right now" }
        var parts: [String] = []
        if let c = current { parts.append("Now \(ThermoInfo.fmt(c))\(unit)") }
        parts.append(status)
        return parts.joined(separator: " · ")
    }
    /// The three mode icons of the card with the active one.
    var modeIcons: [(id: String, symbol: String, active: Bool)] {
        func can(_ id: String) -> Bool {
            guard let m = modes, !m.isEmpty else { return true }
            return m.contains(id) || (id == "heat_cool" && m.contains("auto"))
        }
        let active: String? = (off || unavailable) ? nil : (state == "auto" ? "heat_cool" : state)
        let all = [("heat", "flame.fill"), ("cool", "snowflake"), ("heat_cool", "sun.max.fill")]
        return all.filter { can($0.0) }.map { ($0.0, $0.1, $0.0 == active) }
    }
}
