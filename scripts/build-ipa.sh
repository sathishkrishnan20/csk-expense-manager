#!/usr/bin/env bash
# Builds an unsigned .ipa for AltStore or SideStore, which sign it with your own Apple ID
# themselves. Needs Xcode and CocoaPods. Output: build/ipa/<AppName>.ipa
set -euo pipefail
cd "$(dirname "$0")/.."

npx expo prebuild --platform ios

WORKSPACE=$(ls -d ios/*.xcworkspace | head -1)
SCHEME=$(basename "$WORKSPACE" .xcworkspace)
OUT=build/ipa

rm -rf "$OUT"
mkdir -p "$OUT/Payload"

xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphoneos \
  -archivePath "$OUT/$SCHEME.xcarchive" \
  archive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""

cp -R "$OUT/$SCHEME.xcarchive/Products/Applications/"*.app "$OUT/Payload/"
(cd "$OUT" && zip -qr "$SCHEME.ipa" Payload)

echo "Built $OUT/$SCHEME.ipa"
