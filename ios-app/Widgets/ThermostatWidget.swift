import AppIntents
import SwiftUI
import WidgetKit

struct ThermostatEntry: TimelineEntry {
    var date: Date
    var info: ThermoInfo
    var signedIn: Bool
}

struct ThermostatProvider: AppIntentTimelineProvider {
    typealias Intent = ThermostatConfig
    typealias Entry = ThermostatEntry

    static let defaultID = WidgetSpec.Thermostat.entity

    func placeholder(in context: Context) -> ThermostatEntry { Self.sample }

    func snapshot(for configuration: ThermostatConfig, in context: Context) async -> ThermostatEntry {
        context.isPreview ? Self.sample : await load(configuration)
    }

    func timeline(for configuration: ThermostatConfig, in context: Context) async -> Timeline<ThermostatEntry> {
        Timeline(entries: [await load(configuration)], policy: .after(Date().addingTimeInterval(15 * 60)))
    }

    private func load(_ c: ThermostatConfig) async -> ThermostatEntry {
        let id = c.thermostat?.id ?? Self.defaultID
        guard HAClient.shared.isSignedIn else { return ThermostatEntry(date: .now, info: ThermoInfo(nil, entityID: id), signedIn: false) }
        let e = try? await HAClient.shared.state(id)
        return ThermostatEntry(date: .now, info: ThermoInfo(e, entityID: id), signedIn: true)
    }

    static var sample: ThermostatEntry {
        let e = HAEntity(entityId: defaultID, state: "cool", attributes: [
            "friendly_name": .string("Living Room"), "current_temperature": .number(74), "temperature": .number(72),
            "hvac_action": .string("cooling"), "min_temp": .number(50), "max_temp": .number(90),
            "hvac_modes": .array([.string("heat"), .string("cool"), .string("heat_cool"), .string("off")]),
        ])
        return ThermostatEntry(date: .now, info: ThermoInfo(e, entityID: defaultID), signedIn: true)
    }
}

/// The compact thermostat card of the dashboard, laid out like the old Scriptable widget: every size is the design's own (316 high) times k.
struct ThermostatWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ThermostatEntry

    var body: some View {
        if entry.signedIn { face.widgetURL(URL(string: "okiehome://thermostat/\(entry.info.entityID)")) } else { NeedsSignIn() }
    }

    private var face: some View {
        let info = entry.info
        let medium = family == .systemMedium
        let L = medium ? WidgetSpec.Thermostat.medium : WidgetSpec.Thermostat.small
        let dim = info.off || info.unavailable
        return GeometryReader { geo in
            let W = geo.size.width, H = geo.size.height, k = H / WidgetSpec.Thermostat.designHeight
            let panelW = L.panelW * k, panelX = W - panelW
            let colW = L.colW * k
            let textX = L.textX * k
            let numSize = L.number * k
            let numStr = info.target.map { ThermoInfo.fmt($0) } ?? "–"
            var line = info.statusLine
            if medium, !info.unavailable, let h = info.humidity { line += " · Humidity \(Int(h.rounded()))%" }
            if !medium, !info.unavailable, let c = info.current { line = "Now \(ThermoInfo.fmt(c))\(info.unit)\n" + info.status }   // two short lines on the small one
            let cs = L.chevron * k
            return ZStack(alignment: .topLeading) {
                // the card's glass: a soft warm glow behind the number, and the mode column tinted with the temperature's colour
                RadialGradient(colors: [Color(hex: 0xa08060).opacity(dim ? 0.10 : 0.30), .clear], center: UnitPoint(x: (textX + 150 * k) / W, y: 0.48), startRadius: 0, endRadius: 190 * k)
                    .frame(width: W, height: H)
                if L.iconColumn > 0 { Rectangle().fill(info.color.opacity(dim ? 0.05 : 0.16)).frame(width: colW, height: H) }
                // the panel in the colour of the target temperature, with the chevron
                Rectangle().fill(info.color.opacity(dim ? 0.55 : 0.95)).frame(width: panelW, height: H).offset(x: panelX)
                Path { p in
                    let mx = panelX + panelW / 2, my = H / 2
                    p.move(to: CGPoint(x: mx - 9 * cs, y: my - 22 * cs)); p.addLine(to: CGPoint(x: mx + 11 * cs, y: my)); p.addLine(to: CGPoint(x: mx - 9 * cs, y: my + 22 * cs))
                }
                .stroke(.white, style: StrokeStyle(lineWidth: 6 * cs, lineCap: .round, lineJoin: .round))
                // the mode icons: a column at the left (medium), a row at the bottom (small)
                if L.iconColumn > 0 {
                    Rectangle().fill(.white.opacity(0.18)).frame(width: 2 * k, height: H).offset(x: colW)
                }
                ForEach(Array(info.modeIcons.enumerated()), id: \.element.id) { i, m in
                    let size = L.icon * k
                    let cx = L.iconColumn > 0 ? colW / 2 : textX + L.iconFirstX * k + CGFloat(i) * L.iconStep * k
                    let cy = L.iconColumn > 0 ? H * (info.modeIcons.count == 3 ? 0.2 + 0.3 * CGFloat(i) : 0.35 + 0.3 * CGFloat(i)) : H - L.iconBottom * k
                    let tint: Color = m.active ? info.color : .white.opacity(0.55)
                    Group {
                        if m.id == "heat" { OkieSymbol(name: "flame", size: size, color: tint, line: 1.9) }       // the card's own flame
                        else { ThermoModeIcon(id: m.id, color: tint, line: 2.1, widget: true).frame(width: size, height: size) }
                    }
                    .position(x: cx, y: cy)
                }
                // the writing
                Text(info.name.uppercased())
                    .font(OkieFont.manrope(700, L.name * k)).tracking(L.name * k * 0.12)
                    .foregroundStyle(.white.opacity(0.88)).lineLimit(1).minimumScaleFactor(0.6)
                    .frame(width: panelX - textX - 14 * k, alignment: .leading)
                    .offset(x: textX, y: L.nameY * k)
                // the number and, right behind it, the unit (as wide as the number really is: the page's canvas measured it the same way)
                HStack(alignment: .top, spacing: 5 * k) {
                    Text(numStr)
                        .font(OkieFont.sora(800, numSize)).foregroundStyle(.white.opacity(dim ? 0.45 : 1)).fixedSize()
                        .shadow(color: .white.opacity(dim ? 0 : 0.16), radius: 9 * k)
                    Text(info.unit)
                        .font(OkieFont.manrope(700, L.unit * k)).foregroundStyle(.white.opacity(dim ? 0.45 : 0.9)).fixedSize()
                        .padding(.top, L.unitDY * k)
                }
                .offset(x: textX - 4 * k, y: L.numberY * k)
                Text(line)
                    .font(OkieFont.sora(600, L.status * k)).foregroundStyle(.white.opacity(0.8))
                    .lineLimit(medium ? 1 : 2).truncationMode(.tail)
                    .frame(width: panelX - textX - L.statusRightGap * k, height: L.statusH * k, alignment: .topLeading)
                    .offset(x: textX, y: H - L.statusFromBottom * k)
            }
            .frame(width: W, height: H, alignment: .topLeading)
        }
    }
}

struct ThermostatWidget: Widget {
    let kind = "OkieThermostat"
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: ThermostatConfig.self, provider: ThermostatProvider()) { entry in
            ThermostatWidgetView(entry: entry).okieWidgetBackground()
        }
        .configurationDisplayName("Thermostat")
        .description("The temperature you set. A tap opens the big thermostat.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

#Preview("Thermostat medium", as: .systemMedium) { ThermostatWidget() } timeline: { ThermostatProvider.sample }
#Preview("Thermostat small", as: .systemSmall) { ThermostatWidget() } timeline: { ThermostatProvider.sample }
