import SwiftUI

enum CalMode: String, CaseIterable { case day = "Day", week = "Week", month = "Month", year = "Year" }

/// The dates the calendar screen works with (the week starts on Monday, like the card).
enum CalMath {
    static var cal: Calendar { var c = Calendar.current; c.firstWeekday = 2; c.minimumDaysInFirstWeek = 4; return c }
    static func sod(_ d: Date) -> Date { cal.startOfDay(for: d) }
    static func add(_ d: Date, days n: Int) -> Date { cal.date(byAdding: .day, value: n, to: d) ?? d }
    static func add(_ d: Date, months n: Int) -> Date { cal.date(byAdding: .month, value: n, to: d) ?? d }
    static func weekStart(_ d: Date) -> Date { let s = sod(d); return add(s, days: -((cal.component(.weekday, from: s) + 5) % 7)) }
    static func monthStart(_ d: Date) -> Date { cal.date(from: cal.dateComponents([.year, .month], from: d)) ?? sod(d) }
    static func yearStart(_ d: Date) -> Date { cal.date(from: cal.dateComponents([.year], from: d)) ?? sod(d) }
    static func year(_ d: Date) -> Int { cal.component(.year, from: d) }
    static func days(from a: Date, to b: Date) -> Int { cal.dateComponents([.day], from: sod(a), to: sod(b)).day ?? 0 }
    static func months(from a: Date, to b: Date) -> Int { cal.dateComponents([.month], from: monthStart(a), to: monthStart(b)).month ?? 0 }
    /// the 42 days of a month's grid, from the Monday on or before the 1st
    static func grid(_ month: Date) -> [Date] { let s = weekStart(monthStart(month)); return (0..<42).map { add(s, days: $0) } }
    static func sameMonth(_ a: Date, _ b: Date) -> Bool { cal.isDate(a, equalTo: b, toGranularity: .month) }
    static func up(_ s: String) -> String { s.uppercased().replacingOccurrences(of: ".", with: "") }
    /// "00:00" on a 24-hour clock, "12 AM" on a 12-hour one (the phone's own setting)
    static let is12h: Bool = (DateFormatter.dateFormat(fromTemplate: "j", options: 0, locale: Locale.current) ?? "").contains("a")
    static let hourOnly: DateFormatter = { let f = DateFormatter(); f.dateFormat = is12h ? "h a" : "HH:00"; return f }()
    static let hourFormat: DateFormatter = { let f = DateFormatter(); f.dateStyle = .none; f.timeStyle = .short; return f }()
    static func hourLabel(_ h: Int) -> String { hourOnly.string(from: cal.date(bySettingHour: h, minute: 0, second: 0, of: Date()) ?? Date()) }
}

enum CalLook {
    static let red = Color(red: 0.93, green: 0.30, blue: 0.29)
    static let line = Color.white.opacity(0.14)
}

/// The glass of the buttons: the card's own (Settings > Design > Liquid glass), see OkieGlass.
typealias CalGlass = OkieGlass

// MARK: the events the screen shows

/// The events of the calendars, loaded a month at a time as the screen reaches them and kept by day.
@Observable @MainActor
final class CalData {
    var calIDs: [String] = []
    var allIDs: [String] = []                          // every calendar (hidden ones too): the automatic colours are given among all of them, like on the card
    var calNames: [String: String] = [:]
    var writable: [String] = []
    var byDay: [Date: [CalendarEvent]] = [:]
    var ready = false
    var pick: Date?                                   // the time the red line was moved to in the Day view: a new event starts there
    @ObservationIgnored private var perMonth: [Date: [CalendarEvent]] = [:]
    @ObservationIgnored private var requested: Set<Date> = []
    @ObservationIgnored private var local: [CalendarEvent] = []      // sample mode: events made on the phone

    func color(_ e: CalendarEvent) -> Color { CalendarColors.color(e.calendar, in: allIDs.isEmpty ? calIDs : allIDs) }
    func events(on d: Date) -> [CalendarEvent] { byDay[CalMath.sod(d)] ?? [] }

    func start(_ store: HomeStore) async {
        var list: [(id: String, name: String)] = []
        if store.demo { list = store.calendars.map { ($0.entityId, $0.name) } }
        else { list = (try? await HAClient.shared.calendarList()) ?? [] }
        if !store.demo { await store.syncCalendarSettings() }
        allIDs = list.map(\.id)
        list = list.filter { !CalendarRules.isHidden(id: $0.id, name: $0.name) && !store.calendarHidden.contains($0.id) }
        calNames = Dictionary(uniqueKeysWithValues: list.map { ($0.id, $0.name) })
        calIDs = list.map(\.id)
        ready = true
        // a calendar can be added to when Home Assistant says so (supported_features has the create bit)
        var w: [String] = []
        if store.demo { w = calIDs.filter { $0 == "calendar.family" } }
        else { for id in calIDs { if let e = try? await HAClient.shared.state(id), (Int(e.num("supported_features") ?? 0) & 1) != 0 { w.append(id) } } }
        writable = w
    }

    func ensure(_ month: Date, _ store: HomeStore, force: Bool = false) async {
        while !ready { try? await Task.sleep(nanoseconds: 60_000_000) }
        let m = CalMath.monthStart(month)
        if !force && requested.contains(m) { return }
        requested.insert(m)
        let to = CalMath.add(m, months: 1)
        let got = await store.events(calIDs, from: m, to: to)
        perMonth[m] = got + local.filter { $0.start < to && $0.end > m }
        rebuild()
    }

    /// every month from the one of `a` to the one of `b`
    func ensure(from a: Date, to b: Date, _ store: HomeStore) async {
        var m = CalMath.monthStart(a)
        let last = CalMath.monthStart(b)
        while m <= last { await ensure(m, store); m = CalMath.add(m, months: 1) }
    }

    func reload(_ store: HomeStore) async {
        for m in Array(perMonth.keys) { await ensure(m, store, force: true) }
    }

    func addLocal(_ e: CalendarEvent) {
        local.append(e)
        for m in Array(perMonth.keys) { let to = CalMath.add(m, months: 1); if e.start < to && e.end > m { perMonth[m, default: []].append(e) } }
        rebuild()
    }

    private func rebuild() {
        var idx: [Date: [CalendarEvent]] = [:], seen = Set<String>()
        for list in perMonth.values {
            for e in list {
                guard seen.insert("\(e.calendar)|\(e.summary)|\(e.start.timeIntervalSince1970)|\(e.end.timeIntervalSince1970)").inserted else { continue }
                var d = CalMath.sod(e.start), n = 0
                repeat { idx[d, default: []].append(e); d = CalMath.add(d, days: 1); n += 1 } while d < e.end && n < 62
            }
        }
        for k in idx.keys { idx[k]?.sort { ($0.allDay ? 0 : 1, $0.start) < ($1.allDay ? 0 : 1, $1.start) } }
        byDay = idx
    }
}

// MARK: the screen

/// What a tap on the calendar widget opens: the card's calendar (Day, Week, Month, Year) as its own full-screen page, without the dashboard. It reads the calendars of Home Assistant itself.
struct CalendarScreen: View {
    @Environment(HomeStore.self) private var store
    var onClose: () -> Void

    @State private var data = CalData()
    @State private var mode: CalMode = CalMode(rawValue: UserDefaults.standard.string(forKey: "calendarMode") ?? "") ?? .week
    @State private var anchor = Date()
    @State private var sel = CalMath.sod(Date())              // the picked day in the Month view
    @State private var detail: CalendarEvent?
    @State private var adding = false
    @State private var searching = false

    private let card = Color(hex: 0x262626)
    private let today = CalMath.sod(Date())

    var body: some View {
        ZStack {
            Color(hex: 0x141414).ignoresSafeArea()
            VStack(spacing: 0) {
                header
                strip
                pager.id(mode)
                tabs
            }
        }
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .task { await data.start(store) }
        .task { while !Task.isCancelled { try? await Task.sleep(nanoseconds: 120_000_000_000); await data.reload(store) } }
        .onChange(of: anchor) { _, a in
            if mode == .month { sel = monthSel(a) } else if mode == .day { sel = CalMath.sod(a) }
        }
        .sheet(item: $detail) { e in EventDetail(event: e, color: data.color(e), calendar: data.calNames[e.calendar] ?? e.calendar).presentationDetents([.medium]) }
        .sheet(isPresented: $adding) { NewEventSheet(data: data, day: mode == .month ? sel : CalMath.sod(anchor), at: (mode == .day ? data.pick.flatMap { CalMath.cal.isDate($0, inSameDayAs: anchor) ? $0 : nil } : nil), onDone: { Task { await data.reload(store) } }) }
        .sheet(isPresented: $searching) { CalSearchSheet(data: data, onPick: { d in anchor = d; sel = CalMath.sod(d); switchMode(.day) }) }
    }

    // MARK: top: Close, and the buttons (Today, search, plus)

    private var header: some View {
        HStack(spacing: 0) {
            Button(action: onClose) { Text("Close").font(.system(size: 17)).padding(.horizontal, 18).frame(height: 44).contentShape(Rectangle()) }
            Spacer()
            HStack(spacing: 0) {
                Button { goToday() } label: { Text("Today").font(.system(size: 16, weight: .semibold)).padding(.horizontal, 14).frame(height: 44) }
                Button { searching = true } label: { Image(systemName: "magnifyingglass").font(.system(size: 19)).frame(width: 42, height: 44) }
                Button { adding = true } label: { Image(systemName: "plus").font(.system(size: 22)).frame(width: 42, height: 44) }
            }
            .buttonStyle(.plain)
            .modifier(CalGlass())
            .padding(.trailing, 14)
        }
        .padding(.top, 2).padding(.bottom, 2)
    }

    private func goToday() {
        Haptic.web(8)
        data.pick = nil
        withAnimation(.easeInOut(duration: 0.25)) { anchor = Date(); sel = today }
    }

    // MARK: the strip of periods: one long row that stays where it is (it is not rebuilt when you pick something), so it scrolls

    private var stripRange: ClosedRange<Int> { mode == .day ? -730...730 : (mode == .week ? -104...104 : (mode == .month ? -60...60 : -10...10)) }

    private func stripLabel(_ i: Int) -> String {
        let d = date(mode, i)
        switch mode {
        case .day: return CalMath.up(d.formatted(.dateTime.weekday(.abbreviated))) + " " + d.formatted(.dateTime.day())
        case .week:
            let e = CalMath.add(d, days: 6)
            let m = { (x: Date) in CalMath.up(x.formatted(.dateTime.month(.abbreviated))) }, dd = { (x: Date) in x.formatted(.dateTime.day()) }
            return CalMath.sameMonth(d, e) ? "\(m(d)) \(dd(d))–\(dd(e))" : "\(m(d)) \(dd(d)) – \(m(e)) \(dd(e))"
        case .month:
            let jan = CalMath.cal.component(.month, from: d) == 1 && i != 0
            return CalMath.up(d.formatted(.dateTime.month(.wide))) + (jan ? " " + d.formatted(.dateTime.year()) : "")
        case .year: return d.formatted(.dateTime.year())
        }
    }

    private var strip: some View {
        let current = index(mode, anchor)
        return ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: 24) {
                    ForEach(stripRange, id: \.self) { i in
                        let active = i == current
                        Button {
                            withAnimation(.easeInOut(duration: 0.3)) {
                                anchor = date(mode, i)
                                if mode == .month { sel = monthSel(anchor) } else if mode == .day { sel = CalMath.sod(anchor) }
                            }
                        } label: {
                            VStack(spacing: 5) {
                                Text(stripLabel(i)).font(.system(size: active ? 21 : 17, weight: active ? .bold : .semibold)).tracking(2).opacity(active ? 1 : 0.4).fixedSize()
                                Circle().fill(CalLook.red).frame(width: 5, height: 5).opacity(active && i == 0 ? 1 : 0)
                            }
                        }
                        .id(i)
                    }
                }
                .padding(.top, 14).padding(.bottom, 6)
            }
            .contentMargins(.horizontal, 20, for: .scrollContent)
            .frame(height: 58)                      // a lazy row has no height of its own: without this the strip takes the whole screen
            .task(id: mode) { try? await Task.sleep(nanoseconds: 60_000_000); proxy.scrollTo(index(mode, anchor), anchor: .leading) }
            .onChange(of: current) { _, i in withAnimation(.easeInOut(duration: 0.35)) { proxy.scrollTo(i, anchor: .leading) } }
        }
    }

    // MARK: the pages: one per day, week, month or year, swiped sideways (it slides, it does not jump)

    private func index(_ m: CalMode, _ d: Date) -> Int {
        switch m {
        case .day: return CalMath.days(from: today, to: d)
        case .week: return CalMath.days(from: CalMath.weekStart(today), to: CalMath.weekStart(d)) / 7
        case .month: return CalMath.months(from: today, to: d)
        case .year: return CalMath.year(d) - CalMath.year(today)
        }
    }
    private func date(_ m: CalMode, _ i: Int) -> Date {
        switch m {
        case .day: return CalMath.add(today, days: i)
        case .week: return CalMath.add(CalMath.weekStart(today), days: 7 * i)
        case .month: return CalMath.add(CalMath.monthStart(today), months: i)
        case .year: return CalMath.add(CalMath.yearStart(today), months: 12 * i)
        }
    }

    private var pager: some View {
        let m = mode
        let range: ClosedRange<Int> = m == .day ? -730...730 : (m == .week ? -104...104 : (m == .month ? -60...60 : -10...10))
        return CalPager(range: range, index: Binding(get: { index(m, anchor) }, set: { anchor = date(m, $0) })) { i in
            switch m {
            case .day: CalDayPage(data: data, day: date(.day, i), onTap: { detail = $0 })
            case .week: weekPage(date(.week, i))
            case .month: monthPage(date(.month, i))
            case .year: yearPage(CalMath.year(date(.year, i)))
            }
        }
    }

    private func color(_ e: CalendarEvent) -> Color { data.color(e) }

    // Week: the seven days as a list in a card
    private func weekPage(_ start: Date) -> some View {
        ScrollView {
            VStack(spacing: 0) { ForEach(0..<7, id: \.self) { i in dayRow(CalMath.add(start, days: i), showNone: true, divider: i < 6) } }
                .background(RoundedRectangle(cornerRadius: 28).fill(card.opacity(0.96)))
                .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 24)
                .frame(maxWidth: 760)
        }
        .task { await data.ensure(from: start, to: CalMath.add(start, days: 6), store) }
    }

    /// one day: its date at the left, its events at the right
    private func dayRow(_ day: Date, showNone: Bool, divider: Bool = true) -> some View {
        let evs = data.events(on: day), isToday = CalMath.cal.isDateInToday(day), past = CalMath.sod(day) < today
        return HStack(alignment: .top, spacing: 12) {
            VStack(spacing: 2) {
                Text(CalMath.up(day.formatted(.dateTime.weekday(.abbreviated)))).font(.system(size: 11, weight: .semibold)).tracking(1.4)
                Text(day.formatted(.dateTime.day())).font(.system(size: 24, weight: .bold, design: .rounded))
            }
            .foregroundStyle(isToday ? CalLook.red : .white.opacity(past ? 0.5 : 0.85))
            .frame(width: 44)
            VStack(alignment: .leading, spacing: 10) {
                if evs.isEmpty && showNone { Text("No events").font(.system(size: 15)).opacity(0.6) }
                ForEach(evs) { e in
                    Button { detail = e } label: {
                        HStack(alignment: .top, spacing: 10) {
                            Circle().fill(color(e)).frame(width: 9, height: 9).padding(.top, 6)
                            Text(e.allDay ? "All day" : CalendarView.time(e.start)).font(.system(size: 14)).opacity(0.55).frame(width: 66, alignment: .leading).padding(.top, 2)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.summary.isEmpty ? "Busy" : e.summary).font(.system(size: 16, weight: .semibold)).multilineTextAlignment(.leading)
                                if let l = e.location, !l.isEmpty { Text(l).font(.system(size: 13)).opacity(0.55).multilineTextAlignment(.leading) }
                            }
                            .opacity(past && !isToday ? 0.55 : 1)
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18).padding(.vertical, 12)
        .overlay(alignment: .bottom) { if divider { Rectangle().fill(.white.opacity(0.10)).frame(height: 1).padding(.horizontal, 18) } }
    }

    // Month: a quiet grid with colour dots, and the agenda of the picked day and the days after it
    private func monthPage(_ m: Date) -> some View {
        let cells = CalMath.grid(m), todayD = CalMath.sod(Date())
        let names = (0..<7).map { i in CalMath.add(CalMath.weekStart(Date()), days: i).formatted(.dateTime.weekday(.narrow)) }
        let pickedDay = CalMath.sameMonth(sel, m) ? sel : monthSel(m)
        return VStack(spacing: 0) {
            HStack(spacing: 0) { ForEach(0..<7, id: \.self) { i in Text(names[i]).font(.system(size: 13, weight: .semibold)).opacity(0.45).frame(maxWidth: .infinity) } }
                .padding(.horizontal, 12).padding(.top, 6)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 2) {
                ForEach(cells, id: \.self) { c in
                    let inMonth = CalMath.sameMonth(c, m), n = data.events(on: c)
                    Button { pick(c, inMonth: inMonth, month: m) } label: {
                        VStack(spacing: 3) {
                            Text(c.formatted(.dateTime.day())).font(.system(size: 17, weight: c == todayD ? .bold : .regular)).monospacedDigit()
                                .foregroundStyle(c == todayD ? .white : .white.opacity(inMonth ? 1 : 0.3))
                                .frame(width: 32, height: 32)
                                .background(Circle().fill(c == todayD ? CalLook.red : (c == pickedDay ? .white.opacity(0.2) : .clear)))
                            HStack(spacing: 3) { ForEach(Array(n.prefix(3).enumerated()), id: \.offset) { _, e in Circle().fill(color(e)).frame(width: 5, height: 5) } }.frame(height: 5)
                        }
                        .frame(maxWidth: .infinity, minHeight: 46).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12).padding(.top, 2)
            ScrollView {
                VStack(spacing: 0) {
                    let days = agendaDays(from: pickedDay)
                    ForEach(Array(days.enumerated()), id: \.element) { i, d in dayRow(d, showNone: true, divider: i < days.count - 1) }
                }
                .background(RoundedRectangle(cornerRadius: 24).fill(card.opacity(0.96)))
                .padding(.horizontal, 16).padding(.top, 10).padding(.bottom, 24)
            }
        }
        .task { await data.ensure(from: cells[0], to: CalMath.add(cells[41], days: 45), store) }
    }

    /// the picked day (always, empty or not), then each following day that has something on
    private func agendaDays(from day: Date) -> [Date] {
        var out: [Date] = [], count = 0
        for i in 0..<45 {
            let d = CalMath.add(day, days: i), n = data.events(on: d).count
            if i > 0 && n == 0 { continue }
            if i > 0 && count >= 40 { break }
            out.append(d); count += n
        }
        return out
    }

    private func pick(_ c: Date, inMonth: Bool, month: Date) {
        if !inMonth { withAnimation { anchor = c; sel = c }; return }
        if sel == c { withAnimation { anchor = c; mode = .day }; return }          // a second tap opens the day
        sel = c
    }

    // Year: the twelve months, a day bold when something is on
    private func yearPage(_ y: Int) -> some View {
        let first = CalMath.cal.date(from: DateComponents(year: y, month: 1, day: 1)) ?? Date(), now = Date()
        var has = Set<Date>()
        for m in 0..<12 {
            for c in CalMath.grid(CalMath.add(first, months: m)) where CalMath.sameMonth(c, CalMath.add(first, months: m)) && !data.events(on: c).isEmpty { has.insert(c) }
        }
        return ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 14), GridItem(.flexible(), spacing: 14)], spacing: 18) {
                ForEach(0..<12, id: \.self) { m in
                    let ms = CalMath.add(first, months: m), cells = CalMath.grid(ms)
                    Button { withAnimation { anchor = ms; sel = monthSel(ms); mode = .month } } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(ms.formatted(.dateTime.month(.wide))).font(.system(size: 17, weight: .bold)).foregroundStyle(CalMath.sameMonth(ms, now) ? CalLook.red : .white)
                            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 3) {
                                ForEach(cells, id: \.self) { c in
                                    if CalMath.sameMonth(c, ms) {
                                        Text(c.formatted(.dateTime.day())).font(.system(size: 10.5, weight: has.contains(c) ? .bold : .regular)).monospacedDigit()
                                            .foregroundStyle(CalMath.sod(now) == c ? CalLook.red : .white.opacity(has.contains(c) ? 1 : 0.5))
                                            .frame(maxWidth: .infinity)
                                    } else { Color.clear.frame(height: 12) }
                                }
                            }
                        }
                        .padding(12).background(RoundedRectangle(cornerRadius: 18).fill(card.opacity(0.96)))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12).padding(.bottom, 12)
        }
        .task { await data.ensure(from: first, to: CalMath.add(first, months: 11), store) }
    }

    // MARK: the pill at the bottom

    private var tabs: some View {
        HStack(spacing: 2) {
            ForEach(CalMode.allCases, id: \.self) { m in
                Button { switchMode(m) } label: {
                    Text(m.rawValue).font(.system(size: 17, weight: mode == m ? .semibold : .regular)).foregroundStyle(mode == m ? .black : .white.opacity(0.55))
                        .padding(.horizontal, 20).padding(.vertical, 11)
                        .background { if mode == m { Capsule().fill(.white) } }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(5).background(Capsule().fill(.white.opacity(0.10)))
        .padding(.top, 6).padding(.bottom, 8)
    }

    private func switchMode(_ m: CalMode) {
        guard m != mode else { anchor = Date(); sel = today; return }          // the tab you are on, tapped again: back to today
        Haptic.web(8)
        UserDefaults.standard.set(m.rawValue, forKey: "calendarMode")
        let prev = mode
        withAnimation(.easeOut(duration: 0.15)) {
            if m == .day && prev == .month { anchor = sel }
            if m == .month { sel = prev == .day ? CalMath.sod(anchor) : monthSel(anchor) }
            mode = m
        }
    }

    /// today when it is in the month shown, else the 1st
    private func monthSel(_ a: Date) -> Date { CalMath.sameMonth(a, Date()) ? CalMath.sod(Date()) : CalMath.monthStart(a) }
}

/// Pages side by side, swiped like a book: the page that is on is `index`, a change of it (a tap on the strip) slides there.
private struct CalPager<Page: View>: View {
    var range: ClosedRange<Int>
    @Binding var index: Int
    var page: (Int) -> Page
    @State private var pos: Int?

    init(range: ClosedRange<Int>, index: Binding<Int>, @ViewBuilder page: @escaping (Int) -> Page) {
        self.range = range; self._index = index; self.page = page
        self._pos = State(initialValue: index.wrappedValue)
    }

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
                ForEach(range, id: \.self) { i in page(i).containerRelativeFrame(.horizontal).id(i) }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $pos)
        .onChange(of: pos) { _, p in if let p, p != index { index = p } }
        .onChange(of: index) { _, i in if i != pos { withAnimation(.easeInOut(duration: 0.25)) { pos = i } } }
    }
}

// MARK: day: the hours of the day with a red line at the time now

private let hourH: CGFloat = 40.5
private let gridPad: CGFloat = 10

private struct CalDayPage: View {
    var data: CalData
    var day: Date
    var onTap: (CalendarEvent) -> Void
    @Environment(HomeStore.self) private var store

    var body: some View {
        let evs = data.events(on: day)
        let allDay = evs.filter(\.allDay)
        let isToday = CalMath.cal.isDateInToday(day)
        ScrollViewReader { proxy in
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(allDay) { e in
                        Button { onTap(e) } label: {
                            HStack(spacing: 8) {
                                Capsule().fill(data.color(e)).frame(width: 4, height: 18)
                                Text(e.summary.isEmpty ? "Busy" : e.summary).font(.system(size: 15, weight: .semibold)).lineLimit(1)
                                Spacer()
                                Text("All day").font(.system(size: 13)).opacity(0.55)
                            }
                            .padding(.horizontal, 12).frame(height: 34).background(RoundedRectangle(cornerRadius: 10).fill(data.color(e).opacity(0.25)))
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 12)
                    if evs.isEmpty { Text("No events").font(.system(size: 15)).opacity(0.6).frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 18) }
                    grid(evs.filter { !$0.allDay }, isToday: isToday)
                }
                .padding(.top, 8)
                .padding(.bottom, 24)
            }
            .onAppear {
                // from midnight, unless the time now would be below the bottom of the screen
                let h = CalMath.cal.component(.hour, from: Date())
                if isToday && h > 12 { proxy.scrollTo(max(0, h - 8), anchor: .top) }
            }
        }
        .task { await data.ensure(CalMath.monthStart(day), store) }
    }

    private func grid(_ timed: [CalendarEvent], isToday: Bool) -> some View {
        let d = CalMath.sod(day), end = CalMath.add(d, days: 1)
        let clipped = timed.map { e -> CalendarEvent in var c = e; c.start = max(e.start, d); c.end = max(c.start, min(e.end, end)); return c }
        let placed = CalDayPage.layout(clipped)
        return VStack(spacing: 0) {
            ForEach(0..<24, id: \.self) { h in
                HStack(alignment: .top, spacing: 9) {
                    Text(CalMath.hourLabel(h)).font(.system(size: 12)).foregroundStyle(.white.opacity(0.55)).frame(width: 50, alignment: .trailing).offset(y: gridPad - 8)
                    Rectangle().fill(CalLook.line).frame(height: 0.5).padding(.top, gridPad)
                }
                .padding(.leading, 4)
                .frame(height: hourH, alignment: .top).id(h)
            }
        }
        .coordinateSpace(name: "dayGrid")
        .contentShape(Rectangle())
        .gesture(SpatialTapGesture(coordinateSpace: .named("dayGrid")).onEnded { v in setPick(y: v.location.y) })        // a tap in the hours puts the line there
        .overlay(alignment: .topLeading) {
            GeometryReader { g in
                let x0: CGFloat = 66, w = g.size.width - x0 - 6
                ForEach(placed.indices, id: \.self) { i in block(placed[i], x0: x0, w: w, d: d) }
                timeLine(d: d, isToday: isToday, width: g.size.width)
            }
        }
    }

    private func block(_ p: Placed, x0: CGFloat, w: CGFloat, d: Date) -> some View {
        let top = gridPad + p.e.start.timeIntervalSince(d) / 3600 * hourH
        let ht = max(22, p.e.end.timeIntervalSince(p.e.start) / 3600 * hourH - 2)
        let cw = w / CGFloat(p.cols)
        return Button { onTap(p.e) } label: {
            VStack(alignment: .leading, spacing: 1) {
                Text(p.e.summary.isEmpty ? "Busy" : p.e.summary).font(.system(size: 13, weight: .semibold)).lineLimit(2)
                if ht > 38 { Text(CalendarView.time(p.e.start) + " – " + CalendarView.time(p.e.end)).font(.system(size: 11)).opacity(0.65).lineLimit(1) }
            }
            .padding(.leading, 9).padding(.trailing, 4).padding(.vertical, 3)
            .frame(width: cw - 3, height: ht, alignment: .topLeading)
            .background(RoundedRectangle(cornerRadius: 7).fill(data.color(p.e).opacity(0.3)))
            .overlay(alignment: .leading) { Capsule().fill(data.color(p.e)).frame(width: 3).padding(.vertical, 2).padding(.leading, 2) }
        }
        .buttonStyle(.plain)
        .offset(x: x0 + cw * CGFloat(p.col), y: top)
    }

    /// y in the hour grid -> a time on this day, in steps of 5 minutes
    private func time(atY y: CGFloat) -> Date {
        let hours = min(23.99, max(0, Double(y - gridPad) / Double(hourH)))
        let minutes = Int((hours * 60 / 5).rounded()) * 5
        return CalMath.add(CalMath.sod(day), days: 0).addingTimeInterval(Double(min(minutes, 24 * 60 - 5)) * 60)
    }

    private func setPick(y: CGFloat) {
        let t = time(atY: y)
        if data.pick != t { Haptic.web(5); data.pick = t }
    }

    /// the red line: at the time now (today), or where it was put; its pill can be dragged to choose a time, and a tap in the hours puts it there
    private func timeLine(d: Date, isToday: Bool, width: CGFloat) -> some View {
        TimelineView(.periodic(from: .now, by: 15)) { ctx in
            let picked = data.pick.flatMap { CalMath.cal.isDate($0, inSameDayAs: d) ? $0 : nil }
            if let t = picked ?? (isToday ? ctx.date : nil) {
                let y = gridPad + t.timeIntervalSince(d) / 3600 * hourH
                ZStack(alignment: .topLeading) {
                    Rectangle().fill(CalLook.red).frame(width: width - 54, height: 2).offset(x: 54, y: y - 1).allowsHitTesting(false)
                    Text(CalMath.hourFormat.string(from: t)).font(.system(size: 13, weight: .bold)).foregroundStyle(.white).fixedSize()
                        .padding(.horizontal, 7).frame(height: 22).background(Capsule().fill(CalLook.red))
                        .frame(width: 62, height: 44).contentShape(Rectangle())
                        .offset(x: 3, y: y - 22)
                        .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .named("dayGrid")).onChanged { v in setPick(y: v.location.y) })
                }
            }
        }
    }

    struct Placed { var e: CalendarEvent; var col: Int; var cols: Int }
    /// events that overlap share the width side by side
    static func layout(_ evs: [CalendarEvent]) -> [Placed] {
        var out: [Placed] = [], cluster: [Placed] = [], colEnds: [Date] = [], clusterEnd = Date.distantPast
        func flush() { let n = max(1, colEnds.count); out += cluster.map { Placed(e: $0.e, col: $0.col, cols: n) }; cluster = []; colEnds = [] }
        for e in evs.sorted(by: { $0.start < $1.start }) {
            if e.start >= clusterEnd { flush() }
            let c = colEnds.firstIndex { $0 <= e.start } ?? colEnds.count
            if c == colEnds.count { colEnds.append(e.end) } else { colEnds[c] = e.end }
            cluster.append(Placed(e: e, col: c, cols: 1))
            clusterEnd = max(clusterEnd, e.end)
        }
        flush()
        return out
    }
}

// MARK: add an event, search, one event

/// "+": a new event in a calendar Home Assistant lets us write to (calendar.create_event).
private struct NewEventSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(HomeStore.self) private var store
    var data: CalData
    var onDone: () -> Void
    @State private var title = ""
    @State private var location = ""
    @State private var calendar = ""
    @State private var allDay = false
    @State private var start: Date
    @State private var end: Date
    @State private var busy = false
    @State private var error: String?

    init(data: CalData, day: Date, at: Date? = nil, onDone: @escaping () -> Void) {
        self.data = data; self.onDone = onDone
        let cal = CalMath.cal
        var s: Date
        if let at {
            s = at                                  // the time the red line was moved to
        } else if cal.isDateInToday(day) {
            let now = Date(), m = cal.component(.minute, from: now)
            let add = m == 0 ? 0 : (m <= 30 ? 30 - m : 60 - m)
            let rounded = cal.date(byAdding: .minute, value: add, to: now) ?? now
            s = cal.date(bySetting: .second, value: 0, of: rounded) ?? rounded
        } else {
            s = cal.date(bySettingHour: 9, minute: 0, second: 0, of: day) ?? day
        }
        _start = State(initialValue: s); _end = State(initialValue: s.addingTimeInterval(3600))
    }

    var body: some View {
        NavigationStack {
            Form {
                if data.writable.isEmpty {
                    Section { Text("No calendar can be written to. Add a local calendar in Home Assistant.").foregroundStyle(.secondary) }
                } else {
                    Section {
                        TextField("Title", text: $title)
                        TextField("Location", text: $location)
                    }
                    Section {
                        Picker("Calendar", selection: $calendar) { ForEach(data.writable, id: \.self) { id in Text(data.calNames[id] ?? id).tag(id) } }
                        Toggle("All-day", isOn: $allDay)
                        DatePicker("Starts", selection: $start, displayedComponents: allDay ? [.date] : [.date, .hourAndMinute])
                        DatePicker("Ends", selection: $end, in: start..., displayedComponents: allDay ? [.date] : [.date, .hourAndMinute])
                    }
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
            }
            .navigationTitle("New event").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Add") { Task { await save() } }.disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || busy || calendar.isEmpty) }
            }
            .onAppear { if calendar.isEmpty { calendar = data.writable.first ?? "" } }
            .onChange(of: data.writable) { _, w in if calendar.isEmpty { calendar = w.first ?? "" } }
            .onChange(of: start) { _, s in if end < s { end = s.addingTimeInterval(3600) } }
        }
        .preferredColorScheme(.dark)
    }

    private func save() async {
        busy = true; error = nil
        let name = title.trimmingCharacters(in: .whitespaces)
        if store.demo {
            let e = allDay ? CalendarEvent(calendar: calendar, summary: name, start: CalMath.sod(start), end: CalMath.add(CalMath.sod(max(end, start)), days: 1), allDay: true, location: location)
                           : CalendarEvent(calendar: calendar, summary: name, start: start, end: max(end, start), allDay: false, location: location)
            data.addLocal(e); dismiss(); return
        }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = .current
        var body: [String: Any] = ["entity_id": calendar, "summary": name]
        if !location.isEmpty { body["location"] = location }
        if allDay {
            f.dateFormat = "yyyy-MM-dd"
            body["start_date"] = f.string(from: start); body["end_date"] = f.string(from: CalMath.add(CalMath.sod(max(end, start)), days: 1))
        } else {
            f.dateFormat = "yyyy-MM-dd HH:mm:ss"
            body["start_date_time"] = f.string(from: start); body["end_date_time"] = f.string(from: max(end, start))
        }
        do { try await HAClient.shared.callService("calendar", "create_event", body); onDone(); dismiss() }
        catch { self.error = "Home Assistant did not take it: \(error.localizedDescription)"; busy = false }
    }
}

/// The magnifying glass: events by their title or place, from two months back to a year ahead.
private struct CalSearchSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(HomeStore.self) private var store
    var data: CalData
    var onPick: (Date) -> Void
    @State private var query = ""
    @State private var all: [CalendarEvent] = []
    @State private var loading = true

    private var results: [CalendarEvent] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return [] }
        return all.filter { $0.summary.lowercased().contains(q) || ($0.location ?? "").lowercased().contains(q) }.sorted { $0.start < $1.start }
    }

    var body: some View {
        NavigationStack {
            List {
                if loading { ProgressView() }
                else if !query.isEmpty && results.isEmpty { Text("No events found").foregroundStyle(.secondary) }
                ForEach(results) { e in
                    Button { dismiss(); onPick(CalMath.sod(e.start)) } label: {
                        HStack(spacing: 12) {
                            Capsule().fill(data.color(e)).frame(width: 4, height: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.summary.isEmpty ? "Busy" : e.summary).font(.system(size: 16, weight: .semibold)).foregroundStyle(.white)
                                Text(e.start.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day().year()) + (e.allDay ? " · all day" : " · " + CalendarView.time(e.start)))
                                    .font(.system(size: 13)).foregroundStyle(.white.opacity(0.55))
                            }
                        }
                    }
                }
            }
            .navigationTitle("Search").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Events")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
            .task {
                let now = CalMath.sod(Date())
                all = await store.events(data.calIDs, from: CalMath.add(now, days: -60), to: CalMath.add(now, days: 400))
                loading = false
            }
        }
        .preferredColorScheme(.dark)
    }
}

/// One event, opened from the list.
private struct EventDetail: View {
    var event: CalendarEvent
    var color: Color
    var calendar: String

    private var when: String {
        let day = event.start.formatted(.dateTime.weekday(.wide).month(.wide).day())
        if event.allDay { return day + " · all day" }
        return day + "\n" + CalendarView.time(event.start) + " – " + CalendarView.time(event.end)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Capsule().fill(color).frame(width: 5, height: 56)
                Text(event.summary.isEmpty ? "Busy" : event.summary).font(.system(size: 26, weight: .bold))
            }
            Text(when).font(.system(size: 17)).opacity(0.85)
            if let l = event.location, !l.isEmpty { Label(l, systemImage: "mappin.and.ellipse").font(.system(size: 17)).opacity(0.85) }
            Label(calendar, systemImage: "calendar").font(.system(size: 15)).opacity(0.55)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading).padding(24)
        .background(Color(hex: 0x1c1c1e).ignoresSafeArea())
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
    }
}
