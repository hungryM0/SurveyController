import { useEffect } from 'react'

type ThemeScheme = 'light' | 'dark' | 'system'

interface AppThemeProps {
  scheme?: ThemeScheme | string
  color?: string
  colorDarkMode?: string
  onColorChange?: () => void
  onSchemeChange?: () => void
}

function resolveSystemScheme(): Exclude<ThemeScheme, 'system'> {
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }
  return 'light'
}

function applyThemeScheme(scheme: ThemeScheme | string | undefined) {
  const resolved = scheme === 'dark' || scheme === 'light'
    ? scheme
    : resolveSystemScheme()
  document.body.classList.toggle('dark-theme', resolved === 'dark')
  document.documentElement.setAttribute('data-theme', resolved)
}

function applyThemeColors(color?: string, colorDarkMode?: string) {
  if (!color) {
    return
  }
  document.documentElement.style.setProperty('--PrimaryColor', color)
  document.documentElement.style.setProperty('--PrimaryColorLight', colorDarkMode || color)
}

function AppTheme({
  scheme = 'system',
  color,
  colorDarkMode,
  onColorChange,
  onSchemeChange,
}: AppThemeProps) {
  useEffect(() => {
    applyThemeColors(color, colorDarkMode)
    onColorChange?.()
  }, [color, colorDarkMode, onColorChange])

  useEffect(() => {
    applyThemeScheme(scheme)
    onSchemeChange?.()

    if (scheme !== 'system' || !window.matchMedia) {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      applyThemeScheme('system')
      onSchemeChange?.()
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [scheme, onSchemeChange])

  return null
}

export default AppTheme
