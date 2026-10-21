import AppIntents
import SwiftUI
import WidgetKit

struct FeederEntry: TimelineEntry {
    var date: Date
    var entityID: String
    var name: String
    var lastFed: Date?
    var unavailable: Bool
    var armed: Bool          // the first tap was made: the next one feeds anyway
    var signedIn: Bool
    var design: FeederDesign = .classic
}

struct FeederProvider: AppIntentTimelineProvider {
    typealias Intent = FeederConfig
    typealias Entry = FeederEntry

    static let defaultID = WidgetSpec.Feeder.entity

    func placeholder(in context: Context) -> FeederEntry { Self.sample }

    func snapshot(for configuration: FeederConfig, in context: Context) async -> FeederEntry {
        context.isPreview ? Self.sample : await load(configuration)
    }

    func timeline(for configuration: FeederConfig, in context: Context) async -> Timeline<FeederEntry> {
        let now = Date()
        let first = await load(configuration)
        var entries = [first]
        if first.armed, let at = FeedGuard.armedAt(first.entityID) {
            // after the question ("tap again?") the face goes back to normal by itself
            var back = first; back.armed = false; back.date = at.addingTimeInterval(FeedGuard.armedFor)
            entries.append(back)
        } else if let fed = first.lastFed, now.timeIntervalSince(fed) < 3600 {
            // "Just now" turns into "3 min ago" and so on: one face a minute for the first hour
            for m in 1...60 {
                let t = now.addingTimeInterval(Double(m) * 60)
                if t.timeIntervalSince(fed) > 3600 { break }
                var e = first; e.date = t; entries.append(e)
            }
        }
        return Timeline(entries: entries, policy: .after(now.addingTimeInterval(15 * 60)))
    }

    private func load(_ c: FeederConfig) async -> FeederEntry {
        let id = c.feeder?.id ?? Self.defaultID
        let design = c.design
        guard HAClient.shared.isSignedIn else {
            return FeederEntry(date: .now, entityID: id, name: "Feed the Beasts", lastFed: nil, unavailable: true, armed: false, signedIn: false, design: design)
        }
        guard let e = try? await HAClient.shared.state(id) else {
            return FeederEntry(date: .now, entityID: id, name: "Feed the Beasts", lastFed: nil, unavailable: true, armed: false, signedIn: true, design: design)
        }
        let last = e.attributes["last_triggered"]?.string.flatMap(HADate.parse)
        return FeederEntry(date: .now, entityID: id, name: "Feed the Beasts", lastFed: last, unavailable: e.state == "unavailable", armed: FeedGuard.isArmed(id), signedIn: true, design: design)
    }

    static var sample: FeederEntry {
        FeederEntry(date: .now, entityID: defaultID, name: "Feed the Beasts", lastFed: Date().addingTimeInterval(-3 * 3600), unavailable: false, armed: false, signedIn: true)
    }
}

struct FeederWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: FeederEntry

    var body: some View {
        Group { if !entry.signedIn { NeedsSignIn() } else { content } }
            .containerBackground(for: .widget) { FeederBackdrop(design: entry.design, medium: family != .systemSmall) }
    }

    /// "Just now", "12 min ago", "Today 7:04 AM", "Yesterday 4:00 PM", "Mon 4:00 PM"
    static func fedText(_ d: Date, now: Date) -> String {
        let mins = Int((now.timeIntervalSince(d) / 60).rounded())
        if mins < 2 { return "Just now" }
        if mins < 60 { return "\(mins) min ago" }
        let cal = Calendar.current
        let t = d.formatted(date: .omitted, time: .shortened)
        if cal.isDate(d, inSameDayAs: now) { return "Today " + t }
        if cal.isDateInYesterday(d) { return "Yesterday " + t }
        return d.formatted(.dateTime.weekday(.abbreviated)) + " " + t
    }

    /// The line under the name (white, or orange when the second tap is needed).
    private var fedLine: (text: String, ask: Bool) {
        let medium = family != .systemSmall
        if entry.unavailable { return (medium ? "Not reachable right now" : "Not reachable", false) }
        if entry.armed { return (medium ? "Fed recently. Tap again to feed anyway" : "Fed recently. Tap again to feed", true) }
        guard let fed = entry.lastFed else { return ("Not fed yet", false) }
        let when = Self.fedText(fed, now: entry.date)
        return (medium ? "Last fed " + when : when, false)
    }

    private var content: some View {
        let line = fedLine
        return Button(intent: FeedIntent(entityID: entry.entityID)) {
            FeederCardView(design: entry.design, medium: family != .systemSmall, title: WidgetSpec.Feeder.title.uppercased(), line: line.text, ask: line.ask, dim: entry.unavailable)
        }
        .buttonStyle(.plain)
    }
}

struct FeederWidget: Widget {
    let kind = "OkieFeeder"
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: FeederConfig.self, provider: FeederProvider()) { entry in
            FeederWidgetView(entry: entry)
        }
        .configurationDisplayName("Feed the Beasts")
        .description("One tap feeds the pets. A second tap is needed if they were fed in the last 10 minutes. Long-press the widget to pick one of five designs.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

#Preview("Feeder medium", as: .systemMedium) { FeederWidget() } timeline: { FeederProvider.sample }
#Preview("Feeder small", as: .systemSmall) { FeederWidget() } timeline: { FeederProvider.sample }
