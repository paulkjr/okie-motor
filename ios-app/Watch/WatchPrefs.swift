import Foundation

/// What you choose in the Apple Watch app on the iPhone (Okie Home > Settings.bundle): which pages the watch shows and where, and the dial of the thermostat.
struct WatchPrefs: Equatable {
    var lights = true
    var lightsFirst = true
    var roomba = "left"      // left (hidden, swipe right from the thermostat), end (after the lights) or off
    var modes = "end"

    static func load() -> WatchPrefs {
        let d = UserDefaults.standard
        var p = WatchPrefs()
        if d.object(forKey: "pref_lights") != nil { p.lights = d.bool(forKey: "pref_lights") }
        if let v = d.string(forKey: "pref_lightsOrder") { p.lightsFirst = v != "last" }
        if let v = d.string(forKey: "pref_roomba") { p.roomba = v }
        if let v = d.string(forKey: "pref_modes") { p.modes = v }
        return p
    }

    /// A slider you moved becomes the dial's own value on the watch, once per change.
    static func applyDial() {
        let d = UserDefaults.standard
        for (k, pk) in [("glowBlur", "pref_glowBlur"), ("glowOpacity", "pref_glowOpacity"), ("ticks", "pref_ticks")] {
            guard d.object(forKey: pk) != nil, case let n = d.double(forKey: pk), d.object(forKey: "applied_" + pk) as? Double != n else { continue }
            DialLook.setOverride(k, n)
            d.set(n, forKey: "applied_" + pk)
        }
    }
}

enum WatchPage: Hashable { case light(String), modes, roomba }
