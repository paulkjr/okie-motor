import AVFoundation
import Speech
import WebKit

/// Speech recognition for the dashboard card. A web view has no `webkitSpeechRecognition`, so the card's microphone button did nothing in the app: the bridge script (Resources/okie-bridge.js)
/// gives the page a `SpeechRecognition` that sends `start` / `stop` here (message okieSpeech) and gets the words back through `window.__okieSpeech({ ev, text, final, error })`.
final class SpeechBridge: NSObject {
    weak var web: WKWebView?
    private var recognizer: SFSpeechRecognizer?
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var running = false

    func handle(_ body: Any) {
        guard let s = body as? String, let d = s.data(using: .utf8), let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return }
        switch o["cmd"] as? String {
        case "start": start(lang: (o["lang"] as? String) ?? "en-US")
        case "stop": stop()
        default: break
        }
    }

    private func start(lang: String) {
        if running { stop(silent: true) }
        SFSpeechRecognizer.requestAuthorization { [weak self] status in
            DispatchQueue.main.async {
                guard let self else { return }
                guard status == .authorized else { self.send(["ev": "error", "error": "not-allowed"]); return }
                AVAudioApplication.requestRecordPermission { granted in
                    DispatchQueue.main.async { granted ? self.begin(lang: lang) : self.send(["ev": "error", "error": "not-allowed"]) }
                }
            }
        }
    }

    private func begin(lang: String) {
        guard let rec = SFSpeechRecognizer(locale: Locale(identifier: lang)) ?? SFSpeechRecognizer(), rec.isAvailable else { send(["ev": "error", "error": "service-not-allowed"]); return }
        recognizer = rec
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .duckOthers])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let req = SFSpeechAudioBufferRecognitionRequest()
            req.shouldReportPartialResults = true
            request = req
            let input = engine.inputNode
            input.removeTap(onBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { [weak req] buffer, _ in req?.append(buffer) }
            engine.prepare()
            try engine.start()
            running = true
            task = rec.recognitionTask(with: req) { [weak self] result, error in
                DispatchQueue.main.async {
                    guard let self, self.running else { return }
                    if let r = result { self.send(["ev": "result", "text": r.bestTranscription.formattedString, "final": r.isFinal]) }
                    if error != nil || result?.isFinal == true { self.stop() }
                }
            }
            send(["ev": "start"])
        } catch {
            stop(silent: true)
            send(["ev": "error", "error": "audio-capture"])
        }
    }

    func stop(silent: Bool = false) {
        guard running || engine.isRunning else { if !silent { send(["ev": "end"]) }; return }
        running = false
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio(); request = nil
        task?.cancel(); task = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        if !silent { send(["ev": "end"]) }
    }

    private func send(_ o: [String: Any]) {
        guard let d = try? JSONSerialization.data(withJSONObject: o), let s = String(data: d, encoding: .utf8) else { return }
        web?.evaluateJavaScript("window.__okieSpeech && window.__okieSpeech(\(s))", completionHandler: nil)
    }
}
