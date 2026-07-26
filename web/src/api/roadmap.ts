import { apiBlobRequest, apiRequest, apiUploadRequest } from './client'
import type {
  ActivityMedia,
  ActivityMediaConfig,
  ActivityMediaListResponse,
  ActivityMediaUpload,
  ActivityPhoto,
  ActivityPhotoListResponse,
  ActivityPhotoUpdate,
  ActivityPhotoUpload,
  LongTermInsightsResponse,
  McpAccessToken,
  McpAccessTokenRequest,
  McpAuditEvent,
  McpClient,
  McpClientCreate,
  McpClientCreated,
  McpClientUpdate,
  McpSecretRotated,
  PersonalRecordsResponse,
  PeriodReviewResponse,
} from './types'

function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.set(key, String(value))
  })
  const text = query.toString()
  return text ? `?${text}` : ''
}

export const activityPhotosApi = {
  list: (activityId: string) =>
    apiRequest<ActivityPhotoListResponse>(`/activities/${activityId}/photos`),
  upload: (activityId: string, data: ActivityPhotoUpload, onProgress?: (percent: number) => void) => {
    const form = new FormData()
    form.set('file', data.file)
    if (data.caption?.trim()) form.set('caption', data.caption.trim())
    if (data.captured_at) form.set('captured_at', data.captured_at)
    if (data.latitude != null) form.set('latitude', String(data.latitude))
    if (data.longitude != null) form.set('longitude', String(data.longitude))
    const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (clientTimezone) form.set('client_timezone', clientTimezone)
    return apiUploadRequest<ActivityPhoto>(`/activities/${activityId}/photos`, form, onProgress)
  },
  update: (activityId: string, photoId: string, data: ActivityPhotoUpdate) =>
    apiRequest<ActivityPhoto>(`/activities/${activityId}/photos/${photoId}`, {
      method: 'PATCH',
      body: data,
    }),
  delete: (activityId: string, photoId: string) =>
    apiRequest<void>(`/activities/${activityId}/photos/${photoId}`, { method: 'DELETE' }),
  file: (photo: ActivityPhoto) => apiBlobRequest(photo.file_url),
}

function mediaForm(data: ActivityMediaUpload) {
  const form = new FormData()
  form.set('file', data.file)
  if (data.caption?.trim()) form.set('caption', data.caption.trim())
  if (data.captured_at) form.set('captured_at', data.captured_at)
  if (data.latitude != null) form.set('latitude', String(data.latitude))
  if (data.longitude != null) form.set('longitude', String(data.longitude))
  const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (clientTimezone) form.set('client_timezone', clientTimezone)
  return form
}

export const activityMediaApi = {
  config: () => apiRequest<ActivityMediaConfig>('/media/config'),
  list: (activityId: string) =>
    apiRequest<ActivityMediaListResponse>(`/activities/${activityId}/media`),
  uploadVideo: (activityId: string, data: ActivityMediaUpload, onProgress?: (percent: number) => void) =>
    apiUploadRequest<ActivityMedia>(`/activities/${activityId}/media`, mediaForm(data), onProgress),
  update: (activityId: string, mediaId: string, data: ActivityPhotoUpdate) =>
    apiRequest<ActivityMedia>(`/activities/${activityId}/media/${mediaId}`, {
      method: 'PATCH',
      body: data,
    }),
  delete: (activityId: string, mediaId: string) =>
    apiRequest<void>(`/activities/${activityId}/media/${mediaId}`, { method: 'DELETE' }),
  retry: (activityId: string, mediaId: string) =>
    apiRequest<ActivityMedia>(`/activities/${activityId}/media/${mediaId}/retry`, { method: 'POST' }),
  file: (media: ActivityMedia) => apiBlobRequest(media.file_url),
  playbackUrl: (media: ActivityMedia) =>
    apiRequest<{ url: string; expires_in: number }>(
      `/activities/${media.activity_id}/media/${media.id}/playback-token`,
      { method: 'POST' },
    ).then((response) => response.url),
  poster: (media: ActivityMedia) => {
    if (!media.poster_url) throw new Error('Für dieses Video ist noch kein Poster verfügbar.')
    return apiBlobRequest(media.poster_url)
  },
}

export const insightsApi = {
  records: () => apiRequest<PersonalRecordsResponse>('/statistics/records'),
  longTerm: (dateFrom?: string, dateTo?: string) =>
    apiRequest<LongTermInsightsResponse>(
      `/statistics/insights${queryString({ date_from: dateFrom, date_to: dateTo })}`,
    ),
  periodReview: (year: number, season = 'year') =>
    apiRequest<PeriodReviewResponse>(
      `/statistics/reviews/${year}${queryString({ season })}`,
    ),
}

export const mcpAdminApi = {
  clients: () => apiRequest<McpClient[]>('/mcp/clients'),
  createClient: (data: McpClientCreate) =>
    apiRequest<McpClientCreated>('/mcp/clients', { method: 'POST', body: data }),
  updateClient: (clientId: string, data: McpClientUpdate) =>
    apiRequest<McpClient>(`/mcp/clients/${clientId}`, { method: 'PATCH', body: data }),
  rotateSecret: (clientId: string) =>
    apiRequest<McpSecretRotated>(`/mcp/clients/${clientId}/rotate-secret`, { method: 'POST' }),
  revokeClient: (clientId: string) =>
    apiRequest<McpClient>(`/mcp/clients/${clientId}/revoke`, { method: 'POST' }),
  revokeTokens: (clientId: string) =>
    apiRequest<void>(`/mcp/clients/${clientId}/tokens/revoke`, { method: 'POST' }),
  requestToken: (data: McpAccessTokenRequest) =>
    apiRequest<McpAccessToken>('/mcp/token', { method: 'POST', body: data, auth: false }),
  auditLog: (limit = 100) =>
    apiRequest<McpAuditEvent[]>(`/mcp/audit${queryString({ limit })}`),
}
