import Foundation

enum HAError: LocalizedError {
    case badURL
    case notSignedIn
    case http(Int, String?)
    case rejected(String)       // Home Assistant said no (wrong name or password, ...)
    case network(String)
    case decode

    var errorDescription: String? {
        switch self {
        case .badURL: return "That address does not look right."
        case .notSignedIn: return "Not signed in."
        case .http(let c, let m): return "Home Assistant answered \(c)" + (m.map { ": \($0)" } ?? "")
        case .rejected(let m): return m
        case .network(let m): return m
        case .decode: return "Home Assistant sent something unexpected."
        }
    }
}

/// What we keep after signing in: the address, our client id, and the tokens.
struct HASession: Codable, Equatable {
    var baseURL: URL
    var clientID: String
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var userName: String
}

enum SessionStore {
    private static let account = "session"

    static func load() -> HASession? {
        guard let d = Keychain.get(account: account) else { return nil }
        return try? JSONDecoder().decode(HASession.self, from: d)
    }
    static func save(_ s: HASession) {
        if let d = try? JSONEncoder().encode(s) { Keychain.set(d, account: account) }
    }
    static func clear() { Keychain.delete(account: account) }
}
