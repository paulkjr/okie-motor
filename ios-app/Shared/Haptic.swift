import AudioToolbox
import UIKit

/// Haptics for the app and the widgets.
enum Haptic {
    private static let selection = UISelectionFeedbackGenerator()
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private static let heavy = UIImpactFeedbackGenerator(style: .heavy)

    /// The card in the dashboard asks for `navigator.vibrate(ms)` (4 = one step of the wheel, 8 = a tap, 12 = a switch, 18 = the end of a range, 30 = an error); iOS web views have no vibrate,
    /// so the app's bridge (Resources/okie-bridge.js) sends the number here and the phone's own haptics answer.
    static func web(_ ms: Int) {
        switch ms {
        case ..<6: selection.selectionChanged()                // the tick of the alarm wheel
        case ..<10: light.impactOccurred()
        case ..<15: medium.impactOccurred()
        case ..<25: rigid.impactOccurred()
        default: heavy.impactOccurred()
        }
    }

    /// A short buzz for a widget button (the lights buttons buzz with this on Paul's phone): the system's short "peek" tap and a medium impact.
    static func tap() {
        AudioServicesPlaySystemSound(1519)
        medium.impactOccurred()
    }
}
