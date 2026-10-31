import SwiftUI

struct RootView: View {
    @Environment(HomeStore.self) private var store

    var body: some View {
        @Bindable var store = store
        if UserDefaults.standard.bool(forKey: "lightsSheet") {
            LightsSheet()
        } else if UserDefaults.standard.bool(forKey: "feederSheet") {
            FeederSheet()
        } else if UserDefaults.standard.bool(forKey: "iconSheet") {
            IconSheet()
        } else if store.isSignedIn {
            // no tabs and no menus: Paul's real Okie Motor dashboard fills the screen (its own lock page first); the sample mode shows the native look-alike
            ZStack {
                Color(DashboardWeb.background).ignoresSafeArea()
                if store.demo {
                    Wallpaper()
                    HomeView()
                    if store.locked {
                        LockPage { withAnimation(.easeInOut(duration: 0.45)) { store.locked = false } }
                            .transition(.move(edge: .top).combined(with: .opacity))
                            .zIndex(1)
                    }
                } else if let session = store.session {
                    DashboardWeb(session: session, reload: store.reloadCount, openID: store.openEntity, openToken: store.openToken,
                                 paused: store.widgetScreenOpen, onOpened: { withAnimation(.easeOut(duration: 0.18)) { store.openCover = false } }, onHome: { store.leaveToHomeScreen() }).ignoresSafeArea()
                    if store.openCover { OpenCover(entityID: store.openEntity).transition(.opacity) }
                }
            }
            .fullScreenCover(isPresented: Binding(get: { store.widgetScreen != nil }, set: { if !$0 { store.clearWidgetScreens() } })) {
                switch store.widgetScreen {
                case .thermostat(let id): ThermostatScreen(entityID: id, onClose: { store.closeThermostat() }).id("t-" + id)
                case .weather(let id): WeatherScreen(entityID: id, onClose: { store.closeWeather() }).id("w-" + id)
                case .calendar: CalendarScreen(onClose: { store.closeCalendar() })
                case nil: Color.clear
                }
            }
            .fullScreenCover(isPresented: $store.showCalendar) {
                ZStack { Wallpaper(); CalendarView(onClose: { store.showCalendar = false }) }
            }
        } else {
            ZStack {
                Wallpaper()
                SignInView()
            }
        }
    }
}

/// What shows over the dashboard while a widget's device screen opens (the card takes a moment to start): for a thermostat its name, temperature and mode right away, so the wait is not a blank screen.
struct OpenCover: View {
    @Environment(HomeStore.self) private var store
    var entityID: String?
    @State private var fetched: HAEntity?

    private var info: ThermoInfo? {
        guard let id = entityID, id.hasPrefix("climate."), let e = store.entity(id) ?? fetched else { return nil }
        return ThermoInfo(e, entityID: id)
    }

    var body: some View {
        ZStack {
            Color(DashboardWeb.background).ignoresSafeArea()
            if let i = info {
                VStack(alignment: .leading, spacing: 0) {
                    Text(i.name.uppercased()).font(OkieFont.manrope(700, 14)).tracking(2.4).foregroundStyle(.white.opacity(0.7))
                    Text(i.status).font(OkieFont.manrope(700, 17)).foregroundStyle(i.off || i.unavailable ? .white.opacity(0.5) : i.color).padding(.top, 6)
                    Text("TEMPERATURE, \(i.unit)").font(OkieFont.manrope(700, 12)).tracking(2.2).foregroundStyle(.white.opacity(0.6)).padding(.top, 70)
                    Text(ThermoInfo.fmt(i.target)).font(OkieFont.sora(800, 126)).foregroundStyle(.white.opacity(i.off ? 0.35 : 1)).fixedSize().padding(.top, 6)
                    if let c = i.current { Text("Now \(ThermoInfo.fmt(c))\(i.unit)").font(OkieFont.manrope(600, 17)).foregroundStyle(.white.opacity(0.62)).padding(.top, 4) }
                    ProgressView().tint(.white.opacity(0.5)).padding(.top, 36)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.leading, 26).padding(.top, 150)
            } else {
                ProgressView().tint(.white.opacity(0.7)).scaleEffect(1.2)
            }
        }
        .task {
            guard let id = entityID, id.hasPrefix("climate."), store.entity(id) == nil else { return }
            fetched = try? await HAClient.shared.state(id)
        }
    }
}

struct Wallpaper: View {
    var body: some View {
        GeometryReader { g in
            Image("room")
                .resizable().scaledToFill()
                .frame(width: g.size.width, height: g.size.height)
                .clipped()
                .overlay(Color(red: 18 / 255, green: 15 / 255, blue: 12 / 255).opacity(0.46))
        }
        .ignoresSafeArea()
    }
}
