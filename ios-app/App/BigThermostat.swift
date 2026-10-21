import SwiftUI

/// The sample mode's big thermostat (no Home Assistant to ask): a native look-alike of the card's thermostat screen. With a real Home Assistant the widget opens the dashboard's own screen. A dark warm screen, the target as a heavy number, minus and plus, the three modes, hold to turn off,
/// and the wheel of ticks at the right edge that turns while you drag it. Everything it does goes through the normal climate services.
struct BigThermostat: View {
    @Environment(HomeStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let entityID: String
    var onClose: (() -> Void)?

    @State private var pending: Double?          // what the wheel shows while a change is on its way to Home Assistant
    @State private var send: Task<Void, Never>?
    @State private var dragStartAngle: Double?
    @State private var dragStartValue: Double = 0
    @State private var holding = false
    @State private var holdProgress: CGFloat = 0

    private var info: ThermoInfo { ThermoInfo(store.entity(entityID), entityID: entityID) }
    private var shown: Double? { pending ?? info.target }

    private static let degPerF = 236.0 / 69.0       // how far the wheel turns for one degree Fahrenheit (a Celsius degree turns 1.8 times as far)
    private var degPerUnit: Double { Self.degPerF * (info.unit == "°C" ? 1.8 : 1) }

    var body: some View {
        GeometryReader { geo in
            let W = geo.size.width, H = geo.size.height
            let portrait = H >= W
            let s = min(max(H / 874, 0.8), 1.5)            // one design unit: an iPhone is 874 high
            let R = portrait ? H * 0.348 : H * 0.42
            let cx = portrait ? W + R * 0.45 : W - R * 0.35
            let cy = portrait ? H * 0.567 : H * 0.52
            let acc = info.color
            ZStack(alignment: .topLeading) {
                RadialGradient(stops: [.init(color: Color(hex: 0x4d392b), location: 0), .init(color: Color(hex: 0x271c15), location: 0.48), .init(color: Color(hex: 0x120e0b), location: 1)],
                               center: UnitPoint(x: 0.85, y: 0.12), startRadius: 0, endRadius: max(W, H) * 0.95)
                    .ignoresSafeArea()
                dial(R: R, cx: cx, cy: cy, accent: acc)
                    .contentShape(Rectangle())
                    .gesture(dialDrag(cx: cx, cy: cy, R: R))
                texts(s: s, H: H, accent: acc)
                    .padding(.leading, 26 * s)
            }
            .frame(width: W, height: H, alignment: .topLeading)
        }
        .foregroundStyle(Color(hex: 0xf6f5f7))
        .preferredColorScheme(.dark)
        .statusBarHidden(false)
    }

    // MARK: the writing and the buttons

    private func texts(s: CGFloat, H: CGFloat, accent: Color) -> some View {
        let i = info
        let off = i.off || i.unavailable
        return ZStack(alignment: .topLeading) {
            Button("Close") { if let onClose { onClose() } else { dismiss() } }
                .font(.system(size: 17 * s)).foregroundStyle(Color(hex: 0x0a84ff))
                .offset(y: 8 * s).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 52 * s)
            Text(i.name.uppercased()).font(OkieFont.manrope(700, 14 * s)).tracking(2.4 * s).foregroundStyle(.white.opacity(0.7))
                .offset(y: H * 0.19 - 9 * s)
            Text(stateWord(i)).font(OkieFont.manrope(700, 17 * s)).foregroundStyle(off ? .white.opacity(0.5) : accent)
                .offset(y: H * 0.19 + 20 * s)
            Text("TEMPERATURE, \(i.unit)").font(OkieFont.manrope(700, 12 * s)).tracking(2.2 * s).foregroundStyle(.white.opacity(0.6))
                .offset(y: H * 0.381 - 8 * s)
            Text(shown.map { ThermoInfo.fmt($0) } ?? "–")
                .font(OkieFont.sora(800, 126 * s)).tracking(-0.03 * 126 * s).foregroundStyle(.white.opacity(off ? 0.35 : 1)).fixedSize()
                .offset(x: -4 * s, y: H * 0.381 + 4 * s)
            Text(i.current.map { "Now \(ThermoInfo.fmt($0))\(i.unit)" } ?? "")
                .font(OkieFont.manrope(600, 17 * s)).foregroundStyle(.white.opacity(0.62))
                .offset(y: H * 0.555 - 14 * s)
            HStack(spacing: 14 * s) {
                stepButton("minus", -1, s)
                stepButton("plus", 1, s)
            }
            .offset(y: H * 0.6175 - 26 * s)
            modes(i, s: s, accent: accent).offset(y: H * 0.84 - 23 * s)
            holdButton(i, s: s, accent: accent)
                .frame(width: 360 * s).offset(x: 0, y: H * 0.9375 - 14 * s)
        }
    }

    private func stateWord(_ i: ThermoInfo) -> String {
        if i.unavailable { return "Not reachable" }
        if i.off { return "Off" }
        switch store.entity(entityID)?.attr("hvac_action")?.string {
        case "heating": return "Heating"
        case "cooling": return "Cooling"
        case "drying": return "Drying"
        case "fan": return "Fan"
        case "idle": return "Idle"
        default: return i.status
        }
    }

    private func stepButton(_ symbol: String, _ n: Int, _ s: CGFloat) -> some View {
        Button { step(n) } label: {
            Image(systemName: symbol).font(.system(size: 24 * s, weight: .bold))
                .frame(width: 52 * s, height: 52 * s)
                .background(Circle().fill(Color.white.opacity(0.1)))
                .overlay(Circle().strokeBorder(Color.white.opacity(0.14), lineWidth: 1))
        }
        .buttonStyle(.plain)
    }

    private func modes(_ i: ThermoInfo, s: CGFloat, accent: Color) -> some View {
        HStack(spacing: 22 * s) {
            ForEach(i.modeIcons, id: \.id) { m in
                Button {
                    store.call("climate", "set_hvac_mode", ["entity_id": entityID, "hvac_mode": m.id == "heat_cool" && !(i.modes ?? []).contains("heat_cool") ? "auto" : m.id])
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                } label: {
                    VStack(spacing: 8 * s) {
                        ThermoModeIcon(id: m.id, color: m.active ? .white : .white.opacity(0.78), line: 1.5)
                            .frame(width: 22 * s, height: 22 * s)
                            .frame(width: 46 * s, height: 46 * s)
                            .background(Circle().fill(m.active ? accent : Color.white.opacity(0.1)))
                            .padding(4 * s)
                            .overlay(Circle().strokeBorder(m.active ? accent.opacity(0.7) : .clear, lineWidth: 2))
                        Text(m.id == "heat" ? "Heating" : m.id == "cool" ? "Cooling" : "Heat/Cool")
                            .font(OkieFont.manrope(600, 12 * s)).foregroundStyle(m.active ? .white : .white.opacity(0.62))
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func holdButton(_ i: ThermoInfo, s: CGFloat, accent: Color) -> some View {
        let off = i.off
        return HStack(spacing: 12 * s) {
            ZStack {
                Circle().stroke(accent.opacity(0.25), lineWidth: 2)
                Circle().trim(from: 0, to: holdProgress).stroke(accent, style: StrokeStyle(lineWidth: 2, lineCap: .round)).rotationEffect(.degrees(-90))
                Image(systemName: "power").font(.system(size: 12 * s, weight: .semibold)).foregroundStyle(accent)
            }
            .frame(width: 26 * s, height: 26 * s)
            Text(off ? "Tap to turn on" : "Hold to turn off").font(OkieFont.manrope(600, 17 * s))
        }
        .frame(maxWidth: .infinity)
        .contentShape(Rectangle())
        .onTapGesture { if off { store.call("climate", "turn_on", ["entity_id": entityID]); UIImpactFeedbackGenerator(style: .medium).impactOccurred() } }
        .onLongPressGesture(minimumDuration: 1.2, maximumDistance: 40, perform: {
            holdProgress = 0
            guard !off else { return }
            store.call("climate", "turn_off", ["entity_id": entityID])
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        }, onPressingChanged: { down in
            if off { return }
            if down { withAnimation(.linear(duration: 1.2)) { holdProgress = 1 } } else { withAnimation(.easeOut(duration: 0.2)) { holdProgress = 0 } }
        })
    }

    // MARK: changing the target

    private func step(_ n: Int) {
        let i = info
        guard let t = shown else { return }
        set(t + Double(n) * i.step)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    /// Snaps to the thermostat's grid, shows it at once and sends it a moment after the last change.
    private func set(_ raw: Double) {
        let i = info
        let snapped = (min(i.max, max(i.min, (raw / i.step).rounded() * i.step)) * 100).rounded() / 100
        if snapped != pending { pending = snapped }
        send?.cancel()
        send = Task {
            try? await Task.sleep(nanoseconds: 450_000_000)
            if Task.isCancelled { return }
            store.call("climate", "set_temperature", ["entity_id": entityID, "temperature": snapped])
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if !Task.isCancelled { await MainActor.run { pending = nil } }
        }
    }

    // MARK: the wheel

    private func dialDrag(cx: CGFloat, cy: CGFloat, R: CGFloat) -> some Gesture {
        DragGesture(minimumDistance: 2)
            .onChanged { v in
                let sd = hypot(v.startLocation.x - cx, v.startLocation.y - cy)
                if sd > R * 1.1 || sd < R * 0.5 { return }              // only a drag that starts on the wheel turns it
                let angle = atan2(Double(v.location.y - cy), Double(v.location.x - cx)) * 180 / .pi
                guard let t = shown else { return }
                if dragStartAngle == nil {
                    dragStartAngle = atan2(Double(v.startLocation.y - cy), Double(v.startLocation.x - cx)) * 180 / .pi
                    dragStartValue = t
                }
                var d = angle - (dragStartAngle ?? angle)
                while d > 180 { d -= 360 }
                while d < -180 { d += 360 }
                let before = pending ?? t
                set(dragStartValue + d / degPerUnit)
                if let now = pending, now != before { UISelectionFeedbackGenerator().selectionChanged() }
            }
            .onEnded { _ in dragStartAngle = nil }
    }

    private func dial(R: CGFloat, cx: CGFloat, cy: CGFloat, accent: Color) -> some View {
        let i = info
        let off = i.off || i.unavailable
        let rot = ((shown ?? i.min) - i.min) * degPerUnit
        return Canvas { ctx, _ in
            let u = R / 152.1                                    // the card draws its wheel in a 150 unit circle
            let center = CGPoint(x: cx, y: cy)
            let reach = 60 * u
            // the glow: a radial gradient with the falloff of a soft shadow of the rim, inside and outside
            var stops: [Gradient.Stop] = [.init(color: accent.opacity(0), location: 0)]
            for k in -6...6 {
                let d = reach * Double(k) / 6
                let a = 0.6 * exp(-pow(d / (34 * u), 2)) * max(0, 1 - pow(abs(d) / reach, 4))      // fades to nothing at the ends
                stops.append(.init(color: accent.opacity(a), location: min(1, max(0.0001, (R + d) / (R + reach)))))
            }
            ctx.fill(Path(ellipseIn: CGRect(x: cx - R - reach, y: cy - R - reach, width: 2 * (R + reach), height: 2 * (R + reach))),
                     with: .radialGradient(Gradient(stops: stops), center: center, startRadius: 0, endRadius: R + reach))
            ctx.fill(Path(ellipseIn: CGRect(x: cx - R, y: cy - R, width: 2 * R, height: 2 * R)), with: .color(Color(hex: 0x0b0908).opacity(0.06)))
            ctx.stroke(Path(ellipseIn: CGRect(x: cx - R, y: cy - R, width: 2 * R, height: 2 * R)), with: .color(accent), lineWidth: 1.9 * u)
            // the ticks: 197 around the circle, a long one every fifth, turned by the temperature
            var t = ctx
            t.translateBy(x: cx, y: cy)
            t.rotate(by: .degrees(rot))
            let count = 197
            let tickColor = Color(red: 235 / 255, green: 200 / 255, blue: 208 / 255).opacity(0.55)
            for k in 0..<count {
                let major = k % 5 == 0
                let a = Double(k) * 2 * .pi / Double(count)
                let r1 = (major ? 127 : 135) * u, r2 = 148 * u
                var p = Path()
                p.move(to: CGPoint(x: cos(a) * r1, y: sin(a) * r1)); p.addLine(to: CGPoint(x: cos(a) * r2, y: sin(a) * r2))
                t.stroke(p, with: .color(tickColor), style: StrokeStyle(lineWidth: (major ? 1.3 : 1.0) * u, lineCap: .round))
            }
        }
        .opacity(off ? 0.3 : 1)
        .ignoresSafeArea()
    }
}

#Preview("Big thermostat") {
    BigThermostat(entityID: "climate.living_room").environment(HomeStore.preview)
}
