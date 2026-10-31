import Foundation
import WatchConnectivity

/// Passes the sign-in (and the dial colours) on to the Apple Watch app, so the watch talks to Home Assistant with the same sign-in without typing a password on a watch.
final class WatchLink: NSObject, WCSessionDelegate {
    static let shared = WatchLink()

    func start() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
        SessionStore.didChange = { [weak self] in self?.push() }
    }

    private var lightFavs: [String]?
    private var lightModes: String?      // the card's light modes as JSON text ("" = the three it ships with)
    private var favsAt = Date.distantPast

    /// The lights of the Okie card's Lights screen (lightsFav, in its order; when empty, the global favorites) and its light modes. The watch cannot open a WebSocket to Home Assistant, so the phone reads them and passes them on.
    private func fetchLists() async -> (favs: [String], modes: String)? {
        func data(_ key: String) async -> [String: Any]? {
            guard let r = await HAWS.call(["type": "frontend/get_user_data", "key": key]), (r["success"] as? Bool) == true,
                  let res = r["result"] as? [String: Any], let v = res["value"] as? [String: Any] else { return nil }
            return v["data"] as? [String: Any]
        }
        let own = (await data("okie_motor_rooms"))?["lightsFav"] as? [String]
        let settings = await data("okie_motor_settings")
        let favs: [String]
        if let own, !own.isEmpty { favs = own } else if let g = settings?["favorites"] as? [String] { favs = g } else { return nil }
        var modes = ""
        if let m = settings?["lightModes"], JSONSerialization.isValidJSONObject(m), let d = try? JSONSerialization.data(withJSONObject: m) { modes = String(data: d, encoding: .utf8) ?? "" }
        return (favs, modes)
    }
    private func refreshLightFavs() {
        guard Date().timeIntervalSince(favsAt) > 20 else { return }
        favsAt = Date()
        Task {
            guard let l = await fetchLists() else { return }
            await MainActor.run { self.lightFavs = l.favs; self.lightModes = l.modes; self.push(fetch: false) }
        }
    }

    func push(fetch: Bool = true) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        var ctx: [String: Any] = ["sent": Date().timeIntervalSince1970]
        if let s = SessionStore.load(), let d = try? JSONEncoder().encode(s) { ctx["session"] = d }
        if let look = DialLook.savedJSON { ctx["dial"] = look }
        if let f = lightFavs { ctx["lightFavs"] = f }
        if let m = lightModes { ctx["lightModes"] = m }
        if fetch { refreshLightFavs() }
        try? WCSession.default.updateApplicationContext(ctx)
    }

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) { if activationState == .activated { push() } }
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) { session.activate() }
    /// The watch asks when it has no sign-in yet.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) { if message["hello"] != nil { push() } }
    /// The open watch app asks for the lights list every few seconds: the answer is read from Home Assistant right then, so a change made in the card shows on the watch at once.
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        guard message["lights"] != nil else { replyHandler([:]); return }
        Task {
            if let l = await fetchLists() { lightFavs = l.favs; lightModes = l.modes; replyHandler(["lightFavs": l.favs, "lightModes": l.modes]) } else { replyHandler([:]) }
        }
    }
}
