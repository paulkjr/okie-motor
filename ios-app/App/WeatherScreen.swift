import SwiftUI

/// What a tap on the weather widget opens, laid out like the iPhone's own Weather app: one page per place (the house first, then the cities added with the plus), swiped sideways; on each page
/// the sky with the place, the big picture and the temperature, and scrolled up the hours, the 10 days and the details. It reads Home Assistant (and Open-Meteo for the added cities) itself.
struct WeatherScreen: View {
    @Environment(HomeStore.self) private var store
    let entityID: String
    var onClose: () -> Void

    @State private var wx: WxStore
    @State private var page = 0
    @State private var listing = false
    @State private var adding = false

    init(entityID: String, onClose: @escaping () -> Void) {
        self.entityID = entityID; self.onClose = onClose
        _wx = State(initialValue: WxStore(entityID: entityID))
    }

    var body: some View {
        ZStack {
            TabView(selection: $page) {
                WeatherPage(model: wx.model(nil), isHome: true, demo: store.demo).tag(0)
                ForEach(Array(wx.cities.enumerated()), id: \.element.id) { i, c in
                    WeatherPage(model: wx.model(c), isHome: false, demo: store.demo).tag(i + 1)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea()                      // the pages measure the whole screen, like the card's: the picture runs under the status bar
            fades
            bar
            Button(action: onClose) {
                Text("Close").font(.system(size: 17)).foregroundStyle(.white)
                    .padding(.horizontal, 18).padding(.vertical, 10).contentShape(Rectangle())
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(.top, 6)
        }
        .foregroundStyle(.white)
        .preferredColorScheme(.dark)
        .task { wx.demo = store.demo; await wx.syncFromCard() }
        .onChange(of: wx.cities.count) { _, n in if page > n { page = 0 } }
        .sheet(isPresented: $listing) {
            WxListSheet(wx: wx, demo: store.demo, onPick: { i in withAnimation { page = i } }, onAdd: { listing = false; DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { adding = true } })
        }
        .sheet(isPresented: $adding) {
            WxAddSheet(onPick: { c in let i = wx.add(c); DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { withAnimation { page = i } } })
        }
    }

    /// the page scrolls under the clock and under the bar: a soft blur at both ends keeps them readable
    private var fades: some View {
        VStack(spacing: 0) {
            Rectangle().fill(.ultraThinMaterial).frame(height: 132).mask(LinearGradient(colors: [.black, .black.opacity(0)], startPoint: .top, endPoint: .bottom))
            Spacer(minLength: 0).allowsHitTesting(false)
            Rectangle().fill(.ultraThinMaterial).frame(height: 120).mask(LinearGradient(colors: [.black.opacity(0), .black], startPoint: .top, endPoint: .bottom))
        }
        .ignoresSafeArea().allowsHitTesting(false)
    }

    /// the bar at the bottom: the plus for another city, the places as dots (the arrow is the house), the list of places
    private var bar: some View {
        GeometryReader { g in
            HStack(spacing: 10) {
                Button { Haptic.web(8); adding = true } label: {
                    Image(systemName: "plus").font(.system(size: 22, weight: .medium)).frame(width: 56, height: 56).modifier(CalGlass()).contentShape(Circle())
                }
                Spacer(minLength: 0)
                HStack(spacing: 14) {
                    ForEach(0...wx.cities.count, id: \.self) { i in
                        Button { withAnimation { page = i } } label: {
                            Group {
                                if i == 0 { Image(systemName: "location.fill").font(.system(size: 12, weight: .bold)).opacity(page == 0 ? 1 : 0.45) }
                                else { Circle().fill(.white.opacity(page == i ? 1 : 0.4)).frame(width: 8, height: 8) }
                            }
                            .frame(minWidth: 14, minHeight: 28)
                        }
                    }
                }
                .padding(.horizontal, 18).frame(height: 56).modifier(CalGlass())
                Spacer(minLength: 0)
                Button { Haptic.web(8); listing = true } label: {
                    Image(systemName: "list.bullet").font(.system(size: 20, weight: .medium)).frame(width: 56, height: 56).modifier(CalGlass()).contentShape(Circle())
                }
            }
            .buttonStyle(.plain)
            .frame(width: g.size.width - 32)
            .position(x: g.size.width / 2, y: g.size.height * 0.952)
        }
        .ignoresSafeArea()
    }
}

// MARK: one place

private struct WxScrollKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// how far the page is scrolled (iOS 18 and later; before that the preference above does it)
private struct WxOffset: ViewModifier {
    @Binding var offset: CGFloat
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollGeometryChange(for: CGFloat.self, of: { $0.contentOffset.y + $0.contentInsets.top }, action: { _, new in offset = new })
        } else { content }
    }
}

private struct WeatherPage: View {
    var model: WxModel
    var isHome: Bool
    var demo: Bool
    @State private var scrolled: CGFloat = 0

    var body: some View {
        let w = model.data
        GeometryReader { g in
            ZStack {
                WxSky(night: w.night, cond: w.cond)
                // scrolling down fades the sky to dark, so the details read on a calm ground
                Color.black.opacity(0.78 * Double(min(1, max(0, scrolled / (g.size.height * 0.6))))).ignoresSafeArea().allowsHitTesting(false)
                ScrollView {
                    VStack(spacing: 0) {
                        hero(w, W: g.size.width, H: g.size.height).frame(width: g.size.width, height: g.size.height)
                        WxDetails(w: w, H: g.size.height).padding(.bottom, 140)
                    }
                    .background(GeometryReader { gp in Color.clear.preference(key: WxScrollKey.self, value: -gp.frame(in: .named("wxs")).minY) })
                }
                .coordinateSpace(name: "wxs")
                .onPreferenceChange(WxScrollKey.self) { scrolled = $0 }
                .modifier(WxOffset(offset: $scrolled))
                .scrollIndicators(.hidden)
            }
        }
        .ignoresSafeArea()
        .task { while !Task.isCancelled { await model.refresh(demo: demo); try? await Task.sleep(nanoseconds: 60_000_000_000) } }
    }

    // The first screen of the page: every place is a fraction of the whole screen (read off the design picture of how it should look).
    private func hero(_ w: WeatherData, W: CGFloat, H: CGFloat) -> some View {
        ZStack {
            Text(w.dateText).font(.system(size: 22, weight: .light)).position(x: W / 2, y: H * 0.144)
            HStack(spacing: 7) {
                if isHome { Image(systemName: "location.fill").font(.system(size: 17, weight: .semibold)) }
                Text(w.place).font(.system(size: 25, weight: .bold)).lineLimit(1)
            }
            .padding(.horizontal, 30).position(x: W / 2, y: H * 0.177)
            WeatherGlyph(condition: w.cond, night: w.night, size: W * 0.48, line: 0.62).position(x: W / 2, y: H * 0.3745)
            Text(WxText.condition(w.cond)).font(.system(size: 24, weight: .light)).position(x: W / 2, y: H * 0.508)
            Text(w.temp.map { "\($0)°" } ?? "–").font(.system(size: W * 0.335, weight: .ultraLight)).monospacedDigit().position(x: W / 2, y: H * 0.600)
            daysRow(w, W: W, H: H)
        }
    }

    /// the next days, six at a time; swipe the row sideways for the rest
    private func daysRow(_ w: WeatherData, W: CGFloat, H: CGFloat) -> some View {
        let cw = W * 0.157, top = H * 0.7565, rowH = H * 0.14
        func y(_ f: CGFloat) -> CGFloat { (f - 0.7565) * H }
        return ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
                ForEach(w.days) { d in
                    ZStack {
                        Text(d.label).font(.system(size: 14)).opacity(0.9).position(x: cw / 2, y: y(0.769))
                        WeatherGlyph(condition: d.cond, night: false, size: 36, line: 1.5).position(x: cw / 2, y: y(0.809))
                        Text(d.hi.map { "\($0)°" } ?? "").font(.system(size: 18, weight: .semibold)).position(x: cw / 2, y: y(0.850))
                        Text(d.lo.map { "\($0)°" } ?? "").font(.system(size: 16)).opacity(0.55).position(x: cw / 2, y: y(0.884))
                    }
                    .frame(width: cw, height: rowH)
                }
            }
            .scrollTargetLayout()
        }
        .contentMargins(.horizontal, W * 0.0285, for: .scrollContent)
        .scrollTargetBehavior(.viewAligned)
        .frame(width: W, height: rowH)
        .position(x: W / 2, y: top + rowH / 2)
    }
}

enum WxText {
    static func condition(_ s: String) -> String {
        ["sunny": "Sunny", "clear-night": "Clear night", "partlycloudy": "Partly cloudy", "cloudy": "Cloudy", "rainy": "Rain", "pouring": "Heavy rain", "snowy": "Snow",
         "snowy-rainy": "Sleet", "lightning": "Thunder", "lightning-rainy": "Thunderstorm", "fog": "Fog", "hail": "Hail", "windy": "Windy", "windy-variant": "Windy", "exceptional": "Exceptional"][s] ?? s.capitalized
    }
}

// MARK: the sky

private struct WxSky: View {
    var night: Bool
    var cond: String

    /// the day sky, read off the design picture of how it should look (final colours, top to bottom): no extra darkening on top of it
    private static let daySkyData: [[Double]] = [
        [0.00, 12, 49, 90], [0.05, 15, 53, 99], [0.10, 17, 58, 109], [0.15, 20, 66, 120], [0.20, 23, 74, 133], [0.25, 27, 82, 146], [0.30, 31, 91, 157], [0.35, 35, 98, 167],
        [0.40, 38, 104, 175], [0.45, 44, 112, 183], [0.50, 47, 118, 190], [0.55, 50, 123, 197], [0.60, 52, 128, 201], [0.65, 56, 134, 206], [0.70, 56, 136, 207], [0.75, 54, 131, 202],
        [0.80, 50, 125, 197], [0.85, 48, 122, 193], [0.90, 56, 131, 199], [0.95, 69, 145, 212], [1.00, 82, 158, 224],
    ]
    private static var daySky: [Gradient.Stop] {
        daySkyData.map { (r: [Double]) -> Gradient.Stop in
            Gradient.Stop(color: Color(red: r[1] / 255, green: r[2] / 255, blue: r[3] / 255), location: r[0])
        }
    }

    var body: some View {
        ZStack {
            if !night && cond != "rainy" && cond != "pouring" {
                LinearGradient(stops: Self.daySky, startPoint: .top, endPoint: .bottom)
            } else {
                LinearGradient(colors: night ? [Color(red: 6 / 255, green: 21 / 255, blue: 42 / 255), Color(red: 10 / 255, green: 45 / 255, blue: 68 / 255), Color(red: 14 / 255, green: 106 / 255, blue: 103 / 255)]
                                             : [Color(red: 44 / 255, green: 62 / 255, blue: 85 / 255), Color(red: 70 / 255, green: 103 / 255, blue: 138 / 255)],
                               startPoint: .top, endPoint: .bottom)
                LinearGradient(stops: [.init(color: .black.opacity(0.35), location: 0), .init(color: .clear, location: 0.3), .init(color: .clear, location: 0.7), .init(color: .black.opacity(0.25), location: 1)], startPoint: .top, endPoint: .bottom)
            }
            if night { Stars() }
        }
        .ignoresSafeArea()
    }
}

// MARK: scrolled up: the details and the next hours (our own plain look: rows with thin lines, no cards)

private struct WxDetails: View {
    var w: WeatherData
    var H: CGFloat

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(spacing: 2) {
                Text(w.dateText).font(.system(size: 22, weight: .light))
                Text(w.place).font(.system(size: 22, weight: .bold))
            }
            .frame(maxWidth: .infinity).padding(.top, 48)
            VStack(spacing: 0) {
                ForEach(w.rows) { r in
                    HStack { Text(r.label).opacity(0.7); Spacer(); Text(r.value) }
                        .font(.system(size: 17)).padding(.vertical, 13)
                        .overlay(alignment: .bottom) { Rectangle().fill(.white.opacity(0.18)).frame(height: 1) }
                }
            }
            .padding(.top, 28)
            if !w.hours.isEmpty {
                Text("NEXT HOURS").font(.system(size: 12, weight: .semibold)).tracking(1.4).opacity(0.7).padding(.top, 26)
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(spacing: 20) {
                        ForEach(w.hours) { h in
                            VStack(spacing: 8) {
                                Text(h.label).font(.system(size: 14)).opacity(0.8)
                                WeatherGlyph(condition: h.cond, night: h.night, size: 34, line: 1.5)
                                Text(h.temp.map { "\($0)°" } ?? "").font(.system(size: 18, weight: .semibold))
                            }
                        }
                    }
                    .padding(.vertical, 12)
                }
            }
        }
        .padding(.horizontal, 24)
    }
}

// MARK: the places: list, add

private struct WxListSheet: View {
    @Environment(\.dismiss) private var dismiss
    var wx: WxStore
    var demo: Bool
    var onPick: (Int) -> Void
    var onAdd: () -> Void

    var body: some View {
        NavigationStack {
            List {
                row(wx.model(nil), subtitle: "My Location", page: 0, home: true)
                ForEach(Array(wx.cities.enumerated()), id: \.element.id) { i, c in row(wx.model(c), subtitle: c.sub, page: i + 1, home: false) }
                    .onDelete { idx in for i in idx { wx.remove(wx.cities[i]) } }
            }
            .navigationTitle("Weather").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .primaryAction) { Button { onAdd() } label: { Image(systemName: "plus") } }
            }
        }
        .preferredColorScheme(.dark)
    }

    private func row(_ m: WxModel, subtitle: String, page: Int, home: Bool) -> some View {
        Button { dismiss(); onPick(page) } label: {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) { if home { Image(systemName: "location.fill").font(.system(size: 12)) }; Text(m.data.place.isEmpty ? "…" : m.data.place).font(.system(size: 18, weight: .semibold)) }
                    Text(subtitle.isEmpty ? WxText.condition(m.data.cond) : subtitle).font(.system(size: 14)).foregroundStyle(.white.opacity(0.55))
                }
                Spacer()
                if m.data.loaded { WeatherGlyph(condition: m.data.cond, night: m.data.night, size: 28, line: 1.5) }
                Text(m.data.temp.map { "\($0)°" } ?? "").font(.system(size: 26, weight: .light)).frame(minWidth: 52, alignment: .trailing)
            }
            .foregroundStyle(.white)
        }
        .task { await m.refresh(demo: demo) }
    }
}

private struct WxAddSheet: View {
    @Environment(\.dismiss) private var dismiss
    var onPick: (WxCity) -> Void
    @State private var query = ""
    @State private var results: [WxCity] = []
    @State private var searching = false

    var body: some View {
        NavigationStack {
            List {
                if searching { ProgressView() }
                else if query.trimmingCharacters(in: .whitespaces).count >= 2 && results.isEmpty { Text("No city found").foregroundStyle(.secondary) }
                ForEach(results) { c in
                    Button { onPick(c); dismiss() } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(c.name).font(.system(size: 17, weight: .semibold)).foregroundStyle(.white)
                            if !c.sub.isEmpty { Text(c.sub).font(.system(size: 14)).foregroundStyle(.white.opacity(0.55)) }
                        }
                    }
                }
            }
            .navigationTitle("Add city").navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "City")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .task(id: query) {
                let q = query.trimmingCharacters(in: .whitespaces)
                guard q.count >= 2 else { results = []; return }
                searching = true
                try? await Task.sleep(nanoseconds: 350_000_000)
                guard !Task.isCancelled else { return }
                let r = await OpenMeteo.search(q)
                if !Task.isCancelled { results = r; searching = false }
            }
        }
        .preferredColorScheme(.dark)
    }
}

/// A fixed scatter of stars for the night sky (the same every time, so the sky does not jump).
struct Stars: View {
    var body: some View {
        Canvas { ctx, size in
            var seed: UInt64 = 7
            func next() -> Double { seed = seed &* 6364136223846793005 &+ 1442695040888963407; return Double((seed >> 33) & 0xFFFFFF) / Double(0xFFFFFF) }
            for _ in 0..<70 {
                let x = next() * size.width, y = next() * size.height * 0.7, r = 0.6 + next() * 1.5, a = 0.35 + next() * 0.6
                ctx.fill(Path(ellipseIn: CGRect(x: x, y: y, width: r * 2, height: r * 2)), with: .color(.white.opacity(a)))
            }
        }
        .allowsHitTesting(false)
    }
}
