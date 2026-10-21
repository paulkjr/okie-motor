import Foundation
import CoreLocation

/// The name of the place Home Assistant's home is at ("Lutz"). The coordinates come from Home Assistant's own settings (GET api/config), the name from a reverse look-up (no location permission is
/// needed: it is the place of the house, not of the phone). The answer is kept in the shared keychain, so the app and the widgets agree and the look-up only runs again when the house moves.
enum HomePlace {
    private struct Saved: Codable { var lat: Double; var lon: Double; var name: String }
    private static let account = "homePlace"

    private static var saved: Saved? { Keychain.get(account: account).flatMap { try? JSONDecoder().decode(Saved.self, from: $0) } }
    /// what is known without asking anybody
    static var cached: String? { saved?.name }

    static func name() async -> String? {
        guard let c = await coordinates() else { return saved?.name }
        if let s = saved, abs(s.lat - c.lat) < 0.005, abs(s.lon - c.lon) < 0.005 { return s.name }
        if let n = await reverse(c.lat, c.lon), let d = try? JSONEncoder().encode(Saved(lat: c.lat, lon: c.lon, name: n)) {
            Keychain.set(d, account: account)
            return n
        }
        return saved?.name ?? c.fallback
    }

    /// the house's latitude and longitude, and the name Home Assistant gives the place ("Home") for when no better one is found
    static func coordinates() async -> (lat: Double, lon: Double, fallback: String?)? {
        guard let d = try? await HAClient.shared.request("GET", "api/config"),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any],
              let lat = (o["latitude"] as? NSNumber)?.doubleValue, let lon = (o["longitude"] as? NSNumber)?.doubleValue else { return nil }
        return (lat, lon, o["location_name"] as? String)
    }

    private static func reverse(_ lat: Double, _ lon: Double) async -> String? {
        guard let marks = try? await CLGeocoder().reverseGeocodeLocation(CLLocation(latitude: lat, longitude: lon)), let m = marks.first else { return nil }
        return m.locality ?? m.subAdministrativeArea ?? m.administrativeArea ?? m.name
    }
}
