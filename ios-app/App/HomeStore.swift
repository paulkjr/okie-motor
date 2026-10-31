import SwiftUI
import Observation
import WidgetKit
import WebKit

/// Everything the screens show: the sign-in, all entities (kept live over the WebSocket), the favourites.
@Observable
final class HomeStore {
    var session: HASession? = SessionStore.load()
    var entities: [String: HAEntity] = [:]
    var connection: String = "offline"
    var lastError: String?
    var favorites: [String] = UserDefaults.standard.stringArray(forKey: "favorites") ?? []
    var calendarHidden: Set<String> = CalendarColors.hidden          // switched off on the card (copied from its settings)

    /// The lock page (clock and greeting) is in front at launch and after a long time away; a swipe up lifts it.
    var locked = true
    var thermostatID: String?          // the native thermostat (sample mode only) is open for this entity
    var thermostatFromWidget = false   // the thermostat screen was opened by a widget: Close goes back to the Home Screen
    var weatherID: String?             // the weather screen (WeatherScreen) is open for this entity
    var weatherFromWidget = false
    var calendarOpen = false           // the calendar screen (CalendarScreen) is open
    var calendarFromWidget = false
    enum WidgetScreen: Equatable { case thermostat(String), weather(String), calendar }
    /// the screen in front (one at a time: a link for another one swaps it)
    var widgetScreen: WidgetScreen? {
        if calendarOpen { return .calendar }
        if let id = weatherID { return .weather(id) }
        if let id = thermostatID { return .thermostat(id) }
        return nil
    }
    func clearWidgetScreens() { thermostatID = nil; weatherID = nil; calendarOpen = false; thermostatFromWidget = false; weatherFromWidget = false; calendarFromWidget = false }
    /// a widget's own screen is in front: the dashboard behind it waits (it is not needed, and starting it would only slow the screen down)
    var widgetScreenOpen: Bool { thermostatFromWidget || weatherFromWidget || calendarFromWidget }
    var fromWidget = false             // the dashboard was opened by a widget tap onto a device screen: Back there goes to the Home Screen instead of the dashboard
    var buzzWhenActive = false         // a widget link arrived while the app was starting: the buzz comes when it is in front
    var openCover = false              // a dark cover over the dashboard while it loads and opens that device screen (no flash of the lock page)
    var showCalendar = false
    var openEntity: String?           // a widget tap: open this device's full screen in the dashboard (weather, ...)
    var openToken = 0
    var reloadCount = 0               // the dashboard page starts over (the card's lock page) after a long time away
    private var leftAt: Date?
    private var live: HALive?

    var demo = false
    var isSignedIn: Bool { session != nil || demo }

    var list: [HAEntity] { entities.values.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending } }
    func entity(_ id: String) -> HAEntity? { entities[id] }

    // MARK: going away and coming back, links from the widgets
    func movedToBackground() { leftAt = Date() }
    func becameActive() {
        NotificationCenter.default.post(name: .okieCheckWeb, object: nil)         // a page that went black while the app was away is found and loaded again
        Task { await syncCalendarSettings() }
        if buzzWhenActive { buzzWhenActive = false; DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { Haptic.tap() } }
        if UserDefaults.standard.bool(forKey: "signOutNextLaunch") {       // the switch in the iOS Settings app
            UserDefaults.standard.set(false, forKey: "signOutNextLaunch")
            if isSignedIn { signOut() }
            return
        }
        if isSignedIn { WidgetCenter.shared.reloadAllTimelines() }       // the widgets show what the app sees as soon as it opens
        // Coming back from another app never starts the page over any more (it used to after 15 minutes): the front page shows when the app is opened fresh, after it was closed, not when it was only in the background.
        leftAt = nil
    }
    /// okiehome://thermostat/climate.living_room (the thermostat widget), okiehome://calendar (the calendar widget)
    func open(_ url: URL) {
        guard url.scheme == "okiehome" else { return }
        NSLog("[okie-timing] link %@ received at +%.2fs", url.absoluteString, AppClock.seconds)
#if DEBUG
        if url.host == "report" { NotificationCenter.default.post(name: Notification.Name("okieDebugReport"), object: nil); return }
        if url.host == "browse" { NotificationCenter.default.post(name: Notification.Name("okieDebugBrowse"), object: nil); return }          // debug builds: save a picture of the screen and the card's measurements (see DashboardView.writeReport)
#endif
        // a tap on a widget that opens the app buzzes too: iOS plays no haptic while an app is still starting, so it waits until the app is in front
        if UIApplication.shared.applicationState == .active { Haptic.tap() } else { buzzWhenActive = true }
        locked = false
        if url.host == "thermostat" || url.host == "weather" || url.host == "calendar" { clearWidgetScreens() }          // one screen at a time (a widget tapped while another one's screen is still open)
        switch url.host {
        case "thermostat":
            let id = url.pathComponents.dropFirst().first ?? "climate.living_room"
            thermostatID = id; thermostatFromWidget = true         // the thermostat's controls (ThermostatScreen); the dashboard is not needed
        case "calendar": calendarOpen = true; calendarFromWidget = true       // the calendar screen (CalendarScreen)
        case "weather": weatherID = url.pathComponents.dropFirst().first ?? "weather.forecast_home"; weatherFromWidget = true       // the weather screen (WeatherScreen)
        default: break
        }
    }

    /// Close on the thermostat screen. Opened by a widget it was a quick look: the app steps back to the Home Screen. Opened from inside the app it just closes.
    func closeThermostat() {
        guard thermostatFromWidget else { thermostatID = nil; return }
        thermostatFromWidget = false
        UIApplication.shared.perform(Selector(("suspend")))            // see leaveToHomeScreen
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.thermostatID = nil }       // if the app is still in front a moment later, the dashboard shows
    }

    func closeWeather() {
        guard weatherFromWidget else { weatherID = nil; return }
        weatherFromWidget = false
        UIApplication.shared.perform(Selector(("suspend")))
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.weatherID = nil }
    }

    func closeCalendar() {
        guard calendarFromWidget else { calendarOpen = false; return }
        calendarFromWidget = false
        UIApplication.shared.perform(Selector(("suspend")))
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.calendarOpen = false }
    }

    /// Back on a device screen that a widget opened: it was a quick look, so the app steps back to the Home Screen (the dashboard is not shown).
    func leaveToHomeScreen() {
        guard fromWidget else { return }
        fromWidget = false
        // iOS has no official "go home" call; this is the one many apps use (a selector UIKit answers, not an App Store API: fine for an app installed from Xcode).
        UIApplication.shared.perform(Selector(("suspend")))
    }

    // MARK: sign in / out
    func signedIn(_ s: HASession) {
        SessionStore.save(s)
        session = s
        start()
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// Sample data instead of a Home Assistant: for looking around.
    func enterDemo() {
        demo = true
        entities = Dictionary(uniqueKeysWithValues: Demo.entities().map { ($0.entityId, $0) })
        favorites = Self.defaultFavorites(entities) + entities.values.filter { $0.domain == "light" }.map(\.entityId).sorted()
        connection = "demo"
    }

    func signOut() {
        demo = false
        WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {}
        live?.stop(); live = nil
        SessionStore.clear()
        session = nil; entities = [:]; connection = "offline"
        WidgetCenter.shared.reloadAllTimelines()
    }

    // MARK: live data
    func start() {
        guard session != nil, !demo else { return }
        live?.stop()
        let l = HALive()
        l.onStates = { [weak self] list in
            guard let self else { return }
            self.entities = Dictionary(uniqueKeysWithValues: list.map { ($0.entityId, $0) })
            if self.favorites.isEmpty { self.favorites = Self.defaultFavorites(self.entities); self.saveFavorites() }
        }
        l.onChange = { [weak self] e in self?.entities[e.entityId] = e }
        l.onStatus = { [weak self] s in self?.connection = s }
        live = l
        l.start()
    }

    func events(_ ids: [String], from: Date, to: Date) async -> [CalendarEvent] {
        if demo { return ids.flatMap { Demo.events(calendar: $0, from: from, to: to) }.sorted { $0.start < $1.start } }
        return await HAClient.shared.allEvents(calendars: ids, from: from, to: to)
    }

    /// "Dentist – Paul · Tomorrow 8:30 AM": what comes next, for the lock page and the calendar card.
    func nextEvents(_ n: Int) async -> [CalendarEvent] {
        let now = Date()
        let all = await events(calendars.map(\.entityId), from: now, to: now.addingTimeInterval(7 * 86400))
        return Array(all.filter { $0.end > now }.prefix(n))
    }

    func refresh() async {
        if demo { return }
        do {
            let list = try await HAClient.shared.states()
            entities = Dictionary(uniqueKeysWithValues: list.map { ($0.entityId, $0) })
            lastError = nil
        } catch { lastError = error.localizedDescription }
    }

    // MARK: control
    func call(_ domain: String, _ service: String, _ data: [String: Any]) {
        if demo { demoCall(domain, service, data); return }
        Task {
            do { try await HAClient.shared.callService(domain, service, data) }
            catch { await MainActor.run { self.lastError = error.localizedDescription } }
        }
    }

    /// In the sample mode the buttons change the sample data itself.
    private func demoCall(_ domain: String, _ service: String, _ data: [String: Any]) {
        guard let id = data["entity_id"] as? String, var e = entities[id] else { return }
        switch service {
        case "toggle": e.state = e.state == "on" ? "off" : "on"
        case "turn_on" where domain == "script": e.attributes["last_triggered"] = .string(HADate.string(Date()))
        case "turn_on" where domain == "climate": e.state = "cool"
        case "turn_on": e.state = "on"
        case "turn_off": e.state = "off"
        case "set_temperature": if let t = data["temperature"] as? Double { e.attributes["temperature"] = .number(t) }
        case "set_hvac_mode": if let m = data["hvac_mode"] as? String { e.state = m == "auto" ? "heat_cool" : m }
        default: break
        }
        entities[id] = e
    }

    func toggle(_ e: HAEntity) {
        switch e.domain {
        case "script", "scene": call(e.domain, "turn_on", ["entity_id": e.entityId])
        case "button", "input_button": call(e.domain, "press", ["entity_id": e.entityId])
        default: call("homeassistant", "toggle", ["entity_id": e.entityId])
        }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    // MARK: favourites
    func saveFavorites() { UserDefaults.standard.set(favorites, forKey: "favorites") }
    func toggleFavorite(_ id: String) {
        if let i = favorites.firstIndex(of: id) { favorites.remove(at: i) } else { favorites.append(id) }
        saveFavorites()
    }
    func saveCalendarHidden() { CalendarColors.saveHidden(calendarHidden) }

    /// The card's calendar settings (which calendars are off, the colours picked) are the app's: read when the app comes back and when the calendar opens; the widgets draw again when they changed.
    func syncCalendarSettings() async {
        guard isSignedIn, !demo, let r = await CardSettings.calendars() else { return }
        var changed = false
        if let h = r.hidden { let set = Set(h); if set != calendarHidden { calendarHidden = set }; if CalendarColors.saveHidden(set) { changed = true } }
        if !r.colors.isEmpty, CalendarColors.save(r.colors) { changed = true }
        if changed { WidgetCenter.shared.reloadAllTimelines() }
    }

    /// The first time: the things the old widgets used, when they exist.
    static func defaultFavorites(_ all: [String: HAEntity]) -> [String] {
        let wanted = ["climate.living_room", "switch.bedlight", "script.feed_the_beasts_2", "script.govee_cozy_lights", "script.govee_lets_go_to_sleep", "script.govee_turn_up_the_lights"]
        let found = wanted.filter { all[$0] != nil }
        if !found.isEmpty { return found }
        return all.values.filter { ["light", "climate", "switch"].contains($0.domain) && !$0.isUnavailable }.sorted { $0.name < $1.name }.prefix(8).map { $0.entityId }
    }

    var calendars: [HAEntity] {
        list.filter { $0.domain == "calendar" && !CalendarRules.isHidden(id: $0.entityId, name: $0.name) && !calendarHidden.contains($0.entityId) }
    }
}

#if DEBUG
extension HomeStore {
    /// Sample data for the Xcode canvas (no server needed).
    static var preview: HomeStore {
        let s = HomeStore()
        func e(_ id: String, _ state: String, _ a: [String: JSONValue]) -> HAEntity { HAEntity(entityId: id, state: state, attributes: a) }
        let list = [
            e("climate.living_room", "cool", ["friendly_name": .string("Google Nest"), "current_temperature": .number(69), "temperature": .number(70), "hvac_action": .string("idle"),
                                              "min_temp": .number(50), "max_temp": .number(90), "current_humidity": .number(70),
                                              "hvac_modes": .array([.string("off"), .string("heat"), .string("cool"), .string("heat_cool")])]),
            e("weather.forecast_home", "sunny", ["temperature": .number(68), "friendly_name": .string("Home")]),
            e("switch.bedlight", "on", ["friendly_name": .string("bedLight")]),
            e("script.feed_the_beasts_2", "off", ["friendly_name": .string("Feed The Beasts")]),
        ]
        s.entities = Dictionary(uniqueKeysWithValues: list.map { ($0.entityId, $0) })
        s.favorites = list.map(\.entityId)
        return s
    }
}
#endif
