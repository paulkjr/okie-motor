#!/bin/zsh
# One command to rebuild everything after a change:
#   tools/build.sh            generate + build for the iOS simulator
#   tools/build.sh run        ... and install + start it on the booted simulator
#   tools/build.sh clean      forget the build folder first
# What it does: widgets/widgets.json -> Shared/WidgetSpec.swift, the card's icons -> Shared/OkieSVGIcons.swift, xcodegen, xcodebuild (ad-hoc signed, so the keychain and the widgets work in the simulator).
# For a real iPhone open OkieHome.xcodeproj in Xcode, pick your Apple ID team under Signing & Capabilities and press Run.
set -e
HERE="${0:A:h}/.."
cd "$HERE"
[[ -f ../tools-local/scripts/env.sh ]] && . ../tools-local/scripts/env.sh >/dev/null 2>&1      # (the author's own tool folder; not needed when node and xcodegen are on your PATH)
OUT="${BUILD_DIR:-$HERE/.build}"
[[ "$1" == "clean" ]] && rm -rf "$OUT" && shift
node tools/build-widgets.js
[[ -f ../widget/okie-thermostat-widget.js ]] && node tools/build-big-page.js
[[ -f ../src/okie-ui.js ]] && node tools/gen-swift-icons.js
xcodegen generate >/dev/null
xcodebuild -project OkieHome.xcodeproj -scheme OkieHome -destination 'generic/platform=iOS Simulator' -derivedDataPath "$OUT" \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=NO DEVELOPMENT_TEAM= build > "$OUT.log" 2>&1 || { grep -E "error:" "$OUT.log" | sort -u | head -20; echo "BUILD FAILED (see $OUT.log)"; exit 1; }
echo "BUILD SUCCEEDED"
if [[ "$1" == "run" ]]; then
  APP="$OUT/Build/Products/Debug-iphonesimulator/OkieHome.app"
  xcrun simctl terminate booted com.okiedokie.home 2>/dev/null || true
  xcrun simctl install booted "$APP"
  xcrun simctl launch booted com.okiedokie.home
fi
