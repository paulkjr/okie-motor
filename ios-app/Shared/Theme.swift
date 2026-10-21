import SwiftUI

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255, opacity: opacity)
    }
}

/// The Okie look: warm smoky glass over a room picture, white ink, a colour for what is on.
enum Okie {
    static let glassTop = Color(hex: WidgetSpec.Glass.top)
    static let glassBottom = Color(hex: WidgetSpec.Glass.bottom)
    static let darkInk = Color(hex: WidgetSpec.Accent.ink)
    static let dim = Color.white.opacity(0.62)
    static let amber = Color(hex: WidgetSpec.Accent.amber)
    static let cardRadius: CGFloat = 28

    static var glass: LinearGradient {
        LinearGradient(colors: [glassTop, glassBottom], startPoint: .top, endPoint: .bottom)
    }
}

struct GlassCard: ViewModifier {
    var radius: CGFloat = Okie.cardRadius
    func body(content: Content) -> some View {
        content
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .background(Color.black.opacity(0.18), in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(Color.white.opacity(0.14), lineWidth: 1))
    }
}
extension View {
    func glassCard(radius: CGFloat = Okie.cardRadius) -> some View { modifier(GlassCard(radius: radius)) }
}

// MARK: the card's fonts (Manrope for the big numbers and names, Sora for the small text), loaded from the files in Resources/Fonts

import CoreText

enum OkieFont {
    /// Registers the two font files of this process once (the app and the widget each have their own copy of the bundle).
    private static let registered: Bool = {
        for name in ["Manrope-latin", "Sora-tab"] {
            if let url = Bundle.main.url(forResource: name, withExtension: "ttf") { CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil) }
        }
        return true
    }()

    private static func make(_ postScript: String, _ weight: CGFloat, _ size: CGFloat) -> Font {
        _ = registered
        let wght = 2003265652      // the 'wght' axis of a variable font
        let d = CTFontDescriptorCreateWithAttributes([kCTFontNameAttribute: postScript, kCTFontVariationAttribute: [wght: weight]] as CFDictionary)
        return Font(CTFontCreateWithFontDescriptor(d, size, nil))
    }
    /// Manrope, weight 200 to 800
    static func manrope(_ weight: CGFloat, _ size: CGFloat) -> Font { make("Manrope-ExtraLight", weight, size) }
    /// Sora with tabular figures, weight 400 to 800
    static func sora(_ weight: CGFloat, _ size: CGFloat) -> Font { make("Sora-Regular", weight, size) }
}
