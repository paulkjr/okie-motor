import Foundation
import SwiftUI

struct WxDay: Identifiable { var id: Int; var date: Date; var label: String; var cond: String; var hi: Int?; var lo: Int?; var pop: Int? }
struct WxHour: Identifiable { var id: Int; var label: String; var cond: String; var temp: Int?; var night: Bool }
struct WxRow: Identifiable { var id: String; var label: String; var value: String }

/// Everything one place's weather page shows.
struct WeatherData {
    var place = ""
    var cond = "cloudy"
    var temp: Int?
    var night = false
    var rows: [WxRow] = []
    var days: [WxDay] = []
    var hours: [WxHour] = []
    var loaded = false
    var tz: TimeZone?                    // a city's own time zone (its date and hours); nil = the phone's

    /// "Tuesday, October 20" on the place's own calendar
    var dateText: String {
        let f = DateFormatter(); f.timeZone = tz ?? .current; f.setLocalizedDateFormatFromTemplate("EEEEMMMMd")
        return f.string(from: Date())
    }

    static var sample: WeatherData {
        let c = ["sunny", "sunny", "partlycloudy", "cloudy", "rainy", "sunny", "sunny", "cloudy", "sunny", "sunny"]
        let names = ["Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu"]
        return WeatherData(place: "Home", cond: "sunny", temp: 68, night: false,
                           rows: [WxRow(id: "feels", label: "Feels like", value: "67°"), WxRow(id: "humidity", label: "Humidity", value: "41%"), WxRow(id: "wind", label: "Wind", value: "8 mph NW"),
                                  WxRow(id: "pressure", label: "Pressure", value: "29.92 inHg"), WxRow(id: "uv", label: "UV index", value: "6.0"), WxRow(id: "sunrise", label: "Sunrise", value: "7:21 AM"), WxRow(id: "sunset", label: "Sunset", value: "6:35 PM")],
                           days: (0..<10).map { WxDay(id: $0, date: CalMath.add(Date(), days: $0), label: names[$0], cond: c[$0], hi: 80 - $0, lo: 60 + ($0 % 4), pop: $0 == 4 ? 60 : nil) },
                           hours: (0..<24).map { WxHour(id: $0, label: $0 == 0 ? "Now" : "\(($0 + 8) % 12 + 1) \($0 + 8 < 24 ? "AM" : "PM")", cond: c[$0 % 6], temp: 68 + $0 % 8, night: false) }, loaded: true)
    }

    static func compass(_ deg: Double?) -> String {
        guard let d = deg else { return "" }
        let names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        return names[Int((d / 22.5).rounded()) % 16]
    }
    static func n(_ v: Double, _ digits: Int = 0) -> String { digits == 0 ? String(Int(v.rounded())) : String(format: "%.\(digits)f", v) }

    /// Reads the weather entity of Home Assistant (and the forecasts when asked); nil when Home Assistant cannot be reached.
    static func load(_ id: String, keeping old: WeatherData, forecasts: Bool) async -> WeatherData? {
        guard HAClient.shared.isSignedIn else { return nil }
        async let st = try? await HAClient.shared.state(id)
        async let sun = try? await HAClient.shared.state("sun.sun")
        async let moon = try? await HAClient.shared.state("sensor.moon")
        async let hourly = forecasts ? HAClient.shared.forecast(id, type: "hourly") : []
        async let daily = forecasts ? HAClient.shared.forecast(id, type: "daily") : []
        let (e, s, m, hf, df) = await (st, sun, moon, hourly, daily)
        guard let e else { return nil }
        var w = old
        let a = e.attributes
        let now = Date(), hour = Calendar.current.component(.hour, from: now)
        w.night = s?.state == "below_horizon" ? true : (s?.state == "above_horizon" ? false : (e.state == "clear-night" || hour < 6 || hour >= 20))
        w.cond = e.state
        w.temp = e.num("temperature").map { Int($0.rounded()) }
        w.place = (a["friendly_name"]?.string ?? "").replacingOccurrences(of: "Forecast ", with: "").trimmingCharacters(in: .whitespaces)
        var rows: [WxRow] = []
        func push(_ id: String, _ label: String, _ v: String?) { if let v, !v.isEmpty { rows.append(WxRow(id: id, label: label, value: v)) } }
        push("feels", "Feels like", a["apparent_temperature"]?.double.map { n($0) + "°" })
        push("humidity", "Humidity", a["humidity"]?.double.map { n($0) + "%" })
        if let ws = a["wind_speed"]?.double { push("wind", "Wind", (n(ws) + " " + (a["wind_speed_unit"]?.string ?? "") + (a["wind_bearing"]?.double != nil ? " " + compass(a["wind_bearing"]?.double) : "")).trimmingCharacters(in: .whitespaces)) }
        if let g = a["wind_gust_speed"]?.double { push("gusts", "Gusts", (n(g) + " " + (a["wind_speed_unit"]?.string ?? "")).trimmingCharacters(in: .whitespaces)) }
        push("pressure", "Pressure", a["pressure"]?.double.map { (n($0) + " " + (a["pressure_unit"]?.string ?? "")).trimmingCharacters(in: .whitespaces) })
        push("visibility", "Visibility", a["visibility"]?.double.map { (n($0, $0 < 10 ? 1 : 0) + " " + (a["visibility_unit"]?.string ?? "")).trimmingCharacters(in: .whitespaces) })
        push("dew", "Dew point", a["dew_point"]?.double.map { n($0) + "°" })
        push("uv", "UV index", a["uv_index"]?.double.map { n($0, 1) })
        push("clouds", "Clouds", a["cloud_coverage"]?.double.map { n($0) + "%" })
        if let r = HADate.parse(s?.attributes["next_rising"]?.string) { push("sunrise", "Sunrise", r.formatted(date: .omitted, time: .shortened)) }
        if let r = HADate.parse(s?.attributes["next_setting"]?.string) { push("sunset", "Sunset", r.formatted(date: .omitted, time: .shortened)) }
        if let ms = m?.state, ms != "unknown", ms != "unavailable" { push("moon", "Moon", ms.replacingOccurrences(of: "_", with: " ").capitalized) }
        w.rows = rows
        if forecasts {
            var hours: [WxHour] = []
            for f in hf {
                guard let t = HADate.parse(f["datetime"] as? String), t.timeIntervalSince(now) > -3600 + 1 else { continue }
                if hours.count >= 168 { break }
                let h = Calendar.current.component(.hour, from: t)
                let label = hours.isEmpty ? "Now" : (h == 0 ? t.formatted(.dateTime.weekday(.abbreviated)) : t.formatted(.dateTime.hour()))
                hours.append(WxHour(id: hours.count, label: label, cond: (f["condition"] as? String) ?? "cloudy", temp: (f["temperature"] as? Double).map { Int($0.rounded()) }, night: h < 6 || h >= 20))
            }
            w.hours = hours
            w.days = df.enumerated().compactMap { i, f in
                guard let t = HADate.parse(f["datetime"] as? String) else { return nil }
                return WxDay(id: i, date: t, label: t.formatted(.dateTime.weekday(.abbreviated)), cond: (f["condition"] as? String) ?? "cloudy",
                             hi: (f["temperature"] as? Double).map { Int($0.rounded()) }, lo: (f["templow"] as? Double).map { Int($0.rounded()) },
                             pop: (f["precipitation_probability"] as? Double).map { Int($0.rounded()) })
            }
        }
        w.loaded = true
        return w
    }
}

// MARK: places the user added

/// A place added with the plus: a name and where it is.
struct WxCity: Codable, Identifiable, Equatable {
    var name: String
    var sub: String
    var lat: Double
    var lon: Double
    var id: String { String(format: "%.3f,%.3f", lat, lon) }
}

/// One place's page: Home Assistant's weather entity for the house, Open-Meteo for a city that was added.
@Observable @MainActor
final class WxModel {
    let city: WxCity?
    let entityID: String
    var data = WeatherData()
    @ObservationIgnored private var lastForecast = Date.distantPast
    @ObservationIgnored private var busy = false

    init(city: WxCity?, entityID: String) {
        self.city = city; self.entityID = entityID
        data.place = city?.name ?? HomePlace.cached ?? ""
    }

    func refresh(demo: Bool) async {
        guard !busy else { return }
        busy = true; defer { busy = false }
        if let c = city {
            if let w = await OpenMeteo.load(c) { data = w }
            return
        }
        if demo { var s = WeatherData.sample; s.place = "Home"; data = s; return }
        let due = Date().timeIntervalSince(lastForecast) > 15 * 60
        if var w = await WeatherData.load(entityID, keeping: data, forecasts: due) {
            if let p = await HomePlace.name() { w.place = p }
            data = w
            if due { lastForecast = Date() }
        }
    }
}

@Observable @MainActor
final class WxStore {
    var cities: [WxCity] = []
    let entityID: String
    var demo = false
    @ObservationIgnored private var models: [String: WxModel] = [:]

    init(entityID: String) {
        self.entityID = entityID
        cities = UserDefaults.standard.data(forKey: "weatherCities").flatMap { try? JSONDecoder().decode([WxCity].self, from: $0) } ?? []
    }

    private func cache() { if let d = try? JSONEncoder().encode(cities) { UserDefaults.standard.set(d, forKey: "weatherCities") } }
    /// kept on the phone and in the card's settings in Home Assistant (one list for the app and the card)
    private func write() { cache(); if !demo { let list = cities; Task { await CardSettings.saveCities(list) } } }

    /// the card's list of cities is the list (it may have been changed there): read it when the screen opens
    func syncFromCard() async {
        guard !demo, let remote = await CardSettings.cities(), remote != cities else { return }
        cities = remote; cache()
    }

    func model(_ city: WxCity?) -> WxModel {
        let k = city?.id ?? "home"
        if let m = models[k] { return m }
        let m = WxModel(city: city, entityID: entityID)
        models[k] = m
        return m
    }

    /// the page the city is on (0 is the house)
    @discardableResult func add(_ c: WxCity) -> Int {
        if let i = cities.firstIndex(where: { $0.id == c.id }) { return i + 1 }
        cities.append(c); write()
        return cities.count
    }

    func remove(_ c: WxCity) { cities.removeAll { $0.id == c.id }; models[c.id] = nil; write() }
}

// MARK: Open-Meteo (cities that are not the house: no key, no account)

enum OpenMeteo {
    static func search(_ q: String) async -> [WxCity] {
        guard var c = URLComponents(string: "https://geocoding-api.open-meteo.com/v1/search") else { return [] }
        c.queryItems = [URLQueryItem(name: "name", value: q), URLQueryItem(name: "count", value: "10"), URLQueryItem(name: "language", value: "en"), URLQueryItem(name: "format", value: "json")]
        guard let url = c.url, let (d, _) = try? await URLSession.shared.data(from: url),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any], let list = o["results"] as? [[String: Any]] else { return [] }
        return list.compactMap { r in
            guard let name = r["name"] as? String, let lat = (r["latitude"] as? NSNumber)?.doubleValue, let lon = (r["longitude"] as? NSNumber)?.doubleValue else { return nil }
            let sub = [r["admin1"] as? String, r["country"] as? String].compactMap { $0 }.joined(separator: ", ")
            return WxCity(name: name, sub: sub, lat: lat, lon: lon)
        }
    }

    /// Open-Meteo's weather codes as the words Home Assistant uses (the pictures and colours follow those)
    static func condition(_ code: Int, day: Bool) -> String {
        switch code {
        case 0, 1: return day ? "sunny" : "clear-night"
        case 2: return "partlycloudy"
        case 3: return "cloudy"
        case 45, 48: return "fog"
        case 51, 53, 55, 56, 57, 61, 63, 66, 67, 80, 81: return "rainy"
        case 65, 82: return "pouring"
        case 71, 73, 75, 77, 85, 86: return "snowy"
        case 95: return "lightning"
        case 96, 99: return "lightning-rainy"
        default: return "cloudy"
        }
    }

    static func load(_ c: WxCity) async -> WeatherData? {
        let f = (UserDefaults.standard.string(forKey: "haTempUnit") ?? "°F") == "°F"
        guard var comps = URLComponents(string: "https://api.open-meteo.com/v1/forecast") else { return nil }
        comps.queryItems = [
            URLQueryItem(name: "latitude", value: String(c.lat)), URLQueryItem(name: "longitude", value: String(c.lon)),
            URLQueryItem(name: "current", value: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover"),
            URLQueryItem(name: "hourly", value: "temperature_2m,weather_code,is_day,dew_point_2m,visibility"),
            URLQueryItem(name: "daily", value: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max"),
            URLQueryItem(name: "forecast_days", value: "16"), URLQueryItem(name: "timezone", value: "auto"),
            URLQueryItem(name: "temperature_unit", value: f ? "fahrenheit" : "celsius"), URLQueryItem(name: "wind_speed_unit", value: f ? "mph" : "kmh"),
        ]
        guard let url = comps.url, let (d, _) = try? await URLSession.shared.data(from: url),
              let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any],
              let cur = o["current"] as? [String: Any], let hr = o["hourly"] as? [String: Any], let dy = o["daily"] as? [String: Any] else { return nil }
        let tz = TimeZone(identifier: (o["timezone"] as? String) ?? "") ?? .current
        let tf = DateFormatter(); tf.locale = Locale(identifier: "en_US_POSIX"); tf.timeZone = tz; tf.dateFormat = "yyyy-MM-dd'T'HH:mm"
        let df = DateFormatter(); df.locale = Locale(identifier: "en_US_POSIX"); df.timeZone = tz; df.dateFormat = "yyyy-MM-dd"
        let wd = DateFormatter(); wd.timeZone = tz; wd.setLocalizedDateFormatFromTemplate("EEE")
        let hf = DateFormatter(); hf.timeZone = tz; hf.setLocalizedDateFormatFromTemplate("j")
        let tm = DateFormatter(); tm.timeZone = tz; tm.dateStyle = .none; tm.timeStyle = .short
        func num(_ x: Any?) -> Double? { (x as? NSNumber)?.doubleValue }
        func arr(_ d: [String: Any], _ k: String) -> [Any] { (d[k] as? [Any]) ?? [] }

        let isDay = (num(cur["is_day"]) ?? 1) == 1
        var w = WeatherData()
        w.place = c.name
        w.tz = tz
        w.night = !isDay
        w.cond = condition(Int(num(cur["weather_code"]) ?? 3), day: isDay)
        w.temp = num(cur["temperature_2m"]).map { Int($0.rounded()) }

        // the hours: from the hour that is on now, as many as there are (up to a week)
        let times = arr(hr, "time").compactMap { $0 as? String }
        let nowT = (cur["time"] as? String).flatMap { tf.date(from: $0) } ?? Date()
        let start = times.firstIndex { (tf.date(from: $0) ?? .distantPast) >= nowT.addingTimeInterval(-3599) } ?? 0
        let temps = arr(hr, "temperature_2m"), codes = arr(hr, "weather_code"), days = arr(hr, "is_day"), dews = arr(hr, "dew_point_2m"), vis = arr(hr, "visibility")
        var hours: [WxHour] = []
        for i in start..<min(times.count, start + 168) {
            guard let t = tf.date(from: times[i]) else { continue }
            let hourNum = Calendar.current.dateComponents(in: tz, from: t).hour ?? 0
            let day = (num(i < days.count ? days[i] : nil) ?? 1) == 1
            let label = hours.isEmpty ? "Now" : (hourNum == 0 ? wd.string(from: t) : hf.string(from: t))
            hours.append(WxHour(id: hours.count, label: label, cond: condition(Int(num(i < codes.count ? codes[i] : nil) ?? 3), day: day), temp: num(i < temps.count ? temps[i] : nil).map { Int($0.rounded()) }, night: !day))
        }
        w.hours = hours

        // the days
        let dt = arr(dy, "time").compactMap { $0 as? String }, dc = arr(dy, "weather_code"), dmax = arr(dy, "temperature_2m_max"), dmin = arr(dy, "temperature_2m_min"), dp = arr(dy, "precipitation_probability_max")
        w.days = dt.enumerated().compactMap { i, s in
            guard let t = df.date(from: s) else { return nil }
            return WxDay(id: i, date: t, label: wd.string(from: t), cond: condition(Int(num(i < dc.count ? dc[i] : nil) ?? 3), day: true),
                         hi: num(i < dmax.count ? dmax[i] : nil).map { Int($0.rounded()) }, lo: num(i < dmin.count ? dmin[i] : nil).map { Int($0.rounded()) },
                         pop: num(i < dp.count ? dp[i] : nil).map { Int($0.rounded()) })
        }

        // the details
        var rows: [WxRow] = []
        func push(_ id: String, _ label: String, _ v: String?) { if let v { rows.append(WxRow(id: id, label: label, value: v)) } }
        let windUnit = f ? "mph" : "km/h"
        push("feels", "Feels like", num(cur["apparent_temperature"]).map { WeatherData.n($0) + "°" })
        push("humidity", "Humidity", num(cur["relative_humidity_2m"]).map { WeatherData.n($0) + "%" })
        if let ws = num(cur["wind_speed_10m"]) { push("wind", "Wind", "\(WeatherData.n(ws)) \(windUnit) \(WeatherData.compass(num(cur["wind_direction_10m"])))".trimmingCharacters(in: .whitespaces)) }
        if let g = num(cur["wind_gusts_10m"]) { push("gusts", "Gusts", "\(WeatherData.n(g)) \(windUnit)") }
        if let p = num(cur["pressure_msl"]) { push("pressure", "Pressure", f ? String(format: "%.2f inHg", p * 0.02953) : "\(WeatherData.n(p)) hPa") }
        if start < vis.count, let v = num(vis[start]) { push("visibility", "Visibility", f ? WeatherData.n(v / 1609.34, v / 1609.34 < 10 ? 1 : 0) + " mi" : WeatherData.n(v / 1000, v / 1000 < 10 ? 1 : 0) + " km") }
        if start < dews.count, let v = num(dews[start]) { push("dew", "Dew point", WeatherData.n(v) + "°") }
        if let u = num(arr(dy, "uv_index_max").first) { push("uv", "UV index", WeatherData.n(u, 1)) }
        push("clouds", "Clouds", num(cur["cloud_cover"]).map { WeatherData.n($0) + "%" })
        if let s = arr(dy, "sunrise").first as? String, let t = tf.date(from: s) { push("sunrise", "Sunrise", tm.string(from: t)) }
        if let s = arr(dy, "sunset").first as? String, let t = tf.date(from: s) { push("sunset", "Sunset", tm.string(from: t)) }
        w.rows = rows
        w.loaded = true
        return w
    }
}
