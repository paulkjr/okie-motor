import SwiftUI
import WatchKit
import Observation

/// The robot vacuum (the first vacuum.* Home Assistant has), live, with the four buttons of the app's robot page.
@MainActor @Observable
final class WatchVacuumModel {
    var entity: HAEntity?
    private var loop: Task<Void, Never>?
    private var held = Date.distantPast      // after a button the state is not repainted from Home Assistant for a moment
    private var demo = false

    init() {
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "watchDemo") {
            let st = UserDefaults.standard.string(forKey: "watchVac") ?? "docked"
            entity = HAEntity(entityId: "vacuum.roomba", state: st, attributes: ["friendly_name": .string("Nimbus 2000"), "battery_level": .number(100)])
            demo = true
        }
        #endif
    }

    func start() {
        guard !demo, loop == nil else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled { await self?.refresh(); try? await Task.sleep(nanoseconds: 6_000_000_000) }
        }
    }
    func stop() { loop?.cancel(); loop = nil }

    func refresh() async {
        guard !demo, Date() > held, let all = try? await HAClient.shared.states() else { return }
        let v = all.filter { $0.domain == "vacuum" }
        entity = v.first(where: { $0.state != "unavailable" }) ?? v.first
    }

    /// start, stop, return_to_base or locate
    func send(_ service: String) {
        guard var e = entity else { return }
        let next = ["start": "cleaning", "stop": "idle", "return_to_base": "returning"][service]
        if let next { e.state = next; entity = e; held = Date().addingTimeInterval(5) }
        if demo { return }
        Task { try? await HAClient.shared.callService("vacuum", service, ["entity_id": e.entityId]) }
    }
}

private enum VacLook {
    static let green = Color(hex: 0x6fdc8c), amber = Color(hex: 0xffb454), red = Color(hex: 0xff6b5e), blue = Color(hex: 0x7cc4ff)
    static func word(_ e: HAEntity) -> String {
        switch e.state {
        case "docked": return "Docked"
        case "cleaning": return "Cleaning"
        case "returning": return "Heading home"
        case "paused": return "Paused"
        case "idle": return "Stopped"
        case "error": return stuck(e) ? "Stuck" : "Needs help"
        case "unavailable", "unknown": return "Not reachable"
        default: return e.state.capitalized
        }
    }
    /// The robot's own words for what is wrong (the Roomba integration puts them in status or error).
    static func problem(_ e: HAEntity) -> String? {
        for k in ["error", "status"] { if let s = e.attr(k)?.string, !s.isEmpty, s.lowercased() != e.state { return s } }
        return nil
    }
    static func stuck(_ e: HAEntity) -> Bool { (problem(e) ?? "").lowercased().contains("stuck") }
    static func color(_ e: HAEntity) -> Color {
        switch e.state { case "docked": return green; case "cleaning": return blue; case "returning", "paused": return amber; case "error": return red; default: return .white.opacity(0.7) }
    }
}

/// The robot of the app's page: a white ring, a thin inner ring, the bumper arc with its ticks, the button and a dot, and the dock under it with the green bolt while it charges.
struct RobotArt: View {
    let state: String, accent: Color
    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height)
            let c = CGPoint(x: size.width / 2, y: s * 0.40), R = s * 0.34
            let line = Color.white.opacity(0.92)
            func circle(_ r: CGFloat, _ at: CGPoint) -> Path { Path(ellipseIn: CGRect(x: at.x - r, y: at.y - r, width: 2 * r, height: 2 * r)) }
            ctx.fill(circle(R * 1.28, CGPoint(x: c.x, y: c.y + s * 0.04)), with: .color(.white.opacity(0.06)))
            // the dock first, so the robot sits in front of it
            let dock = CGRect(x: c.x - R * 0.78, y: c.y + R * 0.92, width: R * 1.56, height: R * 0.5)
            ctx.stroke(Path(roundedRect: dock, cornerRadius: R * 0.16), with: .color(.white.opacity(0.75)), lineWidth: 2.2)
            ctx.fill(circle(R, c), with: .color(Color(hex: 0x3a332f)))
            ctx.stroke(circle(R, c), with: .color(line), lineWidth: 3.4)
            ctx.stroke(circle(R * 0.86, c), with: .color(.white.opacity(0.28)), lineWidth: 1)
            var arc = Path(); arc.addArc(center: c, radius: R * 0.68, startAngle: .degrees(205), endAngle: .degrees(335), clockwise: false)
            ctx.stroke(arc, with: .color(line), style: StrokeStyle(lineWidth: 3.6, lineCap: .round))
            for a in [-125.0, -90.0, -55.0] {      // the three ticks on the rim
                let r = a * .pi / 180
                var t = Path(); t.move(to: CGPoint(x: c.x + cos(r) * R * 0.86, y: c.y + sin(r) * R * 0.86)); t.addLine(to: CGPoint(x: c.x + cos(r) * R * 1.02, y: c.y + sin(r) * R * 1.02))
                ctx.stroke(t, with: .color(.white.opacity(0.5)), lineWidth: 1.6)
            }
            ctx.stroke(circle(R * 0.25, c), with: .color(line), lineWidth: 2.4)
            ctx.fill(circle(R * 0.13, c), with: .color(state == "error" ? accent : .white.opacity(0.55)))
            ctx.fill(circle(R * 0.07, CGPoint(x: c.x, y: c.y + R * 0.52)), with: .color(.white.opacity(0.5)))
            if state == "docked" {
                var b = Path(); let m = CGPoint(x: c.x, y: dock.midY + 1), k = R * 0.2
                b.move(to: CGPoint(x: m.x + k * 0.3, y: m.y - k)); b.addLine(to: CGPoint(x: m.x - k * 0.7, y: m.y + k * 0.1)); b.addLine(to: CGPoint(x: m.x, y: m.y + k * 0.1)); b.addLine(to: CGPoint(x: m.x - k * 0.3, y: m.y + k)); b.addLine(to: CGPoint(x: m.x + k * 0.7, y: m.y - k * 0.1)); b.addLine(to: CGPoint(x: m.x, y: m.y - k * 0.1)); b.closeSubpath()
                ctx.fill(b, with: .color(accent))
            }
            if state == "error" { ctx.stroke(circle(R * 1.1, c), with: .color(accent.opacity(0.7)), style: StrokeStyle(lineWidth: 2, dash: [3, 4])) }
        }
    }
}

struct RoombaPage: View {
    @Environment(WatchVacuumModel.self) private var vm
    @State private var done: String?
    var body: some View {
        GeometryReader { g in
            let W = g.size.width
            if let e = vm.entity {
                let accent = VacLook.color(e)
                let pct = e.num("battery_level").map { Int($0.rounded()) }
                VStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 6) {
                            Text(VacLook.word(e)).font(OkieFont.manrope(800, 19)).foregroundStyle(accent == VacLook.green ? .white : accent).lineLimit(1).minimumScaleFactor(0.7)
                            Spacer(minLength: 0)
                            if let pct { battery(pct).offset(y: 6) }      // right under the time, on the title's line
                        }
                        Text(sub(e)).font(OkieFont.manrope(600, 11)).foregroundStyle(.white.opacity(0.55)).lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 13).padding(.top, 30)
                    RobotArt(state: e.state, accent: accent).frame(width: W * 0.5, height: W * 0.5).padding(.top, 6)
                    Spacer(minLength: 0)
                    HStack(spacing: 6) {
                        btn("play.fill", "Start", "start", on: e.state == "cleaning")
                        btn("stop.fill", "Stop", "stop", on: false)
                        btn("house.fill", "Dock", "return_to_base", on: e.state == "returning")
                        btn("magnifyingglass", "Locate", "locate", on: false)
                    }
                    .padding(.horizontal, 8).padding(.bottom, 20)
                }
                .frame(width: W, height: g.size.height)
            } else {
                Hint(title: "No robot found", text: "No vacuum in Home Assistant yet.")
            }
        }
        .ignoresSafeArea()
    }

    private func sub(_ e: HAEntity) -> String {
        if e.state == "error", let p = VacLook.problem(e) { return p }
        return e.name
    }
    private func battery(_ pct: Int) -> some View {
        HStack(spacing: 4) {
            Text("\(pct)%").font(OkieFont.manrope(700, 11)).foregroundStyle(pct <= 20 ? VacLook.red : VacLook.green)
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3).fill(.white.opacity(0.18)).frame(width: 18, height: 9)
                RoundedRectangle(cornerRadius: 3).fill(pct <= 20 ? VacLook.red : VacLook.green).frame(width: max(3, 18 * CGFloat(pct) / 100), height: 9)
            }
        }
    }
    private func btn(_ icon: String, _ label: String, _ service: String, on: Bool) -> some View {
        Button {
            WKInterfaceDevice.current().play(service == "stop" ? .stop : .click)
            vm.send(service)
            done = service
            Task { try? await Task.sleep(nanoseconds: 900_000_000); if done == service { done = nil } }
        } label: {
            VStack(spacing: 3) {
                Image(systemName: done == service ? "checkmark" : icon).font(.system(size: 15, weight: .bold))
                    .foregroundStyle(on ? Color.black : .white)
                    .frame(width: 41, height: 34)
                    .background(RoundedRectangle(cornerRadius: 13).fill(on ? Color.white.opacity(0.92) : Color.white.opacity(0.13)))
                Text(label).font(OkieFont.manrope(600, 9)).foregroundStyle(.white.opacity(0.6))
            }
        }
        .buttonStyle(.plain)
    }
}
