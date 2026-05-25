# Dark Mode Implementation Guide

This document describes the dark mode system in PresenSys and provides guidelines for developers to ensure all UI changes respect dark mode.

## Overview

PresenSys has a comprehensive dark mode system that automatically adapts to the user's preference. Dark mode is:
- **Persistent**: User preference is saved to localStorage and persists across sessions
- **System-aware**: Defaults to system preference (prefers-color-scheme) on first visit
- **Automatic**: Affects all UI elements throughout the app
- **CSS-based**: Uses CSS variables for consistent theming

## Architecture

### 1. State Management

Dark mode state is managed using Zustand in `src/store/useDarkModeStore.ts`:

```typescript
const { isDarkMode, toggleDarkMode, setDarkMode, initialize } = useDarkModeStore();
```

**Key methods:**
- `initialize()`: Load dark mode preference from localStorage or system preference
- `toggleDarkMode()`: Toggle between light and dark modes
- `setDarkMode(isDark)`: Set dark mode to a specific value

The store is automatically initialized in `src/main.tsx`.

### 2. CSS Variables System

All colors are defined as CSS variables in `src/index.css`. The system uses two sets of variables:
- `:root` - Light mode colors (default)
- `:root.dark-mode` - Dark mode colors (applied when dark mode is enabled)

The `dark-mode` class is added/removed from the document root element by `applyDarkMode()` function in the store.

### 3. Color Utilities

A comprehensive color system is provided in `src/lib/themeColors.ts`:

```typescript
import { ThemeColors, OVERLAY_COLORS, STATUS_BADGES } from '../lib/themeColors';

// Use CSS variables directly
style={{ backgroundColor: 'var(--primary-blue)' }}

// Use utility object for semantic naming
style={{ backgroundColor: ThemeColors.semantic.success.background }}

// Get computed color values at runtime
const color = getComputedThemeColor('--primary-blue');
```

## Available CSS Variables

### Core Colors
- `--primary-blue`: Primary brand color
- `--soft-white`: Main background color
- `--bg-gray`: Secondary background color
- `--border-color`: Border color
- `--text-dark`: Primary text color
- `--text-muted`: Secondary/muted text color

### Semantic Colors
Status colors for success, warning, danger, and info states:
- `--success-bg`, `--success-border`, `--success-text`
- `--warning-bg`, `--warning-border`, `--warning-text`
- `--danger-bg`, `--danger-border`, `--danger-text`
- `--info-bg`, `--info-border`, `--info-text`

### Status Indicators
- `--status-success`: Green indicator color
- `--status-danger`: Red indicator color
- `--status-warning`: Yellow indicator color
- `--status-info`: Blue indicator color

### Overlays & Backdrops
- `--overlay-dark`: 40% opacity black overlay
- `--overlay-darker`: 45% opacity black overlay
- `--overlay-darkest`: 50%+ opacity black overlay

### UI Elements
- `--color-light-gray`: Light gray background
- `--color-lighter-gray`: Lighter gray background
- `--color-lighter-border`: Light border color
- `--color-muted-light`: Muted text color
- `--color-white-overlay`: Container background

### Accents
- `--accent-gold`: Gold accent color (#cfb53b light, #d4aa00 dark)
- `--accent-secondary`: Secondary accent color

### Special Colors
- `--progress-bg`: Progress bar background
- `--divider-color`: Divider/separator lines
- `--selected-bg`: Selected item background
- `--primary-highlight-bg`: Primary highlight background
- `--badge-muted-bg`, `--badge-muted-text`, `--badge-muted-border`: Muted badge colors
- `--warning-color`, `--warning-light`, `--warning-light-border`, `--warning-accent`: Warning indicator colors

## Using Dark Mode in Components

### ✅ DO: Use CSS Variables

**Always use CSS variables for colors:**

```tsx
// Preferred: Direct CSS variable
<div style={{ backgroundColor: 'var(--primary-blue)', color: 'var(--text-dark)' }}>
  Content
</div>

// Also good: Use ThemeColors utility
import { ThemeColors } from '../lib/themeColors';

<div style={{ 
  backgroundColor: ThemeColors.semantic.success.background,
  color: ThemeColors.semantic.success.text
}}>
  Success message
</div>

// For overlays/modals
import { OVERLAY_COLORS } from '../lib/themeColors';

<div style={{ backgroundColor: OVERLAY_COLORS.modal }}>
  Modal backdrop
</div>
```

### ❌ DON'T: Use Hardcoded Colors

**Never use hardcoded color values:**

```tsx
// ❌ WRONG - Hardcoded color won't adapt to dark mode
<div style={{ backgroundColor: '#ffffff', color: '#333333' }}>
  This won't work in dark mode!
</div>

// ❌ WRONG - Hardcoded hex colors
<div style={{ borderColor: '#e4e6eb' }}>
  This border won't be visible in dark mode
</div>

// ❌ WRONG - Hardcoded rgba
<div style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
  This overlay might not work well in dark mode
</div>
```

### ✅ DO: Use Theme Colors for Modals

**For modal backdrops, use provided constants:**

```tsx
import { OVERLAY_COLORS } from '../lib/themeColors';

export function MyModal({ open, onClose }) {
  return open && (
    <div style={{ backgroundColor: OVERLAY_COLORS.modal }}>
      <Modal>...</Modal>
    </div>
  );
}
```

### ✅ DO: Create Component-Specific Styles

**For complex styling, use component CSS files with dark mode support:**

```css
/* MyComponent.module.css */
.container {
  background-color: var(--soft-white);
  color: var(--text-dark);
  border: 1px solid var(--border-color);
}

.highlight {
  background-color: var(--primary-highlight-bg);
}
```

```tsx
import styles from './MyComponent.module.css';

export function MyComponent() {
  return <div className={styles.container}>...</div>;
}
```

## Common Patterns

### Status Indicators

```tsx
import { ThemeColors } from '../lib/themeColors';

// ✅ Green for success
<div style={{ color: ThemeColors.status.success }}>✓ Success</div>

// ✅ Red for danger
<div style={{ color: ThemeColors.status.danger }}>✗ Error</div>

// ✅ Yellow for warning
<div style={{ color: ThemeColors.status.warning }}>⚠ Warning</div>
```

### Badges

```tsx
import { STATUS_BADGES } from '../lib/themeColors';

// ✅ Success badge
<span style={{
  background: STATUS_BADGES.success.background,
  color: STATUS_BADGES.success.text,
  border: `1px solid ${STATUS_BADGES.success.border}`
}}>
  Success
</span>
```

### Text Colors

```tsx
import { ThemeColors } from '../lib/themeColors';

// Primary text
<div style={{ color: ThemeColors.text.primary }}>Main text</div>

// Muted text
<div style={{ color: ThemeColors.text.muted }}>Secondary text</div>
```

### Background Colors

```tsx
import { ThemeColors } from '../lib/themeColors';

// Primary background
<div style={{ backgroundColor: ThemeColors.background.primary }}>
  Main area
</div>

// Secondary background
<div style={{ backgroundColor: ThemeColors.background.secondary }}>
  Secondary area
</div>
```

## Adding New Colors

When you need a new color:

1. **Add CSS variables** to `src/index.css` in both `:root` and `:root.dark-mode` sections:

```css
:root {
  --my-color: #specific-light-color;
}

:root.dark-mode {
  --my-color: #specific-dark-color;
}
```

2. **Export from `src/lib/themeColors.ts`** if it's a commonly used color:

```typescript
export const ThemeColors = {
  myColor: 'var(--my-color)',
  // ... other colors
};
```

3. **Use in components:**

```tsx
<div style={{ color: ThemeColors.myColor }}>Content</div>
```

## Testing Dark Mode

1. **Toggle dark mode** via the Settings page (Dark Mode toggle)
2. **Verify** all UI elements display correctly in both modes
3. **Check**:
   - Text is readable (sufficient contrast)
   - Borders are visible
   - Backgrounds are appropriate for the mode
   - Icons and images look good

## Browser DevTools

To test dark mode in browser DevTools:

**Chrome/Firefox:**
1. Open DevTools (F12)
2. Elements/Inspector tab
3. Find `<html>` element
4. Add/remove `dark-mode` class to toggle

**Quick test:**
```javascript
// Toggle dark mode manually
document.documentElement.classList.toggle('dark-mode');
```

## Migration from Hardcoded Colors

If you're converting existing code:

1. **Find all hardcoded colors:**
   ```bash
   grep -r "backgroundColor:\|color:" src --include="*.tsx" | grep "#"
   ```

2. **Replace with CSS variables:**
   - Common colors map to existing CSS variables
   - Create new variables if needed
   - Use ThemeColors utility for semantic meanings

3. **Test thoroughly:**
   - Toggle dark mode multiple times
   - Verify all affected components
   - Check for contrast issues

## Performance Considerations

- CSS variables have minimal performance impact
- Dark mode toggle is instant (no page reload needed)
- All calculations happen at render time
- No runtime color manipulation required

## Accessibility

Dark mode is important for:
- **Eye strain reduction**: Especially in low-light environments
- **Battery life**: On OLED screens
- **User preference**: Respects system color scheme preference
- **Accessibility**: Supports users with light sensitivity

Always ensure:
- Text has sufficient contrast in both modes
- Color is not the only way to convey information
- Interactive elements are clearly visible

## Troubleshooting

### Colors not changing in dark mode
- Ensure you're using CSS variables, not hardcoded colors
- Check that `dark-mode` class is applied to `<html>` element
- Clear browser cache and reload

### Inconsistent colors between components
- Use ThemeColors utility for consistency
- Check that all variants (light/dark) are defined in index.css
- Use browser DevTools to inspect computed colors

### Text not readable in dark mode
- Use `var(--text-dark)` for text on light backgrounds
- Use `var(--text-muted)` for secondary text
- Ensure sufficient contrast (WCAG AA minimum)

## Future Enhancements

Potential improvements:
- Custom color themes (beyond light/dark)
- Per-component theme overrides
- Theme scheduling (auto-switch by time)
- Reduced motion support
- High contrast mode

## References

- CSS Variables (Custom Properties): https://developer.mozilla.org/en-US/docs/Web/CSS/--*
- Prefers Color Scheme: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme
- WCAG Color Contrast: https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum
- Dark Mode Best Practices: https://web.dev/prefers-color-scheme/
