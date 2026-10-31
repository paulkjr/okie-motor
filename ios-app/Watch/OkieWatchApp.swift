import SwiftUI

@main
struct OkieWatchApp: App {
    @State private var model = WatchModel()
    @State private var lights = WatchLightsModel()
    @State private var vacuum = WatchVacuumModel()
    var body: some Scene {
        WindowGroup {
            WatchRoot()
                .environment(model)
                .environment(lights)
                .environment(vacuum)
                .preferredColorScheme(.dark)
        }
    }
}
