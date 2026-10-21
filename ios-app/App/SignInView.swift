import SwiftUI

struct SignInView: View {
    @Environment(HomeStore.self) private var store
    @AppStorage("serverText") private var server = ""      // e.g. https://homeassistant.local:8123 or https://your-name.duckdns.org
    @State private var user = ""
    @State private var password = ""
    @State private var code = ""
    @State private var flowID: String?
    @State private var needsCode = false
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?
    enum Field { case server, user, password, code }

    var body: some View {
        ScrollView {
            VStack(spacing: 22) {
                Spacer(minLength: 40)
                Image(systemName: "house.fill").font(.system(size: 44, weight: .semibold)).foregroundStyle(.white)
                    .frame(width: 92, height: 92).glassCard(radius: 28)
                VStack(spacing: 6) {
                    Text("Okie Home").font(.system(size: 34, weight: .bold, design: .rounded))
                    Text("Sign in with your Home Assistant").font(.callout).foregroundStyle(Okie.dim)
                }
                VStack(spacing: 12) {
                    if needsCode {
                        field("Code from your authenticator", text: $code, id: .code).keyboardType(.numberPad)
                    } else {
                        field("Home Assistant address", text: $server, id: .server).keyboardType(.URL).textInputAutocapitalization(.never)
                        field("Name", text: $user, id: .user).textInputAutocapitalization(.never)
                        SecureField("Password", text: $password)
                            .padding(14).background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                            .focused($focus, equals: .password).submitLabel(.go).onSubmit(go)
                    }
                    if let error { Text(error).font(.footnote).foregroundStyle(Color(hex: 0xff8a7a)).multilineTextAlignment(.center) }
                    Button(action: go) {
                        HStack { if busy { ProgressView().tint(Okie.darkInk) }; Text(needsCode ? "Check the code" : "Sign in").fontWeight(.semibold) }
                            .frame(maxWidth: .infinity).padding(.vertical, 15)
                            .background(.white, in: Capsule()).foregroundStyle(Okie.darkInk)
                    }
                    .disabled(busy)
                    Button("Look around with sample data") { store.enterDemo() }
                        .font(.footnote.weight(.semibold)).foregroundStyle(Okie.dim).padding(.top, 2)
                    Text("Your password goes straight to your own Home Assistant. Only a sign-in token is kept on this device.")
                        .font(.caption).foregroundStyle(Okie.dim).multilineTextAlignment(.center).padding(.top, 4)
                }
                .padding(20).frame(maxWidth: 420).glassCard()
                Spacer(minLength: 40)
            }
            .padding(.horizontal, 20).frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
    }

    private func field(_ title: String, text: Binding<String>, id: Field) -> some View {
        TextField(title, text: text)
            .autocorrectionDisabled()
            .padding(14).background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .focused($focus, equals: id)
    }

    private func go() {
        error = nil
        guard let base = HAAuth.normalize(server) else { error = "That address does not look right."; return }
        busy = true
        Task {
            defer { busy = false }
            do {
                var step: HAAuth.Step
                if needsCode, let flowID { step = try await HAAuth.submit(base: base, flowID: flowID, fields: ["code": code]) }
                else {
                    let first = try await HAAuth.begin(base: base)
                    guard case .form(let id, _, _, _) = first else { throw HAError.decode }
                    step = try await HAAuth.submit(base: base, flowID: id, fields: ["username": user.trimmingCharacters(in: .whitespaces), "password": password])
                }
                switch step {
                case .done(let c):
                    let s = try await HAAuth.exchange(base: base, code: c, userName: user)
                    password = ""; code = ""; needsCode = false; flowID = nil
                    store.signedIn(s)
                case .form(let id, let stepID, let fields, let err):
                    if stepID == "mfa" || fields.contains("code") { flowID = id; needsCode = true; error = err }
                    else { error = err ?? "Wrong name or password." }
                }
            } catch { self.error = error.localizedDescription }
        }
    }
}
