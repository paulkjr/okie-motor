import SwiftUI

/// The lock page of the Okie card: date, big clock, weather and indoor temperature, a greeting, the next event and a grip. A swipe up (or a tap on the grip) lifts it.
struct LockPage: View {
    @Environment(HomeStore.self) private var store
    var unlock: () -> Void
    @State private var drag: CGFloat = 0

    private static let greetings: [[String]] = [
        ["Good morning", "Rise and shine", "Good to see you", "Ready for a good day", "A fresh start", "The day is yours", "Coffee first", "Off to a good start"],
        ["Good afternoon", "Keep it going", "You're doing great", "Nice to see you", "Halfway there", "Welcome back", "All under control", "Take a little breather"],
        ["Good evening", "Almost done", "Time to relax", "You earned this", "Make yourself comfortable", "The evening is yours", "Well done today", "Time to wind down"],
    ]

    var body: some View {
        GeometryReader { geo in
            let s = min(max(geo.size.height / 874, 0.8), 1.5)
            let statusText = status, nextText = nextLine          // read here, not inside the clock's closure, so they follow the data
            TimelineView(.periodic(from: .now, by: 15)) { tl in
                ZStack {
                    Wallpaper().overlay(Color.black.opacity(0.15))
                    VStack(spacing: 0) {
                        Text(tl.date.formatted(.dateTime.weekday(.wide).month(.wide).day())).font(OkieFont.manrope(600, 19 * s)).foregroundStyle(.white.opacity(0.85))
                        Text(tl.date.formatted(date: .omitted, time: .shortened))
                            .font(OkieFont.manrope(500, 68 * s)).tracking(-2.5).monospacedDigit().foregroundStyle(.white).padding(.top, 2)
                        if let line = statusText { Text(line).font(OkieFont.manrope(600, 15 * s)).foregroundStyle(.white.opacity(0.8)).padding(.top, 6) }
                        Text(greeting(tl.date)).font(OkieFont.manrope(500, 30 * s)).tracking(-0.9).foregroundStyle(.white)
                            .multilineTextAlignment(.center).padding(.top, 84 * s)
                        if let next = nextText { Text(next).font(OkieFont.manrope(500, 14 * s)).foregroundStyle(.white.opacity(0.66)).padding(.top, 12).padding(.horizontal, 24) }
                        Spacer()
                        Button(action: unlock) {
                            Capsule().fill(.white.opacity(0.6)).frame(width: 116, height: 5).shadow(color: .white.opacity(0.4), radius: 8)
                                .padding(.vertical, 18).padding(.horizontal, 30)
                        }
                        .padding(.bottom, 6)
                    }
                    .padding(.top, 70 * s)
                    .frame(maxWidth: .infinity)
                }
                .offset(y: drag).opacity(1 - Double(min(1, -drag / 300)))
            }
            .gesture(DragGesture().onChanged { drag = min(0, $0.translation.height) }
                .onEnded { v in
                    if v.translation.height < -60 { unlock() } else { withAnimation(.easeOut(duration: 0.2)) { drag = 0 } }
                })
        }
        .ignoresSafeArea()
        .task(id: store.calendars.count) { upcoming = await store.nextEvents(1).first }
    }

    private var status: String? {
        var parts: [String] = []
        if let w = store.list.first(where: { $0.domain == "weather" }), let t = w.attr("temperature")?.double { parts.append("\(Int(t.rounded()))°")}
        if let c = store.list.first(where: { $0.domain == "climate" }), let t = c.attr("current_temperature")?.double { parts.append("\(Int(t.rounded()))° inside") }
        return parts.isEmpty ? nil : parts.joined(separator: "   ·   ")
    }

    private func greeting(_ d: Date) -> String {
        let h = Calendar.current.component(.hour, from: d)
        let list = Self.greetings[h < 12 ? 0 : (h < 18 ? 1 : 2)]
        return list[Int(d.timeIntervalSince1970 / 3600) % list.count]
    }

    @State private var upcoming: CalendarEvent?
    private var nextLine: String? { upcoming.map { "Next: \($0.summary) · \(EventText.when($0))" } }
}

#Preview("Lock page") {
    LockPage(unlock: {}).environment(HomeStore.preview)
}
