import AppIntents
import SwiftUI

/// The look of the feeder card. Chosen in the widget's settings (long-press the widget > Edit Widget > Design). The colours of each are in widgets/widgets.json (feeder.designs); the pictures
/// (the peeking cat, the leaves, the neon bowl, the bowl and the two cats) are in Shared/FeederArt.xcassets, cut from Paul's five mock-ups.
enum FeederDesign: String, AppEnum, CaseIterable {
    case classic, peek, leaves, neon, bowl

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Design"
    static var caseDisplayRepresentations: [FeederDesign: DisplayRepresentation] = [
        .classic: "Orange cat", .peek: "Peeking cat", .leaves: "Green leaves", .neon: "Neon bowl", .bowl: "Bowl",
    ]

    var spec: WidgetSpec.Feeder.Design { WidgetSpec.Feeder.designs.first { $0.id == rawValue } ?? WidgetSpec.Feeder.designs[0] }
    var top: Color { Color(hex: spec.top) }
    var bottom: Color { Color(hex: spec.bottom) }
    var accent: Color { Color(hex: spec.accent) }
}

/// What is behind the card: the glass for the classic one, a solid colour wash for the others (their pictures need a steady ground).
struct FeederBackdrop: View {
    var design: FeederDesign
    var medium = true          // (kept for the callers; every size uses the same wash)
    var body: some View {
        if design == .classic { GlassBackground() }
        else if design == .bowl {        // Paul's picture: bowl, floor and cats; the card's text is drawn over it
            GeometryReader { geo in
                Group {
                    if medium { Image("feeder_bowl_scene").resizable().frame(width: geo.size.width, height: geo.size.height) }        // a little taller than the picture: stretched
                    else {          // small: the picture sits lower (the bowl and floor), the dark top of the card is left clear for the name
                        let h = geo.size.height * 0.80
                        ZStack(alignment: .bottomLeading) {
                            Color(hex: 0x4a3933)
                            Image("feeder_bowl_scene").resizable().frame(width: h * 2.259, height: h).frame(width: geo.size.width, height: h, alignment: .leading).clipped()
                                .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.22), .init(color: .black, location: 1)], startPoint: .top, endPoint: .bottom))
                        }
                        .frame(width: geo.size.width, height: geo.size.height, alignment: .bottom)
                    }
                }
                ContainerRelativeShape().strokeBorder(Color.white.opacity(0.10), lineWidth: 1)
            }
        }
        else {
            ZStack {
                LinearGradient(colors: [design.top, design.bottom], startPoint: .top, endPoint: .bottom)
                ContainerRelativeShape().strokeBorder(Color.white.opacity(0.10), lineWidth: 1)
            }
        }
    }
}

/// The feeder card in the chosen design, drawn at any size (the widget and the preview sheet in the app both use it). Everything is in design units: the card is 158 high, a medium one about 338 wide.
struct FeederCardView: View {
    var design: FeederDesign
    var medium: Bool
    var title: String            // "FEED THE BEASTS"
    var line: String
    var ask: Bool                // the line is the question "tap again?": drawn in the accent colour
    var dim = false

    private var words: (first: String, last: String) {
        let w = title.split(separator: " ").map(String.init)
        return (w.dropLast().joined(separator: " "), w.last ?? title)
    }
    private var lineColor: Color { ask ? design.accent : .white.opacity(0.7) }

    /// A picture from the art folder at a width, placed by its top left corner; `fade` softens its left edge into the card, `bottomFade` the bottom one.
    private func art(_ name: String, width: CGFloat, x: CGFloat, y: CGFloat, k: CGFloat, fade: CGFloat = 0, fadeEnd: CGFloat = 0, topFade: CGFloat = 0, blend: BlendMode = .normal, opacity: Double = 1, rotate: Double = 0, flip: Bool = false, stretch: CGFloat = 1) -> some View {
        let size = UIImage(named: name)?.size ?? CGSize(width: 1, height: 1)
        let w = width * k, h = w * size.height / size.width
        let sideStops: [Gradient.Stop] = [.init(color: fade > 0 ? .clear : .black, location: 0), .init(color: .black, location: max(fade, 0.001)),
                                          .init(color: .black, location: min(1 - max(fadeEnd, 0.001), 0.999)), .init(color: fadeEnd > 0 ? .clear : .black, location: 1)]
        return Image(name).resizable().interpolation(.high).frame(width: w, height: h)
            .mask(LinearGradient(stops: sideStops, startPoint: .leading, endPoint: .trailing))
            .mask(LinearGradient(stops: topFade > 0 ? [.init(color: .clear, location: 0), .init(color: .black, location: topFade)] : [.init(color: .black, location: 0), .init(color: .black, location: 1)], startPoint: .top, endPoint: .bottom))
            .blendMode(blend).opacity(opacity * (dim ? 0.55 : 1))
            .scaleEffect(x: flip ? -1 : 1, y: stretch, anchor: .bottom).rotationEffect(.degrees(rotate))
            .offset(x: x * k, y: y * k)
    }

    private func text(_ s: String, size: CGFloat, y: CGFloat, x: CGFloat, w: CGFloat, k: CGFloat, heavy: Bool, color: Color? = nil, lines: Int = 1, tracking: CGFloat = 0.09) -> some View {
        Group {
            if heavy {
                Text(s).font(OkieFont.manrope(800, size * k)).tracking(size * k * tracking).foregroundStyle(color ?? .white.opacity(0.94)).lineLimit(1).minimumScaleFactor(0.6)
            } else {
                Text(s).font(OkieFont.sora(600, size * k)).foregroundStyle(color ?? lineColor).lineLimit(lines).minimumScaleFactor(0.7)
            }
        }
        .frame(width: w * k, alignment: .leading).offset(x: x * k, y: y * k)
    }

    var body: some View {
        GeometryReader { geo in
            let H = geo.size.height, k = H / 158, W = geo.size.width / k          // W in design units
            let a = design.accent
            ZStack(alignment: .topLeading) {
                switch design {
                case .classic: classic(W: W, k: k, a: a)
                case .peek: peek(W: W, k: k)
                case .leaves: leaves(W: W, k: k)
                case .neon: neon(W: W, k: k)
                case .bowl: bowl(W: W, k: k)
                }
            }
            .frame(width: geo.size.width, height: H, alignment: .topLeading)
        }
    }

    // 1. the orange cat in its ring, two faint paw prints
    private func classic(W: CGFloat, k: CGFloat, a: Color) -> some View {
        let D: CGFloat = medium ? 70 : 60, bx: CGFloat = 20, by: CGFloat = medium ? 44 : 18
        return ZStack(alignment: .topLeading) {
            art("feeder_paws", width: medium ? 48 : 40, x: medium ? W - 62 : W - 54, y: medium ? 8 : 8, k: k, opacity: 0.3, rotate: 8)
            art("feeder_badge_orange", width: D, x: bx, y: by, k: k)
            if medium {
                text(title, size: 19, y: 48, x: 108, w: W - 122, k: k, heavy: true)
                text(line, size: 14, y: 82, x: 108, w: W - 122, k: k, heavy: false, lines: 2)
            } else { smallText() }
        }
    }

    // 2. a cat looking over the edge
    private func peek(W: CGFloat, k: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            if medium {
                art("feeder_peek", width: 206, x: W - 204, y: 158 - 96 + 1, k: k)
                text("FEED THE", size: 22, y: 30, x: 20, w: 130, k: k, heavy: true)
                text("BEASTS", size: 22, y: 56, x: 20, w: 130, k: k, heavy: true)
                text(line, size: 13, y: 96, x: 20, w: 110, k: k, heavy: false, lines: 2)
            } else {
                art("feeder_peek", width: 188, x: -15, y: 158 - 87 + 1, k: k)
                smallText(top: 12)
            }
        }
    }

    // 3. a cream cat in an olive ring, leaves at the edges
    private func leaves(W: CGFloat, k: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            art("feeder_leaf", width: medium ? 112 : 76, x: medium ? W - 100 : W - 64, y: medium ? 158 - 100 : 158 - 68, k: k, opacity: 0.95)
            art("feeder_leaf", width: medium ? 78 : 66, x: medium ? -22 : -16, y: medium ? -16 : -12, k: k, opacity: 0.9, rotate: 150, flip: true)
            art("feeder_badge_cream", width: medium ? 70 : 60, x: 20, y: medium ? 44 : 18, k: k)
            if medium {
                text(title, size: 17, y: 49, x: 108, w: W - 112, k: k, heavy: true)
                text(line, size: 14, y: 82, x: 108, w: W - 160, k: k, heavy: false, lines: 2)
            } else { smallText() }
        }
    }

    // 4. glowing outline cat and bowl on a near black card
    private func neon(W: CGFloat, k: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            art("feeder_neon_ring", width: medium ? 86 : 66, x: 12, y: medium ? 36 : 10, k: k)
            art("feeder_neon_bowl", width: medium ? 118 : 74, x: medium ? W - 116 : W - 76, y: medium ? 158 - 84 + 2 : 158 - 55 + 2, k: k)
            if medium {
                text(title, size: 17, y: 49, x: 108, w: W - 112, k: k, heavy: true)
                text(line, size: 14, y: 82, x: 108, w: 120, k: k, heavy: false, lines: 2)
            } else { smallText() }
        }
    }

    // 5. a bowl of food, two cats waiting: the picture is the card's background (FeederBackdrop); here only the text, where it is in Paul's mock-up
    private func bowl(W: CGFloat, k: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            if medium {
                text(title, size: 15, y: 57, x: 131, w: W - 140, k: k, heavy: true, tracking: 0.02)
                text(line, size: 11.5, y: 83, x: 131, w: W - 190, k: k, heavy: false, lines: 2)
            } else { smallText(top: 12) }
        }
    }

    /// The small card's text: the name on two lines and the line under it.
    private func smallText(top: CGFloat? = nil) -> some View {
        let t = top
        let w = words
        return ZStack(alignment: .topLeading) {
            GeometryReader { geo in
                let k = geo.size.height / 158
                let y1 = t ?? 94, y2 = (t ?? 94) + 19, y3 = (t ?? 94) + 41
                text(w.first, size: 16, y: y1, x: 20, w: 130, k: k, heavy: true)
                text(w.last, size: 16, y: y2, x: 20, w: 130, k: k, heavy: true)
                text(line, size: 11.5, y: t == nil ? 135 : y3, x: 20, w: 130, k: k, heavy: false, lines: 2)
            }
        }
    }
}
