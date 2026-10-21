import AppIntents
import SwiftUI
import WidgetKit

struct CalendarEntry: TimelineEntry {
    var date: Date
    var events: [CalendarEvent]
    var calendarIDs: [String]      // all calendars shown, in order: the colour of a dot follows the position
    var signedIn: Bool
    var failed: Bool
}

struct CalendarProvider: AppIntentTimelineProvider {
    typealias Intent = CalendarConfig
    typealias Entry = CalendarEntry

    func placeholder(in context: Context) -> CalendarEntry { Self.sample }

    func snapshot(for configuration: CalendarConfig, in context: Context) async -> CalendarEntry {
        context.isPreview ? Self.sample : await load(configuration)
    }

    func timeline(for configuration: CalendarConfig, in context: Context) async -> Timeline<CalendarEntry> {
        Timeline(entries: [await load(configuration)], policy: .after(Date().addingTimeInterval(30 * 60)))
    }

    private func load(_ c: CalendarConfig) async -> CalendarEntry {
        guard HAClient.shared.isSignedIn else { return CalendarEntry(date: .now, events: [], calendarIDs: [], signedIn: false, failed: false) }
        var ids = (c.calendars ?? []).map(\.id)
        if ids.isEmpty {
            // nothing chosen: all calendars except the robot's
            guard let all = try? await HAClient.shared.calendarList() else {
                return CalendarEntry(date: .now, events: [], calendarIDs: [], signedIn: true, failed: true)
            }
            let off = CalendarColors.hidden
            ids = all.filter { !CalendarRules.isHidden(id: $0.id, name: $0.name) && !off.contains($0.id) }.map(\.id)
        }
        let now = Date()
        let events = await HAClient.shared.allEvents(calendars: ids, from: now, to: now.addingTimeInterval(14 * 86400))
            .filter { $0.end > now || $0.start >= now }
        return CalendarEntry(date: now, events: events, calendarIDs: ids, signedIn: true, failed: false)
    }

    static var sample: CalendarEntry {
        let now = Date(), h: TimeInterval = 3600
        return CalendarEntry(date: now, events: [
            CalendarEvent(calendar: "calendar.a", summary: "Dinner with the neighbours", start: now.addingTimeInterval(2 * h), end: now.addingTimeInterval(4 * h), allDay: false, location: nil),
            CalendarEvent(calendar: "calendar.b", summary: "Vet appointment", start: now.addingTimeInterval(26 * h), end: now.addingTimeInterval(27 * h), allDay: false, location: nil),
            CalendarEvent(calendar: "calendar.a", summary: "Trash day", start: now.addingTimeInterval(50 * h), end: now.addingTimeInterval(74 * h), allDay: true, location: nil),
        ], calendarIDs: ["calendar.a", "calendar.b"], signedIn: true, failed: false)
    }
}

/// Laid out like the iPhone's own calendar widget: the weekday in red over the big date, today's events under them (or "No Events Today"), and at the right the next days, each with its date in
/// small grey capitals and its events: an all-day one as a coloured pill, a timed one as a coloured bar with its time. The glass behind it is ours.
struct CalendarWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: CalendarEntry

    private static let dots: [Color] = WidgetSpec.Calendar.dots.map { Color(hex: $0) }
    private static let red = Color(hex: 0xff453a)

    private var cal: Calendar { Calendar.current }
    private var todayStart: Date { cal.startOfDay(for: entry.date) }
    private var tomorrowStart: Date { cal.date(byAdding: .day, value: 1, to: todayStart) ?? todayStart.addingTimeInterval(86400) }
    private var todayEvents: [CalendarEvent] { entry.events.filter { $0.start < tomorrowStart } }
    /// the later days that have something on, each with its events
    private var laterDays: [(day: Date, events: [CalendarEvent])] {
        var out: [(day: Date, events: [CalendarEvent])] = []
        for e in entry.events where e.start >= tomorrowStart {
            let d = cal.startOfDay(for: e.start)
            if let i = out.firstIndex(where: { $0.day == d }) { out[i].events.append(e) } else { out.append((d, [e])) }
        }
        return out
    }

    private func color(_ e: CalendarEvent) -> Color { CalendarColors.color(e.calendar, in: entry.calendarIDs) }

    var body: some View {
        if !entry.signedIn {
            NeedsSignIn()
        } else {
            Group {
                if family == .systemSmall { small } else { wide }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .widgetURL(URL(string: "okiehome://calendar"))
        }
    }

    // MARK: the date

    private func dateBlock(big: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: -2) {
            Text(entry.date.formatted(.dateTime.weekday(.wide)).uppercased()).font(.system(size: 13, weight: .semibold)).foregroundStyle(Self.red).lineLimit(1)
            Text(entry.date.formatted(.dateTime.day())).font(.system(size: big, weight: .regular)).foregroundStyle(.white)
        }
    }

    private func none(_ s: String = "No Events Today") -> some View {
        Text(entry.failed ? "Calendar not reachable" : s).font(.system(size: 15, weight: .medium)).foregroundStyle(.white.opacity(0.55)).lineLimit(1).minimumScaleFactor(0.8)
    }

    // MARK: small

    private var small: some View {
        VStack(alignment: .leading, spacing: 0) {
            dateBlock(big: 44)
            Spacer(minLength: 4)
            VStack(alignment: .leading, spacing: 6) {
                if todayEvents.isEmpty { none() } else { ForEach(todayEvents.prefix(2)) { event($0, compact: true) } }
                if todayEvents.count < 2, let g = laterDays.first, let e = g.events.first {
                    Text(Self.shortDay(g.day)).font(.system(size: 10, weight: .semibold)).foregroundStyle(.white.opacity(0.5)).lineLimit(1)
                    event(e, compact: true)
                }
            }
        }
    }

    // MARK: medium and large

    private var wide: some View {
        let large = family == .systemLarge
        return HStack(alignment: .top, spacing: 14) {
            VStack(alignment: .leading, spacing: 0) {
                dateBlock(big: large ? 56 : 50)
                Spacer(minLength: 6)
                VStack(alignment: .leading, spacing: 7) {
                    if todayEvents.isEmpty { none() } else { ForEach(todayEvents.prefix(large ? 6 : 2)) { event($0, compact: false) } }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: 5) {
                ForEach(Array(laterRows(budget: large ? 11.0 : 4.0).enumerated()), id: \.offset) { _, r in
                    switch r {
                    case .header(let d):
                        Text(d.formatted(.dateTime.weekday(.wide).month(.abbreviated).day()).uppercased())
                            .font(.system(size: 11, weight: .semibold)).foregroundStyle(.white.opacity(0.55)).lineLimit(1)
                    case .event(let e): event(e, compact: false)
                    }
                }
                if laterDays.isEmpty && !entry.failed { Text("Nothing coming up").font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.45)) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private enum Row { case header(Date), event(CalendarEvent) }

    /// what fits at the right: a day's date, then its events, until the room is used (a date counts 1, a pill 1.2, a bar 1.7)
    private func laterRows(budget start: Double) -> [Row] {
        var budget = start, out: [Row] = []
        for g in laterDays {
            guard budget >= 2.2 else { break }
            out.append(.header(g.day)); budget -= 1
            for e in g.events {
                let cost = e.allDay ? 1.2 : 1.7
                guard budget >= cost else { break }
                out.append(.event(e)); budget -= cost
            }
        }
        return out
    }

    // MARK: one event

    @ViewBuilder private func event(_ e: CalendarEvent, compact: Bool) -> some View {
        let c = color(e), title = e.summary.isEmpty ? "Busy" : e.summary
        if e.allDay {
            HStack(spacing: 5) {
                ZStack {
                    Circle().fill(c)
                    Image(systemName: "calendar").font(.system(size: 9, weight: .bold)).foregroundStyle(.black.opacity(0.6))
                }
                .frame(width: 18, height: 18)
                Text(title).font(.system(size: compact ? 12 : 13, weight: .semibold)).foregroundStyle(c).lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.leading, 3).padding(.trailing, 8).padding(.vertical, 3)
            .background(Capsule().fill(c.opacity(0.2)))
        } else {
            HStack(alignment: .top, spacing: 7) {
                Capsule().fill(c).frame(width: 3, height: compact ? 26 : 30)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: compact ? 12 : 13, weight: .semibold)).foregroundStyle(.white).lineLimit(1)
                    Text(Self.time(e, now: entry.date)).font(.system(size: compact ? 10.5 : 11.5, weight: .medium)).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                }
            }
        }
    }

    /// "3:00 PM", "Now · until 4:00 PM"
    static func time(_ e: CalendarEvent, now: Date) -> String {
        if e.start <= now { return "Now · until " + e.end.formatted(date: .omitted, time: .shortened) }
        return e.start.formatted(date: .omitted, time: .shortened)
    }
    private static func shortDay(_ d: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInTomorrow(d) { return "TOMORROW" }
        return d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()).uppercased()
    }
}

struct CalendarWidget: Widget {
    let kind = "OkieCalendar"
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: CalendarConfig.self, provider: CalendarProvider()) { entry in
            CalendarWidgetView(entry: entry).okieWidgetBackground()
        }
        .configurationDisplayName("Calendar")
        .description("What is coming up, from the calendars you choose.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

#Preview("Calendar medium", as: .systemMedium) { CalendarWidget() } timeline: { CalendarProvider.sample }
