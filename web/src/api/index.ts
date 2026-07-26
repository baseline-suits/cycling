import { apiBlobRequest, apiRequest, tokenStore } from './client'
import type {
  Activity,
  ActivityComparison,
  ActivityDetail,
  ActivityFilters,
  ActivityUpdate,
  ActivityExportInput,
  BootstrapData,
  ChatHistoryItem,
  ChatResponse,
  ImportActivityData,
  ImportBatchResponse,
  ImportJob,
  InvitationResponse,
  PasswordResetResponse,
  PaginatedActivities,
  Profile,
  RegistrationData,
  StatisticsOverview,
  TokenResponse,
  LoginResponse,
  PasskeyOptionsResponse,
  PasskeySummary,
  TrackResponse,
  WeatherResponse,
  SummaryResponse,
  StatisticsGranularity,
  SavedSegment,
  RouteMatch,
} from './types'

function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const authApi = {
  async login(email: string, password: string, totpCode?: string) {
    const result = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password, ...(totpCode ? { totp_code: totpCode } : {}) },
    })
    if ('access_token' in result) tokenStore.set(result)
    return result
  },
  login2fa: (challengeToken: string, code: string) => apiRequest<TokenResponse>('/auth/login/2fa', { method: 'POST', auth: false, body: { challenge_token: challengeToken, code } }).then((tokens) => { tokenStore.set(tokens); return tokens }),
  passkeyOptions: (email: string) => apiRequest<PasskeyOptionsResponse>(`/auth/passkeys/login/options?email=${encodeURIComponent(email)}`, { method: 'POST', auth: false }),
  passkeyLogin: (credential: unknown, challengeToken: string) => apiRequest<TokenResponse>('/auth/passkeys/login', { method: 'POST', auth: false, body: { credential, challenge_token: challengeToken } }).then((tokens) => { tokenStore.set(tokens); return tokens }),
  totpStatus: () => apiRequest<{ enabled: boolean }>('/auth/totp'),
  totpSetup: () => apiRequest<{ secret: string; otpauth_uri: string }>('/auth/totp/setup', { method: 'POST' }),
  totpEnable: (code: string) => apiRequest<void>('/auth/totp/enable', { method: 'POST', body: { code } }),
  totpDisable: () => apiRequest<void>('/auth/totp', { method: 'DELETE' }),
  passkeyRegistrationOptions: () => apiRequest<PasskeyOptionsResponse>('/auth/passkeys/options', { method: 'POST' }),
  registerPasskey: (credential: unknown, challengeToken: string, name: string) => apiRequest<{ id: string; name: string }>('/auth/passkeys', { method: 'POST', body: { credential, challenge_token: challengeToken, name } }),
  passkeys: () => apiRequest<PasskeySummary[]>('/auth/passkeys'),
  deletePasskey: (id: string) => apiRequest<void>(`/auth/passkeys/${id}`, { method: 'DELETE' }),
  async register(data: RegistrationData) {
    const tokens = await apiRequest<TokenResponse>('/auth/register', {
      method: 'POST',
      auth: false,
      body: data,
    })
    tokenStore.set(tokens)
    return tokens
  },
  async bootstrap(data: BootstrapData) {
    const tokens = await apiRequest<TokenResponse>('/auth/bootstrap', {
      method: 'POST',
      auth: false,
      body: data,
    })
    tokenStore.set(tokens)
    return tokens
  },
  async logout() {
    const refreshToken = tokenStore.get()?.refresh_token
    try {
      if (refreshToken) {
        await apiRequest<void>('/auth/logout', {
          method: 'POST',
          body: { refresh_token: refreshToken },
        })
      }
    } finally {
      tokenStore.clear()
    }
  },
  createInvitation: (email?: string, expiresInDays = 7) =>
    apiRequest<InvitationResponse>('/auth/invitations', {
      method: 'POST',
      body: { email: email || null, expires_in_days: expiresInDays },
    }),
  createPasswordReset: (email: string, expiresInMinutes = 60) =>
    apiRequest<PasswordResetResponse>('/auth/password-resets', {
      method: 'POST',
      body: { email, expires_in_minutes: expiresInMinutes },
    }),
  resetPassword: (token: string, newPassword: string) =>
    apiRequest<void>('/auth/password-reset', {
      method: 'POST',
      auth: false,
      body: { token, new_password: newPassword },
    }),
}

export const profileApi = {
  get: () => apiRequest<Profile>('/profile'),
  update: (data: Partial<Omit<Profile, 'id' | 'email'>>) =>
    apiRequest<Profile>('/profile', { method: 'PATCH', body: data }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<void>('/profile/password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
    }),
  uploadAvatar: (file: File) => {
    const form = new FormData()
    form.set('file', file)
    return apiRequest<Profile>('/profile/avatar', { method: 'POST', body: form })
  },
  deleteAvatar: () => apiRequest<Profile>('/profile/avatar', { method: 'DELETE' }),
}

export const activitiesApi = {
  list: (filters: ActivityFilters = {}) =>
    apiRequest<PaginatedActivities>(
      `/activities${queryString({
        limit: filters.limit ?? 50,
        offset: filters.offset ?? 0,
        q: filters.q,
        type: filters.type,
        date_from: filters.date_from,
        date_to: filters.date_to,
      })}`,
    ),
  get: (id: string) => apiRequest<ActivityDetail>(`/activities/${id}`),
  import: (data: ImportActivityData) => {
    const form = new FormData()
    form.set('file', data.file)
    if (data.title) form.set('title', data.title)
    if (data.type) form.set('type', data.type)
    if (data.notes) form.set('notes', data.notes)
    return apiRequest<Activity>('/activities', { method: 'POST', body: form })
  },
  importBatch: (files: File[]) => {
    const form = new FormData()
    files.forEach((file) => form.append('files', file))
    return apiRequest<ImportBatchResponse>('/activities/imports', { method: 'POST', body: form })
  },
  importStatus: (jobId: string) => apiRequest<ImportJob>(`/activities/imports/${jobId}`),
  update: (id: string, data: ActivityUpdate) =>
    apiRequest<ActivityDetail>(`/activities/${id}`, { method: 'PATCH', body: data }),
  reanalyze: (id: string) =>
    apiRequest<ActivityDetail>(`/activities/${id}/reanalyze`, { method: 'POST' }),
  delete: (id: string) => apiRequest<void>(`/activities/${id}`, { method: 'DELETE' }),
  track: (id: string) => apiRequest<TrackResponse>(`/activities/${id}/track`),
  weather: (id: string) => apiRequest<WeatherResponse>(`/activities/${id}/weather`),
  refreshWeather: (id: string) =>
    apiRequest<WeatherResponse>(`/activities/${id}/weather/refresh`, { method: 'POST' }),
  summary: (id: string) => apiRequest<SummaryResponse>(`/activities/${id}/summary`),
  generateSummary: (id: string, force = false) =>
    apiRequest<SummaryResponse>(`/activities/${id}/summary?force=${force}`, { method: 'POST' }),
  compare: (activityIds: string[]) =>
    apiRequest<ActivityComparison>('/activities/compare', {
      method: 'POST',
      body: { activity_ids: activityIds },
    }),
  export: (input: ActivityExportInput) =>
    apiBlobRequest('/activities/export', { method: 'POST', body: input }),
  routeMatches: (id: string, limit = 5) => apiRequest<{ activity_id: string; matches: RouteMatch[] }>(`/activities/${id}/route-matches?limit=${limit}`),
}

export const segmentsApi = {
  list: () => apiRequest<SavedSegment[]>('/segments'),
  create: (input: { activity_id: string; name: string; start_m: number; end_m: number }) => apiRequest<SavedSegment>('/segments', { method: 'POST', body: input }),
  delete: (id: string) => apiRequest<void>(`/segments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

export const statisticsApi = {
  overview: (dateFrom?: string, dateTo?: string, granularity: StatisticsGranularity = 'auto', type?: string) =>
    apiRequest<StatisticsOverview>(
      `/statistics/overview${queryString({ date_from: dateFrom, date_to: dateTo, granularity, type })}`,
    ),
}

export const chatApi = {
  send: (message: string, history: ChatHistoryItem[], activityId?: string) =>
    apiRequest<ChatResponse>('/chat', {
      method: 'POST',
      body: { message, history, activity_id: activityId || undefined },
    }),
}

export { activityMediaApi, activityPhotosApi, insightsApi, mcpAdminApi } from './roadmap'
export { gamificationApi, gamificationEndpoints, gamificationOverviewQueryKey } from './gamification'
export type * from './types'
