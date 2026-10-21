import SwiftUI

struct CalendarView: View {
    @Environment(HomeStore.self) private var store
    @State private var weekStart = CalendarView.monday(of: Date())
    @State private var events: [CalendarEvent] = []
    @State private var loading = false
    var onClose: (() -> Void)?

    static func monday(of d: Date) -> Date {
        var c = Calendar.current; c.firstWeekday = 2
        return c.dateInterval(of: .weekOfYear, for: d)?.start ?? Calendar.current.startOfDay(for: d)
    }

    private var days: [Date] { (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: weekStart) } }
    private var title: String {
        let f = DateFormatter(); f.dateFormat = "MMM d"
        let end = Calendar.current.date(byAdding: .day, value: 6, to: weekStart) ?? weekStart
        return "\(f.string(from: weekStart)) – \(f.string(from: end))"
    }

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                if let onClose { Button("Close", action: onClose).font(.system(size: 17)).padding(.trailing, 8) }
                Text(title).font(OkieFont.manrope(800, 28))
                Spacer()
                Button("Today") { withAnimation { weekStart = Self.monday(of: Date()) } }.font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 14).padding(.vertical, 8).glassCard(radius: 16)
            }
            .padding(.horizontal, 20).padding(.top, 10)
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(days, id: \.self) { d in dayRow(d) }
                }
                .padding(.vertical, 6).glassCard().padding(.horizontal, 16).padding(.bottom, 24)
                .frame(maxWidth: 760)
            }
            .refreshable { await load() }
        }
        .frame(maxWidth: .infinity)
        .task(id: weekStart) { await load() }
        .task(id: store.calendars.map(\.entityId)) { await load() }
        .gesture(DragGesture(minimumDistance: 40).onEnded { v in
            guard abs(v.translation.width) > abs(v.translation.height) * 1.6 else { return }
            let d = v.translation.width < 0 ? 7 : -7
            if let n = Calendar.current.date(byAdding: .day, value: d, to: weekStart) { withAnimation { weekStart = n } }
        })
    }

    private func load() async {
        let ids = store.calendars.map(\.entityId)
        let end = Calendar.current.date(byAdding: .day, value: 7, to: weekStart) ?? weekStart
        let list = await store.events(ids, from: weekStart, to: end)
        await MainActor.run { events = list }
    }

    private func dayRow(_ day: Date) -> some View {
        let cal = Calendar.current
        let evs = events.filter { e in
            let ds = cal.startOfDay(for: day), de = cal.date(byAdding: .day, value: 1, to: ds)!
            return e.start < de && (e.end > ds || e.start >= ds) && (e.allDay ? e.end > ds : true)
        }
        let today = cal.isDateInToday(day)
        let wf = DateFormatter(); wf.dateFormat = "EEE"
        let all = store.calendars.map(\.entityId)
        return HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 2) {
                Text(wf.string(from: day).uppercased()).font(.system(size: 11, weight: .semibold)).tracking(1.2).foregroundStyle(today ? Color(hex: 0xff453a) : Okie.dim)
                Text("\(cal.component(.day, from: day))").font(.system(size: 26, weight: .bold, design: .rounded)).foregroundStyle(today ? Color(hex: 0xff453a) : .white)
            }
            .frame(width: 48)
            VStack(alignment: .leading, spacing: 10) {
                if evs.isEmpty { Text("No events").foregroundStyle(Okie.dim).font(.callout) }
                ForEach(evs) { e in
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Circle().fill(CalendarColors.color(e.calendar, in: all)).frame(width: 9, height: 9)
                        Text(e.allDay ? "All day" : Self.time(e.start)).font(.footnote).foregroundStyle(Okie.dim).frame(width: 64, alignment: .leading)
                        Text(e.summary).font(.system(size: 16, weight: .semibold)).lineLimit(2)
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .overlay(alignment: .bottom) { Rectangle().fill(Color.white.opacity(0.10)).frame(height: 1).padding(.horizontal, 16) }
    }

    static func time(_ d: Date) -> String {
        let f = DateFormatter(); f.timeStyle = .short; f.dateStyle = .none; return f.string(from: d)
    }
}

enum EventText {
    /// "Today · 3:00 PM", "Tomorrow · all day", "Fri 24 · 9:30 AM"
    static func when(_ e: CalendarEvent, now: Date = Date()) -> String {
        let cal = Calendar.current
        let day = (cal.isDateInToday(e.start) || e.start <= now) ? "Today" : cal.isDateInTomorrow(e.start) ? "Tomorrow" : e.start.formatted(.dateTime.weekday(.abbreviated).day())
        return e.allDay ? day + " · all day" : day + " · " + e.start.formatted(date: .omitted, time: .shortened)
    }
}

/// The next few events as a card on the dashboard; a tap opens the week.
struct CalendarCard: View {
    @Environment(HomeStore.self) private var store
    @State private var events: [CalendarEvent] = []

    var body: some View {
        Button { store.showCalendar = true } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("COMING UP").font(OkieFont.manrope(800, 12)).tracking(2).foregroundStyle(Okie.amber)
                    Spacer()
                    Image(systemName: "chevron.right").font(.footnote.weight(.bold)).foregroundStyle(Okie.dim)
                }
                if events.isEmpty {
                    Text("Nothing coming up").font(.callout).foregroundStyle(Okie.dim)
                } else {
                    let all = store.calendars.map(\.entityId)
                    ForEach(events) { e in
                        HStack(alignment: .top, spacing: 10) {
                            Capsule().fill(CalendarColors.color(e.calendar, in: all)).frame(width: 4, height: 34)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(e.summary.isEmpty ? "Busy" : e.summary).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                                Text(EventText.when(e)).font(.system(size: 13, weight: .medium)).foregroundStyle(Okie.dim)
                            }
                            Spacer(minLength: 0)
                        }
                    }
                }
            }
            .padding(18).frame(maxWidth: .infinity, alignment: .leading).glassCard()
        }
        .buttonStyle(.plain)
        .task(id: store.calendars.map(\.entityId)) { events = await store.nextEvents(4) }
    }
}
