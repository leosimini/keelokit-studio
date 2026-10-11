# Native mobile capture

Studio can capture screenshots of a mobile app running on an Android device or emulator, or on an iOS simulator, and record them as evidence. It drives the platform tools you already have (`adb`, `xcrun simctl`); it does not install them, boot devices or build your app. Start the device and install the build first (Keelokit's `/keelokit:run-local` does this for React Native and Expo projects), then capture.

| | Android (`adb-android`) | iOS simulator (`simctl-ios`) |
|---|---|---|
| Launch the app | yes | yes |
| Tap by visible text or coordinates, type, press BACK/ENTER/TAB/DOWN | yes | no |
| Open a deep link | no | yes, for URL schemes you declare |
| Assert visible text (role and result) | yes, from the UI hierarchy | no |
| Evidence verification | `live-capture`: can back claims | `screenshot-only`: **cannot back claims** |

An iOS capture records that the app was launched and navigated, and keeps the screenshot as material for the editor; because `simctl` cannot read what is on screen, nothing it captures can support a claim in a script. A claim about an iOS screen needs an observer Studio does not ship, or verification on Android or by hand.

## Request

```json
{
  "projectId": "my-app",
  "platform": "android",
  "device": {"serial": "emulator-5554"},
  "app": {"id": "com.example.app"},
  "build": "1.2.0 (42)",
  "locale": "en-US",
  "role": "admin",
  "demoDataId": "demo-seed-1",
  "journey": {
    "id": "sign-in",
    "name": "Sign in as an admin",
    "steps": [{"action": "launch"}, {"action": "tap_text", "text": "Sign in"}, {"action": "type", "text": "demo@example.com"}, {"action": "key", "key": "ENTER"}],
    "role_assertion": {"role": "admin", "text": "Admin"},
    "verify": {"text": "Dashboard"}
  },
  "allowedClaims": ["Admins land on the dashboard after signing in."]
}
```

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/studio-capture-native.mjs" --capability android --serial emulator-5554
node "${CLAUDE_PLUGIN_ROOT}/scripts/studio-capture-native.mjs" --project-root "$PWD" --request request.json
```

For iOS use `"platform": "ios"`, `"device": {"udid": "booted"}`, `"app": {"id": "com.example.App", "url_schemes": ["exampleapp"]}` and steps `launch`, `open_url` and `wait`; `verify` and `role_assertion` are rejected and `allowedClaims` must stay empty.

## Rules

- The role text must be visible on the final screen together with the verification text. The capture records the device model, OS and screen size, the build, locale, flags and the demo dataset, so a changed device or build produces new evidence.
- The app must be in the foreground at the end, or the capture fails.
- Typed text is sent to the device and never stored or hashed; only letters, digits, spaces and `. _ @ : / + -` are accepted, so there is no shell injection through a journey. Use demo data, never real credentials. Deep link queries are not stored either.
- A failed journey is recorded as failed evidence (with a failure screenshot when possible) and carries no claims. Tool output is never persisted.
- Screenshots are stored content-addressed in the project under `media/studio/captures/`.
- Localized variants need their own capture in that locale (set the device language first); see `docs/localization.md`.

## What has and has not been verified

The adapter's process, argument, parsing, evidence and failure paths are covered by tests that run against stand-ins for `adb` and `xcrun simctl` (`tests/support/fake-adb.mjs`, `tests/support/fake-xcrun.mjs`). **It has not been exercised against a real Android emulator or device, or an iOS simulator.** Run the `--capability` check and one capture on your own machine before relying on it; `uiautomator dump`, `simctl io screenshot` and `dumpsys window` output varies by OS version, and a mismatch will show up as a failed capture, not as a wrong claim.
