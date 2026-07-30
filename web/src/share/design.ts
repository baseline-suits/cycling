import type { OverlayTheme } from './types'

export const BASELINE_CYCLING_SOLID_COLORS = ['#080A0D', '#B9E878', '#8F86FF', '#F2F5EF'] as const

export interface OverlayPalette {
  canvas: string
  surface: string
  surfaceStrong: string
  text: string
  muted: string
  accent: string
  achievement: string
  routeHalo: string
  shadow: string
}

export function paletteFor(theme: OverlayTheme): OverlayPalette {
  return theme === 'dark'
    ? {
        canvas: '#080A0D', surface: 'rgba(23, 25, 35, .9)', surfaceStrong: '#171923',
        text: '#F2F5EF', muted: '#C4CBC0', accent: '#B9E878', achievement: '#F0B65E',
        routeHalo: 'rgba(8, 10, 13, .84)', shadow: '0 18px 50px rgba(0, 0, 0, .32)',
      }
    : {
        canvas: '#F2F5EF', surface: 'rgba(255, 255, 255, .92)', surfaceStrong: '#FFFFFF',
        text: '#151A12', muted: '#62695E', accent: '#5E7F1C', achievement: '#B97616',
        routeHalo: 'rgba(255, 255, 255, .9)', shadow: '0 18px 50px rgba(20, 26, 18, .13)',
      }
}

export const overlayRadius = { small: 12, medium: 20, large: 32 }
