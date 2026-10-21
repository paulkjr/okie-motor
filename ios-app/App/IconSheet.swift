import SwiftUI

/// Every icon of the card in a grid, to compare with the card's own (launch argument -iconSheet YES).
struct IconSheet: View {
    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 92), spacing: 6)], spacing: 10) {
                ForEach(OkieSVG.icons.keys.sorted(), id: \.self) { name in
                    VStack(spacing: 4) {
                        OkieSymbol(name: name, size: 40, color: .white)
                        Text(name).font(.system(size: 10)).foregroundStyle(.white.opacity(0.6))
                    }
                }
            }
            .padding(12)
        }
        .background(Color(red: 0.12, green: 0.1, blue: 0.08))
    }
}

#Preview("All icons") { IconSheet() }
