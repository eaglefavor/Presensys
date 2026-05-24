# Presensys Native App Mode Documentation

## Overview

Presensys PWA now supports native app mode styling that automatically activates when the application is installed as an app on Android or iOS devices. This ensures the app looks and feels like a native application rather than a website.

## How It Works

### Detection Strategy

The app mode detection uses three methods (in priority order):

1. **iOS Detection**: `navigator.standalone === true` (for Safari home screen web apps)
2. **Android/Chrome Detection**: `window.matchMedia('(display-mode: standalone)').matches` (for Chrome/Chromium PWAs)
3. **Default**: Falls back to browser mode if neither is detected

### Display Modes

- **`standalone`**: App is installed and running as a full app (removes browser UI)
- **`browser`**: App is running in a web browser (shows desktop framing)
- **`fullscreen`**: Reserved for future full-screen experiences

## Architecture

### Files Added

#### 1. **src/lib/appModeDetector.ts**
Core detection logic:
- `detectAppMode()`: Returns current app mode
- `isAppMode()`: Boolean check for app vs browser
- `applyAppModeAttribute()`: Sets `data-app-mode` attribute on document root
- `onDisplayModeChange()`: Listens for mode changes

#### 2. **src/store/useAppModeStore.ts**
Zustand store for state management:
- `mode`: Current app mode ('standalone', 'browser', 'fullscreen')
- `isAppMode`: Boolean flag
- `initialize()`: Sets up detection and listeners
- `setMode()`: Manual mode override

#### 3. **src/hooks/useAppMode.ts**
React hook for consuming app mode state:
```tsx
const { mode, isAppMode, isStandalone, isFullscreen, isBrowser } = useAppMode();
```

### Files Modified

#### 1. **index.html**
- Added `viewport-fit=cover` for notch/safe area support
- Added apple-mobile-web-app meta tags for iOS
- Enhanced viewport meta tag for proper device scaling

#### 2. **vite.config.ts**
PWA manifest now includes:
- `display: "standalone"` - Activates app mode
- `orientation: "portrait-primary"` - Locks to portrait on phones
- `background_color: "#ffffff"` - Sets splash screen background
- `scope: "/"` and `start_url: "/"` - Proper app scope
- `categories: ["productivity"]` - App categorization

#### 3. **src/index.css**
Added comprehensive CSS media queries:
- `@media (display-mode: standalone)` - Styles when app is installed
- Removes desktop framing (margins, shadows, borders)
- Maximizes screen real estate (100vw, 100vh)
- Respects safe areas for notched devices
- Provides utility classes `.app-mode-only` and `.web-mode-only`

#### 4. **src/main.tsx**
- Imports and initializes `useAppModeStore`
- Calls `initializeAppMode()` to set up detection on app startup

## Usage in Components

### Accessing App Mode State

```tsx
import { useAppMode } from '@/hooks/useAppMode';

function MyComponent() {
  const { isAppMode, isStandalone, isBrowser } = useAppMode();

  return (
    <>
      {isAppMode && <div>Running as native app!</div>}
      {isBrowser && <div>Running in browser</div>}
    </>
  );
}
```

### Conditional Styling

Use CSS utility classes:

```tsx
<div className="app-mode-only">
  This only shows when installed as an app
</div>

<div className="web-mode-only">
  This only shows when viewed in browser
</div>
```

Or use CSS media queries:

```css
@media (display-mode: standalone) {
  /* Styles for app mode */
}

@media (display-mode: browser) {
  /* Styles for browser mode */
}
```

Or use attribute selectors:

```css
[data-app-mode="standalone"] .my-element {
  /* Styles for app mode */
}

[data-app-mode="browser"] .my-element {
  /* Styles for browser mode */
}
```

## Styling Behavior

### Browser Mode (Website)
- Desktop framing visible (centered container with shadow)
- Max-width of 500px on desktop
- Margins and padding for visual separation
- Browser chrome and scrollbars visible

### Standalone Mode (Installed App)
- Full viewport (100vw × 100vh)
- No margins or framing
- No shadows or borders
- Edge-to-edge rendering
- Respects device safe areas (notches, Dynamic Island, etc.)
- Hidden scrollbars for immersive feel
- System fonts for native appearance

## Safe Area Insets

The CSS uses CSS environment variables to respect device safe areas:

```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
padding-left: env(safe-area-inset-left);
padding-right: env(safe-area-inset-right);
```

These automatically handle:
- **iOS**: Notches, Dynamic Island (iPhone 14 Pro/Max)
- **Android**: Display cutouts, system gestures

## Installation Instructions

### For End Users

#### Android (Chrome)
1. Open Presensys in Chrome
2. Tap the menu button (⋮) → "Install app"
3. The app will be installed to home screen and run in standalone mode

#### iOS (Safari)
1. Open Presensys in Safari
2. Tap the share button → "Add to Home Screen"
3. The app will be installed to home screen and run in standalone mode

### For Developers

The app mode feature is automatically active. No additional setup required after deployment.

## Testing

### Desktop
1. Open browser DevTools (F12)
2. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Type "Rendering" → "Emulate CSS media feature prefers-color-scheme"
4. Change from "no preference" to "dark" or "light"
5. Use the same menu to test `display-mode: standalone`

Alternative in DevTools:
- Chrome: Settings → Rendering → Emulate CSS media feature `prefers-reduced-motion`
- Look for display-mode options

### Actual Devices

#### Android
1. Install the app via Chrome menu
2. Open the installed app from home screen
3. Verify: No browser address bar, full screen rendering

#### iOS
1. Install via Safari "Add to Home Screen"
2. Open the installed app from home screen
3. Verify: No Safari toolbar, full screen rendering, safe area respected

## Platform-Specific Notes

### Android (Chrome)
- Supports `display: standalone` mode (removes Chrome UI)
- Safe areas handled via viewport-fit: cover
- Status bar color controlled by theme-color meta tag
- Can be uninstalled like any other app

### iOS (Safari)
- Uses apple-mobile-web-app meta tags
- Status bar style controlled by `apple-mobile-web-app-status-bar-style`
- Safe areas for notches via `viewport-fit: cover` and safe-area-inset env vars
- Appears as a "Home Screen Web App"

## Browser Compatibility

| Feature | iOS Safari | Chrome/Android | Firefox | Edge |
|---------|-----------|-----------------|---------|------|
| display-mode media query | ✅ Partial | ✅ | ✅ | ✅ |
| navigator.standalone | ✅ | ❌ | ❌ | ❌ |
| Safe area insets | ✅ | ✅ | ✅ | ✅ |
| PWA Installation | ✅ | ✅ | ✅ | ✅ |

## Performance Considerations

- App mode detection runs once at startup
- Minimal overhead (single media query check)
- Changes are rare (only when user installs/uninstalls)
- No performance impact on rendering

## Future Enhancements

Potential improvements:
1. **Fullscreen Mode**: For kiosk/immersive experiences
2. **Dynamic Status Bar**: Change colors based on app state
3. **App Shortcuts**: Add Quick Actions for iOS/Android
4. **Share Target**: Allow sharing files/data to app
5. **File Handling**: Register as default handler for attendance files

## Troubleshooting

### App not detected as standalone
- Clear browser cache and reinstall
- Verify manifest has `display: "standalone"`
- Check that `start_url` is correct

### Safe areas not working
- Ensure `viewport-fit=cover` is in viewport meta tag
- Verify `env(safe-area-inset-*)` CSS is applied
- Test on actual device (not all emulators support it)

### Styles not changing
- Clear browser cache
- Check DevTools to confirm `data-app-mode` attribute is set
- Verify CSS media query is correct

## References

- [Web App Manifest Spec](https://w3c.github.io/manifest/)
- [Display Modes](https://w3c.github.io/manifest/#display-modes)
- [Safe Area Insets](https://developer.mozilla.org/en-US/docs/Web/CSS/env)
- [Apple Web App Meta Tags](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
