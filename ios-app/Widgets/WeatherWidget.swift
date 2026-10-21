import AppIntents
import SwiftUI
import WidgetKit

struct WHour: Identifiable { var id: Int; var label: String; var cond: String; var temp: Int?; var night: Bool }
struct WDay: Identifiable { var id: Int; var label: String; var cond: String; var hi: Int?; var lo: Int? }

struct WeatherEntry: TimelineEntry {
    var date: Date
    var entityID: String
    var place: String
    var cond: String
    var temp: Int?
    var night: Bool
    var hours: [WHour]          // the page of hours that is shown
    var days: [WDay]            // the page of days that is shown
    var hi: Int?, lo: Int?
    var showDays: Bool
    var hourOffset: Int, hourCount: Int
    var dayOffset: Int, dayCount: Int
    var signedIn: Bool
    var unavailable: Bool
}

/// The weather widget cannot scroll (no widget can), so the strips have arrows: a tap on > shows the next hours (or days), a tap on < goes back. Where the page is stays until you change it.
struct WeatherPageIntent: AppIntent {
    static var title: LocalizedStringResource = "Page the forecast"
    static var isDiscoverable: Bool { false }
    @Parameter(title: "Entity") var entityID: String
    @Parameter(title: "Strip") var strip: String          // "hours" or "days"
    @Parameter(title: "Direction") var step: Int          // 1 or -1
    init() {}
    init(entityID: String, strip: String, step: Int) { self.entityID = entityID; self.strip = strip; self.step = step }

    static func key(_ id: String, _ strip: String) -> String { "wx." + strip + "." + id }
    static func modeKey(_ id: String) -> String { "wx.mode." + id }
    func perform() async throws -> some IntentResult {
        Haptic.tap()
        let per = Int(strip == "hours" ? WidgetSpec.Weather.hoursPerPage : WidgetSpec.Weather.daysPerPage)
        let k = Self.key(entityID, strip)
        let now = UserDefaults.standard.integer(forKey: k)
        UserDefaults.standard.set(max(0, now + step * per), forKey: k)
        WidgetCenter.shared.reloadTimelines(ofKind: "OkieWeather")
        return .result()
    }
}

/// Switches the strip between the next hours and the next days.
struct WeatherModeIntent: AppIntent {
    static var title: LocalizedStringResource = "Hours or days"
    static var isDiscoverable: Bool { false }
    @Parameter(title: "Entity") var entityID: String
    init() {}
    init(entityID: String) { self.entityID = entityID }
    func perform() async throws -> some IntentResult {
        Haptic.tap()
        let k = WeatherPageIntent.modeKey(entityID)
        UserDefaults.standard.set(!UserDefaults.standard.bool(forKey: k), forKey: k)
        WidgetCenter.shared.reloadTimelines(ofKind: "OkieWeather")
        return .result()
    }
}

struct WeatherProvider: AppIntentTimelineProvider {
    typealias Intent = WeatherConfig
    typealias Entry = WeatherEntry

    func placeholder(in context: Context) -> WeatherEntry { Self.sample }
    func snapshot(for configuration: WeatherConfig, in context: Context) async -> WeatherEntry { context.isPreview ? Self.sample : await load(configuration) }
    func timeline(for configuration: WeatherConfig, in context: Context) async -> Timeline<WeatherEntry> {
        Timeline(entries: [await load(configuration)], policy: .after(Date().addingTimeInterval(15 * 60)))
    }

    private func load(_ c: WeatherConfig) async -> WeatherEntry {
        let id = c.weather?.id ?? WidgetSpec.Weather.entity
        let none = WeatherEntry(date: .now, entityID: id, place: "", cond: "cloudy", temp: nil, night: false, hours: [], days: [], hi: nil, lo: nil, showDays: false, hourOffset: 0, hourCount: 0, dayOffset: 0, dayCount: 0, signedIn: HAClient.shared.isSignedIn, unavailable: true)
        guard HAClient.shared.isSignedIn else { return none }
        async let st = try? await HAClient.shared.state(id)
        async let sun = try? await HAClient.shared.state("sun.sun")
        async let hourly = HAClient.shared.forecast(id, type: "hourly")
        async let daily = HAClient.shared.forecast(id, type: "daily")
        let (e, s, hf, df) = await (st, sun, hourly, daily)
        guard let e else { return none }
        let now = Date()
        let hour = Calendar.current.component(.hour, from: now)
        let night = s?.state == "below_horizon" ? true : (s?.state == "above_horizon" ? false : (e.state == "clear-night" || hour < 6 || hour >= 20))
        let cal = Calendar.current
        // hours: never a past hour; the first one says Now, the first hour of a new day says the weekday
        var hours: [WHour] = []
        for f in hf {
            guard let t = HADate.parse(f["datetime"] as? String), t.timeIntervalSince(now) > -3600 + 1 else { continue }
            if hours.count >= Int(WidgetSpec.Weather.maxHours) { break }
            let h = cal.component(.hour, from: t)
            let label = hours.isEmpty ? "Now" : (h == 0 ? t.formatted(.dateTime.weekday(.abbreviated)) : t.formatted(.dateTime.hour()))
            hours.append(WHour(id: hours.count, label: label, cond: (f["condition"] as? String) ?? "cloudy", temp: (f["temperature"] as? Double).map { Int($0.rounded()) }, night: h < 6 || h >= 20))
        }
        var days: [WDay] = []
        for f in df.prefix(Int(WidgetSpec.Weather.maxDays)) {
            guard let t = HADate.parse(f["datetime"] as? String) else { continue }
            days.append(WDay(id: days.count, label: t.formatted(.dateTime.weekday(.abbreviated)), cond: (f["condition"] as? String) ?? "cloudy",
                             hi: (f["temperature"] as? Double).map { Int($0.rounded()) }, lo: (f["templow"] as? Double).map { Int($0.rounded()) }))
        }
        let hp = Int(WidgetSpec.Weather.hoursPerPage), dp = Int(WidgetSpec.Weather.daysPerPage)
        let ho = min(UserDefaults.standard.integer(forKey: WeatherPageIntent.key(id, "hours")), max(0, hours.count - hp))
        let dofs = min(UserDefaults.standard.integer(forKey: WeatherPageIntent.key(id, "days")), max(0, days.count - dp))
        let place = await HomePlace.name() ?? (e.attributes["friendly_name"]?.string ?? "").replacingOccurrences(of: "Forecast ", with: "")
        return WeatherEntry(date: now, entityID: id, place: place, cond: e.state, temp: e.num("temperature").map { Int($0.rounded()) }, night: night,
                            hours: Array(hours.dropFirst(ho).prefix(hp)), days: Array(days.dropFirst(dofs).prefix(dp)), hi: days.first?.hi, lo: days.first?.lo,
                            showDays: UserDefaults.standard.bool(forKey: WeatherPageIntent.modeKey(id)), hourOffset: ho, hourCount: hours.count,
                            dayOffset: dofs, dayCount: days.count, signedIn: true, unavailable: false)
    }

    static var sample: WeatherEntry {
        let c = ["sunny", "sunny", "sunny", "cloudy", "cloudy", "partlycloudy"], t = [69, 72, 75, 78, 78, 79]
        let hours = (0..<6).map { WHour(id: $0, label: $0 == 0 ? "Now" : "\(9 + $0) AM", cond: c[$0], temp: t[$0], night: false) }
        let dc = ["cloudy", "sunny", "sunny", "sunny", "sunny", "partlycloudy"], hi = [80, 79, 80, 79, 80, 82], lo = [65, 61, 60, 60, 60, 64]
        let days = (0..<6).map { WDay(id: $0, label: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][$0], cond: dc[$0], hi: hi[$0], lo: lo[$0]) }
        return WeatherEntry(date: .now, entityID: WidgetSpec.Weather.entity, place: "Lutz", cond: "sunny", temp: 68, night: false, hours: hours, days: days, hi: 79, lo: 67, showDays: false, hourOffset: 0, hourCount: 24, dayOffset: 0, dayCount: 10, signedIn: true, unavailable: false)
    }
}

/// The weather card of the dashboard's slider (okie-bento.js, page "weather"): place, big temperature with condition and H/L, the big thin picture, the next hours. (The "Weather / Sunny" caption of the dashboard's card at the bottom left is left out: the condition is at the top already.)
/// The slider's own pager (dots, pause, edit) is left out: in its place a small pill pages through the hours or days (a widget cannot scroll).
struct WeatherWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WeatherEntry

    static func conditionText(_ s: String) -> String {
        ["sunny": "Sunny", "clear-night": "Clear night", "partlycloudy": "Partly cloudy", "cloudy": "Cloudy", "rainy": "Rain", "pouring": "Heavy rain", "snowy": "Snow",
         "snowy-rainy": "Sleet", "lightning": "Thunder", "lightning-rainy": "Thunderstorm", "fog": "Fog", "hail": "Hail", "windy": "Windy", "windy-variant": "Windy", "exceptional": "Exceptional"][s] ?? s.capitalized
    }

    var body: some View {
        if !entry.signedIn { NeedsSignIn() }
        else if entry.unavailable { Text("Weather not reachable right now").font(.system(size: 13, weight: .semibold)).foregroundStyle(.white.opacity(0.8)).frame(maxWidth: .infinity, maxHeight: .infinity) }
        else if family == .systemLarge { card } else { compact }
    }

    private var hl: String? {
        guard let h = entry.hi, let l = entry.lo else { return nil }
        return "H:\(h)°  L:\(l)°"
    }

    // MARK: large: the card as it is on the dashboard
    // Every size and place below was measured on the dashboard's own card (916 x 990 px in the screenshot): sizes scale with the width, vertical places with the height.

    private var card: some View {
        GeometryReader { geo in
            let s = geo.size.width / 916, v = geo.size.height / 990
            let days = entry.showDays
            ZStack(alignment: .topLeading) {
                at(s, v, HStack(spacing: 14 * s) {
                    Text(entry.place).font(.system(size: 42 * s, weight: .semibold)).lineLimit(1)
                    Image(systemName: "chevron.right").font(.system(size: 30 * s, weight: .regular))
                }, x: 41, cy: 70, w: 600)
                at(s, v, Text(entry.temp.map { "\($0)°" } ?? "–").font(.system(size: 146 * s, weight: .light)).tracking(-0.03 * 146 * s).monospacedDigit(), x: 41, cy: 180, w: 300)
                at(s, v, Text(Self.conditionText(entry.cond)).font(.system(size: 44 * s, weight: .semibold)).lineLimit(1), x: 295, cy: 151, w: 560)
                if let hl { at(s, v, Text(hl).font(.system(size: 34 * s)).opacity(0.85).lineLimit(1), x: 295, cy: 215, w: 560) }
                WeatherGlyph(condition: entry.cond, night: entry.night, size: 437 * s, line: 0.62)
                    .position(x: 458 * s, y: 458 * v)
                Rectangle().fill(.white.opacity(0.22)).frame(width: 834 * s, height: max(1, 2 * s)).position(x: 458 * s, y: 673 * v)
                ForEach(0..<(days ? entry.days.count : entry.hours.count), id: \.self) { i in
                    column(i, s: s, v: v)
                }
                pill(s: s).position(x: (535 + 174) * s, y: 933 * v)
            }
            .foregroundStyle(.white)
        }
        .widgetURL(URL(string: "okiehome://weather/\(entry.entityID)"))
    }

    /// A text (or picture) whose left edge is x and whose middle is cy, in screenshot pixels (s scales across, v down).
    private func at<V: View>(_ s: CGFloat, _ v: CGFloat, _ view: V, x: CGFloat, cy: CGFloat, w: CGFloat, _ a: Alignment = .leading) -> some View {
        view.frame(width: w * s, height: 90 * s, alignment: a).position(x: (x + w / 2) * s, y: cy * v)
    }

    /// One column of the strip on the large card: label, picture, number(s), in screenshot pixels.
    @ViewBuilder private func column(_ i: Int, s: CGFloat, v: CGFloat) -> some View {
        let cx: CGFloat = 106 + 140.4 * CGFloat(i)
        if entry.showDays {
            let d = entry.days[i]
            at(s, v, Text(d.label).font(.system(size: 29 * s)).opacity(0.75), x: cx - 70, cy: 715, w: 140, .center)
            WeatherGlyph(condition: d.cond, night: false, size: 60 * s).position(x: cx * s, y: 778 * v)
            at(s, v, Text(d.hi.map { "\($0)°" } ?? "").font(.system(size: 36 * s, weight: .semibold)), x: cx - 70, cy: 838, w: 140, .center)
            at(s, v, Text(d.lo.map { "\($0)°" } ?? "").font(.system(size: 32 * s)).opacity(0.55), x: cx - 70, cy: 878, w: 140, .center)
        } else {
            let h = entry.hours[i]
            at(s, v, Text(h.label).font(.system(size: 29 * s)).opacity(0.75).lineLimit(1).minimumScaleFactor(0.7), x: cx - 70, cy: 715, w: 140, .center)
            WeatherGlyph(condition: h.cond, night: h.night, size: 60 * s).position(x: cx * s, y: 778 * v)
            at(s, v, Text(h.temp.map { "\($0)°" } ?? "").font(.system(size: 36 * s, weight: .medium)), x: cx - 70, cy: 848, w: 140, .center)
        }
    }

    /// The hours (or days) as columns for the medium widget.
    @ViewBuilder private func columns(k: CGFloat) -> some View {
        if entry.showDays {
            ForEach(entry.days) { d in
                VStack(spacing: 6 * k) {
                    Text(d.label).font(.system(size: 12 * k)).opacity(0.75)
                    WeatherGlyph(condition: d.cond, night: false, size: 26 * k)
                    Text(d.hi.map { "\($0)°" } ?? "").font(.system(size: 15 * k, weight: .semibold))
                    Text(d.lo.map { "\($0)°" } ?? "").font(.system(size: 13 * k)).opacity(0.55)
                }.frame(maxWidth: .infinity)
            }
        } else {
            ForEach(entry.hours) { x in
                VStack(spacing: 6 * k) {
                    Text(x.label).font(.system(size: 12 * k)).opacity(0.75).lineLimit(1).minimumScaleFactor(0.7)
                    WeatherGlyph(condition: x.cond, night: x.night, size: 26 * k)
                    Text(x.temp.map { "\($0)°" } ?? "").font(.system(size: 15 * k, weight: .medium))
                }.frame(maxWidth: .infinity)
            }
        }
    }

    /// Where the dashboard has its pager (dots, pause, edit): back, forward, and hours / days.
    private func pill(s: CGFloat) -> some View {
        let off = entry.showDays ? entry.dayOffset : entry.hourOffset
        let count = entry.showDays ? entry.dayCount : entry.hourCount
        let per = Int(entry.showDays ? WidgetSpec.Weather.daysPerPage : WidgetSpec.Weather.hoursPerPage)
        let strip = entry.showDays ? "days" : "hours"
        return HStack(spacing: 0) {
            pill(button: "chevron.left", s: s, enabled: off > 0, intent: WeatherPageIntent(entityID: entry.entityID, strip: strip, step: -1))
            pill(button: "chevron.right", s: s, enabled: off + per < count, intent: WeatherPageIntent(entityID: entry.entityID, strip: strip, step: 1))
            Button(intent: WeatherModeIntent(entityID: entry.entityID)) {
                Image(systemName: entry.showDays ? "clock" : "calendar").font(.system(size: 34 * s, weight: .semibold)).frame(width: 116 * s, height: 68 * s)
            }.buttonStyle(.plain)
        }
        .frame(width: 348 * s, height: 68 * s)
        .background(RoundedRectangle(cornerRadius: 40 * s, style: .continuous).fill(.black.opacity(WidgetSpec.Weather.pillAlpha)))
    }
    private func pill(button symbol: String, s: CGFloat, enabled: Bool, intent: WeatherPageIntent) -> some View {
        Button(intent: intent) { Image(systemName: symbol).font(.system(size: 34 * s, weight: .bold)).frame(width: 116 * s, height: 68 * s).opacity(enabled ? 1 : 0.3) }
            .buttonStyle(.plain).disabled(!enabled)
    }

    private func medPill(button symbol: String, k: CGFloat, enabled: Bool, intent: WeatherPageIntent) -> some View {
        Button(intent: intent) { Image(systemName: symbol).font(.system(size: 13 * k, weight: .bold)).frame(width: 34 * k, height: 32 * k).opacity(enabled ? 1 : 0.3) }
            .buttonStyle(.plain).disabled(!enabled)
    }

    // MARK: medium: the same card, wide

    private var compact: some View {
        GeometryReader { geo in
            let k = geo.size.height / 169
            VStack(spacing: 6 * k) {
                HStack(spacing: 12 * k) {
                    WeatherGlyph(condition: entry.cond, night: entry.night, size: 50 * k, line: 0.9)
                    Text(entry.temp.map { "\($0)°" } ?? "–").font(.system(size: 46 * k, weight: .light)).tracking(-0.03 * 46 * k)
                    VStack(alignment: .leading, spacing: 2 * k) {
                        Text(entry.place).font(.system(size: 16 * k, weight: .semibold)).lineLimit(1)
                        Text(Self.conditionText(entry.cond)).font(.system(size: 13 * k, weight: .semibold)).lineLimit(1)
                        if let hl { Text(hl).font(.system(size: 12 * k)).opacity(0.85) }
                    }
                    Spacer(minLength: 0)
                }
                Rectangle().fill(.white.opacity(0.22)).frame(height: 1)
                HStack(spacing: 2 * k) {
                    medPill(button: "chevron.left", k: k * 0.8, enabled: (entry.showDays ? entry.dayOffset : entry.hourOffset) > 0, intent: WeatherPageIntent(entityID: entry.entityID, strip: entry.showDays ? "days" : "hours", step: -1))
                    columns(k: k * 0.85)
                    medPill(button: "chevron.right", k: k * 0.8, enabled: (entry.showDays ? entry.dayOffset + Int(WidgetSpec.Weather.daysPerPage) < entry.dayCount : entry.hourOffset + Int(WidgetSpec.Weather.hoursPerPage) < entry.hourCount), intent: WeatherPageIntent(entityID: entry.entityID, strip: entry.showDays ? "days" : "hours", step: 1))
                }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 12 * k).padding(.vertical, 12 * k)
        }
        .widgetURL(URL(string: "okiehome://weather/\(entry.entityID)"))
    }
}

struct WeatherWidget: Widget {
    let kind = "OkieWeather"
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: WeatherConfig.self, provider: WeatherProvider()) { entry in
            WeatherWidgetView(entry: entry).containerBackground(for: .widget) {
                ZStack {
                    LinearGradient(colors: Self.sky(entry), startPoint: UnitPoint(x: 0.33, y: 0), endPoint: UnitPoint(x: 0.67, y: 1))
                    if entry.night { Stars() }
                }
            }
        }
        .configurationDisplayName("Weather")
        .description("Now, the next hours and the next days. The arrows page through the forecast.")
        .supportedFamilies([.systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }

    /// The sky behind everything, from the card's skyStops()
    static func sky(_ e: WeatherEntry) -> [Color] {
        let stops = e.night ? WidgetSpec.Weather.night : (e.cond == "rainy" || e.cond == "pouring" ? WidgetSpec.Weather.rain : WidgetSpec.Weather.day)
        return stops.map { Color(hex: $0) }
    }
}

#Preview("Weather medium", as: .systemMedium) { WeatherWidget() } timeline: { WeatherProvider.sample }
#Preview("Weather large", as: .systemLarge) { WeatherWidget() } timeline: { WeatherProvider.sample }

/// A fixed scatter of stars at night (the card's starField with seed 7), still: the sky does not jump on an update.
struct Stars: View {
    var body: some View {
        Canvas { ctx, size in
            var a: UInt32 = 7
            func rnd() -> Double { a = a &* 1664525 &+ 1013904223; return Double(a) / 4294967296 }
            for _ in 0..<45 {
                let x = rnd() * size.width, y = rnd() * size.height * 0.6, r = 0.8 + rnd() * 1.9, o = 0.25 + rnd() * 0.5
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: r, height: r)), with: .color(.white.opacity(o)))
            }
        }
    }
}
