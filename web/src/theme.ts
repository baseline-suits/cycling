import { alpha, createTheme, type PaletteMode } from '@mui/material/styles'

declare module '@mui/material/styles' {
  interface Palette {
    chart: { teal: string; lime: string; amber: string; coral: string; blue: string }
  }
  interface PaletteOptions {
    chart?: { teal: string; lime: string; amber: string; coral: string; blue: string }
  }
}

export function createAppTheme(mode: PaletteMode) {
  const dark = mode === 'dark'

  return createTheme({
    cssVariables: true,
    palette: {
      mode,
      primary: dark
        ? { main: '#B9E878', light: '#D4F8A4', dark: '#7F9F2E', contrastText: '#11170B' }
        : { main: '#5E7F1C', light: '#86A93D', dark: '#3D5710', contrastText: '#FFFFFF' },
      secondary: dark
        ? { main: '#8F86FF', light: '#B8B2FF', dark: '#655CC5', contrastText: '#080A0D' }
        : { main: '#655CC5', light: '#8F86FF', dark: '#494197' },
      background: dark
        ? { default: '#080A0D', paper: '#11151B' }
        : { default: '#F2F5EF', paper: '#FFFFFF' },
      text: dark
        ? { primary: '#F2F5EF', secondary: '#C4CBC0' }
        : { primary: '#151A12', secondary: '#62695E' },
      divider: alpha(dark ? '#EFF4EA' : '#26301F', dark ? 0.12 : 0.1),
      error: { main: dark ? '#FFB4AB' : '#BA1A1A' },
      success: { main: dark ? '#85D49A' : '#2E7D4A' },
      chart: {
        teal: dark ? '#61D8DD' : '#18898F',
        lime: dark ? '#B9E878' : '#6F941F',
        amber: dark ? '#F0B65E' : '#B97616',
        coral: dark ? '#FF8D91' : '#C44F58',
        blue: dark ? '#73A7FF' : '#356FCE',
      },
    },
    shape: { borderRadius: 16 },
    typography: {
      fontFamily: 'Manrope Variable, system-ui, sans-serif',
      h1: { fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 750, letterSpacing: '-0.04em' },
      h2: { fontSize: 'clamp(1.65rem, 3vw, 2.25rem)', fontWeight: 750, letterSpacing: '-0.035em' },
      h3: { fontSize: '1.35rem', fontWeight: 700, letterSpacing: '-0.02em' },
      h4: { fontSize: '1.1rem', fontWeight: 700 },
      button: { fontWeight: 700, textTransform: 'none' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            colorScheme: mode,
            transition: 'background-color 180ms ease, color 180ms ease',
          },
          '@media (prefers-reduced-motion: reduce)': {
            body: { transition: 'none' },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: { root: { minHeight: 44, borderRadius: 14 } },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${alpha(dark ? '#EFF4EA' : '#26301F', dark ? 0.1 : 0.08)}`,
            boxShadow: dark ? '0 16px 42px rgba(0, 0, 0, 0.2)' : '0 12px 36px rgba(20, 50, 45, 0.05)',
          },
        },
      },
      MuiTextField: { defaultProps: { size: 'small' } },
      MuiSelect: { defaultProps: { size: 'small' } },
      MuiChip: { styleOverrides: { root: { fontWeight: 650 } } },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  })
}

export function createMinimalTheme() {
  const base = createAppTheme('dark')

  return createTheme(base, {
    palette: {
      mode: 'dark',
      primary: { main: '#B9E878', light: '#D4F8A4', dark: '#7F9F2E', contrastText: '#11170B' },
      secondary: { main: '#8F86FF', light: '#B8B2FF', dark: '#655CC5', contrastText: '#080A0D' },
      background: { default: '#080A0D', paper: '#11151B' },
      text: { primary: '#F2F5EF', secondary: '#C4CBC0' },
      divider: alpha('#EFF4EA', .1),
      error: { main: '#FFB4AB' },
      success: { main: '#87D39B' },
      warning: { main: '#EBC477' },
      chart: {
        teal: '#61D8DD',
        lime: '#B9E878',
        amber: '#F0B65E',
        coral: '#FF8D91',
        blue: '#73A7FF',
      },
    },
    shape: { borderRadius: 12 },
    typography: {
      fontFamily: 'Manrope Variable, system-ui, sans-serif',
      h1: { fontSize: 'clamp(2.35rem, 7vw, 4.8rem)', lineHeight: 1.02, fontWeight: 690, letterSpacing: '-.055em' },
      h2: { fontSize: 'clamp(1.8rem, 4vw, 3rem)', lineHeight: 1.08, fontWeight: 680, letterSpacing: '-.045em' },
      h3: { fontSize: 'clamp(1.25rem, 2vw, 1.6rem)', lineHeight: 1.2, fontWeight: 680, letterSpacing: '-.025em' },
      h4: { fontSize: '1.05rem', lineHeight: 1.35, fontWeight: 680 },
      body1: { lineHeight: 1.7 },
      body2: { lineHeight: 1.6 },
      button: { fontWeight: 680, textTransform: 'none' },
      overline: { fontSize: '.69rem', lineHeight: 1.5, fontWeight: 750, letterSpacing: '.1em' },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            '--avento-minimal-surface-subtle': '#0D1015',
            '--avento-minimal-surface-raised': '#171923',
            '--avento-minimal-content-width': '1280px',
            '--avento-motion-fast': '120ms',
            '--avento-motion-normal': '180ms',
            '--avento-motion-slow': '240ms',
          },
          body: {
            colorScheme: 'dark',
            backgroundImage: 'radial-gradient(circle at 72% -20%, rgba(143,134,255,.12), transparent 38%)',
            transition: 'background-color var(--avento-motion-normal) ease, color var(--avento-motion-normal) ease',
          },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': {
              animationDuration: '0.01ms !important',
              animationIterationCount: '1 !important',
              scrollBehavior: 'auto !important',
              transitionDuration: '0.01ms !important',
            },
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            minHeight: 44,
            borderRadius: 10,
            '&:focus-visible': { outline: '2px solid #D8FFAC', outlineOffset: 3 },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { '&:focus-visible': { outline: '2px solid #D8FFAC', outlineOffset: 3 } } },
      },
      MuiLink: {
        styleOverrides: { root: { '&:focus-visible': { outline: '2px solid #D8FFAC', outlineOffset: 3, borderRadius: 4 } } },
      },
      MuiTab: {
        styleOverrides: { root: { minHeight: 44, '&:focus-visible': { outline: '2px solid #D8FFAC', outlineOffset: -2 } } },
      },
      MuiToggleButton: {
        styleOverrides: { root: { minHeight: 40, '&:focus-visible': { outline: '2px solid #D8FFAC', outlineOffset: -2 } } },
      },
      MuiMenuItem: {
        styleOverrides: { root: { '&:focus-visible': { outline: '2px solid #D8FFAC', outlineOffset: -2 } } },
      },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: '1px solid rgba(239,244,234,.08)',
            boxShadow: '0 18px 50px rgba(0,0,0,.16)',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
            border: '1px solid rgba(239,244,234,.1)',
            '@media (max-width: 420px)': { margin: 12, width: 'calc(100% - 24px)', maxHeight: 'calc(100% - 24px)' },
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: { root: { '&:focus-visible': { outline: '2px solid #D8FFAC', outlineOffset: -2 } } },
      },
      MuiChip: { styleOverrides: { root: { fontWeight: 650 } } },
      MuiLinearProgress: { styleOverrides: { root: { backgroundColor: 'rgba(239,244,234,.08)' } } },
      MuiTooltip: { defaultProps: { arrow: true } },
    },
  })
}
