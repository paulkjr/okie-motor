import Foundation

/// A WebSocket to Home Assistant: the first full list of states, then every change as it happens. Reconnects by itself.
final class HALive {
    var onStates: (([HAEntity]) -> Void)?
    var onChange: ((HAEntity) -> Void)?
    var onStatus: ((String) -> Void)?

    private var task: URLSessionWebSocketTask?
    private var stopped = false
    private var attempt = 0
    private var nextID = 1
    private var statesID = 0

    func start() { stopped = false; Task { await connect() } }
    func stop() { stopped = true; task?.cancel(with: .goingAway, reason: nil); task = nil }

    private func status(_ s: String) { DispatchQueue.main.async { self.onStatus?(s) } }

    private func connect() async {
        guard !stopped else { return }
        status("connecting")
        do {
            let session = try await HAClientToken.valid()
            var c = URLComponents(url: session.baseURL.appendingPathComponent("api/websocket"), resolvingAgainstBaseURL: false)!
            c.scheme = (c.scheme == "http") ? "ws" : "wss"
            let t = URLSession.shared.webSocketTask(with: c.url!)
            task = t
            t.resume()
            nextID = 1
            // the server speaks first (auth_required), then we answer with the token
            while !stopped {
                let msg = try await t.receive()
                guard let o = Self.object(msg) else { continue }
                switch o["type"] as? String {
                case "auth_required":
                    try await send(["type": "auth", "access_token": session.accessToken])
                case "auth_ok":
                    attempt = 0
                    status("online")
                    statesID = take()
                    try await send(["id": statesID, "type": "get_states"])
                    try await send(["id": take(), "type": "subscribe_events", "event_type": "state_changed"])
                case "auth_invalid":
                    status("sign-in expired")
                    throw HAError.notSignedIn
                case "result":
                    if (o["id"] as? Int) == statesID, let arr = o["result"] as? [[String: Any]] {
                        let data = try JSONSerialization.data(withJSONObject: arr)
                        if let list = try? JSONDecoder().decode([HAEntity].self, from: data) {
                            DispatchQueue.main.async { self.onStates?(list) }
                        }
                    }
                case "event":
                    if let ev = o["event"] as? [String: Any], let d = ev["data"] as? [String: Any], let new = d["new_state"] as? [String: Any],
                       let data = try? JSONSerialization.data(withJSONObject: new), let e = try? JSONDecoder().decode(HAEntity.self, from: data) {
                        DispatchQueue.main.async { self.onChange?(e) }
                    }
                default: break
                }
            }
        } catch {
            guard !stopped else { return }
            status("reconnecting")
            attempt += 1
            let wait = min(30, pow(2, Double(min(attempt, 5))))
            try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            await connect()
        }
    }

    private func take() -> Int { defer { nextID += 1 }; return nextID }

    private func send(_ o: [String: Any]) async throws {
        let d = try JSONSerialization.data(withJSONObject: o)
        try await task?.send(.string(String(data: d, encoding: .utf8) ?? "{}"))
    }

    private static func object(_ m: URLSessionWebSocketTask.Message) -> [String: Any]? {
        switch m {
        case .string(let s): return (try? JSONSerialization.jsonObject(with: Data(s.utf8))) as? [String: Any]
        case .data(let d): return (try? JSONSerialization.jsonObject(with: d)) as? [String: Any]
        @unknown default: return nil
        }
    }
}

/// The token for the socket (refreshed like every other request).
enum HAClientToken {
    static func valid() async throws -> HASession {
        guard var s = SessionStore.load() else { throw HAError.notSignedIn }
        if s.expiresAt.timeIntervalSinceNow < 60 {
            s = try await HAAuth.refresh(s)
            SessionStore.save(s)
        }
        return s
    }
}
