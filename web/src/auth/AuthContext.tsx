import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { authApi, profileApi, type BootstrapData, type LoginResponse, type Profile, type RegistrationData } from '../api'
import { tokenStore } from '../api/client'
import { LoadingScreen } from '../components/States'

interface AuthContextValue {
  profile: Profile | null
  loading: boolean
  login: (email: string, password: string, totpCode?: string) => Promise<LoginResponse>
  register: (data: RegistrationData) => Promise<void>
  bootstrap: (data: BootstrapData) => Promise<void>
  logout: () => Promise<void>
  refreshProfile: () => Promise<void>
  setProfile: (profile: Profile) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(Boolean(tokenStore.get()?.access_token))

  const refreshProfile = useCallback(async () => {
    if (!tokenStore.get()?.access_token) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setProfile(await profileApi.get())
    } catch {
      tokenStore.clear()
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshProfile()
    const onAuthChange = () => {
      if (!tokenStore.get()) setProfile(null)
    }
    window.addEventListener('avento:auth-changed', onAuthChange)
    return () => window.removeEventListener('avento:auth-changed', onAuthChange)
  }, [refreshProfile])

  const login = useCallback(
    async (email: string, password: string, totpCode?: string) => {
      const result = await authApi.login(email, password, totpCode)
      if ('access_token' in result) await refreshProfile()
      return result
    },
    [refreshProfile],
  )
  const register = useCallback(
    async (data: RegistrationData) => {
      await authApi.register(data)
      await refreshProfile()
    },
    [refreshProfile],
  )
  const bootstrap = useCallback(
    async (data: BootstrapData) => {
      await authApi.bootstrap(data)
      await refreshProfile()
    },
    [refreshProfile],
  )
  const logout = useCallback(async () => {
    await authApi.logout()
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({ profile, loading, login, register, bootstrap, logout, refreshProfile, setProfile }),
    [profile, loading, login, register, bootstrap, logout, refreshProfile],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth muss innerhalb des AuthProvider verwendet werden.')
  return context
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen label="Dein Baseline Cycling wird vorbereitet …" />
  if (!profile) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}
