import Foundation

/// Sample data so the app can be looked at (and tried) without a Home Assistant: the same things the real one has.
enum Demo {
    static func entities() -> [HAEntity] {
        func e(_ id: String, _ state: String, _ a: [String: JSONValue]) -> HAEntity { HAEntity(entityId: id, state: state, attributes: a) }
        let fed = HADate.string(Date().addingTimeInterval(-3 * 3600))
        return [
            e("climate.living_room", "cool", ["friendly_name": .string("Google Nest"), "current_temperature": .number(69), "temperature": .number(70), "hvac_action": .string("idle"),
                                              "min_temp": .number(50), "max_temp": .number(90), "target_temp_step": .number(1), "current_humidity": .number(70),
                                              "hvac_modes": .array([.string("off"), .string("heat"), .string("cool"), .string("heat_cool")])]),
            e("weather.forecast_home", "sunny", ["temperature": .number(68), "friendly_name": .string("Home")]),
            e("switch.bedlight", "on", ["friendly_name": .string("bedLight")]),
            e("light.living_room_lamp", "on", ["friendly_name": .string("Living Room Lamp"), "brightness": .number(180), "supported_color_modes": .array([.string("brightness")])]),
            e("light.kitchen", "off", ["friendly_name": .string("Kitchen"), "supported_color_modes": .array([.string("onoff")])]),
            e("script.feed_the_beasts_2", "off", ["friendly_name": .string("Feed The Beasts"), "last_triggered": .string(fed)]),
            e("script.govee_cozy_lights", "off", ["friendly_name": .string("Cozy lights")]),
            e("script.govee_lets_go_to_sleep", "off", ["friendly_name": .string("Let's go to sleep")]),
            e("script.govee_turn_up_the_lights", "off", ["friendly_name": .string("Turn up the lights")]),
            e("calendar.family", "off", ["friendly_name": .string("Family")]),
            e("calendar.holidays", "off", ["friendly_name": .string("Holidays")]),
        ]
    }

    /// A week that repeats: something every day, one all-day event.
    static func events(calendar: String, from: Date, to: Date) -> [CalendarEvent] {
        let cal = Calendar.current
        var out: [CalendarEvent] = []
        var day = cal.startOfDay(for: from)
        func at(_ d: Date, _ h: Int, _ m: Int = 0) -> Date { cal.date(bySettingHour: h, minute: m, second: 0, of: d) ?? d }
        while day < to {
            let wd = cal.component(.weekday, from: day)          // 1 = Sunday
            let next = cal.date(byAdding: .day, value: 1, to: day) ?? day
            if calendar == "calendar.family" {
                switch wd {
                case 2: out.append(CalendarEvent(calendar: calendar, summary: "Dentist – Alex", start: at(day, 8, 30), end: at(day, 9, 30), allDay: false, location: nil))
                case 3: out.append(CalendarEvent(calendar: calendar, summary: "Dinner with the Millers", start: at(day, 18), end: at(day, 19, 30), allDay: false, location: nil))
                case 4: out.append(CalendarEvent(calendar: calendar, summary: "Lunch with Sam", start: at(day, 12), end: at(day, 13), allDay: false, location: nil))
                case 5: out.append(CalendarEvent(calendar: calendar, summary: "Trash day", start: day, end: next, allDay: true, location: nil))
                case 6: out.append(CalendarEvent(calendar: calendar, summary: "Movie night", start: at(day, 19), end: at(day, 22), allDay: false, location: nil))
                case 7: out.append(CalendarEvent(calendar: calendar, summary: "Farmers market", start: at(day, 10), end: at(day, 11, 30), allDay: false, location: nil))
                default: out.append(CalendarEvent(calendar: calendar, summary: "Call Mom", start: at(day, 14), end: at(day, 15), allDay: false, location: nil))
                }
            } else if calendar == "calendar.holidays", cal.component(.day, from: day) == 31, cal.component(.month, from: day) == 10 {
                out.append(CalendarEvent(calendar: calendar, summary: "Halloween", start: day, end: next, allDay: true, location: nil))
            }
            day = next
        }
        return out.filter { $0.start < to && $0.end > from }
    }
}
