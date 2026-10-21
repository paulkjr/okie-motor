import Foundation

/// One request over Home Assistant's WebSocket (connect, sign in, ask, read the answer, close): for the few things the REST API does not have, like the user data the Okie Motor card keeps.
enum HAWS {
    static func call(_ payload: [String: Any], timeout: TimeInterval = 8) async -> [String: Any]? {
        guard let session = try? await HAClientToken.valid() else { return nil }
        var c = URLComponents(url: session.baseURL.appendingPathComponent("api/websocket"), resolvingAgainstBaseURL: false)!
        c.scheme = (c.scheme == "http") ? "ws" : "wss"
        let task = URLSession.shared.webSocketTask(with: c.url!)
        task.resume()
        defer { task.cancel(with: .goingAway, reason: nil) }
        func object(_ m: URLSessionWebSocketTask.Message) -> [String: Any]? {
            switch m {
            case .string(let s): return (try? JSONSerialization.jsonObject(with: Data(s.utf8))) as? [String: Any]
            case .data(let d): return (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
            @unknown default: return nil
            }
        }
        func send(_ o: [String: Any]) async throws {
            let d = try JSONSerialization.data(withJSONObject: o)
            try await task.send(.string(String(data: d, encoding: .utf8) ?? "{}"))
        }
        let ask = Task { () -> [String: Any]? in
            while true {
                guard let o = object(try await task.receive()) else { continue }
                switch o["type"] as? String {
                case "auth_required": try await send(["type": "auth", "access_token": session.accessToken])
                case "auth_ok": var p = payload; p["id"] = 1; try await send(p)
                case "auth_invalid": return nil
                case "result": if (o["id"] as? Int) == 1 { return o }
                default: break
                }
            }
        }
        let timer = Task { try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000)); ask.cancel(); task.cancel(with: .goingAway, reason: nil) }
        defer { timer.cancel() }
        return (try? await ask.value) ?? nil
    }
}

/// The settings of the Okie Motor card, shared through Home Assistant's own user data (key okie_motor_settings, the same the card syncs): the app reads and writes the parts it shares with the card.
/// The cities of the weather screen are one of them (`weatherCities`, a list of { name, sub, lat, lon }), so a city added in the app is on the card and the other way round.
enum CardSettings {
    private static let key = "okie_motor_settings"
    private enum Stored { case failed, empty, value(t: Double, data: [String: Any]) }

    private static func read() async -> Stored {
        guard let r = await HAWS.call(["type": "frontend/get_user_data", "key": key]), (r["success"] as? Bool) == true else { return .failed }
        guard let res = r["result"] as? [String: Any], let v = res["value"] as? [String: Any] else { return .empty }
        return .value(t: (v["t"] as? NSNumber)?.doubleValue ?? 0, data: (v["data"] as? [String: Any]) ?? [:])
    }

    /// the cities of the card; nil when they cannot be read (the app keeps its own then)
    static func cities() async -> [WxCity]? {
        switch await read() {
        case .value(_, let data):
            guard let arr = data["weatherCities"] as? [[String: Any]] else { return [] }
            return arr.compactMap { o in
                guard let name = o["name"] as? String, let lat = (o["lat"] as? NSNumber)?.doubleValue, let lon = (o["lon"] as? NSNumber)?.doubleValue else { return nil }
                return WxCity(name: name, sub: (o["sub"] as? String) ?? "", lat: lat, lon: lon)
            }
        case .empty: return []
        case .failed: return nil
        }
    }

    /// The calendars switched off and the colours picked, as the card has them (nil when the card's settings cannot be read)
    static func calendars() async -> (hidden: [String]?, colors: [String: String])? {
        switch await read() {
        case .value(_, let data):
            let hidden = data["calendarHidden"] as? [String]
            let colors = (data["calendarColors"] as? [String: Any])?.compactMapValues { $0 as? String } ?? [:]
            return (hidden, colors)
        case .empty: return (nil, [:])
        case .failed: return nil
        }
    }

    /// Sets the cities in the card's settings and stamps them newer, so every screen picks them up. Only when the card's settings could be read: a failed read must never overwrite them with nothing.
    static func saveCities(_ list: [WxCity]) async {
        guard case .value(_, var data) = await read() else { return }
        data["weatherCities"] = list.map { ["name": $0.name, "sub": $0.sub, "lat": $0.lat, "lon": $0.lon] as [String: Any] }
        _ = await HAWS.call(["type": "frontend/set_user_data", "key": key, "value": ["t": Date().timeIntervalSince1970 * 1000, "data": data]])
    }
}
