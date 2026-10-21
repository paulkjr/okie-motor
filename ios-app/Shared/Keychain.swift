import Foundation
import Security

/// A tiny keychain wrapper. The app and the widgets share one access group so the widgets can talk to Home Assistant with the same sign-in.
enum Keychain {
    private static let service = "OkieHome"
    /// An unsigned simulator build has no keychain entitlement at all (every call fails with -34018): then the sign-in lives in this process only, so the app still works (the widgets cannot see it).
    private static let lock = NSLock()
    private static var memory: [String: Data] = [:]

    private static var group: String? {
        guard let g = Bundle.main.object(forInfoDictionaryKey: "OkieKeychainGroup") as? String, !g.isEmpty, !g.contains("$(") else { return nil }
        return g
    }

    private static func base(_ account: String, group: String?) -> [String: Any] {
        var q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        if let group { q[kSecAttrAccessGroup as String] = group }
        return q
    }

    static func set(_ data: Data, account: String) {
        for g in [group, nil] as [String?] {
            let q = base(account, group: g)
            SecItemDelete(q as CFDictionary)
            var add = q
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
            let status = SecItemAdd(add as CFDictionary, nil)
            if status == errSecSuccess { lock.lock(); memory[account] = nil; lock.unlock(); return }
        }
        lock.lock(); memory[account] = data; lock.unlock()
    }

    static func get(account: String) -> Data? {
        for g in [group, nil] as [String?] {
            var q = base(account, group: g)
            q[kSecReturnData as String] = true
            q[kSecMatchLimit as String] = kSecMatchLimitOne
            var out: AnyObject?
            if SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data { return d }
        }
        lock.lock(); defer { lock.unlock() }
        return memory[account]
    }

    static func delete(account: String) {
        for g in [group, nil] as [String?] { SecItemDelete(base(account, group: g) as CFDictionary) }
        lock.lock(); memory[account] = nil; lock.unlock()
    }
}
