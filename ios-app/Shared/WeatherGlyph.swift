import SwiftUI

/// The card's weather pictures: the sun or moon behind a cloud (cut out where the cloud is), a cloud, rain, a sun, a moon. Same drawings as okie-weather.js.
struct WeatherGlyph: View {
    var condition: String       // the Home Assistant weather state
    var night: Bool
    var size: CGFloat
    var line: CGFloat = 1.3

    /// { main, back } like the card's iconKind()
    static func kind(_ state: String, night: Bool) -> (main: String, back: String?) {
        switch state {
        case "rainy", "pouring": return ("rain", nil)
        case "clear-night": return ("moon", nil)
        case "sunny": return (night ? "moon" : "sun", nil)
        case "partlycloudy": return ("cloud", night ? "moon" : "sun")
        default: return ("cloud", nil)
        }
    }

    var body: some View {
        let k = Self.kind(condition, night: night)
        Canvas { ctx, _ in
            let s = size / 24
            func draw(_ name: String, in c: inout GraphicsContext, transform: CGAffineTransform, width: CGFloat, fill: Bool = false) {
                for prim in OkieSVG.weatherIcons[name] ?? [] {
                    var path: Path
                    switch prim.kind {
                    case .path(let d): path = OkieSVG.path(d, scale: s)
                    case .circle(let cx, let cy, let r): path = Path(ellipseIn: CGRect(x: (cx - r) * s, y: (cy - r) * s, width: 2 * r * s, height: 2 * r * s))
                    case .rect: continue
                    }
                    path = path.applying(CGAffineTransform(scaleX: transform.a, y: transform.d).concatenating(CGAffineTransform(translationX: transform.tx * s, y: transform.ty * s)))
                    if fill { c.fill(path, with: .color(.black)) }
                    c.stroke(path, with: .color(fill ? .black : .white), style: StrokeStyle(lineWidth: width * s, lineCap: .round, lineJoin: .round))
                }
            }
            guard let back = k.back else { var c = ctx; draw(k.main, in: &c, transform: .identity, width: line); return }
            // the sun or moon behind: drawn first, then the cloud's outline (and a margin around it) is cut out of it, then the cloud itself
            let cloudT = CGAffineTransform(a: 0.84, b: 0, c: 0, d: 0.84, tx: 0, ty: 5.6), backT = CGAffineTransform(a: 0.72, b: 0, c: 0, d: 0.72, tx: 10, ty: -1.4)
            ctx.drawLayer { layer in
                var l = layer
                draw(back, in: &l, transform: backT, width: line / 0.72)
                l.blendMode = .destinationOut
                draw(k.main, in: &l, transform: cloudT, width: line / 0.84 + 2.6, fill: true)
            }
            var c = ctx
            draw(k.main, in: &c, transform: cloudT, width: line / 0.84)
        }
        .frame(width: size, height: size)
    }
}
