import AppIntents
import SwiftUI

/// The two looks of the lights card. Chosen in the widget's settings (long-press the widget > Edit Widget > Design). The colours are in widgets/widgets.json (lights, lights.bright).
enum LightsDesign: String, AppEnum, CaseIterable {
    case dark, bright

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Design"
    static var caseDisplayRepresentations: [LightsDesign: DisplayRepresentation] = [.dark: "Dark", .bright: "Bright"]
}

struct LightItem: Identifiable {
    var id: String
    var name: String
    var caption: String?        // the room, for a switch or light ("Bedroom")
    var state: String?          // "On" / "Off" for a switch or light, nothing for a script
    var glyph: LightGlyph
    var ink: Color              // the icon when it is lit
    var disc: Color             // the circle behind the icon when it is lit
    var isOn: Bool
    var lit: Bool               // scripts are always drawn lit, a switch only when it is on

    /// The look of a button: the names and colours of the old shortcuts for the four usual ones, a plain light bulb for the rest.
    static func from(_ e: HAEntity, area: String? = nil) -> LightItem {
        let id = e.entityId
        let isSwitch = ["switch", "light", "input_boolean"].contains(e.domain)
        func make(_ name: String, _ glyph: LightGlyph, _ ink: UInt32, _ disc: UInt32) -> LightItem {
            LightItem(id: id, name: name, caption: isSwitch ? area : nil, state: isSwitch ? (e.isOn ? "On" : "Off") : nil, glyph: glyph,
                      ink: Color(hex: ink), disc: Color(hex: disc), isOn: e.isOn, lit: !isSwitch || e.isOn)
        }
        if let t = WidgetSpec.Lights.tiles.first(where: { $0.entity == id }) {
            return make(t.name, LightGlyph(rawValue: t.glyph) ?? .bulb, t.ink, t.disc)
        }
        let s = (id + " " + e.name).lowercased()
        var name = e.name
        if name.lowercased().hasPrefix("govee ") { name = String(name.dropFirst(6)) }
        if s.contains("sleep") || s.contains("night") { return make(name, .moon, 0x7c7cff, 0x38387a) }
        if s.contains("cozy") || s.contains("sofa") || s.contains("couch") { return make(name, .sofa, 0xee8a5c, 0x5b3a30) }
        return make(name, .bulb, 0xf5c542, 0x5a4a14)
    }
}

/// What is behind the card: dark glass, or cream milk glass with a few leaves behind it (they show through the buttons).
struct LightsBackdrop: View {
    var design: LightsDesign
    var body: some View {
        switch design {
        case .dark:
            GlassBackground(top: Color(hex: WidgetSpec.Lights.background[0]), bottom: Color(hex: WidgetSpec.Lights.background[1]))
        case .bright:
            let B = WidgetSpec.Lights.Bright.self
            GeometryReader { geo in
                ZStack(alignment: .topLeading) {
                    LinearGradient(colors: [Color(hex: B.top), Color(hex: B.bottom)], startPoint: .top, endPoint: .bottom)
                    Image("feeder_leaf").resizable().scaledToFit().frame(width: geo.size.width * 0.26).rotationEffect(.degrees(205))
                        .opacity(0.38).blur(radius: 1.5).offset(x: geo.size.width * 0.76, y: -geo.size.height * 0.10)
                    Image("feeder_leaf").resizable().scaledToFit().frame(width: geo.size.width * 0.26).rotationEffect(.degrees(80))
                        .opacity(0.34).blur(radius: 1.5).offset(x: -geo.size.width * 0.09, y: geo.size.height * 0.38)
                    Image("feeder_leaf").resizable().scaledToFit().frame(width: geo.size.width * 0.22).rotationEffect(.degrees(-100))
                        .opacity(0.32).blur(radius: 2).offset(x: geo.size.width * 0.85, y: geo.size.height * 0.55)
                    ContainerRelativeShape().strokeBorder(Color.white.opacity(0.7), lineWidth: 1)
                }
                .frame(width: geo.size.width, height: geo.size.height).clipped()
            }
        }
    }
}

/// One button: a rounded tile with a round coloured icon and the name (and the room and state for a switch).
struct LightTile: View {
    let item: LightItem
    let small: Bool
    var design: LightsDesign = .dark

    private var bright: Bool { design == .bright }

    private var palette: (disc: Color, ink: Color) {
        guard bright else {
            return item.lit ? (item.disc, item.ink) : (Color(hex: WidgetSpec.Lights.offDisc), Color(hex: WidgetSpec.Lights.offInk))
        }
        let B = WidgetSpec.Lights.Bright.self
        if !item.lit { return (Color(hex: B.offDisc), Color(hex: B.offInk)) }
        switch item.glyph {
        case .sofa: return (Color(hex: B.sofaDisc), Color(hex: B.sofaInk))
        case .moon: return (Color(hex: B.moonDisc), Color(hex: B.moonInk))
        case .bedlight: return (Color(hex: B.bedDisc), Color(hex: B.bedInk))
        case .bulb: return (Color(hex: B.bulbDisc), Color(hex: B.bulbInk))
        }
    }
    private var textColor: Color { bright ? Color(hex: WidgetSpec.Lights.Bright.text) : .white }
    private var captionColor: Color { bright ? Color(hex: WidgetSpec.Lights.Bright.caption) : Color(hex: WidgetSpec.Lights.caption) }

    var body: some View {
        Button(intent: ToggleEntityIntent(entityID: item.id)) {
            Group {
                if small {
                    VStack(spacing: 4) {
                        icon(30)
                        Text(item.name).font(.system(size: 10.5, weight: .semibold)).foregroundStyle(textColor)
                            .lineLimit(2).minimumScaleFactor(0.7).multilineTextAlignment(.center)
                    }
                    .padding(.horizontal, 4)
                } else {
                    HStack(spacing: 11) {
                        icon(38)
                        VStack(alignment: .leading, spacing: 1) {
                            if let c = item.caption { Text(c).font(.system(size: 11.5, weight: .medium)).foregroundStyle(captionColor).lineLimit(1) }
                            Text(item.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(textColor)
                                .lineLimit(2).minimumScaleFactor(0.8).fixedSize(horizontal: false, vertical: true)
                            if let st = item.state { Text(st).font(.system(size: 11.5, weight: .medium)).foregroundStyle(captionColor) }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.leading, 11).padding(.trailing, 6)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(tileFill)
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(bright ? Color.white.opacity(0.85) : Color(hex: WidgetSpec.Lights.tileBorder), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    /// Dark: the dark tile at the card's glass strength. Bright: milk glass, see-through enough for the leaves behind to show.
    @ViewBuilder private var tileFill: some View {
        if bright { RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color(hex: WidgetSpec.Lights.Bright.tile).opacity(0.58)) }
        else { RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Color(hex: WidgetSpec.Lights.tile).opacity(min(1, GlassRule.current.alpha + 0.2))) }
    }

    private func icon(_ d: CGFloat) -> some View {
        ZStack {
            Circle().fill(palette.disc)
            LightGlyphView(glyph: item.glyph, color: palette.ink).frame(width: d * 0.58, height: d * 0.58)
        }
        .frame(width: d, height: d)
    }
}

/// The four buttons in two rows that fill the card, for the widget and the preview page.
struct LightsGrid: View {
    let items: [LightItem]
    let small: Bool
    var design: LightsDesign = .dark

    var body: some View {
        let gap: CGFloat = small ? 6 : 9
        VStack(spacing: gap) {
            ForEach(0..<((items.count + 1) / 2), id: \.self) { r in
                HStack(spacing: gap) {
                    ForEach(items[(r * 2)..<min(items.count, r * 2 + 2)]) { LightTile(item: $0, small: small, design: design).frame(maxHeight: .infinity) }
                    if r * 2 + 1 >= items.count { Color.clear }
                }
                .frame(maxHeight: .infinity)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
