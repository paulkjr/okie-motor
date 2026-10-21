import SwiftUI

/// The card's own icons (24 x 24 line icons, the same shapes as in okie-motor/src/okie-ui.js), drawn with SwiftUI.
enum OkieSVG {
    struct Prim {
        enum Kind { case path(String), rect(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, r: CGFloat), circle(cx: CGFloat, cy: CGFloat, r: CGFloat) }
        var kind: Kind
        var strokeWidth: CGFloat?
        var fill: String?          // "currentColor" = filled in the icon's colour
        var stroke: String?        // "none" = no outline
        init(_ kind: Kind, strokeWidth: CGFloat? = nil, fill: String? = nil, stroke: String? = nil) { self.kind = kind; self.strokeWidth = strokeWidth; self.fill = fill; self.stroke = stroke }
    }

    // MARK: path data

    /// An SVG path string as a SwiftUI path on the 24 grid scaled to `size`.
    static func path(_ d: String, scale s: CGFloat) -> Path {
        var p = Path()
        var t = Scanner(d)
        var cur = CGPoint.zero, start = CGPoint.zero
        var lastCtrl: CGPoint?
        var cmd: Character = "M"
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
        while let c = t.nextCommand(&cmd) {
            let rel = c.isLowercase
            switch c.uppercased() {
            case "M":
                guard let x = t.number(), let y = t.number() else { return p }
                cur = rel ? CGPoint(x: cur.x + x * s, y: cur.y + y * s) : pt(x, y); start = cur; p.move(to: cur); lastCtrl = nil
                cmd = rel ? "l" : "L"
            case "L":
                guard let x = t.number(), let y = t.number() else { return p }
                cur = rel ? CGPoint(x: cur.x + x * s, y: cur.y + y * s) : pt(x, y); p.addLine(to: cur); lastCtrl = nil
            case "H":
                guard let x = t.number() else { return p }
                cur = CGPoint(x: rel ? cur.x + x * s : x * s, y: cur.y); p.addLine(to: cur); lastCtrl = nil
            case "V":
                guard let y = t.number() else { return p }
                cur = CGPoint(x: cur.x, y: rel ? cur.y + y * s : y * s); p.addLine(to: cur); lastCtrl = nil
            case "C":
                guard let a = t.number(), let b = t.number(), let c1 = t.number(), let d1 = t.number(), let e = t.number(), let f = t.number() else { return p }
                let o = rel ? cur : .zero, k = rel ? s : s
                let p1 = CGPoint(x: o.x + a * k, y: o.y + b * k), p2 = CGPoint(x: o.x + c1 * k, y: o.y + d1 * k), p3 = CGPoint(x: o.x + e * k, y: o.y + f * k)
                p.addCurve(to: p3, control1: p1, control2: p2); cur = p3; lastCtrl = p2
            case "S":
                guard let c1 = t.number(), let d1 = t.number(), let e = t.number(), let f = t.number() else { return p }
                let o = rel ? cur : .zero
                let p1 = lastCtrl.map { CGPoint(x: 2 * cur.x - $0.x, y: 2 * cur.y - $0.y) } ?? cur
                let p2 = CGPoint(x: o.x + c1 * s, y: o.y + d1 * s), p3 = CGPoint(x: o.x + e * s, y: o.y + f * s)
                p.addCurve(to: p3, control1: p1, control2: p2); cur = p3; lastCtrl = p2
            case "A":
                guard let rx = t.number(), let ry = t.number(), let rot = t.number(), let fa = t.number(), let fs = t.number(), let x = t.number(), let y = t.number() else { return p }
                let end = rel ? CGPoint(x: cur.x + x * s, y: cur.y + y * s) : pt(x, y)
                addArc(&p, from: cur, to: end, rx: rx * s, ry: ry * s, rotation: rot, large: fa != 0, sweep: fs != 0)
                cur = end; lastCtrl = nil
            case "Z":
                p.closeSubpath(); cur = start; lastCtrl = nil
            default: return p
            }
        }
        return p
    }

    /// The SVG arc (endpoint form) as Bezier curves.
    private static func addArc(_ p: inout Path, from a: CGPoint, to b: CGPoint, rx rx0: CGFloat, ry ry0: CGFloat, rotation: CGFloat, large: Bool, sweep: Bool) {
        if a == b { return }
        var rx = abs(rx0), ry = abs(ry0)
        if rx == 0 || ry == 0 { p.addLine(to: b); return }
        let phi = rotation * .pi / 180, cp = cos(phi), sp = sin(phi)
        let dx = (a.x - b.x) / 2, dy = (a.y - b.y) / 2
        let x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy
        let lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry)
        if lam > 1 { let k = sqrt(lam); rx *= k; ry *= k }
        let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1
        let den = rx * rx * y1 * y1 + ry * ry * x1 * x1
        var coef = den == 0 ? 0 : sqrt(max(0, num / den))
        if large == sweep { coef = -coef }
        let cxp = coef * rx * y1 / ry, cyp = -coef * ry * x1 / rx
        let cx = cp * cxp - sp * cyp + (a.x + b.x) / 2, cy = sp * cxp + cp * cyp + (a.y + b.y) / 2
        func ang(_ ux: CGFloat, _ uy: CGFloat, _ vx: CGFloat, _ vy: CGFloat) -> CGFloat {
            let d = atan2(ux * vy - uy * vx, ux * vx + uy * vy); return d
        }
        let th1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry)
        var dth = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry)
        if !sweep && dth > 0 { dth -= 2 * .pi } else if sweep && dth < 0 { dth += 2 * .pi }
        let n = max(1, Int(ceil(abs(dth) / (.pi / 2))))
        let step = dth / CGFloat(n), t = 4 / 3 * tan(step / 4)
        var th = th1
        for _ in 0..<n {
            let c1 = cos(th), s1 = sin(th), c2 = cos(th + step), s2 = sin(th + step)
            func map(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: cp * rx * x - sp * ry * y + cx, y: sp * rx * x + cp * ry * y + cy) }
            p.addCurve(to: map(c2, s2), control1: map(c1 - t * s1, s1 + t * c1), control2: map(c2 + t * s2, s2 - t * c2))
            th += step
        }
    }

    /// Reads the numbers and commands of a path string.
    private struct Scanner {
        let chars: [Character]; var i = 0
        init(_ s: String) { chars = Array(s) }
        mutating func skip() { while i < chars.count, chars[i] == " " || chars[i] == "," || chars[i] == "\n" { i += 1 } }
        /// The next command letter, or the same one again when numbers follow ("l5 5 5 5").
        mutating func nextCommand(_ cmd: inout Character) -> Character? {
            skip(); guard i < chars.count else { return nil }
            if chars[i].isLetter { cmd = chars[i]; i += 1; if cmd == "z" || cmd == "Z" { return cmd }; return cmd }
            return cmd
        }
        mutating func number() -> CGFloat? {
            skip(); guard i < chars.count else { return nil }
            var j = i, seenDot = false
            if chars[j] == "-" || chars[j] == "+" { j += 1 }
            while j < chars.count {
                let c = chars[j]
                if c.isNumber { j += 1 } else if c == ".", !seenDot { seenDot = true; j += 1 } else if (c == "e" || c == "E"), j + 1 < chars.count, chars[j + 1].isNumber || chars[j + 1] == "-" { j += 2 } else { break }
            }
            guard j > i, let v = Double(String(chars[i..<j])) else { return nil }
            i = j; return CGFloat(v)
        }
    }

    // MARK: drawing

    static func shapes(_ name: String, size: CGFloat) -> [(path: Path, prim: Prim)] {
        let s = size / 24
        return (icons[name] ?? icons["eye"] ?? []).map { prim in
            switch prim.kind {
            case .path(let d): return (path(d, scale: s), prim)
            case .rect(let x, let y, let w, let h, let r): return (Path(roundedRect: CGRect(x: x * s, y: y * s, width: w * s, height: h * s), cornerRadius: r * s), prim)
            case .circle(let cx, let cy, let r): return (Path(ellipseIn: CGRect(x: (cx - r) * s, y: (cy - r) * s, width: 2 * r * s, height: 2 * r * s)), prim)
            }
        }
    }
}

/// One of the card's icons in a colour at a size (line weight 1.6 on the 24 grid, like the card).
struct OkieSymbol: View {
    var name: String
    var size: CGFloat = 24
    var color: Color = .white
    var line: CGFloat = 1.6

    var body: some View {
        Canvas { ctx, _ in
            for (path, prim) in OkieSVG.shapes(name, size: size) {
                let w = (prim.strokeWidth ?? line) * size / 24
                if prim.fill == "currentColor" { ctx.fill(path, with: .color(color)) }
                if prim.stroke != "none" { ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: w, lineCap: .round, lineJoin: .round)) }
            }
        }
        .frame(width: size, height: size)
    }
}
