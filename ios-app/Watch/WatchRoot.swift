import SwiftUI
import WatchKit

/// The big thermostat of the phone app, made for the watch: the same warm screen, the glowing wheel of ticks (turned with the Digital Crown), the heavy number and the three modes.
private let screen = RadialGradient(stops: [.init(color: Color(hex: 0x4d392b), location: 0), .init(color: Color(hex: 0x271c15), location: 0.48), .init(color: Color(hex: 0x120e0b), location: 1)],
                                    center: UnitPoint(x: 0.85, y: 0.12), startRadius: 0, endRadius: 330)

struct WatchRoot: View {
    /// The last moment the app was awake: a beat every second while it runs, so after a sleep the gap shows how long you were away.
    final class Beat { var value = Date() }
    static let lastSeen = Beat()

    @Environment(WatchModel.self) private var m
    @Environment(WatchLightsModel.self) private var lm
    @Environment(WatchVacuumModel.self) private var vm
    @Environment(\.scenePhase) private var phase
    @State private var prefs = WatchPrefs.load()
    @State private var fresh = UUID()
    @State private var page = UserDefaults.standard.integer(forKey: "watchPage") == 99 ? -1 : UserDefaults.standard.integer(forKey: "watchPage")      // for looking at one screen from the command line (99 = the hidden left page)

    var body: some View {
        content
    }

    /// The pages after the thermostat, as chosen in the Apple Watch app on the iPhone.
    private var pages: [WatchPage] {
        let lights: [WatchPage] = prefs.lights ? lm.ids.map { .light($0) } : []
        var rest: [WatchPage] = []
        if prefs.roomba == "end", vm.entity != nil { rest.append(.roomba) }
        if prefs.modes == "end" || (prefs.modes == "left" && prefs.roomba == "left" && vm.entity != nil) { rest.append(.modes) }
        return prefs.lightsFirst ? lights + rest : rest + lights
    }
    /// The page that waits hidden on the left: the robot, else the light modes when those were given the spot.
    private var left: WatchPage? {
        if prefs.roomba == "left", vm.entity != nil { return .roomba }
        if prefs.modes == "left" { return .modes }
        return nil
    }

    private func goPage(_ d: Int) {
        lm.swipeDir = d
        withAnimation(.easeOut(duration: 0.22)) { page = min(pages.count, max(left != nil ? -1 : 0, page + d)) }
    }

    private var content: some View {
        Group {
            if !m.signedIn { Hint(title: "Sign in on your iPhone", text: "Open Okie Home on your iPhone once and this watch signs in by itself.") }
            else if let i = m.info {
                TabView(selection: $page) {
                    if let left { Group { if left == .modes { ModesPage() } else { RoombaPage() } }.tag(-1) }      // slides in like any page, but has no dot
                    ThermostatHome(info: i, goPage: { d in goPage(d) }).tag(0)
                    ForEach(Array(pages.enumerated()), id: \.element) { n, kind in
                        switch kind {
                        case .light(let id): LightPage(id: id, active: page == n + 1, goPage: { d in goPage(d) }).tag(n + 1)
                        case .modes: ModesPage().tag(n + 1)
                        case .roomba: RoombaPage().tag(n + 1)
                        }
                    }
                }
                .tabViewStyle(.page(indexDisplayMode: .never))
                .id(fresh)
                .overlay {      // our own dots: the hidden left page does not get one
                    if page >= 0 {
                        VStack {
                            Spacer()
                            HStack(spacing: 6) {
                                ForEach(0...pages.count, id: \.self) { n in Circle().fill(Color.white.opacity(n == page ? 1 : 0.32)).frame(width: 6, height: 6) }
                            }.padding(.bottom, 3)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity).ignoresSafeArea().allowsHitTesting(false)
                    }
                }
            } else if let e = m.error { Hint(title: "Not connected", text: e) }
            else { ProgressView().tint(.white) }
        }
        .foregroundStyle(Color(hex: 0xf6f5f7))
        .containerBackground(screen, for: .tabView)
        .background(screen.ignoresSafeArea())
        .task { while !Task.isCancelled { WatchRoot.lastSeen.value = Date(); try? await Task.sleep(nanoseconds: 1_000_000_000) } }
        .onAppear { prefs = .load(); WatchPrefs.applyDial(); m.start(); lm.start(); vm.start() }
        .onChange(of: phase) { _, p in
            if p == .active, Date().timeIntervalSince(WatchRoot.lastSeen.value) > 8 { page = 0; fresh = UUID() }      // the beat below stops while the app sleeps, so a long gap means you came back to it
            if p == .active { prefs = .load(); WatchPrefs.applyDial(); m.start(); lm.start(); vm.start(); Task { await m.refresh() } } else { m.stop(); lm.stop(); vm.stop() } }
    }
}

struct Hint: View {
    let title: String, text: String
    var body: some View {
        VStack(spacing: 6) {
            Text(title).font(OkieFont.manrope(700, 17)).multilineTextAlignment(.center)
            Text(text).font(OkieFont.manrope(600, 13)).foregroundStyle(.white.opacity(0.62)).multilineTextAlignment(.center)
        }.padding()
    }
}

/// A measured temperature without the decimal: 69.4 is shown as 69.
private func whole(_ v: Double?) -> String { v.map { String(Int($0.rounded())) } ?? "–" }

private func stateWord(_ i: ThermoInfo, _ e: HAEntity?) -> String {
    if i.unavailable { return "Not reachable" }
    if i.off { return "Off" }
    switch e?.attr("hvac_action")?.string {
    case "heating": return "Heating"
    case "cooling": return "Cooling"
    case "drying": return "Drying"
    case "fan": return "Fan"
    case "idle": return "Idle"
    default: return i.status
    }
}

// MARK: page 1: the one thermostat page, with the Now, Dials and Conditioning screens behind taps

enum ThermoScreen: Hashable { case now, dials, mode }

struct ThermostatHome: View {
    let info: ThermoInfo
    var goPage: (Int) -> Void = { _ in }
    @State private var path: [ThermoScreen] = []
    var body: some View {
        NavigationStack(path: $path) {
            TemperaturePage(info: info, goPage: goPage,
                            onNow: { path.append(.now) }, onDials: { path.append(.dials) }, onMode: { path.append(.mode) })
                .navigationDestination(for: ThermoScreen.self) { s in
                    Group {
                        switch s {
                        case .now: NowPage(info: info)
                        case .dials: DialSettingsPage()
                        case .mode: ScrollView { ModePage(info: info).padding(.bottom, 26) }
                        }
                    }
                    .containerBackground(screen, for: .navigation)
                }
        }
        .onAppear {
            #if DEBUG
            if let n = UserDefaults.standard.string(forKey: "watchScreen"), path.isEmpty { path = [n == "now" ? .now : n == "dials" ? .dials : .mode] }      // for looking at one screen from the command line
            #endif
        }
    }
}

// MARK: the temperature, turned with the Digital Crown

struct TemperaturePage: View {
    @Environment(WatchModel.self) private var m
    let info: ThermoInfo
    var goPage: (Int) -> Void = { _ in }
    var onNow: () -> Void = {}
    var onDials: () -> Void = {}
    var onMode: () -> Void = {}
    @State private var flipped = false
    @State private var axis = 0      // 0 not decided yet, 1 up/down (turns the wheel), 2 sideways (changes the page)
    @State private var crown = 70.0
    @State private var touched = false
    @State private var commit: Task<Void, Never>?
    @State private var lastAngle: Double?
    @State private var dragValue = 0.0

    private var lo: Double { info.min }
    private var hi: Double { info.max }
    private var shown: Double { touched ? crown : (m.displayTarget(info) ?? info.current ?? lo) }
    private var off: Bool { info.off || info.unavailable }
    private var accent: Color { off ? .gray : ThermoInfo.color(for: shown, min: lo, max: hi, unit: info.unit) }
    private var degPerUnit: Double { (236.0 / 69.0) * (info.unit == "°C" ? 1.8 : 1) }

    var body: some View {
        GeometryReader { g in
            let W = g.size.width, H = g.size.height
            let R = H * 0.49
            ZStack(alignment: .topLeading) {
                Wheel(R: R, cx: W + R * 0.46, cy: H * 0.6, accent: accent, rot: (shown - lo) * degPerUnit, off: off).id(m.lookRev)
                VStack(alignment: .leading, spacing: 0) {
                    Text(info.name.uppercased()).font(OkieFont.manrope(700, 11)).tracking(1.6).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                    Text(stateWord(info, m.entity)).font(OkieFont.manrope(700, 14)).foregroundStyle(off ? .white.opacity(0.5) : accent).padding(.top, 1)
                        .frame(width: W * 0.5, alignment: .leading).contentShape(Rectangle()).onTapGesture { onMode() }
                    Spacer(minLength: 0)
                    Text("TEMPERATURE, \(info.unit)").font(OkieFont.manrope(700, 9)).tracking(1.4).foregroundStyle(.white.opacity(0.6))
                    Text(ThermoInfo.fmt(shown)).font(OkieFont.sora(800, 70)).tracking(-2).foregroundStyle(.white.opacity(off ? 0.35 : 1)).fixedSize().offset(x: -2).contentShape(Rectangle()).onTapGesture { onNow() }
                    Text(info.current.map { "Now \(whole($0))\(info.unit)" } ?? "").font(OkieFont.manrope(600, 13)).foregroundStyle(.white.opacity(0.62)).padding(.top, 2)
                    Spacer(minLength: 0)
                }
                .padding(.leading, 13).padding(.top, 34).padding(.bottom, 18)
            }
            .frame(width: W, height: H)
            .background(alignment: .trailing) {      // the strip over the wheel and its glow: up and down turn the wheel, sideways changes the page (the rest of the screen swipes by itself)
                let sw = W * 0.55
                Color.clear.frame(width: sw, height: H).contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 4)
                        .onChanged { v in
                            if axis == 0, max(abs(v.translation.width), abs(v.translation.height)) > 8 { axis = abs(v.translation.height) >= abs(v.translation.width) ? 1 : 2 }
                            if axis == 2, !flipped, abs(v.translation.width) > 18 { flipped = true; goPage(v.translation.width < 0 ? 1 : -1) }      // the page changes as soon as the swipe is clear, not when the finger lifts
                            guard axis == 1 else { return }
                            let ccx = W + R * 0.46 - (W - sw), ccy = H * 0.6      // the wheel's centre in the strip's own coordinates
                            let a = atan2(v.location.y - ccy, v.location.x - ccx)
                            if lastAngle == nil { lastAngle = atan2(v.startLocation.y - ccy, v.startLocation.x - ccx); dragValue = crown }
                            var d = a - (lastAngle ?? a)
                            if d > .pi { d -= 2 * .pi } else if d < -.pi { d += 2 * .pi }
                            lastAngle = a
                            dragValue = min(hi, max(lo, dragValue + (d * 180 / .pi) / degPerUnit))
                            let snapped = min(hi, max(lo, (dragValue / info.step).rounded() * info.step))
                            if snapped != crown { crown = snapped; WKInterfaceDevice.current().play(.click) }
                        }
                        .onEnded { v in
                            axis = 0; lastAngle = nil; flipped = false
                        })
                    .simultaneousGesture(TapGesture().onEnded { onDials() })
            }
        }
        .ignoresSafeArea()
        .focusable()
        .digitalCrownRotation($crown, from: lo, through: hi, by: info.step, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
        .onChange(of: crown) { _, v in
            guard touched || abs(v - (m.displayTarget(info) ?? v)) >= info.step / 2 else { return }
            touched = true
            m.trust(v)      // your number counts from the first turn, not from the moment it is sent
            commit?.cancel()
            commit = Task { try? await Task.sleep(nanoseconds: 900_000_000); guard !Task.isCancelled else { return }; m.setTarget(v); try? await Task.sleep(nanoseconds: 600_000_000); touched = false }
        }
        .onAppear { crown = m.displayTarget(info) ?? info.current ?? lo }
        .onChange(of: m.displayTarget(info)) { _, t in if !touched, let t { crown = t } }
    }
}

/// The wheel of the big thermostat: a glowing ring with 197 ticks that turn as the temperature changes.
struct Wheel: View {
    let R: CGFloat, cx: CGFloat, cy: CGFloat, accent: Color, rot: Double, off: Bool
    var body: some View {
        Canvas { ctx, _ in
            let u = R / 152.1
            let center = CGPoint(x: cx, y: cy)
            let look = DialLook.current
            let haze = look.haze * 0.6      // the watch is small and bright: less spread than the card, so less glare
            let reach = 60 * u * haze
            var stops: [Gradient.Stop] = [.init(color: accent.opacity(0), location: 0)]
            for k in -6...6 {
                let d = reach * Double(k) / 6
                let peak = min(1, 0.5 * look.brightness), width = 34 * u * haze
                let falloff = exp(-pow(d / width, 2)), ends = max(0, 1 - pow(abs(d) / reach, 4))
                let a = peak * falloff * ends
                stops.append(.init(color: accent.opacity(a), location: min(1, max(0.0001, (R + d) / (R + reach)))))
            }
            ctx.fill(Path(ellipseIn: CGRect(x: cx - R - reach, y: cy - R - reach, width: 2 * (R + reach), height: 2 * (R + reach))),
                     with: .radialGradient(Gradient(stops: stops), center: center, startRadius: 0, endRadius: R + reach))
            ctx.fill(Path(ellipseIn: CGRect(x: cx - R, y: cy - R, width: 2 * R, height: 2 * R)), with: .color(Color(hex: 0x0b0908).opacity(0.06)))
            ctx.stroke(Path(ellipseIn: CGRect(x: cx - R, y: cy - R, width: 2 * R, height: 2 * R)), with: .color(accent), lineWidth: max(3, 4.4 * u))
            var t = ctx
            t.translateBy(x: cx, y: cy)
            t.rotate(by: .degrees(rot))
            let count = max(40, Int((100 * (DialLook.overrides["ticks"] ?? 100) / 100 / 5).rounded()) * 5)      // the watch has its own number of marks (100 at 100 %), whatever the phone's Dials say: they read better on a small screen
            let tickColor = Color(red: 235 / 255, green: 200 / 255, blue: 208 / 255).opacity(0.7)
            for k in 0..<count {
                let major = k % 5 == 0
                let a = Double(k) * 2 * .pi / Double(count)
                let r1 = (major ? 115 : 126) * u, r2 = 141 * u
                var p = Path()
                p.move(to: CGPoint(x: cos(a) * r1, y: sin(a) * r1)); p.addLine(to: CGPoint(x: cos(a) * r2, y: sin(a) * r2))
                t.stroke(p, with: .color(tickColor), style: StrokeStyle(lineWidth: max(2, (major ? 3.4 : 2.5) * u + 0.4), lineCap: .round))
            }
        }
        .opacity(off ? 0.3 : 1)
        .allowsHitTesting(false)
    }
}

// MARK: page 2: the mode

struct ModePage: View {
    @Environment(WatchModel.self) private var m
    let info: ThermoInfo
    @State private var holdProgress: CGFloat = 0

    var body: some View {
        let accent = info.off || info.unavailable ? Color.gray : info.color
        VStack(alignment: .leading, spacing: 8) {
            Text("CONDITIONING").font(OkieFont.manrope(700, 10)).tracking(1.6).foregroundStyle(.white.opacity(0.7))
            ForEach(info.modeIcons, id: \.id) { md in
                Button {
                    m.setMode(md.id == "heat_cool" && !(info.modes ?? []).contains("heat_cool") ? "auto" : md.id)
                } label: {
                    HStack(spacing: 12) {
                        ThermoModeIcon(id: md.id, color: md.active ? .white : .white.opacity(0.78), line: 1.5)
                            .frame(width: 20, height: 20)
                            .frame(width: 40, height: 40)
                            .background(Circle().fill(md.active ? accent : Color.white.opacity(0.1)))
                            .overlay(Circle().strokeBorder(md.active ? accent.opacity(0.7) : .clear, lineWidth: 2).padding(-3))
                        Text(md.id == "heat" ? "Heating" : md.id == "cool" ? "Cooling" : "Heat/Cool")
                            .font(OkieFont.manrope(600, 17)).foregroundStyle(md.active ? .white : .white.opacity(0.62))
                        Spacer(minLength: 0)
                    }
                }.buttonStyle(.plain)
            }
            holdButton(accent)
        }
        .padding(.horizontal, 14).padding(.top, 2)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func holdButton(_ accent: Color) -> some View {
        let off = info.off
        return HStack(spacing: 10) {
            ZStack {
                Circle().stroke(accent.opacity(0.25), lineWidth: 2)
                Circle().trim(from: 0, to: holdProgress).stroke(accent, style: StrokeStyle(lineWidth: 2, lineCap: .round)).rotationEffect(.degrees(-90))
                Image(systemName: "power").font(.system(size: 11, weight: .semibold)).foregroundStyle(accent)
            }.frame(width: 26, height: 26)
            Text(off ? "Tap to turn on" : "Hold to turn off").font(OkieFont.manrope(600, 14))
        }
        .padding(.top, 2)
        .contentShape(Rectangle())
        .onTapGesture { if off { m.turn(on: true) } }
        .onLongPressGesture(minimumDuration: 1.2, maximumDistance: 40, perform: { holdProgress = 0; if !off { m.turn(on: false) } },
                            onPressingChanged: { down in if off { return }; if down { withAnimation(.linear(duration: 1.2)) { holdProgress = 1 } } else { withAnimation(.easeOut(duration: 0.2)) { holdProgress = 0 } } })
    }
}

// MARK: page 3: how it is right now

struct NowPage: View {
    @Environment(WatchModel.self) private var m
    let info: ThermoInfo
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("NOW").font(OkieFont.manrope(700, 10)).tracking(1.6).foregroundStyle(.white.opacity(0.7))
            Text(whole(info.current) + info.unit).font(OkieFont.sora(800, 46)).tracking(-1.5).fixedSize()
            Text(stateWord(info, m.entity)).font(OkieFont.manrope(700, 16)).foregroundStyle(info.off ? .white.opacity(0.5) : info.color)
            if let h = info.humidity { Text("\(Int(h))% humidity").font(OkieFont.manrope(600, 14)).foregroundStyle(.white.opacity(0.62)).padding(.top, 4) }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading).padding(.horizontal, 14)
    }
}

// MARK: page 4: the look of the dial, like Settings > Dials in the phone app

struct DialSettingsPage: View {
    @Environment(WatchModel.self) private var m
    struct Row: Identifiable { let id: String; let label: String; let unit: String; let step: Double; let lo: Double; let hi: Double }
    let rows = [Row(id: "glowBlur", label: "Softness", unit: " px", step: 10, lo: 0, hi: 160), Row(id: "glowOpacity", label: "Glow", unit: "%", step: 5, lo: 0, hi: 100), Row(id: "ticks", label: "Marks", unit: "%", step: 10, lo: 40, hi: 160)]

    private func value(_ id: String) -> Double {
        let l = DialLook.current
        switch id { case "glowBlur": return l.glowBlur; case "glowOpacity": return l.glowOpacity; default: return l.ticks }
    }

    var body: some View {
        let _ = m.lookRev
        Group {
            List {
                ForEach(rows) { r in
                    NavigationLink {
                        SettingWheel(row: r)
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.label).font(OkieFont.manrope(700, 15))
                            Text("\(Int(value(r.id)))\(r.unit)").font(OkieFont.manrope(700, 14)).foregroundStyle(DialLook.overrides[r.id] != nil ? Okie.amber : .white.opacity(0.7))
                        }
                    }
                }
                Button { m.resetLook() } label: { Text("Reset the dial look").font(OkieFont.manrope(700, 14)).frame(maxWidth: .infinity) }
                Text("Tap a line, turn the crown, then go back and look at the temperature.").font(OkieFont.manrope(600, 11)).foregroundStyle(.white.opacity(0.5)).listRowBackground(Color.clear)
            }
            .navigationTitle("Dials")
        }
    }

}


/// One dial setting as a wheel you turn with the Digital Crown; the change shows at once.
struct SettingWheel: View {
    @Environment(WatchModel.self) private var m
    @Environment(\.dismiss) private var dismiss
    let row: DialSettingsPage.Row
    @State private var pick: Double = 0
    private var steps: [Double] { Array(stride(from: row.lo, through: row.hi, by: row.step)) }
    private var start: Double {
        let l = DialLook.current
        let v = row.id == "glowBlur" ? l.glowBlur : row.id == "glowOpacity" ? l.glowOpacity : l.ticks
        return steps.min { abs($0 - v) < abs($1 - v) } ?? row.lo
    }
    var body: some View {
        VStack(spacing: 6) {
            Picker(row.label, selection: $pick) {
                ForEach(steps, id: \.self) { Text("\(Int($0))\(row.unit)").tag($0) }
            }
            .pickerStyle(.wheel)
            .frame(height: 90)
            Button("Save \(Int(pick))\(row.unit)") { m.setLook(row.id, pick); dismiss() }
                .buttonStyle(.borderedProminent).tint(.orange)
        }
        .onAppear { pick = start }
        .navigationTitle(row.label)
    }
}
