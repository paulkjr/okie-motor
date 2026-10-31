import SwiftUI
import WatchKit
import Observation
import WatchConnectivity

/// The lights of the Okie card's Lights screen (its own list lightsFav; empty or missing: the global favorites that are lights), live from Home Assistant.
@MainActor @Observable
final class WatchLightsModel {
    var ids: [String] = []
    var swipeDir = 1      // which way the last page change went, so the page that arrives can ease in from that side
    var ents: [String: HAEntity] = [:]
    var areas: [String: String] = [:]
    private var favs: [String]?
    private var loop: Task<Void, Never>?
    private var demo = false
    private var held: [String: Date] = [:]      // a light you just changed is not repainted from Home Assistant for a moment

    init() {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "watchDemo") {
            func e(_ id: String, _ name: String, _ st: String, _ a: [String: JSONValue]) -> HAEntity { var a = a; a["friendly_name"] = .string(name); return HAEntity(entityId: id, state: st, attributes: a) }
            let list = [
                e("light.living_room_lamp", "Living Room Lamp", "on", ["brightness": .number(179), "supported_color_modes": .array([.string("rgb")]), "rgb_color": .array([.number(255), .number(120), .number(60)])]),
                e("switch.bedlight", "Bedlight", "on", [:]),
                e("light.patio_light", "Patio Light", "off", ["supported_color_modes": .array([.string("brightness")])]),
            ]
            ents = Dictionary(uniqueKeysWithValues: list.map { ($0.entityId, $0) }); ids = list.map(\.entityId)
            areas = ["light.living_room_lamp": "Living Room", "switch.bedlight": "Bedroom", "light.patio_light": "Patio"]
            demo = true
        }
        #endif
    }

    static func isLightish(_ e: HAEntity) -> Bool {
        if e.domain == "light" { return true }
        guard e.domain == "switch" else { return false }
        let s = (e.entityId + " " + e.name).lowercased()
        return ["light", "lamp", "licht", "leucht", "bulb"].contains { s.contains($0) }
    }
    static func dimmable(_ e: HAEntity) -> Bool {
        guard e.domain == "light" else { return false }
        let modes = e.attr("supported_color_modes")
        guard case .array(let a)? = modes else { return false }
        return a.contains { let m = $0.string ?? ""; return m != "onoff" && m != "unknown" }
    }
    static func pct(_ e: HAEntity) -> Int {
        guard e.isOn else { return 0 }
        guard let b = e.num("brightness") else { return 100 }
        return max(1, min(100, Int((b / 255 * 100).rounded())))
    }
    /// The bulb's colour, else warm white.
    static func glow(_ e: HAEntity) -> Color {
        if case .array(let a)? = e.attr("rgb_color"), a.count >= 3, let r = a[0].double, let g = a[1].double, let b = a[2].double { return Color(red: r / 255, green: g / 255, blue: b / 255) }
        return Color(red: 255 / 255, green: 167 / 255, blue: 87 / 255)
    }

    func start() {
        guard !demo, loop == nil else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(nanoseconds: 6_000_000_000)
            }
        }
    }
    func stop() { loop?.cancel(); loop = nil }

    /// Asks the iPhone for the Lights list as it is in Home Assistant right now (the answer is kept for the next look when the phone cannot be reached).
    private func askPhone() async {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated, WCSession.default.isReachable else { return }
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            var done = false
            func finish() { if !done { done = true; c.resume() } }
            WCSession.default.sendMessage(["lights": 1], replyHandler: { r in
                if let f = r["lightFavs"] as? [String] { UserDefaults.standard.set(f, forKey: "lightFavs") }
                if let m = r["lightModes"] as? String { UserDefaults.standard.set(m, forKey: "lightModes") }
                DispatchQueue.main.async { finish() }
            }, errorHandler: { _ in DispatchQueue.main.async { finish() } })
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { finish() }
        }
    }

    func refresh() async {
        guard !demo else { return }
        await askPhone()
        favs = UserDefaults.standard.stringArray(forKey: "lightFavs") ?? []      // the iPhone reads the card's lists and hands them over (a watch cannot open a WebSocket)
        guard let all = try? await HAClient.shared.states() else { return }
        let byId = Dictionary(all.map { ($0.entityId, $0) }, uniquingKeysWith: { a, _ in a })
        let list = (favs ?? []).filter { id in
            guard let e = byId[id] else { return false }
            return Self.isLightish(e)      // a light that is offline stays, as on the card, shown as unavailable
        }
        var next = ents
        for id in list { if let e = byId[id], (held[id] ?? .distantPast) < Date() { next[id] = e } }
        if list != ids { ids = list }
        ents = next
        for id in list where areas[id] == nil { if let a = await HAClient.shared.areaName(id) { areas[id] = a } }
    }

    /// Switch on or off, or set the brightness (0 turns it off).
    func set(_ id: String, on: Bool? = nil, pct: Int? = nil) {
        guard var e = ents[id] else { return }
        let dom = e.domain == "switch" ? "switch" : "light"
        var service = "turn_on"
        var data: [String: Any] = ["entity_id": id]
        if let p = pct {
            if p <= 0 { service = "turn_off" } else { data["brightness_pct"] = p }
            e.state = p <= 0 ? "off" : "on"
            if p > 0 { e.attributes["brightness"] = .number(Double(p) / 100 * 255) }
        } else if let on {
            service = on ? "turn_on" : "turn_off"; e.state = on ? "on" : "off"
        }
        ents[id] = e
        held[id] = Date().addingTimeInterval(1.5)
        if demo { return }
        Task { try? await HAClient.shared.callService(dom, service, data) }
    }
}

// MARK: one page per light

/// The pendant lamp of the app's design, all vector so it is sharp at any size: a thin cord, a small collar, a near-black cone with a flared rim, a bright disc under it and a beam in the bulb's colour that fades downwards.
struct LampArt: View {
    let color: Color, level: Double      // level 0...1
    var body: some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height, cx = w / 2
            let sw = w * 0.62, sh = sw * 0.62      // the shade's box
            let x0 = cx - sw / 2, y0 = h * 0.15
            func P(_ fx: Double, _ fy: Double) -> CGPoint { CGPoint(x: cx + fx * sw, y: y0 + fy * sh) }
            let rim = y0 + 0.97 * sh
            let lit = level > 0.001
            let warm = Color(red: 1, green: 0.93, blue: 0.78)
            if lit {
                var layer = ctx
                layer.addFilter(.blur(radius: 7))
                var beam = Path()
                beam.move(to: CGPoint(x: cx - sw * 0.4, y: rim)); beam.addLine(to: CGPoint(x: cx + sw * 0.4, y: rim))
                beam.addLine(to: CGPoint(x: cx + sw * 0.42, y: h * 0.97)); beam.addLine(to: CGPoint(x: cx - sw * 0.42, y: h * 0.97)); beam.closeSubpath()
                let g = Gradient(stops: [.init(color: color.opacity(0.85 * level), location: 0), .init(color: color.opacity(0.35 * level), location: 0.4), .init(color: color.opacity(0), location: 1)])
                layer.fill(beam, with: .linearGradient(g, startPoint: CGPoint(x: cx, y: rim), endPoint: CGPoint(x: cx, y: h * 0.97)))
            }
            let dw = sw * 0.86, dh = sw * 0.09
            let disc = Path(ellipseIn: CGRect(x: cx - dw / 2, y: rim - dh * 0.55, width: dw, height: dh))
            ctx.fill(disc, with: .color(lit ? warm.opacity(0.35 + 0.65 * level) : Color.white.opacity(0.1)))
            if lit { ctx.fill(disc, with: .color(color.opacity(0.35 * level))) }
            var cord = Path(); cord.move(to: CGPoint(x: cx, y: 0)); cord.addLine(to: P(0, 0.06))
            ctx.stroke(cord, with: .color(Color(white: 0.12)), lineWidth: 2.4)
            ctx.fill(Path(roundedRect: CGRect(x: cx - sw * 0.035, y: y0 + 0.02 * sh, width: sw * 0.07, height: 0.12 * sh), cornerRadius: 2), with: .color(Color(white: 0.08)))
            var shade = Path()      // a plain cone: straight sides, a small flat top
            shade.move(to: P(-0.08, 0.13)); shade.addLine(to: P(0.08, 0.13))
            shade.addLine(to: P(0.5, 0.97)); shade.addLine(to: P(-0.5, 0.97))
            shade.closeSubpath()
            let body = Gradient(stops: [.init(color: Color(white: 0.22), location: 0), .init(color: Color(white: 0.09), location: 0.28), .init(color: Color(white: 0.04), location: 0.5), .init(color: Color(white: 0.09), location: 0.72), .init(color: Color(white: 0.22), location: 1)])      // dark on the watch, whitish on the dashboard and in the apps
            ctx.fill(shade, with: .linearGradient(body, startPoint: P(-0.5, 0.5), endPoint: P(0.5, 0.5)))
            var edge = Path(); edge.move(to: P(-0.5, 0.97)); edge.addLine(to: P(0.5, 0.97))
            ctx.stroke(edge, with: .color(lit ? Color.white.opacity(0.55) : Color.white.opacity(0.22)), lineWidth: 1.4)
        }
        .allowsHitTesting(false)
    }
}

struct LightPage: View {
    @Environment(WatchLightsModel.self) private var lm
    let id: String
    let active: Bool
    var goPage: (Int) -> Void = { _ in }
    @State private var level = 0.0          // 0...100 while you drag or turn the crown
    @State private var touchedAt = Date.distantPast
    @State private var sentAt = Date.distantPast
    @State private var crown = 0.0
    @State private var axis = 0
    @State private var flipped = false
    @State private var slide: CGFloat = 0      // a slight follow of the finger while you swipe sideways, and the ease-in of the page that arrives
    @State private var startLevel = 0.0
    @FocusState private var focused: Bool

    private var e: HAEntity? { lm.ents[id] }
    private var dim: Bool { e.map(WatchLightsModel.dimmable) ?? false }
    private var recently: Bool { Date().timeIntervalSince(touchedAt) < 1.5 }
    private var shown: Double { recently ? level : Double(e.map(WatchLightsModel.pct) ?? 0) }

    var body: some View {
        if let e {
            GeometryReader { g in
                let W = g.size.width, H = g.size.height
                ZStack(alignment: .top) {
                    LampArt(color: WatchLightsModel.glow(e), level: shown / 100)
                        .frame(width: W, height: H)
                        .contentShape(Rectangle())
                        .gesture(DragGesture(minimumDistance: 4)
                            .onChanged { v in
                                if axis == 0, max(abs(v.translation.width), abs(v.translation.height)) > 8 { axis = abs(v.translation.height) >= abs(v.translation.width) ? 1 : 2; startLevel = shown; level = startLevel }
                                if axis == 2, !flipped, abs(v.translation.width) > 18 { flipped = true; goPage(v.translation.width < 0 ? 1 : -1) }      // the page changes as soon as the swipe is clear, not when the finger lifts
                                guard axis == 1, dim, !(e.isUnavailable) else { return }
                                touchedAt = Date()
                                level = min(100, max(0, startLevel - v.translation.height / (H * 0.5) * 100))
                                crown = level
                                push(final: false)
                            }
                            .onEnded { v in
                                if axis == 1, dim { touchedAt = Date(); push(final: true) }
                                axis = 0; flipped = false
                            })
                        .simultaneousGesture(TapGesture().onEnded { toggle() })
                    VStack(alignment: .leading, spacing: 1) {
                        Spacer(minLength: 0)
                        Text(e.name).font(OkieFont.manrope(700, 15)).lineLimit(1).minimumScaleFactor(0.75)
                        Text(lm.areas[id] ?? "").font(OkieFont.manrope(600, 11)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                        Text(e.isUnavailable ? "Unavailable" : e.isOn ? (dim ? "Brightness \(Int(shown.rounded()))%" : "On") : "Off").font(OkieFont.manrope(600, 12)).foregroundStyle(e.isOn ? WatchLightsModel.glow(e) : .white.opacity(0.5))
                    }
                    .frame(width: W - 96, alignment: .leading).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomLeading).padding(.leading, 24).padding(.bottom, 30).allowsHitTesting(false)
                    Button { toggle() } label: {
                        Capsule().fill(e.isOn ? WatchLightsModel.glow(e) : Color.white.opacity(0.18)).frame(width: 30, height: 56)
                            .overlay(alignment: e.isOn ? .bottom : .top) { Circle().fill(.white).frame(width: 24, height: 24).padding(3) }
                    }.buttonStyle(.plain)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing).padding(.trailing, 24).padding(.bottom, 30)
                }
                .frame(width: W, height: H)
            }
            .ignoresSafeArea()
            .focusable(active && dim)
            .focused($focused)
.onChange(of: active) { _, a in focused = a && dim }
            .digitalCrownRotation($crown, from: 0, through: 100, by: 2, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
            .onChange(of: crown) { _, v in
                guard active, dim, abs(v - shown) >= 1 else { return }
                level = v; touchedAt = Date(); push(final: false)
                Task { try? await Task.sleep(nanoseconds: 400_000_000); if Date().timeIntervalSince(touchedAt) >= 0.38 { push(final: true) } }
            }
            .onAppear { crown = Double(WatchLightsModel.pct(e)); focused = active && dim }
        }
    }

    private func toggle() {
        guard let e, !e.isUnavailable else { return }
        WKInterfaceDevice.current().play(.click)
        touchedAt = Date.distantPast
        lm.set(id, on: !e.isOn)
    }
    /// Brightness goes out at most every 160 ms while you drag, and once more at the end.
    private func push(final: Bool) {
        if !final, Date().timeIntervalSince(sentAt) < 0.16 { return }
        sentAt = Date()
        lm.set(id, pct: Int(level.rounded()))
    }
}

// MARK: the light modes (Cozy lights, Let's go to sleep ...), the last page

struct LightMode: Identifiable {
    let id: String, name: String, icon: String, from: Color, to: Color
    let calls: [(domain: String, service: String, data: [String: Any])]

    /// The modes of the card (setting lightModes, passed on by the iPhone); the three it ships with when there are none saved.
    static func load() -> [LightMode] {
        let defaults: [[String: Any]] = [
            ["id": "cozy", "name": "Cozy lights", "icon": "flame", "color": ["#ff8a5c", "#c8423f"], "run": [["type": "script", "entity": "script.govee_cozy_lights"]]],
            ["id": "sleep", "name": "Let's go to sleep", "icon": "moon", "color": ["#7c7cff", "#2f2f8f"], "run": [["type": "script", "entity": "script.govee_lets_go_to_sleep"]]],
            ["id": "bright", "name": "Turn up the lights", "icon": "sun", "color": ["#f5a30b", "#b4560a"], "run": [["type": "script", "entity": "script.govee_turn_up_the_lights"]]],
        ]
        var list = defaults
        if let t = UserDefaults.standard.string(forKey: "lightModes"), !t.isEmpty, let o = (try? JSONSerialization.jsonObject(with: Data(t.utf8))) as? [[String: Any]] { list = o }
        func col(_ v: Any?, _ i: Int, _ d: UInt32) -> Color {
            guard let a = v as? [String], a.count > i, a[i].hasPrefix("#"), let n = UInt32(a[i].dropFirst(), radix: 16) else { return Color(hex: d) }
            return Color(hex: n)
        }
        return list.enumerated().compactMap { n, m in
            guard let name = m["name"] as? String else { return nil }
            var calls: [(domain: String, service: String, data: [String: Any])] = []
            for it in (m["run"] as? [[String: Any]]) ?? [] {
                switch it["type"] as? String {
                case "script": if let e = it["entity"] as? String { calls.append(("script", "turn_on", ["entity_id": e])) }
                case "scene": if let e = it["entity"] as? String { calls.append(("scene", "turn_on", ["entity_id": e])) }
                case "lights":
                    guard let es = it["entities"] as? [String] else { continue }
                    var d: [String: Any] = ["entity_id": es]
                    let on = (it["state"] as? String) != "off"
                    if on, let b = it["brightness"] as? NSNumber { d["brightness_pct"] = b.intValue }
                    calls.append(("light", on ? "turn_on" : "turn_off", d))
                default: break
                }
            }
            guard !calls.isEmpty else { return nil }
            return LightMode(id: (m["id"] as? String) ?? "m\(n)", name: name, icon: (m["icon"] as? String) ?? "bulb", from: col(m["color"], 0, 0xff8a5c), to: col(m["color"], 1, 0xc8423f), calls: calls)
        }
    }
    var symbol: String {
        ["flame": "flame.fill", "moon": "moon.fill", "sun": "sun.max.fill", "bulb": "lightbulb.fill", "star": "star.fill", "heart": "heart.fill", "spark": "sparkles", "tv": "tv", "home": "house.fill", "bolt": "bolt.fill"][icon] ?? "lightbulb.fill"
    }
}

struct ModesPage: View {
    @Environment(WatchLightsModel.self) private var lm
    @State private var modes = LightMode.load()
    @State private var ran: String?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 5) {
                Text("LIGHT MODES").font(OkieFont.manrope(700, 10)).tracking(1.6).foregroundStyle(.white.opacity(0.7)).padding(.leading, 6)
                ForEach(modes) { md in
                    Button { run(md) } label: {
                        HStack(spacing: 10) {
                            Image(systemName: ran == md.id ? "checkmark" : md.symbol).font(.system(size: 13, weight: .semibold)).frame(width: 28, height: 28)
                                .background(Circle().fill(LinearGradient(colors: [md.from, md.to], startPoint: .topLeading, endPoint: .bottomTrailing)))
                            Text(md.name).font(OkieFont.manrope(700, 13)).lineLimit(1).minimumScaleFactor(0.8)
                            Spacer(minLength: 0)
                        }
                        .padding(6).frame(maxWidth: .infinity).background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color.white.opacity(0.1)))
                    }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 10).padding(.top, 22).padding(.bottom, 18)
        }
        .onAppear { modes = LightMode.load() }
    }
    private func run(_ md: LightMode) {
        WKInterfaceDevice.current().play(.success)
        ran = md.id
        Task {
            for c in md.calls { try? await HAClient.shared.callService(c.domain, c.service, c.data) }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            if ran == md.id { ran = nil }
        }
    }
}
