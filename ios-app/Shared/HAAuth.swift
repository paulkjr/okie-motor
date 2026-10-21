import Foundation

/// Signing in the way the Home Assistant web page itself does (its login flow API), with our own client id on the same address, so nothing has to be set up on the server.
enum HAAuth {
    /// "ha.example.com", "http://192.168.1.20:8123/" ... -> a clean base URL
    static func normalize(_ text: String) -> URL? {
        var t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.isEmpty { return nil }
        if !t.contains("://") { t = "https://" + t }
        guard var c = URLComponents(string: t), let host = c.host, !host.isEmpty else { return nil }
        c.path = ""; c.query = nil; c.fragment = nil
        return c.url ?? URL(string: "https://\(host)")
    }
    static func clientID(for base: URL) -> String {
        var s = base.absoluteString
        if !s.hasSuffix("/") { s += "/" }
        return s
    }

    enum Step {
        case form(flowID: String, stepID: String, fields: [String], error: String?)
        case done(code: String)
    }

    private static func json(_ method: String, _ url: URL, _ body: [String: Any]?) async throws -> (Int, [String: Any]) {
        var r = URLRequest(url: url, timeoutInterval: 20)
        r.httpMethod = method
        if let body {
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
            r.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        do {
            let (d, resp) = try await URLSession.shared.data(for: r)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            let obj = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] ?? [:]
            return (code, obj)
        } catch {
            throw HAError.network("Could not reach Home Assistant: \((error as NSError).localizedDescription)")
        }
    }

    private static func read(_ code: Int, _ o: [String: Any]) throws -> Step {
        guard code == 200 else { throw HAError.http(code, o["message"] as? String) }
        let type = o["type"] as? String
        if type == "create_entry", let result = o["result"] as? String { return .done(code: result) }
        if type == "abort" { throw HAError.rejected((o["reason"] as? String)?.replacingOccurrences(of: "_", with: " ") ?? "Sign-in was stopped.") }
        guard let flow = o["flow_id"] as? String else { throw HAError.decode }
        let step = o["step_id"] as? String ?? "init"
        let fields = (o["data_schema"] as? [[String: Any]])?.compactMap { $0["name"] as? String } ?? []
        var err: String?
        if let e = o["errors"] as? [String: String], let first = e.values.first {
            switch first {
            case "invalid_auth": err = "Wrong name or password."
            case "invalid_code": err = "That code is not right."
            default: err = first.replacingOccurrences(of: "_", with: " ")
            }
        }
        return .form(flowID: flow, stepID: step, fields: fields, error: err)
    }

    static func begin(base: URL) async throws -> Step {
        let cid = clientID(for: base)
        let (code, o) = try await json("POST", base.appendingPathComponent("auth/login_flow"), [
            "client_id": cid, "handler": ["homeassistant", NSNull()], "redirect_uri": cid + "?auth_callback=1",
        ])
        return try read(code, o)
    }

    static func submit(base: URL, flowID: String, fields: [String: String]) async throws -> Step {
        var body: [String: Any] = fields
        body["client_id"] = clientID(for: base)
        let (code, o) = try await json("POST", base.appendingPathComponent("auth/login_flow/\(flowID)"), body)
        return try read(code, o)
    }

    private static func tokenRequest(base: URL, form: [String: String]) async throws -> [String: Any] {
        var r = URLRequest(url: base.appendingPathComponent("auth/token"), timeoutInterval: 20)
        r.httpMethod = "POST"
        r.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var c = URLComponents(); c.queryItems = form.map { URLQueryItem(name: $0.key, value: $0.value) }
        r.httpBody = c.percentEncodedQuery?.data(using: .utf8)
        do {
            let (d, resp) = try await URLSession.shared.data(for: r)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any] ?? [:]
            if code != 200 { throw HAError.http(code, (o["error_description"] as? String) ?? (o["error"] as? String)) }
            return o
        } catch let e as HAError { throw e }
        catch { throw HAError.network("Could not reach Home Assistant: \((error as NSError).localizedDescription)") }
    }

    static func exchange(base: URL, code: String, userName: String) async throws -> HASession {
        let cid = clientID(for: base)
        let o = try await tokenRequest(base: base, form: ["grant_type": "authorization_code", "code": code, "client_id": cid])
        guard let access = o["access_token"] as? String, let refresh = o["refresh_token"] as? String else { throw HAError.decode }
        let life = (o["expires_in"] as? Double) ?? 1800
        return HASession(baseURL: base, clientID: cid, accessToken: access, refreshToken: refresh, expiresAt: Date().addingTimeInterval(life), userName: userName)
    }

    static func refresh(_ s: HASession) async throws -> HASession {
        let o = try await tokenRequest(base: s.baseURL, form: ["grant_type": "refresh_token", "refresh_token": s.refreshToken, "client_id": s.clientID])
        guard let access = o["access_token"] as? String else { throw HAError.decode }
        var n = s
        n.accessToken = access
        n.expiresAt = Date().addingTimeInterval((o["expires_in"] as? Double) ?? 1800)
        return n
    }
}
