import SwiftUI
import WidgetKit

@main
struct OkieWidgetBundle: WidgetBundle {
    var body: some Widget {
        ThermostatWidget()
        LightsWidget()
        FeederWidget()
        CalendarWidget()
        WeatherWidget()
    }
}
