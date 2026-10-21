import SwiftUI
import WebKit
import WidgetKit

/// What a tap on the thermostat widget opens: only the controls of the thermostat (the menu bubble, the wheel, the number, the modes, hold to turn off), without the card's photo header and
/// without the dashboard. It is Resources/BigThermostat.html (built by tools/build-big-page.js from the card's own code) and it talks to Home Assistant by itself with the app's sign-in, so it is
/// up at once. In the sample mode (no Home Assistant) the native look-alike `BigThermostat` is shown.
struct ThermostatScreen: View {
    @Environment(HomeStore.self) private var store
    let entityID: String
    var onClose: () -> Void

    var body: some View {
        if let session = store.session, !store.demo {
            ZStack {
                Color(hex: 0x120e0b).ignoresSafeArea()
                ThermostatPageWeb(session: session, entityID: entityID).ignoresSafeArea()
                Button(action: onClose) {
                    Text("Close").font(.system(size: 17)).foregroundStyle(Color(hex: 0x0a84ff))
                        .padding(.horizontal, 18).padding(.vertical, 10).contentShape(Rectangle())
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(.top, 1)             // on the row of the menu bubble
            }
            .preferredColorScheme(.dark)
        } else {
            BigThermostat(entityID: entityID)
        }
    }
}

struct ThermostatPageWeb: UIViewRepresentable {
    let session: HASession
    let entityID: String

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        // iOS web views have no navigator.vibrate: the page asks for one (a tick per degree of the wheel, a tap on a button) and the app answers with the phone's haptics
        cfg.userContentController.add(context.coordinator, name: "okieHaptic")
        let shim = "try{Object.defineProperty(navigator,'vibrate',{configurable:true,writable:true,value:function(p){var ms=Array.isArray(p)?(p[0]||0):(+p||0);window.webkit.messageHandlers.okieHaptic.postMessage(String(Math.round(ms)));return true;}});}catch(e){}"
        cfg.userContentController.addUserScript(WKUserScript(source: shim, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let w = WKWebView(frame: .zero, configuration: cfg)
        let bg = UIColor(red: 18 / 255, green: 14 / 255, blue: 11 / 255, alpha: 1)
        w.isOpaque = false
        w.backgroundColor = bg
        w.scrollView.backgroundColor = bg
        w.scrollView.contentInsetAdjustmentBehavior = .never       // the page reads the safe areas itself (env(safe-area-inset-*))
        w.scrollView.bounces = false
        w.navigationDelegate = context.coordinator
        context.coordinator.web = w
        context.coordinator.start(session: session, entityID: entityID)
        return w
    }

    func updateUIView(_ w: WKWebView, context: Context) {}

    static func dismantleUIView(_ w: WKWebView, coordinator: Coordinator) { coordinator.stop(); w.configuration.userContentController.removeScriptMessageHandler(forName: "okieHaptic") }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        weak var web: WKWebView?
        private var timer: Timer?

        func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "okieHaptic", let t = message.body as? String, let ms = Int(t) { Haptic.web(ms) }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { NSLog("[okie-timing] thermostat page shown at +%.2fs", AppClock.seconds) }

        func start(session: HASession, entityID: String) {
            // the page can load at once with what is known; the unit (°F or °C) is a setting of Home Assistant itself, remembered from the last time
            let unit = UserDefaults.standard.string(forKey: "haTempUnit") ?? "°F"
            Task { @MainActor in
                let fresh = (try? await HAClient.shared.validSession(minLife: 600)) ?? session
                guard let html = Self.page(session: fresh, entityID: entityID, unit: unit) else { return }
                web?.loadHTMLString(html, baseURL: fresh.baseURL)      // the page's address is Home Assistant's own, so it can talk to it without any cross-site trouble
                timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in self?.sendToken() }       // the token lasts 30 minutes: a fresh one every minute while it is open
                if let d = try? await HAClient.shared.request("GET", "api/config"),
                   let o = (try? JSONSerialization.jsonObject(with: d)) as? [String: Any], let u = (o["unit_system"] as? [String: Any])?["temperature"] as? String { UserDefaults.standard.set(u, forKey: "haTempUnit") }
            }
        }

        func stop() { timer?.invalidate(); timer = nil }
        deinit { timer?.invalidate() }

        private func sendToken() {
            Task { @MainActor in
                guard let s = try? await HAClient.shared.validSession(minLife: 600), let lit = Self.literal(s.accessToken) else { return }
                _ = try? await web?.evaluateJavaScript("if (window.CFG) CFG.token = \(lit);")
            }
        }

        /// The page's three holes (see tools/build-big-page.js): the address with the token, the dial look, and what was saved (look and profiles).
        static func page(session: HASession, entityID: String, unit: String) -> String? {
            guard let url = Bundle.main.url(forResource: "BigThermostat", withExtension: "html"), var html = try? String(contentsOf: url, encoding: .utf8) else { return nil }
            func json(_ o: Any) -> String {
                guard let d = try? JSONSerialization.data(withJSONObject: o, options: [.fragmentsAllowed, .withoutEscapingSlashes]), let s = String(data: d, encoding: .utf8) else { return "{}" }
                return s.replacingOccurrences(of: "<", with: "\\u003c")
            }
            let host = session.baseURL.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            let cfg = json(["url": host, "token": session.accessToken, "entity": entityID, "unit": unit, "haptics": true] as [String: Any])
            let look = DialLook.current
            func hex(_ v: UInt32) -> String { String(format: "#%06x", v) }
            let lookJSON = json(["c0": hex(look.c0), "c1": hex(look.c1), "c2": hex(look.c2), "c3": hex(look.c3), "cool": look.cool, "warm": look.warm] as [String: Any])
            func parsed(_ s: String?) -> Any { s.flatMap { $0.data(using: .utf8) }.flatMap { try? JSONSerialization.jsonObject(with: $0) } ?? [String: Any]() }
            let store = json(["look": parsed(DialLook.savedJSON), "profiles": parsed(UserDefaults.standard.string(forKey: "okieProfiles"))] as [String: Any])
            html = html.replacingOccurrences(of: "__CFG__", with: cfg).replacingOccurrences(of: "__LOOK__", with: lookJSON).replacingOccurrences(of: "__STORE__", with: store)
            return html
        }

        static func literal(_ s: String) -> String? {
            guard let d = try? JSONSerialization.data(withJSONObject: s, options: .fragmentsAllowed) else { return nil }
            return String(data: d, encoding: .utf8)
        }

        /// The page cannot write to the keychain: it asks with a hidden frame that goes to okie-save://<what>?<json> (the way it did in Scriptable). Caught here, never sent anywhere.
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = navigationAction.request.url, url.scheme == "okie-save" else { decisionHandler(.allow); return }
            decisionHandler(.cancel)
            guard let key = url.host, let json = url.query?.removingPercentEncoding, (try? JSONSerialization.jsonObject(with: Data(json.utf8))) != nil else { return }
            switch key {
            case "look": if DialLook.save(json) { WidgetCenter.shared.reloadAllTimelines() }        // the widget wears the same colours
            case "profiles": UserDefaults.standard.set(json, forKey: "okieProfiles")
            default: break
            }
        }
    }
}
