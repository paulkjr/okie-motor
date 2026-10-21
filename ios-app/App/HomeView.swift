import SwiftUI

struct HomeView: View {
    @Environment(HomeStore.self) private var store
    @State private var search = ""
    @State private var detail: HAEntity?

    private var shown: [HAEntity] {
        let q = search.trimmingCharacters(in: .whitespaces)
        if q.isEmpty { return store.favorites.compactMap { store.entity($0) } }
        return store.list.filter { $0.name.localizedCaseInsensitiveContains(q) || $0.entityId.localizedCaseInsensitiveContains(q) }.prefix(60).map { $0 }
    }
    private var weather: HAEntity? { store.list.first { $0.domain == "weather" } }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                searchBar
                if shown.isEmpty {
                    Text(search.isEmpty ? "Nothing here yet. Search for a device and hold it to add it." : "Nothing found.")
                        .foregroundStyle(Okie.dim).padding(.top, 30).frame(maxWidth: .infinity)
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 160, maximum: 240), spacing: 12)], spacing: 12) {
                        ForEach(shown) { e in
                            EntityTile(entity: e, onTap: { tap(e) }, onLong: { detail = e })
                        }
                    }
                    if search.isEmpty, !store.calendars.isEmpty { CalendarCard() }
                }
            }
            .padding(.horizontal, 18).padding(.top, 8).padding(.bottom, 30)
            .frame(maxWidth: 980).frame(maxWidth: .infinity)
        }
        .refreshable { await store.refresh() }
        .sheet(item: $detail) { e in
            DetailSheet(entityID: e.entityId).presentationDetents(e.domain == "climate" ? [.large] : [.medium, .large]).presentationBackground(.ultraThinMaterial)
        }
    }

    private func tap(_ e: HAEntity) {
        switch e.domain {
        case "climate": store.thermostatID = e.entityId
        case "weather", "media_player", "cover": detail = e
        default: store.toggle(e)
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            if let w = weather {
                Label("\(w.attr("temperature")?.double.map { String(Int($0.rounded())) } ?? "–")°", systemImage: "cloud.sun.fill")
                    .font(.footnote.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 8).glassCard(radius: 18)
            }
            Spacer()
            HStack(spacing: 6) {
                Circle().fill(store.connection == "online" ? Color.green : Color.orange).frame(width: 8, height: 8)
                Text(store.connection == "online" ? "Home Assistant" : store.connection.capitalized).font(.caption.weight(.medium))
            }
            .padding(.horizontal, 12).padding(.vertical, 8).glassCard(radius: 18)
        }
    }

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(Okie.dim)
            TextField("Search devices", text: $search).autocorrectionDisabled().textInputAutocapitalization(.never)
            if !search.isEmpty { Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Okie.dim) } }
        }
        .padding(.horizontal, 16).padding(.vertical, 14).glassCard(radius: 24)
    }
}

/// A device as a tile: white and lit when on (like the dashboard), dark glass when off.
struct EntityTile: View {
    let entity: HAEntity
    var onTap: () -> Void
    var onLong: () -> Void

    private var on: Bool { entity.isOn || (entity.domain == "climate" && entity.state != "off" && !entity.isUnavailable) || (entity.domain == "cover" && entity.state == "open") }

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    Image(systemName: OkieIcon.symbol(for: entity)).font(.system(size: 26, weight: .medium))
                        .foregroundStyle(on ? Okie.amber : .white.opacity(0.8))
                    Spacer()
                    if entity.domain == "climate", let t = entity.attr("temperature")?.double {
                        Text(ThermoInfo.fmt(t) + "°").font(.system(size: 22, weight: .bold, design: .rounded)).foregroundStyle(on ? Okie.darkInk : .white)
                    }
                }
                Spacer(minLength: 18)
                Text(entity.name).font(.system(size: 15, weight: .semibold)).lineLimit(2).multilineTextAlignment(.leading)
                    .foregroundStyle(on ? Okie.darkInk : .white)
                Text(OkieIcon.stateText(entity)).font(.system(size: 13)).foregroundStyle(on ? Okie.darkInk.opacity(0.6) : Okie.dim)
            }
            .padding(16).frame(maxWidth: .infinity, minHeight: 124, alignment: .leading)
            .background(on ? AnyShapeStyle(Color.white) : AnyShapeStyle(.ultraThinMaterial), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .background(Color.black.opacity(on ? 0 : 0.2), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Color.white.opacity(on ? 0 : 0.14), lineWidth: 1))
            .opacity(entity.isUnavailable ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .simultaneousGesture(LongPressGesture(minimumDuration: 0.45).onEnded { _ in UIImpactFeedbackGenerator(style: .medium).impactOccurred(); onLong() })
    }
}

enum OkieIcon {
    static func symbol(for e: HAEntity) -> String {
        let n = (e.name + " " + e.entityId).lowercased()
        switch e.domain {
        case "light": return "lightbulb.fill"
        case "climate": return "thermometer.medium"
        case "cover": return "blinds.horizontal.closed"
        case "lock": return "lock.fill"
        case "fan": return "fan.fill"
        case "media_player": return n.contains("tv") ? "tv.fill" : "hifispeaker.fill"
        case "weather": return "cloud.sun.fill"
        case "camera": return "video.fill"
        case "calendar": return "calendar"
        case "vacuum": return "fanblades.fill"
        case "scene": return "sparkles"
        case "script", "button", "input_button":
            if n.contains("feed") || n.contains("beast") || n.contains("cat") { return "pawprint.fill" }
            if n.contains("sleep") || n.contains("night") { return "moon.fill" }
            if n.contains("cozy") { return "flame.fill" }
            if n.contains("bright") || n.contains("turn_up") || n.contains("turn up") { return "sun.max.fill" }
            return "play.fill"
        default:
            if n.contains("light") || n.contains("lamp") || n.contains("bed") { return "lightbulb.fill" }
            return "power"
        }
    }
    static func stateText(_ e: HAEntity) -> String {
        if e.isUnavailable { return "Not reachable" }
        switch e.domain {
        case "climate":
            let info = ThermoInfo(e, entityID: e.entityId)
            return info.statusLine
        case "light": if e.isOn, let b = e.attr("brightness")?.double { return "\(Int((b / 255 * 100).rounded()))%" }; return e.state.capitalized
        case "script", "button", "input_button", "scene": return "Tap to run"
        case "weather": return e.state.replacingOccurrences(of: "-", with: " ").capitalized
        default: return e.state.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}

#Preview("Dashboard") {
    ZStack { Wallpaper(); HomeView() }.environment(HomeStore.preview)
}
