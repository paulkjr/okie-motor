import SwiftUI

/// Debug page (launch argument `-lightsSheet YES`): both lights designs, medium and small, to look at them without placing widgets.
struct LightsSheet: View {
    private var items: [LightItem] {
        func e(_ id: String, _ name: String, _ state: String) -> HAEntity { HAEntity(entityId: id, state: state, attributes: ["friendly_name": .string(name)]) }
        return [LightItem.from(e("switch.bedlight", "Bedlight", "off"), area: "Bedroom"), LightItem.from(e("script.govee_cozy_lights", "Cozy", "off")),
                LightItem.from(e("script.govee_lets_go_to_sleep", "Sleep", "off")), LightItem.from(e("script.govee_turn_up_the_lights", "Turn up", "off"))]
    }

    var body: some View {
        GeometryReader { geo in
            let scale = min(1, (geo.size.width - 24) / 506)
            ScrollView {
                sheet.scaleEffect(scale, anchor: .topLeading).frame(width: 506 * scale, height: 760 * scale, alignment: .topLeading).padding(12)
            }
        }
        .background(Color(white: 0.55))
    }

    private var sheet: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(LightsDesign.allCases, id: \.self) { d in
                Text(d == .dark ? "Dark" : "Bright").font(.caption).foregroundStyle(.white.opacity(0.8))
                HStack(spacing: 10) {
                    card(d, small: false).frame(width: 338, height: 158)
                    card(d, small: true).frame(width: 158, height: 158)
                }
            }
        }
        .frame(width: 506)
    }

    private func card(_ d: LightsDesign, small: Bool) -> some View {
        LightsGrid(items: items, small: small, design: d)
            .background { LightsBackdrop(design: d) }
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .containerShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
