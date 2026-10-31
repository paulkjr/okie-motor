import SwiftUI

@main
struct OkieHomeApp: App {
    @State private var store = HomeStore()
    init() { WatchLink.shared.start(); _ = AppClock.start; NSLog("[okie-timing] the process was %.2fs old when our code started", AppClock.beforeOurCode) }
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .preferredColorScheme(.dark)
                .onAppear {
                    store.becameActive()
                    if !store.isSignedIn, UserDefaults.standard.bool(forKey: "demoMode") { store.enterDemo() }      // launch argument -demoMode YES
                    if store.isSignedIn { store.start() }
                }
                .onOpenURL { store.open($0) }
                .onChange(of: phase) { _, p in
                    if p == .background { store.movedToBackground() }
                    if p == .active { store.becameActive(); if store.isSignedIn { store.start(); WatchLink.shared.push() } }
                }
        }
    }
}
