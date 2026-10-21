import AppIntents
import SwiftUI
import WidgetKit

struct LightsEntry: TimelineEntry {
    var date: Date
    var items: [LightItem]
    var signedIn: Bool
    var design: LightsDesign = .dark
}

struct LightsProvider: AppIntentTimelineProvider {
    typealias Intent = LightsConfig
    typealias Entry = LightsEntry

    /// What it shows when no buttons were chosen (the ones that exist on this Home Assistant).
    static let usual = WidgetSpec.Lights.tiles.map(\.entity)

    func placeholder(in context: Context) -> LightsEntry { Self.sample }

    func snapshot(for configuration: LightsConfig, in context: Context) async -> LightsEntry {
        context.isPreview ? Self.sample : await load(configuration)
    }

    func timeline(for configuration: LightsConfig, in context: Context) async -> Timeline<LightsEntry> {
        Timeline(entries: [await load(configuration)], policy: .after(Date().addingTimeInterval(15 * 60)))
    }

    private func load(_ c: LightsConfig) async -> LightsEntry {
        guard HAClient.shared.isSignedIn else { return LightsEntry(date: .now, items: [], signedIn: false, design: c.design) }
        var wanted = c.chosen
        let found = await fetch(wanted.isEmpty ? Self.usual : wanted)
        var items = found
        if wanted.isEmpty && found.isEmpty, let all = try? await HAClient.shared.states() {
            // none of the usual ones exist: the first lights
            wanted = all.filter { $0.domain == "light" }.prefix(4).map(\.entityId)
            items = wanted.compactMap { id in all.first { $0.entityId == id } }.map { LightItem.from($0) }
        }
        return LightsEntry(date: .now, items: Array(items.prefix(4)), signedIn: true, design: c.design)
    }

    /// One request per button, all at the same time; an entity that cannot be read is left out.
    private func fetch(_ ids: [String]) async -> [LightItem] {
        await withTaskGroup(of: (Int, LightItem?).self) { group in
            for (i, id) in ids.enumerated() {
                group.addTask {
                    guard let e = try? await HAClient.shared.state(id) else { return (i, nil) }
                    let area = ["switch", "light", "input_boolean"].contains(e.domain) ? await HAClient.shared.areaName(id) : nil
                    return (i, LightItem.from(e, area: area))
                }
            }
            var out: [(Int, LightItem)] = []
            for await (i, item) in group { if let item { out.append((i, item)) } }
            return out.sorted { $0.0 < $1.0 }.map(\.1)
        }
    }

    static var sample: LightsEntry {
        func e(_ id: String, _ name: String, _ state: String) -> HAEntity { HAEntity(entityId: id, state: state, attributes: ["friendly_name": .string(name)]) }
        return LightsEntry(date: .now, items: [
            LightItem.from(e("switch.bedlight", "Bedlight", "on"), area: "Bedroom"),
            LightItem.from(e("script.govee_cozy_lights", "Cozy", "off")),
            LightItem.from(e("script.govee_lets_go_to_sleep", "Sleep", "off")),
            LightItem.from(e("script.govee_turn_up_the_lights", "Turn up", "off")),
        ], signedIn: true)
    }
}

struct LightsWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LightsEntry

    var body: some View {
        if !entry.signedIn {
            NeedsSignIn()
        } else if entry.items.isEmpty {
            Text("Pick lights in the widget settings")
                .font(.system(size: 13, weight: .semibold)).multilineTextAlignment(.center)
                .foregroundStyle(entry.design == .bright ? Color(hex: WidgetSpec.Lights.Bright.text) : .white.opacity(0.85))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            LightsGrid(items: entry.items, small: family == .systemSmall, design: entry.design)
        }
    }
}

struct LightsWidget: Widget {
    let kind = "OkieLights"
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: LightsConfig.self, provider: LightsProvider()) { entry in
            LightsWidgetView(entry: entry).containerBackground(for: .widget) { LightsBackdrop(design: entry.design) }
        }
        .configurationDisplayName("Lights")
        .description("Up to four buttons for lights, switches and scripts. Long-press the widget to pick a dark or a bright design.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

#Preview("Lights medium", as: .systemMedium) { LightsWidget() } timeline: { LightsProvider.sample }
#Preview("Lights small", as: .systemSmall) { LightsWidget() } timeline: { LightsProvider.sample }
