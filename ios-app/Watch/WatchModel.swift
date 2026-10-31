import SwiftUI
import WatchConnectivity
import Observation

/// What the watch shows: the thermostat, kept fresh while the app is open, and the changes you make with the crown and the mode list.
@MainActor @Observable
final class WatchModel: NSObject, WCSessionDelegate {
    var info: ThermoInfo?
    var entity: HAEntity?
    var signedIn = SessionStore.load() != nil
    var error: String?
    var busy = false
    private var demo = false
    var lookRev = 0      // goes up when the dial look changes, so the wheel and the settings page draw again
    private var entityID: String?
    private var loop: Task<Void, Never>?
    /// What you set last: for a while the watch trusts its own number over what Home Assistant still reports (a real thermostat reports the change back late), so the number never jumps back.
    private(set) var pendingTarget: Double?
    private var pendingAt = Date.distantPast
    private let pendingGrace: TimeInterval = 20
    func trust(_ v: Double) { pendingTarget = v; pendingAt = Date() }
    /// The target to show: yours while Home Assistant has not caught up, else Home Assistant's.
    func displayTarget(_ info: ThermoInfo) -> Double? {
        if let p = pendingTarget, Date().timeIntervalSince(pendingAt) < pendingGrace, abs((info.target ?? .infinity) - p) > 0.001 { return p }
        return info.target
    }
    private var holdUntil = Date.distantPast      // after a change the poll waits, so the number does not jump back before Home Assistant has it

    override init() {
        super.init()
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "watchDemo") {      // launch argument -watchDemo YES: sample thermostat for looking at the screens
            let e = HAEntity(entityId: "climate.living_room", state: "heat", attributes: ["friendly_name": .string("Google Nest"), "current_temperature": .number(71), "temperature": .number((UserDefaults.standard.double(forKey: "watchTarget") > 0 ? UserDefaults.standard.double(forKey: "watchTarget") : 72)), "min_temp": .number(50), "max_temp": .number(90), "target_temp_step": .number(1), "temperature_unit": .string("°F"), "hvac_action": .string("heating"), "current_humidity": .number(41), "hvac_modes": .array([.string("off"), .string("heat"), .string("cool"), .string("heat_cool")])])
            entity = e; info = ThermoInfo(e, entityID: e.entityId); signedIn = true; demo = true
            if UserDefaults.standard.bool(forKey: "watchBump") { Task { try? await Task.sleep(nanoseconds: 3_000_000_000); self.setLook("glowBlur", 20); self.setLook("ticks", 50); self.setLook("glowOpacity", 0) } }      // looking at the settings page redraw by itself
            return
        }
        #endif
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // MARK: sign-in from the phone
    nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        let ctx = session.receivedApplicationContext
        Task { @MainActor in
            if !ctx.isEmpty { self.take(ctx) }
            if SessionStore.load() == nil, session.isReachable { session.sendMessage(["hello": 1], replyHandler: nil) }
        }
    }
    nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        Task { @MainActor in self.take(applicationContext) }
    }
    private func take(_ ctx: [String: Any]) {
        if let look = ctx["dial"] as? String { DialLook.save(look); lookRev += 1 }
        if let f = ctx["lightFavs"] as? [String] { UserDefaults.standard.set(f, forKey: "lightFavs") }
        if let m = ctx["lightModes"] as? String { UserDefaults.standard.set(m, forKey: "lightModes") }
        if let d = ctx["session"] as? Data, let s = try? JSONDecoder().decode(HASession.self, from: d) {
            let mine = SessionStore.load()
            if mine?.baseURL != s.baseURL || mine?.refreshToken != s.refreshToken || (mine?.expiresAt ?? .distantPast) < s.expiresAt { SessionStore.save(s) }
            signedIn = true
            error = nil
            start()
        } else if ctx["session"] == nil, ctx["sent"] != nil {
            SessionStore.clear(); signedIn = false; info = nil; entity = nil; stop()
        }
    }

    // MARK: live data
    func start() {
        guard signedIn, !demo, loop == nil else { return }
        loop = Task { [weak self] in
            while !Task.isCancelled {
                await self?.refresh()
                try? await Task.sleep(nanoseconds: 12_000_000_000)
            }
        }
    }
    func stop() { loop?.cancel(); loop = nil }

    func refresh() async {
        guard !demo, Date() >= holdUntil else { return }
        do {
            if entityID == nil {
                let all = try await HAClient.shared.states().filter { $0.domain == "climate" }
                entityID = all.first { $0.entityId == WidgetSpec.Thermostat.entity }?.entityId ?? all.first?.entityId
                guard entityID != nil else { error = "No thermostat found in Home Assistant."; return }
            }
            let e = try await HAClient.shared.state(entityID!)
            entity = e
            info = ThermoInfo(e, entityID: entityID!)
            if let p = pendingTarget, Date().timeIntervalSince(pendingAt) >= pendingGrace || abs((info?.target ?? .infinity) - p) <= 0.001 { pendingTarget = nil }      // caught up, or given up
            error = nil
        } catch HAError.notSignedIn {
            signedIn = false
        } catch {
            self.error = (error as? HAError)?.errorDescription ?? error.localizedDescription
        }
    }

    // MARK: changes
    /// The new target: when the thermostat works with a low and a high (Heat/Cool), both move by the same amount.
    func setTarget(_ value: Double) {
        guard let e = entity, let id = entityID else { return }
        var data: [String: Any] = ["entity_id": id]
        if e.attributes["temperature"]?.double == nil, let lo = e.num("target_temp_low"), let hi = e.num("target_temp_high") {
            let mid = (lo + hi) / 2
            data["target_temp_low"] = lo + (value - mid)
            data["target_temp_high"] = hi + (value - mid)
        } else {
            data["temperature"] = value
        }
        send("set_temperature", data)
    }

    func setLook(_ key: String, _ v: Double) { DialLook.setOverride(key, v); lookRev += 1 }
    func resetLook() { for k in ["glowBlur", "glowSpread", "glowOpacity", "ticks"] { DialLook.setOverride(k, nil) }; lookRev += 1 }

    func turn(on: Bool) { guard let id = entityID else { return }; send(on ? "turn_on" : "turn_off", ["entity_id": id]) }

    func setMode(_ mode: String) { guard let id = entityID else { return }; send("set_hvac_mode", ["entity_id": id, "hvac_mode": mode]) }

    private func send(_ service: String, _ data: [String: Any]) {
        holdUntil = Date().addingTimeInterval(3)
        busy = true
        Task {
            do { try await HAClient.shared.callService("climate", service, data); error = nil }
            catch { self.error = (error as? HAError)?.errorDescription ?? error.localizedDescription }
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            holdUntil = .distantPast
            await refresh()
            busy = false
        }
    }
}
