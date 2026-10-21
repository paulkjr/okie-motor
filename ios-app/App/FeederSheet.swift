import SwiftUI

/// Debug page (launch argument `-feederSheet YES`): all five feeder designs, medium and small, over a bright and a dark ground, to look at them without placing widgets.
struct FeederSheet: View {
    var body: some View {
        GeometryReader { geo in
            let scale = min(1, (geo.size.width - 24) / 506)
            ScrollView {
                sheet.scaleEffect(scale, anchor: .topLeading).frame(width: 506 * scale, height: 1330 * scale, alignment: .topLeading).padding(12)
            }
        }
        .background(Color(white: 0.82))
    }

    private var sheet: some View {
            VStack(alignment: .leading, spacing: 14) {
                ForEach(FeederDesign.allCases, id: \.self) { d in
                    Text(d.spec.name).font(.caption).foregroundStyle(.secondary)
                    HStack(spacing: 10) {
                        card(d, medium: true, line: "Last fed 3 h ago", ask: false).frame(width: 338, height: 158)
                        card(d, medium: false, line: "3 h ago", ask: false).frame(width: 158, height: 158)
                    }
                }
                Text("Question state").font(.caption).foregroundStyle(.secondary)
                HStack(spacing: 10) {
                    card(.peek, medium: true, line: "Fed recently. Tap again to feed anyway", ask: true).frame(width: 338, height: 158)
                    card(.bowl, medium: false, line: "Fed recently. Tap again to feed", ask: true).frame(width: 158, height: 158)
                }
            }
            .frame(width: 506)
    }

    private func card(_ d: FeederDesign, medium: Bool, line: String, ask: Bool) -> some View {
        FeederCardView(design: d, medium: medium, title: "FEED THE BEASTS", line: line, ask: ask)
            .background { FeederBackdrop(design: d, medium: medium) }
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .containerShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
