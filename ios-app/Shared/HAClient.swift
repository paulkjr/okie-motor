import Foundation

/// Talks to Home Assistant's REST API with the saved sign-in; refreshes the token when it is about to run out. Used by the app and by the widgets.
final class HAClient {
    static let shared = HAClient()

    private let gate = TokenGate()

    var isSignedIn: Bool { SessionStore.load() != nil }
    /// The sign-in with at least `minLife` seconds left on the token (renewed when it has less): for a web page that keeps using it for a while.
    func validSession(minLife: TimeInterval = 60) async throws -> HASession { try await gate.valid(minLife: minLife) }
    var baseURL: URL? { SessionStore.load()?.baseURL }

    // MARK: requests
    func request(_ method: String = "GET", _ path: String, query: [String: String] = [:], body: Any? = nil, retry: Bool = true) async throws -> Data {
        let s = try await gate.valid()
        var c = URLComponents(url: s.baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { c.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var r = URLRequest(url: c.url!, timeoutInterval: 15)
        r.httpMethod = method
        r.setValue("Bearer \(s.accessToken)", forHTTPHeaderField: "Authorization")
        if let body {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        do {
            let (d, resp) = try await URLSession.shared.data(for: r)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401 && retry { await gate.expire(); return try await request(method, path, query: query, body: body, retry: false) }
            guard (200..<300).contains(code) else { throw HAError.http(code, String(data: d, encoding: .utf8)?.prefix(200).description) }
            return d
        } catch let e as HAError { throw e }
        catch { throw HAError.network((error as NSError).localizedDescription) }
    }

    // MARK: states
    func states() async throws -> [HAEntity] {
        let d = try await request("GET", "api/states")
        guard let list = try? JSONDecoder().decode([HAEntity].self, from: d) else { throw HAError.decode }
        return list
    }

    func state(_ id: String) async throws -> HAEntity {
        let d = try await request("GET", "api/states/\(id)")
        guard let e = try? JSONDecoder().decode(HAEntity.self, from: d) else { throw HAError.decode }
        return e
    }

    func callService(_ domain: String, _ service: String, _ data: [String: Any] = [:]) async throws {
        _ = try await request("POST", "api/services/\(domain)/\(service)", body: data)
    }

    /// The hourly or daily forecast of a weather entity (Home Assistant's weather.get_forecasts, which answers with the forecast list).
    func forecast(_ id: String, type: String) async -> [[String: Any]] {
        guard let d = try? await request("POST", "api/services/weather/get_forecasts", query: ["return_response": ""], body: ["entity_id": id, "type": type]),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any],
              let r = o["service_response"] as? [String: Any], let e = r[id] as? [String: Any] else { return [] }
        return (e["forecast"] as? [[String: Any]]) ?? []
    }

    /// The room of an entity ("Bedroom"), from Home Assistant's template API; nil when it has none.
    func areaName(_ id: String) async -> String? {
        guard let d = try? await request("POST", "api/template", body: ["template": "{{ area_name('\(id)') or '' }}"]),
              let t = String(data: d, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty, t != "None" else { return nil }
        return t
    }

    // MARK: calendar
    func events(calendar: String, from: Date, to: Date) async throws -> [CalendarEvent] {
        let d = try await request("GET", "api/calendars/\(calendar)", query: ["start": HADate.string(from), "end": HADate.string(to)])
        guard let arr = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]] else { throw HAError.decode }
        func when(_ v: Any?) -> (Date, Bool)? {
            if let o = v as? [String: Any] {
                if let dt = o["dateTime"] as? String, let x = HADate.parse(dt) { return (x, false) }
                if let day = o["date"] as? String, let x = HADate.parse(day) { return (x, true) }
            }
            if let s = v as? String, let x = HADate.parse(s) { return (x, !s.contains("T")) }
            return nil
        }
        return arr.compactMap { o in
            guard let (s, allDay) = when(o["start"]) else { return nil }
            let e = when(o["end"])?.0 ?? s
            return CalendarEvent(calendar: calendar, summary: (o["summary"] as? String) ?? "", start: s, end: e, allDay: allDay, location: o["location"] as? String)
        }
    }

    /// Every calendar of the server: entity id and name.
    func calendarList() async throws -> [(id: String, name: String)] {
        let d = try await request("GET", "api/calendars")
        guard let arr = (try? JSONSerialization.jsonObject(with: d)) as? [[String: Any]] else { throw HAError.decode }
        return arr.compactMap { o in
            guard let id = o["entity_id"] as? String else { return nil }
            return (id: id, name: (o["name"] as? String) ?? id)
        }
    }

    func allEvents(calendars: [String], from: Date, to: Date) async -> [CalendarEvent] {
        await withTaskGroup(of: [CalendarEvent].self) { group in
            for c in calendars { group.addTask { (try? await self.events(calendar: c, from: from, to: to)) ?? [] } }
            var all: [CalendarEvent] = []
            for await part in group { all += part }
            return all.sorted { $0.start < $1.start }
        }
    }
}

/// One at a time: reads the sign-in, refreshes it when it has less than a minute left, and saves the new one for the widgets.
private actor TokenGate {
    func valid(minLife: TimeInterval = 60) async throws -> HASession {
        guard var s = SessionStore.load() else { throw HAError.notSignedIn }
        if s.expiresAt.timeIntervalSinceNow < minLife { s = try await renew(s) }
        return s
    }
    func expire() async {
        guard var s = SessionStore.load() else { return }
        s.expiresAt = .distantPast
        SessionStore.save(s)
    }
    private func renew(_ s: HASession) async throws -> HASession {
        let n = try await HAAuth.refresh(s)
        SessionStore.save(n)
        return n
    }
}
