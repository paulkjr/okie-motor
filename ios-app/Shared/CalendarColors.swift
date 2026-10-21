import SwiftUI

/// The colour of a calendar and which calendars are hidden: the same on the card, in the app and in the widgets. The card keeps both in its synced settings (`calendarColors`, `calendarHidden`);
/// the app copies them into the shared keychain (CardSettings), and a calendar without a picked colour gets one by the card's own rule (the first palette colour nobody uses, calendars in name order).
enum CalendarColors {
    /// the card's palette (src/okie-feeds.js CAL_PALETTE)
    static let palette: [UInt32] = [0x0a84ff, 0x32d74b, 0xff9f0a, 0xff453a, 0xbf5af2, 0x64d2ff, 0xffd60a, 0xff6482, 0xac8e68]
    private static let colorsAccount = "calendarColors", hiddenAccount = "calendarHidden"

    /// the colours picked on the card: calendar id -> "#rrggbb"
    static var saved: [String: String] {
        guard let d = Keychain.get(account: colorsAccount), let m = try? JSONDecoder().decode([String: String].self, from: d) else { return [:] }
        return m
    }
    @discardableResult static func save(_ m: [String: String]) -> Bool {
        guard m != saved, let d = try? JSONEncoder().encode(m) else { return false }
        Keychain.set(d, account: colorsAccount); return true
    }

    /// the calendars switched off on the card
    static var hidden: Set<String> {
        guard let d = Keychain.get(account: hiddenAccount), let a = try? JSONDecoder().decode([String].self, from: d) else { return [] }
        return Set(a)
    }
    @discardableResult static func saveHidden(_ s: Set<String>) -> Bool {
        guard s != hidden, let d = try? JSONEncoder().encode(Array(s).sorted()) else { return false }
        Keychain.set(d, account: hiddenAccount); return true
    }

    static func parse(_ hex: String) -> UInt32? {
        guard hex.count == 7, hex.hasPrefix("#") else { return nil }
        return UInt32(hex.dropFirst(), radix: 16)
    }

    /// One colour per calendar that never changes: the picked one, else the first palette colour nobody uses yet (calendars taken in name order), like the card.
    static func assign(_ ids: [String], saved: [String: String]) -> [String: UInt32] {
        var out: [String: UInt32] = [:], used = Set<UInt32>()
        for id in ids { if let c = saved[id].flatMap(parse) { out[id] = c; used.insert(c) } }
        for id in ids.sorted() where out[id] == nil {
            let c = palette.first { !used.contains($0) } ?? palette[out.count % palette.count]
            out[id] = c; used.insert(c)
        }
        return out
    }

    /// `all`: every calendar there is (so the automatic colours match the card's); the picked colours come from the card.
    static func color(_ calendar: String, in all: [String]) -> Color {
        let ids = all.contains(calendar) ? all : all + [calendar]
        return Color(hex: assign(ids, saved: saved)[calendar] ?? palette[0])
    }
}
