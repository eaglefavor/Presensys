/**
 * Theme Colors and Utilities for Dark Mode Support
 *
 * This module provides a centralized, type-safe way to access theme colors.
 * All colors respect the dark mode setting and should be used instead of hardcoded colors.
 *
 * Usage Examples:
 *   - Use CSS variables directly in styles: style={{ backgroundColor: 'var(--primary-blue)' }}
 *   - Use utility object for semantic naming: ThemeColors.overlay.dark
 *   - Use getComputedThemeColor() for runtime access: getComputedThemeColor('--primary-blue')
 */

/**
 * Semantic color values - these are CSS variable names that automatically
 * respond to dark mode changes. Access via getComputedThemeColor() or use directly in style props.
 */
export const ThemeColors = {
  /** Primary brand color - automatically adjusted for dark mode */
  primary: 'var(--primary-blue)',
  
  /** Text and background colors */
  text: {
    primary: 'var(--text-dark)',
    muted: 'var(--text-muted)',
  },

  background: {
    primary: 'var(--soft-white)',
    secondary: 'var(--bg-gray)',
  },

  border: 'var(--border-color)',

  /** Status/semantic colors for success, warning, danger, info */
  semantic: {
    success: {
      background: 'var(--success-bg)',
      border: 'var(--success-border)',
      text: 'var(--success-text)',
    },
    warning: {
      background: 'var(--warning-bg)',
      border: 'var(--warning-border)',
      text: 'var(--warning-text)',
    },
    danger: {
      background: 'var(--danger-bg)',
      border: 'var(--danger-border)',
      text: 'var(--danger-text)',
    },
    info: {
      background: 'var(--info-bg)',
      border: 'var(--info-border)',
      text: 'var(--info-text)',
    },
  },

  /** Status indicators */
  status: {
    success: 'var(--status-success)',
    danger: 'var(--status-danger)',
    warning: 'var(--status-warning)',
    info: 'var(--status-info)',
  },

  /** Overlay/backdrop colors */
  overlay: {
    dark: 'var(--overlay-dark)',
    darker: 'var(--overlay-darker)',
    darkest: 'var(--overlay-darkest)',
  },

  /** Accent colors for special UI elements */
  accent: {
    gold: 'var(--accent-gold)',
    secondary: 'var(--accent-secondary)',
  },

  /** UI element colors */
  ui: {
    lightGray: 'var(--color-light-gray)',
    lighterGray: 'var(--color-lighter-gray)',
    lighterBorder: 'var(--color-lighter-border)',
    mutedLight: 'var(--color-muted-light)',
    white: 'var(--color-white-overlay)',
  },

  /** Warning/offline indicator */
  warning: {
    primary: 'var(--warning-color)',
    background: 'var(--warning-light)',
    border: 'var(--warning-light-border)',
    accent: 'var(--warning-accent)',
  },
};

/**
 * Get the computed CSS variable value at runtime.
 * Useful when you need the actual color value (not a CSS variable reference).
 *
 * @param variableName - CSS variable name (with or without '--' prefix)
 * @returns The computed color value
 *
 * @example
 * const primaryColor = getComputedThemeColor('--primary-blue');
 * // Returns something like '#006994' in light mode or '#0093cc' in dark mode
 */
export function getComputedThemeColor(variableName: string): string {
  const normalizedName = variableName.startsWith('--') ? variableName : `--${variableName}`;
  const value = getComputedStyle(document.documentElement).getPropertyValue(normalizedName).trim();
  return value || '#000000'; // Fallback to black if not found
}

/**
 * Standard overlay color map for different use cases
 * These are commonly used in modals, backdrops, and overlays
 */
export const OVERLAY_COLORS = {
  modal: ThemeColors.overlay.darker,      // 0.45 opacity black
  backdrop: ThemeColors.overlay.dark,     // 0.4 opacity black
  intense: ThemeColors.overlay.darkest,   // 0.5+ opacity black
} as const;

/**
 * Common semantic color combinations for status badges and indicators
 */
export const STATUS_BADGES = {
  success: {
    background: ThemeColors.semantic.success.background,
    border: ThemeColors.semantic.success.border,
    text: ThemeColors.semantic.success.text,
  },
  warning: {
    background: ThemeColors.semantic.warning.background,
    border: ThemeColors.semantic.warning.border,
    text: ThemeColors.semantic.warning.text,
  },
  danger: {
    background: ThemeColors.semantic.danger.background,
    border: ThemeColors.semantic.danger.border,
    text: ThemeColors.semantic.danger.text,
  },
  info: {
    background: ThemeColors.semantic.info.background,
    border: ThemeColors.semantic.info.border,
    text: ThemeColors.semantic.info.text,
  },
  muted: {
    background: `rgba(108, 117, 125, 0.1)`,
    border: `1px dashed #adb5bd`,
    text: ThemeColors.ui.mutedLight,
  },
} as const;

/**
 * Best practices for using theme colors in components:
 *
 * 1. For inline styles, use CSS variables directly:
 *    style={{ backgroundColor: 'var(--primary-blue)' }}
 *
 * 2. For semantic colors, use ThemeColors object:
 *    style={{ backgroundColor: ThemeColors.semantic.success.background }}
 *
 * 3. Never use hardcoded colors like:
 *    ❌ style={{ backgroundColor: '#ffc107' }}
 *    ✅ style={{ backgroundColor: 'var(--warning-color)' }}
 *
 * 4. For complex color logic, extract to CSS classes instead of inline styles:
 *    Consider using CSS or Tailwind for better maintainability
 *
 * 5. When adding new colors, extend the CSS variables in src/index.css first
 *    Then add exports to ThemeColors object for consistency
 */
