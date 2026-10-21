import SwiftUI

/// The bigger controls of one device.
struct DetailSheet: View {
    @Environment(HomeStore.self) private var store
    let entityID: String

    private var e: HAEntity? { store.entity(entityID) }

    var body: some View {
        ScrollView {
            if let e {
                VStack(spacing: 18) {
                    HStack {
                        Image(systemName: OkieIcon.symbol(for: e)).font(.title2).foregroundStyle(e.isOn ? Okie.amber : .white)
                        VStack(alignment: .leading) {
                            Text(e.name).font(.title3.weight(.semibold))
                            Text(OkieIcon.stateText(e)).font(.subheadline).foregroundStyle(Okie.dim)
                        }
                        Spacer()
                    }
                    content(e)
                    Button { store.toggleFavorite(e.entityId) } label: {
                        Text(store.favorites.contains(e.entityId) ? "Remove from dashboard" : "Add to dashboard").font(.footnote.weight(.semibold)).foregroundStyle(Okie.dim)
                    }
                }
                .padding(22)
            } else { Text("Not found").padding(40) }
        }
    }

    @ViewBuilder private func content(_ e: HAEntity) -> some View {
        switch e.domain {
        case "climate": ThermostatControls(entityID: e.entityId)
        case "light": LightControls(entity: e)
        case "cover": CoverControls(entity: e)
        case "media_player": MediaControls(entity: e)
        default:
            Button { store.toggle(e) } label: {
                Text(["script", "scene", "button", "input_button"].contains(e.domain) ? "Run" : (e.isOn ? "Turn off" : "Turn on"))
                    .fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(.white, in: Capsule()).foregroundStyle(Okie.darkInk)
            }
        }
    }
}

struct LightControls: View {
    @Environment(HomeStore.self) private var store
    let entity: HAEntity
    @State private var level: Double = 0

    var body: some View {
        VStack(spacing: 16) {
            Button { store.toggle(entity) } label: {
                Text(entity.isOn ? "Turn off" : "Turn on").fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 16)
                    .background(.white, in: Capsule()).foregroundStyle(Okie.darkInk)
            }
            if entity.domain == "light", (entity.attr("supported_color_modes")?.array?.contains { $0.string != "onoff" } ?? false) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Brightness").font(.footnote).foregroundStyle(Okie.dim)
                    Slider(value: $level, in: 1...100, step: 1) { editing in
                        if !editing { store.call("light", "turn_on", ["entity_id": entity.entityId, "brightness_pct": Int(level)]) }
                    }.tint(Okie.amber)
                }
                .onAppear { level = ((entity.attr("brightness")?.double ?? 128) / 255 * 100).rounded() }
            }
        }
    }
}

struct CoverControls: View {
    @Environment(HomeStore.self) private var store
    let entity: HAEntity
    var body: some View {
        HStack(spacing: 12) {
            ForEach([("Open", "open_cover"), ("Stop", "stop_cover"), ("Close", "close_cover")], id: \.1) { t in
                Button { store.call("cover", t.1, ["entity_id": entity.entityId]) } label: {
                    Text(t.0).fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 14).background(Color.white.opacity(0.14), in: Capsule())
                }
            }
        }
    }
}

struct MediaControls: View {
    @Environment(HomeStore.self) private var store
    let entity: HAEntity
    var body: some View {
        HStack(spacing: 14) {
            ForEach([("backward.fill", "media_previous_track"), (entity.state == "playing" ? "pause.fill" : "play.fill", "media_play_pause"), ("forward.fill", "media_next_track")], id: \.1) { t in
                Button { store.call("media_player", t.1, ["entity_id": entity.entityId]) } label: {
                    Image(systemName: t.0).font(.title2).frame(width: 64, height: 64).background(Color.white.opacity(0.14), in: Circle())
                }
            }
        }
    }
}

struct ThermostatControls: View {
    @Environment(HomeStore.self) private var store
    let entityID: String
    private var info: ThermoInfo { ThermoInfo(store.entity(entityID), entityID: entityID) }

    var body: some View {
        let i = info
        VStack(spacing: 18) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(ThermoInfo.fmt(i.target)).font(.system(size: 92, weight: .heavy, design: .rounded)).foregroundStyle(i.off ? .white.opacity(0.45) : .white)
                Text(i.unit).font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(.white.opacity(0.8))
            }
            .frame(maxWidth: .infinity).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: 28, style: .continuous).fill(i.color.opacity(i.off ? 0.25 : 0.85)))
            Text(i.statusLine).font(.callout).foregroundStyle(Okie.dim)
            HStack(spacing: 22) {
                round("minus") { step(-1, i) }
                round("plus") { step(1, i) }
            }
            HStack(spacing: 10) {
                ForEach(i.modeIcons, id: \.id) { m in
                    Button { store.call("climate", "set_hvac_mode", ["entity_id": entityID, "hvac_mode": m.id == "heat_cool" && !(i.modes ?? []).contains("heat_cool") ? "auto" : m.id]) } label: {
                        VStack(spacing: 6) {
                            Image(systemName: m.symbol).font(.title3).frame(width: 54, height: 54)
                                .background(m.active ? i.color : Color.white.opacity(0.12), in: Circle()).foregroundStyle(.white)
                            Text(m.id == "heat" ? "Heating" : m.id == "cool" ? "Cooling" : "Auto").font(.caption).foregroundStyle(m.active ? .white : Okie.dim)
                        }.frame(maxWidth: .infinity)
                    }
                }
            }
            Button { store.call("climate", i.off ? "turn_on" : "turn_off", ["entity_id": entityID]) } label: {
                Label(i.off ? "Turn on" : "Turn off", systemImage: "power").fontWeight(.semibold).frame(maxWidth: .infinity).padding(.vertical, 14)
                    .background(Color.white.opacity(0.14), in: Capsule())
            }
        }
    }

    private func round(_ symbol: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) { Image(systemName: symbol).font(.title2.weight(.bold)).frame(width: 64, height: 64).background(Color.white.opacity(0.14), in: Circle()) }
    }
    private func step(_ n: Int, _ i: ThermoInfo) {
        guard let t = i.target else { return }
        let next = max(i.min, min(i.max, t + Double(n) * i.step))
        store.call("climate", "set_temperature", ["entity_id": entityID, "temperature": next])
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }
}
