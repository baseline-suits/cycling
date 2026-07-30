import { useEffect, useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import BlockRoundedIcon from '@mui/icons-material/BlockRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import KeyRoundedIcon from '@mui/icons-material/KeyRounded'
import PowerSettingsNewRoundedIcon from '@mui/icons-material/PowerSettingsNewRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import SecurityRoundedIcon from '@mui/icons-material/SecurityRounded'
import VpnKeyRoundedIcon from '@mui/icons-material/VpnKeyRounded'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Skeleton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mcpAdminApi, type McpClient, type McpClientCreate, type McpClientUpdate } from '../api'
import { useAuth } from '../auth/AuthContext'
import { PageHeader } from '../components/PageHeader'
import { EmptyState, ErrorState } from '../components/States'
import { errorMessage, formatDateTime } from '../utils/format'

const scopeDefinitions = [
  { id: 'activities:read', label: 'Aktivitäten lesen', description: 'Listen und Basisdaten der Aktivitäten abrufen.' },
  { id: 'activities:detail', label: 'Aktivitätsdetails', description: 'Einzelne Fahrten und Streckendaten untersuchen.' },
  { id: 'statistics:read', label: 'Statistiken lesen', description: 'Aggregierte Trainingsstatistiken abrufen.' },
  { id: 'insights:read', label: 'Insights lesen', description: 'Rekorde und Langzeitanalysen verwenden.' },
] as const

interface OneTimeSecret {
  title: string
  label: string
  value: string
  clientId?: string
  expiresIn?: number
  scopes?: string[]
  canRequestToken?: boolean
}

export function McpAdminPage() {
  return <McpAdminContent minimal={false} />
}

export function MinimalMcpAdminPage() {
  return <McpAdminContent minimal />
}

export function useMcpAdminController() {
  const { profile } = useAuth()
  const client = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [editClient, setEditClient] = useState<McpClient | null>(null)
  const [tokenClient, setTokenClient] = useState<McpClient | null>(null)
  const [prefilledSecret, setPrefilledSecret] = useState('')
  const [oneTimeSecret, setOneTimeSecret] = useState<OneTimeSecret | null>(null)
  const [confirmDeactivate, setConfirmDeactivate] = useState<McpClient | null>(null)
  const clients = useQuery({
    queryKey: ['admin', 'mcp', 'clients'],
    queryFn: mcpAdminApi.clients,
    enabled: Boolean(profile?.is_admin),
  })
  const audit = useQuery({
    queryKey: ['admin', 'mcp', 'audit'],
    queryFn: () => mcpAdminApi.auditLog(100),
    enabled: Boolean(profile?.is_admin),
  })
  const refreshClients = () => client.invalidateQueries({ queryKey: ['admin', 'mcp', 'clients'] })
  const create = useMutation({ mutationFn: (data: McpClientCreate) => mcpAdminApi.createClient(data) })
  const update = useMutation({
    mutationFn: ({ clientId, data }: { clientId: string; data: McpClientUpdate }) => mcpAdminApi.updateClient(clientId, data),
  })
  const rotate = useMutation({ mutationFn: (clientId: string) => mcpAdminApi.rotateSecret(clientId) })
  const revokeTokens = useMutation({ mutationFn: (clientId: string) => mcpAdminApi.revokeTokens(clientId) })

  return {
    profile, createOpen, setCreateOpen, editClient, setEditClient, tokenClient, setTokenClient,
    prefilledSecret, setPrefilledSecret, oneTimeSecret, setOneTimeSecret, confirmDeactivate,
    setConfirmDeactivate, clients, audit, refreshClients, create, update, rotate, revokeTokens,
  }
}

function McpAdminContent({ minimal }: { minimal: boolean }) {
  const {
    profile, createOpen, setCreateOpen, editClient, setEditClient, tokenClient, setTokenClient,
    prefilledSecret, setPrefilledSecret, oneTimeSecret, setOneTimeSecret, confirmDeactivate,
    setConfirmDeactivate, clients, audit, refreshClients, create, update, rotate, revokeTokens,
  } = useMcpAdminController()

  if (!profile?.is_admin) {
    return (
      <>
        {minimal ? <MinimalMcpHeader description="Verwaltung externer, streng eingeschränkter Datenzugriffe." /> : <PageHeader eyebrow="ADMINISTRATION" title="MCP-Clients" description="Verwaltung externer, streng eingeschränkter Datenzugriffe." />}
        <Alert severity="warning">Dieser Bereich ist Administratoren vorbehalten.</Alert>
      </>
    )
  }

  async function createClient(data: McpClientCreate) {
    try {
      const result = await create.mutateAsync(data)
      const { client_secret: clientSecret, ...createdClient } = result
      await refreshClients()
      setCreateOpen(false)
      setOneTimeSecret({ title: 'MCP-Client angelegt', label: 'Client-Secret', value: clientSecret, clientId: createdClient.client_id, scopes: createdClient.scopes, canRequestToken: true })
      create.reset()
    } catch {
      // Die Fehlermeldung bleibt im Dialog sichtbar.
    }
  }

  async function updateClient(data: McpClientUpdate) {
    if (!editClient) return
    try {
      await update.mutateAsync({ clientId: editClient.client_id, data })
      await refreshClients()
      setEditClient(null)
      update.reset()
    } catch {
      // Die Fehlermeldung bleibt im Dialog sichtbar.
    }
  }

  async function toggleClient(target: McpClient, isActive: boolean) {
    try {
      await update.mutateAsync({ clientId: target.client_id, data: { is_active: isActive } })
      await refreshClients()
      setConfirmDeactivate(null)
      update.reset()
    } catch {
      // Die Fehlermeldung wird im Bestätigungsdialog angezeigt.
    }
  }

  async function rotateSecret(target: McpClient) {
    try {
      const result = await rotate.mutateAsync(target.client_id)
      setOneTimeSecret({ title: 'Client-Secret erneuert', label: 'Neues Client-Secret', value: result.client_secret, clientId: result.client_id, scopes: target.scopes, canRequestToken: true })
      rotate.reset()
    } catch {
      // Fehler wird oberhalb der Client-Liste angezeigt.
    }
  }

  return (
    <>
      {minimal ? <MinimalMcpHeader action={<Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => { create.reset(); setCreateOpen(true) }}>Client anlegen</Button>} /> : <PageHeader
        eyebrow="ADMINISTRATION"
        title="MCP-Clients"
        description="Vergib minimale Scopes, erzeuge kurzlebige Zugriffstoken und prüfe jeden MCP-Aufruf im Audit-Log."
        action={<Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => { create.reset(); setCreateOpen(true) }}>Client anlegen</Button>}
      />}

      <Alert severity="info" icon={<SecurityRoundedIcon />} sx={{ mb: 3 }}>
        Client-Secrets und Zugriffstoken werden nur einmal angezeigt und weder im Browser noch in Baseline Cycling im Klartext gespeichert.
      </Alert>

      {(rotate.isError || revokeTokens.isError || (update.isError && !confirmDeactivate && !editClient)) && <Alert severity="error" sx={{ mb: 2 }}>{errorMessage(rotate.error ?? revokeTokens.error ?? update.error)}</Alert>}
      {revokeTokens.isSuccess && <Alert severity="success" sx={{ mb: 2 }}>Alle kurzlebigen Token dieses Clients wurden widerrufen.</Alert>}
      {clients.isError && <ErrorState error={clients.error} onRetry={() => void clients.refetch()} />}
      {clients.isLoading && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 2 }}>{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} variant="rounded" height={240} />)}</Box>}
      {clients.data && clients.data.length === 0 && (
        <Card><EmptyState title="Noch keine MCP-Clients" description="Lege einen Client an und erteile nur die Scopes, die seine Integration wirklich benötigt." action={<Button variant="contained" onClick={() => setCreateOpen(true)}>Ersten Client anlegen</Button>} /></Card>
      )}
      {clients.data && clients.data.length > 0 && (
        <Box component="section" aria-label="MCP-Clients" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {clients.data.map((mcpClient) => (
            <ClientCard
              key={mcpClient.client_id}
              client={mcpClient}
              busy={update.isPending || rotate.isPending || revokeTokens.isPending}
              onEdit={() => { update.reset(); setEditClient(mcpClient) }}
              onToken={() => { setPrefilledSecret(''); setTokenClient(mcpClient) }}
              onToggle={() => mcpClient.is_active ? setConfirmDeactivate(mcpClient) : void toggleClient(mcpClient, true)}
              onRotate={() => void rotateSecret(mcpClient)}
              onRevokeTokens={() => revokeTokens.mutate(mcpClient.client_id)}
            />
          ))}
        </Box>
      )}

      <Box sx={{ mt: 4 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 1.5 }}>
          <Stack direction="row" alignItems="center" gap={1}><HistoryRoundedIcon color="primary" /><Box><Typography variant="h3">Audit-Log</Typography><Typography variant="body2" color="text.secondary">Die letzten 100 protokollierten MCP-Anfragen</Typography></Box></Stack>
          <Tooltip title="Audit-Log aktualisieren"><IconButton aria-label="Audit-Log aktualisieren" onClick={() => void audit.refetch()}><RefreshRoundedIcon /></IconButton></Tooltip>
        </Stack>
        <Card>
          {audit.isError && <Box sx={{ p: 2 }}><ErrorState error={audit.error} onRetry={() => void audit.refetch()} /></Box>}
          {audit.isLoading && <Box sx={{ p: 2 }}><Skeleton variant="rounded" height={220} /></Box>}
          {audit.data && audit.data.length === 0 && <EmptyState title="Noch keine Aufrufe" description="Sobald ein MCP-Client ein Werkzeug verwendet, erscheint der Aufruf hier." />}
          {audit.data && audit.data.length > 0 && <Stack divider={<Box sx={{ borderTop: '1px solid', borderColor: 'divider' }} />}>{audit.data.map((entry, index) => (
            <Box key={`${entry.client_id ?? 'unknown'}-${entry.created_at}-${index}`} sx={{ px: { xs: 2, sm: 2.5 }, py: 1.75, display: 'grid', gridTemplateColumns: { xs: '1fr auto', md: 'minmax(160px, .7fr) minmax(160px, 1fr) 120px 100px 160px' }, gap: 1, alignItems: 'center' }}>
              <Box sx={{ minWidth: 0 }}><Typography variant="body2" fontWeight={750} noWrap>{entry.tool_name || entry.method}</Typography><Typography variant="caption" color="text.secondary" noWrap>{entry.client_id || 'Unbekannter Client'}</Typography>{minimal && <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', md: 'none' }, mt: .25 }}>{entry.method} · {entry.duration_ms} ms · {formatDateTime(entry.created_at)}</Typography>}</Box>
              <Chip size="small" color={entry.outcome === 'success' || entry.outcome === 'accepted' ? 'success' : 'error'} variant="outlined" label={entry.outcome} />
              <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' } }}>{entry.method}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', md: 'block' } }}>{entry.duration_ms} ms</Typography>
              <Typography variant="caption" color="text.secondary" textAlign="right" sx={{ display: { xs: 'none', md: 'block' } }}>{formatDateTime(entry.created_at)}</Typography>
            </Box>
          ))}</Stack>}
        </Card>
      </Box>

      <ClientDialog
        open={createOpen}
        mode="create"
        ownerUserId={profile.id}
        busy={create.isPending}
        error={create.error}
        onClose={() => setCreateOpen(false)}
        onSubmit={(data) => void createClient(data as McpClientCreate)}
      />
      <ClientDialog
        open={Boolean(editClient)}
        mode="edit"
        client={editClient}
        ownerUserId={editClient?.owner_user_id ?? profile.id}
        busy={update.isPending}
        error={update.error}
        onClose={() => setEditClient(null)}
        onSubmit={(data) => void updateClient(data as McpClientUpdate)}
      />
      <TokenDialog
        client={tokenClient}
        initialSecret={prefilledSecret}
        onClose={() => { setTokenClient(null); setPrefilledSecret('') }}
        onCreated={(secret) => { setTokenClient(null); setPrefilledSecret(''); setOneTimeSecret(secret) }}
      />
      <OneTimeSecretDialog
        secret={oneTimeSecret}
        onClose={() => setOneTimeSecret(null)}
        onRequestToken={oneTimeSecret?.clientId && oneTimeSecret.canRequestToken ? () => {
          const target = clients.data?.find((item) => item.client_id === oneTimeSecret.clientId) ?? null
          setPrefilledSecret(oneTimeSecret.value)
          setTokenClient(target)
          setOneTimeSecret(null)
        } : undefined}
      />

      <Dialog open={Boolean(confirmDeactivate)} onClose={update.isPending ? undefined : () => setConfirmDeactivate(null)} maxWidth="xs" fullWidth>
        <DialogTitle>MCP-Client deaktivieren?</DialogTitle>
        <DialogContent>
          <Typography>Alle aktiven Token von „{confirmDeactivate?.name}“ werden widerrufen. Der Client kann später wieder aktiviert werden.</Typography>
          {update.isError && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(update.error)}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}><Button color="inherit" onClick={() => setConfirmDeactivate(null)}>Abbrechen</Button><Button color="error" variant="contained" disabled={update.isPending} onClick={() => confirmDeactivate && void toggleClient(confirmDeactivate, false)}>Deaktivieren</Button></DialogActions>
      </Dialog>
    </>
  )
}

function MinimalMcpHeader({ description = 'Vergib minimale Scopes, erzeuge kurzlebige Zugriffstoken und prüfe jeden MCP-Aufruf im Audit-Log.', action }: { description?: string; action?: React.ReactNode }) {
  return <Stack component="header" direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-end' }} gap={2.5} sx={{ mb: { xs: 4, md: 6 }, pt: { md: 2 } }}><Box sx={{ maxWidth: 760 }}><Typography variant="overline" color="primary.main">Administration</Typography><Typography component="h1" variant="h1" sx={{ mt: 1 }}>MCP-Zugänge</Typography><Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 680 }}>{description}</Typography></Box>{action}</Stack>
}

function ClientCard({ client, busy, onEdit, onToken, onToggle, onRotate, onRevokeTokens }: { client: McpClient; busy: boolean; onEdit: () => void; onToken: () => void; onToggle: () => void; onRotate: () => void; onRevokeTokens: () => void }) {
  return (
    <Card sx={{ height: '100%', opacity: client.is_active ? 1 : .82 }}>
      <CardContent sx={{ p: 2.5 }}>
        <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
          <Box sx={{ minWidth: 0 }}><Stack direction="row" alignItems="center" gap={.75}><Typography variant="h3" noWrap>{client.name}</Typography><Chip size="small" color={client.revoked_at ? 'error' : client.is_active ? 'success' : 'default'} label={client.revoked_at ? 'Widerrufen' : client.is_active ? 'Aktiv' : 'Deaktiviert'} /></Stack><Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{client.client_id}</Typography></Box>
          <Tooltip title="Client bearbeiten"><IconButton aria-label={`${client.name} bearbeiten`} onClick={onEdit} disabled={busy || Boolean(client.revoked_at)}><EditRoundedIcon /></IconButton></Tooltip>
        </Stack>
        <Stack direction="row" gap={.75} flexWrap="wrap" sx={{ my: 2 }}>{client.scopes.map((scope) => <Chip key={scope} size="small" variant="outlined" label={scopeDefinitions.find((item) => item.id === scope)?.label ?? scope} />)}{client.scopes.length === 0 && <Chip size="small" label="Keine Scopes" />}</Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 2 }}><Box><Typography variant="caption" color="text.secondary">Erstellt</Typography><Typography variant="body2">{formatDateTime(client.created_at)}</Typography></Box><Box><Typography variant="caption" color="text.secondary">Zuletzt verwendet</Typography><Typography variant="body2">{client.last_used_at ? formatDateTime(client.last_used_at) : 'Noch nie'}</Typography></Box></Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button size="small" variant="contained" startIcon={<VpnKeyRoundedIcon />} onClick={onToken} disabled={busy || !client.is_active || Boolean(client.revoked_at)}>Token anfordern</Button>
          <Button size="small" startIcon={<KeyRoundedIcon />} onClick={onRotate} disabled={busy || Boolean(client.revoked_at)}>Secret erneuern</Button>
          <Button size="small" startIcon={<BlockRoundedIcon />} onClick={onRevokeTokens} disabled={busy || Boolean(client.revoked_at)}>Token widerrufen</Button>
          <Button size="small" color={client.is_active ? 'error' : 'success'} startIcon={<PowerSettingsNewRoundedIcon />} onClick={onToggle} disabled={busy || Boolean(client.revoked_at)}>{client.is_active ? 'Deaktivieren' : 'Aktivieren'}</Button>
        </Stack>
      </CardContent>
    </Card>
  )
}

interface ClientDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  client?: McpClient | null
  ownerUserId: string
  busy: boolean
  error: unknown
  onClose: () => void
  onSubmit: (data: McpClientCreate | McpClientUpdate) => void
}

function ClientDialog({ open, mode, client, ownerUserId, busy, error, onClose, onSubmit }: ClientDialogProps) {
  const [name, setName] = useState('')
  const [owner, setOwner] = useState(ownerUserId)
  const [scopes, setScopes] = useState<string[]>([])
  useEffect(() => {
    if (!open) return
    setName(client?.name ?? '')
    setOwner(client?.owner_user_id ?? ownerUserId)
    setScopes(client?.scopes ?? [])
  }, [client, open, ownerUserId])
  function toggle(scope: string) { setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]) }
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{mode === 'create' ? 'MCP-Client anlegen' : 'MCP-Client bearbeiten'}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <TextField label="Name" required value={name} onChange={(event) => setName(event.target.value)} inputProps={{ maxLength: 120 }} />
        {mode === 'create' && <TextField label="Besitzerkonto-ID" required value={owner} onChange={(event) => setOwner(event.target.value)} helperText="Standardmäßig gehört der Client deinem Administratorkonto." />}
        <Box><Typography fontWeight={750}>Scopes</Typography><Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Wähle nur die Berechtigungen, die der Client benötigt.</Typography><Stack>{scopeDefinitions.map((scope) => <FormControlLabel key={scope.id} control={<Checkbox checked={scopes.includes(scope.id)} onChange={() => toggle(scope.id)} />} label={<Box><Typography variant="body2" fontWeight={700}>{scope.label}</Typography><Typography variant="caption" color="text.secondary">{scope.description}</Typography></Box>} />)}</Stack></Box>
        {Boolean(error) && <Alert severity="error">{errorMessage(error)}</Alert>}
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}><Button color="inherit" onClick={onClose}>Abbrechen</Button><Button variant="contained" disabled={busy || !name.trim() || (mode === 'create' && !owner.trim())} onClick={() => onSubmit(mode === 'create' ? { name: name.trim(), owner_user_id: owner.trim(), scopes } : { name: name.trim(), scopes })}>{busy ? 'Wird gespeichert …' : 'Speichern'}</Button></DialogActions>
    </Dialog>
  )
}

function TokenDialog({ client, initialSecret, onClose, onCreated }: { client: McpClient | null; initialSecret: string; onClose: () => void; onCreated: (secret: OneTimeSecret) => void }) {
  const [clientSecret, setClientSecret] = useState('')
  const [scopes, setScopes] = useState<string[]>([])
  const token = useMutation({ mutationFn: mcpAdminApi.requestToken })
  useEffect(() => {
    if (client) {
      setClientSecret(initialSecret)
      setScopes(client.scopes)
      token.reset()
    } else {
      setClientSecret('')
      setScopes([])
      token.reset()
    }
  }, [client, initialSecret])
  function close() {
    setClientSecret('')
    setScopes([])
    token.reset()
    onClose()
  }
  function toggle(scope: string) { setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]) }
  async function submit() {
    if (!client) return
    try {
      const result = await token.mutateAsync({ client_id: client.client_id, client_secret: clientSecret, scopes })
      setClientSecret('')
      token.reset()
      onCreated({ title: 'Kurzlebiger Zugriffstoken', label: 'Access-Token', value: result.access_token, clientId: client.client_id, expiresIn: result.expires_in, scopes: result.scopes })
    } catch {
      // Die Fehlermeldung bleibt im Dialog sichtbar.
    }
  }
  return (
    <Dialog open={Boolean(client)} onClose={token.isPending ? undefined : close} fullWidth maxWidth="sm">
      <DialogTitle>Zugriffstoken anfordern</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <TextField label="Client-ID" value={client?.client_id ?? ''} slotProps={{ input: { readOnly: true } }} />
        <TextField label="Client-Secret" type="password" autoComplete="off" required value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} helperText="Das Secret wird nur für diese Anfrage im Arbeitsspeicher gehalten." />
        <Box><Typography fontWeight={750}>Token-Scopes</Typography><Typography variant="caption" color="text.secondary">Nur eine Teilmenge der Client-Scopes ist zulässig.</Typography><Stack sx={{ mt: .5 }}>{scopeDefinitions.filter((scope) => client?.scopes.includes(scope.id)).map((scope) => <FormControlLabel key={scope.id} control={<Checkbox checked={scopes.includes(scope.id)} onChange={() => toggle(scope.id)} />} label={scope.label} />)}</Stack></Box>
        {token.isError && <Alert severity="error">{errorMessage(token.error)}</Alert>}
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}><Button color="inherit" onClick={close}>Abbrechen</Button><Button variant="contained" disabled={token.isPending || clientSecret.length < 24} onClick={() => void submit()}>{token.isPending ? 'Wird angefordert …' : 'Token anfordern'}</Button></DialogActions>
    </Dialog>
  )
}

export function OneTimeSecretDialog({ secret, onClose, onRequestToken }: { secret: OneTimeSecret | null; onClose: () => void; onRequestToken?: () => void }) {
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  useEffect(() => { setCopied(false); setCopyError(false) }, [secret])
  async function copy() { if (secret) { try { await navigator.clipboard.writeText(secret.value); setCopied(true); setCopyError(false) } catch { setCopyError(true) } } }
  return (
    <Dialog open={Boolean(secret)} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{secret?.title}</DialogTitle>
      <DialogContent><Stack spacing={2}>
        <Alert severity="warning">Dieses Geheimnis wird nur jetzt angezeigt. Kopiere es an einen sicheren Ort; nach dem Schließen kann Baseline Cycling es nicht wiederherstellen.</Alert>
        {secret?.clientId && <TextField label="Client-ID" value={secret.clientId} slotProps={{ input: { readOnly: true } }} />}
        <TextField label={secret?.label} value={secret?.value ?? ''} multiline minRows={3} slotProps={{ input: { readOnly: true } }} sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '.82rem', overflowWrap: 'anywhere' } }} />
        {secret?.expiresIn != null && <Typography variant="body2" color="text.secondary">Gültigkeit: {Math.round(secret.expiresIn / 60)} Minuten · Scopes: {secret.scopes?.join(', ') || 'keine'}</Typography>}
        <Button variant="outlined" startIcon={<ContentCopyRoundedIcon />} onClick={() => void copy()}>{copied ? 'Kopiert' : 'In die Zwischenablage kopieren'}</Button>
        <Box role="status" aria-live="polite"><Typography variant="caption" color={copyError ? 'error' : 'text.secondary'}>{copyError ? 'Kopieren war nicht möglich. Markiere das Geheimnis und kopiere es manuell.' : copied ? 'Das Geheimnis wurde in die Zwischenablage kopiert.' : ''}</Typography></Box>
      </Stack></DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>{onRequestToken && <Button startIcon={<VpnKeyRoundedIcon />} onClick={onRequestToken}>Direkt Token anfordern</Button>}<Box sx={{ flex: 1 }} /><Button variant="contained" onClick={onClose}>Ich habe es sicher gespeichert</Button></DialogActions>
    </Dialog>
  )
}
