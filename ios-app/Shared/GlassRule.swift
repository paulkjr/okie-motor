import SwiftUI

/// The card's glass rule (Settings > Design > Liquid glass), as the widgets need it. The app reads the numbers you set in the card and keeps them in the shared keychain.
struct GlassRule: Codable, Equatable {
    var cardStyle = WidgetSpec.Glass.cardStyle        // "dark" or "light"
    var cardTint = Double(WidgetSpec.Glass.cardTint)  // %
    var cardEdge = Double(WidgetSpec.Glass.cardEdge)  // %
    var tint = 76.0                                   // % Darkness of the menu bar, search bar and windows (Settings > Design > Liquid glass)
    var blur = 20.0                                   // px Blurriness of the same
    var cardBlur = 60.0                               // px Blurriness of the glass behind the cards

    init() {}
    init(from decoder: Decoder) throws {              // an older saved rule has no tint / blur: the card's defaults then
        let c = try decoder.container(keyedBy: CodingKeys.self)
        cardStyle = try c.decodeIfPresent(String.self, forKey: .cardStyle) ?? cardStyle
        cardTint = try c.decodeIfPresent(Double.self, forKey: .cardTint) ?? cardTint
        cardEdge = try c.decodeIfPresent(Double.self, forKey: .cardEdge) ?? cardEdge
        tint = try c.decodeIfPresent(Double.self, forKey: .tint) ?? tint
        blur = try c.decodeIfPresent(Double.self, forKey: .blur) ?? blur
        cardBlur = try c.decodeIfPresent(Double.self, forKey: .cardBlur) ?? cardBlur
    }

    /// How much of what is behind the menu bar glass is covered: the card's own rule (rgba(18,18,18, .3 + Darkness * .85)).
    var menuAlpha: Double { min(0.97, 0.3 + tint / 100 * 0.85) }

    /// How much of the wallpaper is covered: the card's own rule (dark glass is 2.4 times the tint, at most 88 %) times the widgets' strength.
    var alpha: Double {
        let card = cardStyle == "light" ? cardTint / 100 : min(0.88, cardTint / 100 * 2.4)
        return min(0.96, card * Double(WidgetSpec.Glass.strength))
    }
    /// The card's own cover (what the app's cards have; the widgets add their strength on top because they have no blur behind them).
    var cardAlpha: Double { cardStyle == "light" ? cardTint / 100 : min(0.88, cardTint / 100 * 2.4) }
    /// The light rim around a card.
    var edge: Double { cardEdge / 100 }

    private static let account = "glass"
    private static let lock = NSLock()
    private static var cached: (at: Date, value: GlassRule)?
    static var current: GlassRule {
        lock.lock(); defer { lock.unlock() }
        if let c = cached, Date().timeIntervalSince(c.at) < 2 { return c.value }
        let r = Keychain.get(account: account).flatMap { try? JSONDecoder().decode(GlassRule.self, from: $0) } ?? GlassRule()
        cached = (Date(), r)
        return r
    }
    @discardableResult
    static func save(_ r: GlassRule) -> Bool {
        guard r != current, let d = try? JSONEncoder().encode(r) else { return false }
        Keychain.set(d, account: account)
        lock.lock(); cached = nil; lock.unlock()
        return true
    }
    /// From the card's settings.glass object (any part may be missing: the card's defaults apply).
    static func from(json: String) -> GlassRule {
        var r = GlassRule()
        guard let d = json.data(using: .utf8), let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] else { return r }
        if let s = o["cardStyle"] as? String, s == "dark" || s == "light" { r.cardStyle = s }
        if let t = (o["cardTint"] as? NSNumber)?.doubleValue { r.cardTint = min(100, max(0, t)) }
        if let e = (o["cardEdge"] as? NSNumber)?.doubleValue { r.cardEdge = min(100, max(0, e)) }
        if let t = (o["tint"] as? NSNumber)?.doubleValue { r.tint = min(100, max(0, t)) }
        if let b = (o["blur"] as? NSNumber)?.doubleValue { r.blur = min(100, max(0, b)) }
        if let b = (o["cardBlur"] as? NSNumber)?.doubleValue { r.cardBlur = min(100, max(0, b)) }
        return r
    }
}

/// The widget's glass: the warm smoky gradient at the card's transparency, with the card's thin even outline (not a bright gradient rim: that looked shiny).
struct GlassBackground: View {
    var top: Color = Okie.glassTop
    var bottom: Color = Okie.glassBottom
    var body: some View {
        let g = GlassRule.current
        ZStack {
            LinearGradient(colors: [top.opacity(g.alpha), bottom.opacity(g.alpha)], startPoint: .top, endPoint: .bottom)
            ContainerRelativeShape().strokeBorder(Color.white.opacity(min(0.4, g.edge * 1.5)), lineWidth: 1)
        }
    }
}

/// The glass of the app's own buttons (the weather bar, the calendar's top buttons): the same glass as the cards of the dashboard (Settings > Design > Liquid glass > Cards): the warm smoky gradient at
/// the card's transparency, a blur behind it when the card has one, the thin light rim. No iOS 26 "Liquid Glass".
struct OkieGlass: ViewModifier {
    func body(content: Content) -> some View {
        let g = GlassRule.current
        content.background {
            ZStack {
                if g.cardBlur > 1 { Capsule().fill(.ultraThinMaterial) }
                Capsule().fill(LinearGradient(colors: [Okie.glassTop.opacity(g.cardAlpha), Okie.glassBottom.opacity(g.cardAlpha)], startPoint: .top, endPoint: .bottom))
                Capsule().strokeBorder(Color.white.opacity(min(0.4, g.edge * 1.5)), lineWidth: 1)
            }
        }
    }
}
