import SwiftUI

/// The icons of the Okie cards, drawn as shapes on a 24 x 24 grid so they scale and take any colour.
enum OkieIcon24 {
    private static func p(_ s: CGFloat, _ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }

    /// "Heating": the card's teardrop.
    static func heat(_ r: CGRect) -> Path {
        let s = min(r.width, r.height) / 24
        var path = Path()
        path.move(to: p(s, 12, 3))
        path.addCurve(to: p(s, 17.75, 15.25), control1: p(s, 14.2, 7.2), control2: p(s, 17.75, 9.6))
        path.addArc(center: p(s, 12, 15.25), radius: 5.75 * s, startAngle: .degrees(0), endAngle: .degrees(180), clockwise: false)
        path.addCurve(to: p(s, 12, 3), control1: p(s, 6.25, 9.6), control2: p(s, 9.8, 7.2))
        path.closeSubpath()
        return path
    }
    /// "Cooling": a snowflake of six arms (three lines through the middle).
    static func cool(_ r: CGRect) -> Path {
        let s = min(r.width, r.height) / 24
        var path = Path()
        for deg in [90.0, 30.0, -30.0] {
            let a = deg * .pi / 180, x = cos(a) * 10.5, y = sin(a) * 10.5
            path.move(to: p(s, 12 - x, 12 - y)); path.addLine(to: p(s, 12 + x, 12 + y))
        }
        return path
    }
    /// "Heat/Cool": a small sun above-left and a small snowflake below-right.
    static func heatCool(_ r: CGRect) -> Path {
        let s = min(r.width, r.height) / 24
        var path = Path()
        path.addEllipse(in: CGRect(x: 4.8 * s, y: 4.8 * s, width: 4.4 * s, height: 4.4 * s))
        for seg in [(7.0, 1.8, 7.0, 3.2), (7.0, 10.8, 7.0, 12.2), (1.8, 7.0, 3.2, 7.0), (10.8, 7.0, 12.2, 7.0), (3.3, 3.3, 4.3, 4.3), (9.7, 9.7, 10.7, 10.7), (3.3, 10.7, 4.3, 9.7), (9.7, 4.3, 10.7, 3.3)] {
            path.move(to: p(s, seg.0, seg.1)); path.addLine(to: p(s, seg.2, seg.3))
        }
        for seg in [(17.0, 11.5, 17.0, 22.5), (12.3, 14.2, 21.7, 19.8), (21.7, 14.2, 12.3, 19.8)] {
            path.move(to: p(s, seg.0, seg.1)); path.addLine(to: p(s, seg.2, seg.3))
        }
        return path
    }
    /// The sun of the small widget's "auto" icon: a ring and eight rays.
    static func sun(_ r: CGRect) -> Path {
        let s = min(r.width, r.height) / 24
        var path = Path()
        path.addEllipse(in: CGRect(x: (12 - 4.1) * s, y: (12 - 4.1) * s, width: 8.2 * s, height: 8.2 * s))
        for i in 0..<8 {
            let a = Double(i) * .pi / 4
            path.move(to: p(s, 12 + cos(a) * 6.5, 12 + sin(a) * 6.5)); path.addLine(to: p(s, 12 + cos(a) * 10.1, 12 + sin(a) * 10.1))
        }
        return path
    }
    /// A power symbol.
    static func power(_ r: CGRect) -> Path {
        let s = min(r.width, r.height) / 15
        var path = Path()
        path.move(to: p(s, 7.5, 1.5)); path.addLine(to: p(s, 7.5, 7.5))
        path.addArc(center: p(s, 7.5, 7.7), radius: 5.6 * s, startAngle: .degrees(-50), endAngle: .degrees(-130), clockwise: true)
        return path
    }
    /// A clock face.
    static func clock(_ r: CGRect) -> Path {
        let s = min(r.width, r.height) / 24
        var path = Path()
        path.addEllipse(in: CGRect(x: 3 * s, y: 3 * s, width: 18 * s, height: 18 * s))
        path.move(to: p(s, 12, 7)); path.addLine(to: p(s, 12, 12)); path.addLine(to: p(s, 15, 14))
        return path
    }
}

struct ThermoModeIcon: View {
    var id: String
    var color: Color
    var line: CGFloat = 1.6
    var widget = false        // the widget draws "heat/cool" as a plain sun, the big thermostat as a sun and a snowflake
    var body: some View {
        GeometryReader { g in
            let r = CGRect(origin: .zero, size: g.size)
            let path = id == "heat" ? OkieIcon24.heat(r) : id == "cool" ? OkieIcon24.cool(r) : (widget ? OkieIcon24.sun(r) : OkieIcon24.heatCool(r))
            path.stroke(color, style: StrokeStyle(lineWidth: line * min(g.size.width, g.size.height) / 24, lineCap: .round, lineJoin: .round))
        }
        .aspectRatio(1, contentMode: .fit)
    }
}

/// The icons of the light buttons, filled, on the same 24 grid.
enum LightGlyph: String {
    case bedlight, sofa, moon, bulb

    func path(in r: CGRect) -> Path {
        let s = min(r.width, r.height) / 24
        func rr(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ c: CGFloat) -> Path { Path(roundedRect: CGRect(x: x * s, y: y * s, width: w * s, height: h * s), cornerRadius: c * s) }
        var path = Path()
        switch self {
        case .bedlight:
            path.addPath(rr(6.5, 2.5, 11, 19, 2.8))
            path.addPath(rr(9, 5.4, 6, 2.2, 1.1))        // the slot, cut out (even-odd fill)
        case .sofa:
            path.addPath(rr(5, 6, 14, 7, 2.2))
            path.addPath(rr(2, 9.5, 5, 8.5, 2.2)); path.addPath(rr(17, 9.5, 5, 8.5, 2.2))
            path.addPath(rr(5, 12, 14, 6, 1.4))
            path.addPath(rr(4, 18, 1.8, 2, 0.6)); path.addPath(rr(18.2, 18, 1.8, 2, 0.6))
        case .moon:
            // a crescent (the part of a big circle that a smaller, shifted one does not cover) and two small stars
            let c1 = CGPoint(x: 10.6, y: 13.2), r1: CGFloat = 8.4, c2 = CGPoint(x: 15.0, y: 10.2), r2: CGFloat = 7.2
            let dx = c2.x - c1.x, dy = c2.y - c1.y, d = (dx * dx + dy * dy).squareRoot()
            let al = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = max(0, r1 * r1 - al * al).squareRoot()
            let mx = c1.x + al * dx / d, my = c1.y + al * dy / d
            let pa = CGPoint(x: mx + h * dy / d, y: my - h * dx / d), pb = CGPoint(x: mx - h * dy / d, y: my + h * dx / d)
            func ang(_ p: CGPoint, _ c: CGPoint) -> CGFloat { atan2(p.y - c.y, p.x - c.x) }
            /// points of a circle from angle a to angle b, going the way that passes angle `via`
            func arc(_ c: CGPoint, _ r: CGFloat, _ a: CGFloat, _ b: CGFloat, via: CGFloat) -> [CGPoint] {
                func sweep(_ from: CGFloat, _ to: CGFloat, _ dir: CGFloat) -> CGFloat { var t = (to - from) * dir; while t < 0 { t += 2 * .pi }; return t }
                let dir: CGFloat = sweep(a, via, 1) < sweep(a, b, 1) ? 1 : -1
                let total = sweep(a, b, dir)
                return (0...48).map { i in let t = a + dir * total * CGFloat(i) / 48; return CGPoint(x: c.x + r * cos(t), y: c.y + r * sin(t)) }
            }
            let far1 = ang(CGPoint(x: c1.x - dx / d, y: c1.y - dy / d), .zero)          // the side of the big circle away from the small one
            let near2 = ang(CGPoint(x: -dx / d, y: -dy / d), .zero)                    // the side of the small circle toward the big one
            let outer = arc(c1, r1, ang(pa, c1), ang(pb, c1), via: far1)
            let inner = arc(c2, r2, ang(pb, c2), ang(pa, c2), via: near2)
            let pts = outer + inner
            path.move(to: CGPoint(x: pts[0].x * s, y: pts[0].y * s))
            for q in pts.dropFirst() { path.addLine(to: CGPoint(x: q.x * s, y: q.y * s)) }
            path.closeSubpath()
            for (cx, cy, rad) in [(18.4, 6.4, 2.7), (21.0, 12.0, 1.9)] as [(CGFloat, CGFloat, CGFloat)] {       // five pointed stars
                for k in 0..<10 {
                    let a = -CGFloat.pi / 2 + CGFloat(k) * .pi / 5, r = k % 2 == 0 ? rad : rad * 0.45
                    let q = CGPoint(x: (cx + r * cos(a)) * s, y: (cy + r * sin(a)) * s)
                    if k == 0 { path.move(to: q) } else { path.addLine(to: q) }
                }
                path.closeSubpath()
            }
        case .bulb:
            path.addEllipse(in: CGRect(x: 7.2 * s, y: 5.2 * s, width: 9.6 * s, height: 9.6 * s))
            path.addPath(rr(9.6, 13.4, 4.8, 3.4, 1))
            path.addPath(rr(10, 17.4, 4, 1.8, 0.9))
            for (x1, y1, x2, y2) in [(12.0, 1.4, 12.0, 3.2), (4.2, 5.2, 5.5, 6.5), (19.8, 5.2, 18.5, 6.5), (2.8, 11.4, 4.6, 11.4), (21.2, 11.4, 19.4, 11.4)] as [(CGFloat, CGFloat, CGFloat, CGFloat)] {
                var ray = Path(); ray.move(to: CGPoint(x: x1 * s, y: y1 * s)); ray.addLine(to: CGPoint(x: x2 * s, y: y2 * s))
                path.addPath(ray.strokedPath(StrokeStyle(lineWidth: 1.5 * s, lineCap: .round)))
            }
        }
        return path
    }
}

struct LightGlyphView: View {
    var glyph: LightGlyph
    var color: Color
    var body: some View {
        GeometryReader { g in
            glyph.path(in: CGRect(origin: .zero, size: g.size)).fill(color, style: FillStyle(eoFill: glyph == .bedlight))
        }
        .aspectRatio(1, contentMode: .fit)
    }
}
