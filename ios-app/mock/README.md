# Mock Home Assistant (for trying Okie Home without your own server)

A pretend Home Assistant in plain Node (no npm packages). Everything in it is made up.

## Run

```bash
cd ios-app
node mock/server.js            # listens on port 8123 on every address of this computer; PORT=9000 changes it
```

Options (environment variables): `MFA=1` asks for a (fake) authenticator code after the password; `EXPIRES_IN=90` makes access tokens live 90 seconds
(to watch the refresh); `DRIFT=0` stops the room temperature creeping toward the target every 20 seconds.

## Sign in

Use the address it prints (for the simulator `http://localhost:8123`, for a phone on the same Wi-Fi the computer's address) with this made-up test account:

| | |
|---|---|
| Name | `okie-test` |
| Password | `mock-f8e8f3090878` (a throw-away password for the mock only; `server.js` knows just its SHA-256) |
| Code (only with `MFA=1`) | `123456` |

Refresh tokens are accepted when they start with `mock-refresh-`, so restarting the mock does not sign the app out. Use `localhost` in the simulator.

## Try the app in the simulator

```bash
./tools/build.sh               # generates the Xcode project with XcodeGen, builds for the simulator and launches it
xcrun simctl launch booted com.okiedokie.home -serverText http://localhost:8123
```

Seed entities (a thermostat in °F with heat / cool / heat_cool, lights, a switch, a weather entity, calendars with events, a robot vacuum and more) are listed in
`mock/server.js`.
