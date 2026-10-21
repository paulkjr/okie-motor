import SwiftUI
import WebKit
import WidgetKit
import UniformTypeIdentifiers

/// The Okie Motor dashboard of your Home Assistant, full screen, signed in with the app's own sign-in (it hands the tokens to the page, so there is no second login).
/// The card draws everything itself: lock page, search with the assistant, cards, dock, settings. Nothing of the app is in front of it.
/// Seconds since the app process started touching this (used for the "[okie-timing]" lines in the log, to see where a cold start spends its time).
enum AppClock {
    static let start = Date()
    static var seconds: Double { Date().timeIntervalSince(start) }
    /// How long the process had already been alive when the app's own code started (the system's launch work: loading the app, the Swift runtime, the debug library of a debug build).
    static var beforeOurCode: Double {
        var info = kinfo_proc(), size = MemoryLayout<kinfo_proc>.stride
        var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
        guard sysctl(&mib, 4, &info, &size, nil, 0) == 0 else { return -1 }
        let t = info.kp_proc.p_un.__p_starttime
        return start.timeIntervalSince(Date(timeIntervalSince1970: Double(t.tv_sec) + Double(t.tv_usec) / 1e6))
    }
}

struct DashboardWeb: UIViewRepresentable {
    let session: HASession
    let reload: Int          // changes when the page should start over (back from a long time away: the card's lock page again)
    var openID: String? = nil     // a widget asked for this device's full screen
    var openToken = 0
    var paused = false                  // the thermostat screen is in front (opened by a widget): the dashboard is not needed now and does not load
    var onOpened: () -> Void = {}       // the page has loaded (and had time to open the device screen): the cover can go
    var onHome: () -> Void = {}         // Back was tapped on a device screen a widget opened: leave to the Home Screen

    static let background = UIColor(red: 18 / 255, green: 15 / 255, blue: 12 / 255, alpha: 1)

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.userContentController.add(context.coordinator, name: "okieGlass")
        cfg.userContentController.add(context.coordinator, name: "okieLook")
        cfg.userContentController.add(context.coordinator, name: "okieHome")
        cfg.userContentController.add(context.coordinator, name: "okieOpened")
        cfg.userContentController.add(context.coordinator, name: "okieHaptic")
        cfg.userContentController.add(context.coordinator, name: "okieNote")
        cfg.userContentController.add(context.coordinator, name: "okieBackup")
        cfg.userContentController.add(context.coordinator, name: "okiePurge")
        cfg.userContentController.add(context.coordinator, name: "okieSpeech")
        let w = WKWebView(frame: .zero, configuration: cfg)
        w.uiDelegate = context.coordinator
        w.navigationDelegate = context.coordinator
        context.coordinator.onOpened = onOpened; context.coordinator.onHome = onHome
        context.coordinator.web = w
        context.coordinator.speech.web = w
        w.isOpaque = false
        w.backgroundColor = Self.background
        w.scrollView.backgroundColor = Self.background
        w.scrollView.contentInsetAdjustmentBehavior = .never
        w.scrollView.bounces = false
        w.allowsBackForwardNavigationGestures = false
        context.coordinator.loaded = reload
        // the dashboard starts loading at once (the same page whatever opened the app); a widget link that arrives meanwhile is handed to the page (see updateUIView)
        context.coordinator.started = true
        context.coordinator.latest = self
        start(w, coordinator: context.coordinator)
        context.coordinator.startWatchdog()
        return w
    }

    static func dismantleUIView(_ w: WKWebView, coordinator: Coordinator) { coordinator.stopWatchdog() }

    /// loads the dashboard again (the page process is gone and there is nothing to reload)
    fileprivate func restart(_ w: WKWebView, _ c: Coordinator) { start(w, coordinator: c) }

    func updateUIView(_ w: WKWebView, context: Context) {
        let c = context.coordinator
        c.onOpened = onOpened; c.onHome = onHome
        c.latest = self
        if !c.started { return }
        if paused { if !c.pageLoaded { w.stopLoading(); c.parked = true }; return }
        if c.parked { c.parked = false; start(w, coordinator: c); return }
        if c.loaded != reload { c.loaded = reload; start(w, coordinator: c); return }
        guard c.openSeen != openToken else { return }
        // a widget asked for a device screen: when the card is already running (the app was only in the background) open it right now, no reload
        if let id = openID {
            c.openSeen = openToken
            let call = "window.__okieBridge.openWhenReady(\(Coordinator.literal(id)));"
            if c.pageLoaded {
                w.evaluateJavaScript("(function(){var B=window.__okieBridge;if(!B||!B.open(\(Coordinator.literal(id)))) return false;B.arm();B.watch();return true;})()") { [weak c] r, _ in
                    guard let c, (r as? Bool) != true else { return }
                    DispatchQueue.main.async { c.openSeen = -1; start(w, coordinator: c) }            // the card was not ready: load the dashboard again with the link
                }
            } else if c.committed {
                w.evaluateJavaScript("if (window.__okieBridge) { \(call) }")          // the page is loading: the bridge opens the screen the moment the card is ready
            } else {
                c.pendingOpen = id                                                      // the page has not started yet: handed over when it does (didCommit)
            }
            return
        }
        start(w, coordinator: c)
    }

    /// Puts the sign-in where Home Assistant's own page looks for it (localStorage.hassTokens), then opens the dashboard.
    private func start(_ w: WKWebView, coordinator: Coordinator) {
        let host = session.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let tokens: [String: Any] = [
            "access_token": session.accessToken, "token_type": "Bearer", "expires_in": 1800,
            "hassUrl": host, "clientId": session.clientID, "expires": Int(session.expiresAt.timeIntervalSince1970 * 1000),
            "refresh_token": session.refreshToken,
        ]
        let ucc = w.configuration.userContentController
        ucc.removeAllUserScripts()
        if let d = try? JSONSerialization.data(withJSONObject: tokens), let js = String(data: d, encoding: .utf8) {
            ucc.addUserScript(WKUserScript(source: "try { localStorage.setItem('hassTokens', JSON.stringify(\(js))); } catch (e) {}", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        // the card keeps its Settings in localStorage "okie:settings"; its glass numbers go to the widgets so they wear the same glass
        let glass = "function s(){try{var o=JSON.parse(localStorage.getItem('okie:settings')||'{}');if(typeof o==='string')o=JSON.parse(o);window.webkit.messageHandlers.okieGlass.postMessage(JSON.stringify((o&&o.glass)||{}));}catch(e){}}s();setInterval(s,3000);"
        ucc.addUserScript(WKUserScript(source: glass, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        // the card's Dial look (Settings > Thermostat dial) goes to the big thermostat and the thermostat widget, so the wheel glows the same everywhere
        let look = "function l(){try{var o=JSON.parse(localStorage.getItem('okie:settings')||'{}');if(typeof o==='string')o=JSON.parse(o);window.webkit.messageHandlers.okieLook.postMessage(JSON.stringify((o&&o.thermo)||{}));}catch(e){}}l();setInterval(l,3000);"
        ucc.addUserScript(WKUserScript(source: look, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let path = UserDefaults.standard.string(forKey: "dashboardPath") ?? "/okie-tablet/home"
        var url = path.hasPrefix("http") ? URL(string: path) : URL(string: host + (path.hasPrefix("/") ? path : "/" + path))
        // a widget asked for a device screen: the bridge (Resources/okie-bridge.js) opens it the moment the card is ready (the card's own ?okie_open= link waits a fixed 0.9 s;
        // the bridge falls back to that link if the card never gets ready), sees when it is on screen, and takes Back on it
        var arm = ""
        if let id = openID, openToken != coordinator.openSeen { arm = "window.__okieBridge.openWhenReady(\(Coordinator.literal(id)));" }
        if let js = Bundle.main.url(forResource: "okie-bridge", withExtension: "js").flatMap({ try? String(contentsOf: $0, encoding: .utf8) }) {
            ucc.addUserScript(WKUserScript(source: js + "\n" + arm, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        } else if let id = openID, openToken != coordinator.openSeen, let u = url, var c = URLComponents(url: u, resolvingAgainstBaseURL: false) {
            c.queryItems = (c.queryItems ?? []) + [URLQueryItem(name: "okie_open", value: id)]      // no bridge in the bundle: the card's own link
            url = c.url ?? u
        }
        coordinator.openSeen = openToken
        coordinator.pageLoaded = false
        coordinator.committed = false
        coordinator.pendingOpen = nil
        NSLog("[okie-timing] loading the dashboard at +%.2fs%@", AppClock.seconds, openID != nil ? " (widget link)" : "")
        if let url { w.load(URLRequest(url: url)) }
        // the dark cover goes once the page has loaded and the card had time to open the screen (or after a few seconds whatever happens)
        DispatchQueue.main.asyncAfter(deadline: .now() + 7) { [weak coordinator] in coordinator?.onOpened() }
    }

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate, WKScriptMessageHandler, UIDocumentPickerDelegate {
        var loaded = 0
        var openSeen = 0
        var pageLoaded = false
        var started = false
        var parked = false                 // the load was stopped because the thermostat screen came first
        var committed = false              // the dashboard page has started to arrive (the bridge is in it)
        var pendingOpen: String?           // a device screen asked for before the page had started
        var latest: DashboardWeb?
        var onOpened: () -> Void = {}
        var onHome: () -> Void = {}
        weak var web: WKWebView?
        let speech = SpeechBridge()

        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            committed = true
            if let id = pendingOpen { pendingOpen = nil; webView.evaluateJavaScript("if (window.__okieBridge) { window.__okieBridge.openWhenReady(\(Self.literal(id))); }") }
        }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { pageLoaded = true; finishedAt = Date(); NSLog("[okie-timing] page finished loading at +%.2fs", AppClock.seconds) }
        /// A web content process that was thrown out while the app was away: start over next time.
        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { pageLoaded = false; webView.reload() }

        // MARK: the page that stays black (an iPad glitch: only a strip at the top is drawn, the rest stays black until the app is restarted)
        // Every few seconds, and whenever the app comes back, the page is asked how big it thinks the screen is. If it does not answer, or its viewport is not the size of the web view
        // (a collapsed viewport), it is nudged (layout, scroll back to the top, a resize event) and, when that does not help, loaded again.
        private var strikes = 0
        private var finishedAt = Date()
        private var blackUsable: Bool?           // does "drawn small" show the real screen on this device? (nil: not tested yet)
        private var reloads: [Date] = []
        private var timer: Timer?
        private var observers: [NSObjectProtocol] = []

        func startWatchdog() {
            guard timer == nil else { return }
            timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in self?.check() }
            let nc = NotificationCenter.default
            observers.append(nc.addObserver(forName: .okieCheckWeb, object: nil, queue: .main) { [weak self] _ in self?.check(after: 0.8) })
            observers.append(nc.addObserver(forName: UIResponder.keyboardDidHideNotification, object: nil, queue: .main) { [weak self] _ in self?.web?.scrollView.setContentOffset(.zero, animated: false); self?.check(after: 0.5) })
            observers.append(nc.addObserver(forName: UIDevice.orientationDidChangeNotification, object: nil, queue: .main) { [weak self] _ in self?.check(after: 1.0) })
        }
        func stopWatchdog() { timer?.invalidate(); timer = nil; observers.forEach { NotificationCenter.default.removeObserver($0) }; observers = [] }

        func check(after delay: TimeInterval = 0) {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in self?.checkNow() }
        }
        private func checkNow() {
            guard let w = web, started, !parked, w.window != nil, UIApplication.shared.applicationState == .active else { return }
            guard pageLoaded else { return }                                       // still loading (or offline): the load itself reports its trouble
            var answered = false
            DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in
                guard let self, !answered else { return }                           // no answer in 6 s: the page process is stuck or gone
                self.fail(w, "no answer")
            }
            w.evaluateJavaScript("[window.innerWidth, window.innerHeight, document.readyState].join('|')") { [weak self] r, err in
                answered = true
                guard let self else { return }
                guard err == nil, let s = r as? String else { self.fail(w, "error"); return }
                let p = s.split(separator: "|").map(String.init)
                if p.count == 3, let iw = Double(p[0]), let ih = Double(p[1]), (iw < Double(w.bounds.width) * 0.5 || ih < Double(w.bounds.height) * 0.5) {      // only a really collapsed viewport (half the view): a small difference is the safe area, not a glitch
                    self.fail(w, "viewport \(Int(iw))x\(Int(ih)) in a \(Int(w.bounds.width))x\(Int(w.bounds.height)) view")
                } else { self.strikes = 0 }          // (a black screen that answers is the card's own deep rest (screensaver), not a glitch: it is not touched)
            }
        }

        /// The black test only counts when it has been shown to work here: a healthy dashboard, ten seconds after it loaded, must NOT look black to it (on some devices the web view cannot be drawn
        /// from the app and always comes out black: the dashboard would then be loaded again every half minute and nothing could be scrolled).
        private func blackTestSaysBlack(_ w: WKWebView) -> Bool {
            if blackUsable == nil {
                guard Date().timeIntervalSince(finishedAt) > 12 else { return false }
                blackUsable = !looksBlack(w)
                NSLog("[okie-watchdog] black test %@ on this device", blackUsable == true ? "works" : "cannot be trusted, switched off")
                return false
            }
            return blackUsable == true && looksBlack(w)
        }

        /// What the web view really shows (not what the page thinks): drawn small, the middle of it is checked. A dashboard is never pure black (the wallpaper, a dimmed screensaver at worst
        /// 10 %), so a black middle means the web view stopped drawing (iPad glitch: only a strip under the status bar is left).
        private func looksBlack(_ w: WKWebView) -> Bool {
            guard w.bounds.width > 100, w.bounds.height > 100 else { return false }
            let size = CGSize(width: 40, height: 40 * w.bounds.height / w.bounds.width)
            let fmt = UIGraphicsImageRendererFormat(); fmt.scale = 1; fmt.opaque = true
            let img = UIGraphicsImageRenderer(size: size, format: fmt).image { _ in w.drawHierarchy(in: CGRect(origin: .zero, size: size), afterScreenUpdates: false) }
            guard let cg = img.cgImage, let data = cg.dataProvider?.data, let p = CFDataGetBytePtr(data) else { return false }
            let bpp = cg.bitsPerPixel / 8, rowBytes = cg.bytesPerRow
            var sum = 0, n = 0
            for y in Int(size.height * 0.25)..<Int(size.height * 0.85) {
                for x in Int(size.width * 0.1)..<Int(size.width * 0.9) {
                    let o = y * rowBytes + x * bpp
                    sum += Int(max(p[o], p[o + 1], p[o + 2])); n += 1
                }
            }
            return n > 0 && Double(sum) / Double(n) < 9           // under 9 of 255 on average: black
        }
        private func fail(_ w: WKWebView, _ why: String) {
            strikes += 1
            NSLog("[okie-watchdog] dashboard looks wrong (%@), strike %d", why, strikes)
            if strikes < 2 {
                w.setNeedsLayout(); w.layoutIfNeeded(); w.scrollView.setContentOffset(.zero, animated: false)
                let f = w.frame; w.frame = f.insetBy(dx: 0, dy: 1); w.layoutIfNeeded(); w.frame = f; w.layoutIfNeeded()          // a frame change makes the web view lay out and draw again
                w.evaluateJavaScript("window.dispatchEvent(new Event('resize'));document.body&&void document.body.offsetHeight")
                check(after: 2)
            } else {
                strikes = 0; pageLoaded = false
                reloads = reloads.filter { Date().timeIntervalSince($0) < 300 } + [Date()]
                if reloads.count >= 3 { blackUsable = false; NSLog("[okie-watchdog] three reloads in five minutes: the black test is switched off") }       // never a reload loop
                if w.url != nil { w.reload() } else if let d = latest { d.restart(w, self) }
            }
        }

        static func literal(_ s: String) -> String {
            guard let d = try? JSONSerialization.data(withJSONObject: s, options: .fragmentsAllowed), let t = String(data: d, encoding: .utf8) else { return "\"\"" }
            return t
        }

        func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "okieGlass", let json = message.body as? String {
                if GlassRule.save(GlassRule.from(json: json)) { WidgetCenter.shared.reloadAllTimelines() }
            } else if message.name == "okieHome" {
                DispatchQueue.main.async { self.onHome() }
            } else if message.name == "okieNote" {
                NSLog("[okie-timing] note at +%.2fs: %@", AppClock.seconds, (message.body as? String) ?? "")
                DebugLog.append((message.body as? String) ?? "")
            } else if message.name == "okieSpeech" {
                speech.handle(message.body)
            } else if message.name == "okiePurge" {
                // the card on the server is newer than the copy this web view holds (or the card's Refresh button): clear the HTTP caches (not the sign-in or the settings) and load the page again
                NSLog("[okie-purge] clearing the web view cache (server version %@)", (message.body as? String) ?? "-")
                DispatchQueue.main.async { self.purgeAndReload() }
            } else if message.name == "okieHaptic" {
                if let t = message.body as? String, let ms = Int(t) { NSLog("[okie-haptic] %d ms", ms); Haptic.web(ms) }
            } else if message.name == "okieOpened" {
                NSLog("[okie-timing] screen is on at +%.2fs (page clock: %@)", AppClock.seconds, (message.body as? String) ?? "")
                DispatchQueue.main.async { self.onOpened() }
            } else if message.name == "okieLook", let json = message.body as? String {
                if DialLook.saveFromCard(json) { WidgetCenter.shared.reloadAllTimelines() }
            } else if message.name == "okieBackup", let o = message.body as? [String: Any] {
                // the card's Settings > Backup & sync: Export opens the share sheet (Save to Files, AirDrop ...), Import opens the Files picker
                if o["action"] as? String == "export", let name = o["name"] as? String, let json = o["json"] as? String { share(name: name, json: json) }
                if o["action"] as? String == "import" { pick() }
            }
        }

        /// clears the web view's disk and memory caches (never the website data: the sign-in and the card's settings stay) and loads the page again from the server
        func purgeAndReload() {
            let types: Set<String> = [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
            WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: Date(timeIntervalSince1970: 0)) { [weak self] in
                DispatchQueue.main.async { self?.web?.reloadFromOrigin() }
            }
        }

        private func topController() -> UIViewController? {
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            var top = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
            while let p = top?.presentedViewController { top = p }
            return top
        }

        private func share(name: String, json: String) {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(name.replacingOccurrences(of: "/", with: "-"))
            guard (try? json.write(to: url, atomically: true, encoding: .utf8)) != nil, let top = topController() else { return }
            let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = top.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 1, height: 1)
            top.present(sheet, animated: true)
        }

        private func pick() {
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.json, .plainText], asCopy: true)
            picker.delegate = self
            topController()?.present(picker, animated: true)
        }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            guard let url = urls.first, let text = try? String(contentsOf: url, encoding: .utf8),
                  let data = try? JSONSerialization.data(withJSONObject: text, options: .fragmentsAllowed), let literal = String(data: data, encoding: .utf8) else { return }
            web?.evaluateJavaScript("window.OkieMotor && window.OkieMotor.sync && window.OkieMotor.sync.importText(\(literal))")
        }

        /// A link that wants a new window opens in the same page.
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url { webView.load(URLRequest(url: url)) }
            return nil
        }

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            present(message: message, actions: [("OK", { completionHandler() })], cancel: nil)
        }
        func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
            present(message: message, actions: [("OK", { completionHandler(true) })], cancel: ("Cancel", { completionHandler(false) }))
        }

        private func present(message: String, actions: [(String, () -> Void)], cancel: (String, () -> Void)?) {
            let a = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            if let cancel { a.addAction(UIAlertAction(title: cancel.0, style: .cancel) { _ in cancel.1() }) }
            for x in actions { a.addAction(UIAlertAction(title: x.0, style: .default) { _ in x.1() }) }
            let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
            var top = scene?.windows.first(where: \.isKeyWindow)?.rootViewController
            while let p = top?.presentedViewController { top = p }
            top?.present(a, animated: true)
        }
    }
}

extension Notification.Name { static let okieCheckWeb = Notification.Name("okieCheckWeb") }

/// TEMPORARY: a small file in the app's Documents folder (Documents/okie-debug.log, 200 KB at most) for what the card reports about a drag that did not work. Copy it off a connected device with
/// `xcrun devicectl device copy from --domain-type appDataContainer --domain-identifier com.okiedokie.home --source Documents/okie-debug.log`. Only class names and numbers go in it.
enum DebugLog {
    private static let queue = DispatchQueue(label: "okie.debuglog")
    private static var url: URL? { FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?.appendingPathComponent("okie-debug.log") }
    static func append(_ line: String) {
        guard line.contains("\"dbg\":") else { return }
        queue.async {
            guard let u = url else { return }
            let stamp = String(format: "%.2f ", AppClock.seconds)
            guard let data = (stamp + line + "\n").data(using: .utf8) else { return }
            if let h = try? FileHandle(forWritingTo: u) {
                defer { try? h.close() }
                let size = (try? h.seekToEnd()) ?? 0
                if size > 200_000 { try? h.truncate(atOffset: 0) }
                try? h.write(contentsOf: data)
            } else { try? data.write(to: u) }
        }
    }
}
