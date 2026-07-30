import { useEffect, useRef, useState } from 'react'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded'
import DirectionsBikeRoundedIcon from '@mui/icons-material/DirectionsBikeRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded'
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded'
import { Alert, Avatar, Box, Button, Card, CardContent, CircularProgress, Divider, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material'
import { useMutation, useQuery } from '@tanstack/react-query'
import { activitiesApi, chatApi, type AIDataBasis, type ChatHistoryItem, type ChatSource } from '../api'
import { useAuth } from '../auth/AuthContext'
import { AIDataBasisPanel } from '../components/AIDataBasisPanel'
import { MarkdownText } from '../components/MarkdownText'
import { PageHeader } from '../components/PageHeader'
import { errorMessage, formatDate } from '../utils/format'

interface ChatUiMessage extends ChatHistoryItem {
  id: string
  sources?: ChatSource[]
  toolsUsed?: string[]
  provider?: string
  dataBasis?: AIDataBasis | null
}

interface ChatRequest {
  message: string
  history: ChatHistoryItem[]
  focusId?: string
}

const quickPrompts = [
  'Wie hat sich meine Ausdauer in den letzten drei Monaten entwickelt?',
  'Welche war meine beste Grundlagenausdauer-Einheit?',
  'Bei welcher schnellen Fahrt hatte ich besonders viel Gegenwind?',
  'Was sollte ich als Nächstes trainieren?',
]

function messageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function welcomeMessage(): ChatUiMessage {
  return {
    id: 'welcome',
    role: 'assistant',
    content: 'Hallo! Ich bin dein Baseline Cycling Coach. Frag mich nach deiner Fitnessentwicklung, einzelnen Fahrten, Herzfrequenz, Wetter oder Trainingsideen. Ich suche die passenden Daten gezielt für dich heraus.',
  }
}

function loadHistory(key: string): ChatUiMessage[] {
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return [welcomeMessage()]
    const parsed = JSON.parse(stored) as ChatUiMessage[]
    return Array.isArray(parsed) && parsed.length ? parsed : [welcomeMessage()]
  } catch {
    return [welcomeMessage()]
  }
}

const toolLabels: Record<string, string> = {
  list_activities: 'Aktivitäten durchsucht',
  search_activities: 'Aktivitäten durchsucht',
  get_activity: 'Fahrtdetails geladen',
  get_activity_details: 'Fahrtdetails geladen',
  get_activity_track: 'Streckendaten analysiert',
  find_similar_activities: 'Ähnliche Fahrten gesucht',
  compare_activities: 'Fahrten verglichen',
  get_statistics: 'Statistik ausgewertet',
  get_training_statistics: 'Statistik ausgewertet',
  get_weather: 'Wetter geprüft',
  get_splits: 'Kilometerabschnitte geprüft',
  analyze_route_segment: 'Streckenabschnitt analysiert',
}

export function useChatController() {
  const { profile } = useAuth()
  const storageKey = `avento.chat.history.${profile?.id ?? 'local'}`
  const [messages, setMessages] = useState<ChatUiMessage[]>(() => loadHistory(storageKey))
  const [input, setInput] = useState('')
  const [activityId, setActivityId] = useState('')
  const [failedRequest, setFailedRequest] = useState<ChatRequest | null>(null)
  const activities = useQuery({ queryKey: ['activities', 'chat-picker'], queryFn: () => activitiesApi.list({ limit: 50 }) })
  const chat = useMutation({
    mutationFn: ({ message, history, focusId }: ChatRequest) => chatApi.send(message, history, focusId),
    onSuccess: (response) => {
      setFailedRequest(null)
      setMessages((current) => [...current, {
        id: messageId(),
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        toolsUsed: response.tools_used,
        provider: response.provider,
        dataBasis: response.data_basis,
      }])
    },
  })

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50)))
  }, [messages, storageKey])

  function submit(text = input) {
    const message = text.trim()
    if (!message || chat.isPending) return
    const history = messages.slice(-20).map(({ role, content }) => ({ role, content }))
    setMessages((current) => [...current, { id: messageId(), role: 'user', content: message }])
    setInput('')
    chat.reset()
    const request = { message, history, focusId: activityId || undefined }
    setFailedRequest(request)
    chat.mutate(request)
  }

  function retry() {
    if (!failedRequest || chat.isPending) return
    chat.reset()
    chat.mutate(failedRequest)
  }

  function clearHistory() {
    setMessages([welcomeMessage()])
    setInput('')
    setFailedRequest(null)
    chat.reset()
  }

  return { profile, messages, input, setInput, activityId, setActivityId, activities, chat, submit, retry, clearHistory }
}

export function ChatPage() {
  const controller = useChatController()
  const { profile, messages, input, setInput, activityId, setActivityId, activities, chat, submit, clearHistory } = controller
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, chat.isPending])

  return (
    <>
      <PageHeader
        eyebrow="DEIN PERSÖNLICHER COACH"
        title="Baseline Cycling Chat"
        description="Sprich mit deinen gesamten Trainingsdaten. Der Coach kann Aktivitäten, Strecken, Kilometerwerte, Herzfrequenz und Wetter gezielt abrufen."
        action={<Button color="inherit" startIcon={<DeleteSweepRoundedIcon />} onClick={clearHistory} disabled={messages.length <= 1}>Verlauf leeren</Button>}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 320px' }, gap: 2.5, alignItems: 'start' }}>
        <Card sx={{ overflow: 'hidden' }}>
          <Box sx={{ height: { xs: 'min(58vh, 600px)', md: 'min(64vh, 680px)' }, minHeight: 430, overflowY: 'auto', p: { xs: 2, sm: 3 }, bgcolor: 'rgba(var(--mui-palette-background-defaultChannel) / .55)' }} aria-live="polite">
            <Stack spacing={2.25}>
              {messages.map((message) => <ChatBubble key={message.id} message={message} profileName={profile?.display_name} avatar={profile?.avatar_data_url} />)}
              {chat.isPending && (
                <Stack direction="row" gap={1.25} alignItems="flex-start">
                  <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main' }}><SmartToyRoundedIcon fontSize="small" /></Avatar>
                  <Box sx={{ px: 2, py: 1.5, bgcolor: 'background.paper', borderRadius: '4px 18px 18px 18px', border: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" alignItems="center" gap={1}><CircularProgress size={18} /><Typography variant="body2" color="text.secondary">Ich durchsuche deine Trainingsdaten …</Typography></Stack>
                  </Box>
                </Stack>
              )}
              <div ref={endRef} />
            </Stack>
          </Box>
          <Divider />
          <Box component="form" onSubmit={(event) => { event.preventDefault(); submit() }} sx={{ p: { xs: 1.5, sm: 2 }, bgcolor: 'background.paper' }}>
            {chat.isError && <Alert severity="error" sx={{ mb: 1.5 }}>{errorMessage(chat.error)}</Alert>}
            <Stack direction="row" gap={1} alignItems="flex-end">
              <TextField
                fullWidth
                multiline
                maxRows={5}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit() } }}
                placeholder="Was möchtest du über dein Training wissen?"
                slotProps={{ htmlInput: { 'aria-label': 'Nachricht an Baseline Cycling Chat' } }}
              />
              <Button type="submit" variant="contained" aria-label="Nachricht senden" disabled={!input.trim() || chat.isPending} sx={{ minWidth: 48, width: 48, px: 0 }}><SendRoundedIcon /></Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>Enter sendet · Umschalt + Enter fügt eine neue Zeile ein</Typography>
          </Box>
        </Card>

        <Stack spacing={2.5}>
          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" gap={1}><DirectionsBikeRoundedIcon color="primary" /><Typography variant="h3">Fokusfahrt</Typography></Stack>
              <Typography variant="body2" color="text.secondary" sx={{ my: 1.5 }}>Optional kannst du eine konkrete Fahrt als Ausgangspunkt setzen.</Typography>
              <TextField select fullWidth label="Aktivität" value={activityId} onChange={(event) => setActivityId(event.target.value)} disabled={activities.isLoading || activities.isError}>
                <MenuItem value="">Alle Trainingsdaten</MenuItem>
                {activities.data?.items.map((activity) => <MenuItem key={activity.id} value={activity.id}>{activity.title} · {formatDate(activity.started_at)}</MenuItem>)}
              </TextField>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" gap={1}><AutoAwesomeRoundedIcon color="primary" /><Typography variant="h3">Ideen zum Fragen</Typography></Stack>
              <Stack spacing={1} sx={{ mt: 1.5 }}>
                {quickPrompts.map((prompt) => <Button key={prompt} variant="outlined" color="inherit" onClick={() => submit(prompt)} disabled={chat.isPending} sx={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', py: 1.1 }}>{prompt}</Button>)}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Stack direction="row" alignItems="center" gap={1}><TravelExploreRoundedIcon color="primary" /><Typography variant="h3">Nachvollziehbar</Typography></Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25, lineHeight: 1.65 }}>Antworten verlinken die verwendeten Fahrten und zeigen, welche Datenwerkzeuge eingesetzt wurden. So kannst du jede Aussage direkt prüfen.</Typography>
            </CardContent>
          </Card>
        </Stack>
      </Box>
    </>
  )
}

export function MinimalChatPage() {
  const { profile, messages, input, setInput, activityId, setActivityId, activities, chat, submit, retry, clearHistory } = useChatController()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const followRef = useRef(true)

  useEffect(() => {
    if (followRef.current) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages, chat.isPending])

  function trackScroll() {
    const node = scrollerRef.current
    if (node) followRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 120
  }

  return (
    <Stack spacing={{ xs: 4, md: 6 }} sx={{ minHeight: 'calc(100dvh - 150px)' }}>
      <Stack component="header" direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} alignItems={{ sm: 'flex-end' }}>
        <Box sx={{ maxWidth: 760 }}>
          <Typography variant="overline" color="primary.main">Dein persönlicher Coach</Typography>
          <Typography component="h1" variant="h1" sx={{ mt: 1 }}>Baseline Cycling Chat</Typography>
          <Typography color="text.secondary" sx={{ mt: 1.5, maxWidth: 680 }}>Frage nach Entwicklung, einzelnen Fahrten, Herzfrequenz, Wetter oder deinem nächsten Trainingsimpuls.</Typography>
        </Box>
        <Tooltip title="Gesprächsverlauf leeren"><span><IconButton aria-label="Gesprächsverlauf leeren" onClick={clearHistory} disabled={messages.length <= 1}><DeleteSweepRoundedIcon /></IconButton></span></Tooltip>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 290px' }, gap: 2.5, minHeight: 0, flex: 1 }}>
        <Card component="section" aria-label="Gespräch mit Baseline Cycling" sx={{ bgcolor: 'var(--avento-minimal-surface-subtle)', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: { xs: 'min(680px, calc(100dvh - 250px))', md: 650 } }}>
          <Box ref={scrollerRef} onScroll={trackScroll} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', p: { xs: 2, sm: 3 } }} aria-live="polite" aria-busy={chat.isPending}>
            <Stack spacing={2.5}>
              {messages.map((message) => <MinimalChatBubble key={message.id} message={message} profileName={profile?.display_name} avatar={profile?.avatar_data_url} />)}
              {chat.isPending && <Stack direction="row" gap={1.25} alignItems="center"><Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.main' }}><SmartToyRoundedIcon fontSize="small" /></Avatar><CircularProgress size={17} /><Typography variant="body2" color="text.secondary">Ich durchsuche deine Trainingsdaten …</Typography></Stack>}
              <div ref={endRef} />
            </Stack>
          </Box>
          <Box component="form" onSubmit={(event) => { event.preventDefault(); followRef.current = true; submit() }} sx={{ position: 'sticky', bottom: 0, borderTop: '1px solid', borderColor: 'divider', p: { xs: 1.5, sm: 2 }, bgcolor: 'var(--avento-minimal-surface-raised)', pb: 'max(12px, env(safe-area-inset-bottom))' }}>
            {chat.isError && <Alert severity="error" action={<Button color="inherit" size="small" onClick={retry}>Erneut versuchen</Button>} sx={{ mb: 1.5 }}>{errorMessage(chat.error)}</Alert>}
            <Stack direction="row" gap={1} alignItems="flex-end">
              <TextField fullWidth multiline maxRows={5} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); followRef.current = true; submit() } }} placeholder="Was möchtest du über dein Training wissen?" slotProps={{ htmlInput: { 'aria-label': 'Nachricht an Baseline Cycling Chat' } }} />
              <IconButton type="submit" color="primary" aria-label="Nachricht senden" disabled={!input.trim() || chat.isPending} sx={{ width: 48, height: 48, border: '1px solid', borderColor: 'divider' }}><SendRoundedIcon /></IconButton>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: .75, display: { xs: 'none', sm: 'block' } }}>Enter sendet · Umschalt + Enter fügt eine neue Zeile ein</Typography>
          </Box>
        </Card>

        <Stack component="aside" aria-label="Chat-Einstellungen" spacing={2}>
          <Box sx={{ pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="overline" color="text.secondary">Fokus</Typography>
            <Typography variant="h3" sx={{ mt: .5 }}>Eine Fahrt vertiefen</Typography>
            <TextField select fullWidth size="small" label="Aktivität" value={activityId} onChange={(event) => setActivityId(event.target.value)} disabled={activities.isLoading || activities.isError} sx={{ mt: 2 }}>
              <MenuItem value="">Alle Trainingsdaten</MenuItem>
              {activities.data?.items.map((activity) => <MenuItem key={activity.id} value={activity.id}>{activity.title} · {formatDate(activity.started_at)}</MenuItem>)}
            </TextField>
            {activities.isError && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>Aktivitäten konnten nicht geladen werden.</Typography>}
          </Box>
          <Box>
            <Typography variant="overline" color="text.secondary">Frageideen</Typography>
            <Stack spacing={.75} sx={{ mt: 1.5 }}>{quickPrompts.map((prompt) => <Button key={prompt} variant="text" color="inherit" onClick={() => { followRef.current = true; submit(prompt) }} disabled={chat.isPending} sx={{ justifyContent: 'flex-start', textAlign: 'left', height: 'auto', px: 0 }}>{prompt}</Button>)}</Stack>
          </Box>
        </Stack>
      </Box>
    </Stack>
  )
}

function MinimalChatBubble({ message, profileName, avatar }: { message: ChatUiMessage; profileName?: string; avatar?: string | null }) {
  const user = message.role === 'user'
  return <Stack direction={user ? 'row-reverse' : 'row'} gap={1.25} alignItems="flex-start">
    <Avatar src={user ? avatar ?? undefined : undefined} aria-hidden sx={{ width: 32, height: 32, bgcolor: user ? 'secondary.dark' : 'primary.main', color: 'white', fontSize: '.85rem', fontWeight: 800 }}>{user ? profileName?.charAt(0).toUpperCase() : <SmartToyRoundedIcon fontSize="small" />}</Avatar>
    <Box sx={{ minWidth: 0, maxWidth: { xs: 'calc(100% - 44px)', sm: '82%' } }}>
      <Typography variant="caption" color="text.secondary">{user ? 'Du' : 'Baseline Cycling'}</Typography>
      <Box sx={{ mt: .5, px: { xs: 1.5, sm: 2 }, py: 1.5, bgcolor: user ? 'rgba(185,232,120,.12)' : 'var(--avento-minimal-surface-raised)', border: '1px solid', borderColor: user ? 'rgba(185,232,120,.35)' : 'divider', borderRadius: user ? '16px 8px 16px 16px' : '8px 16px 16px 16px', overflowWrap: 'anywhere' }}><MarkdownText content={message.content} /></Box>
      {!user && message.provider && <Box sx={{ mt: 1 }}><AIDataBasisPanel dataBasis={message.dataBasis} sources={message.sources} tools={message.toolsUsed} toolLabels={toolLabels} provider={message.provider} /></Box>}
    </Box>
  </Stack>
}

function ChatBubble({ message, profileName, avatar }: { message: ChatUiMessage; profileName?: string; avatar?: string | null }) {
  const user = message.role === 'user'
  return (
    <Stack direction={user ? 'row-reverse' : 'row'} gap={1.25} alignItems="flex-start">
      <Avatar src={user ? avatar ?? undefined : undefined} sx={{ width: 36, height: 36, bgcolor: user ? 'secondary.light' : 'primary.main', color: user ? 'secondary.dark' : 'white', fontWeight: 800 }}>
        {user ? profileName?.charAt(0).toUpperCase() : <SmartToyRoundedIcon fontSize="small" />}
      </Avatar>
      <Box sx={{ maxWidth: { xs: 'calc(100% - 52px)', sm: '80%' } }}>
        <Box sx={{ px: 2, py: 1.5, bgcolor: user ? 'primary.main' : 'background.paper', color: user ? 'primary.contrastText' : 'text.primary', borderRadius: user ? '18px 4px 18px 18px' : '4px 18px 18px 18px', border: user ? 'none' : '1px solid', borderColor: 'divider', boxShadow: user ? 'none' : '0 8px 24px rgba(20,50,45,.05)' }}>
          <MarkdownText content={message.content} />
        </Box>
        {!user && message.provider && (
          <Box sx={{ mt: 1.1 }}>
            <AIDataBasisPanel
              dataBasis={message.dataBasis}
              sources={message.sources}
              tools={message.toolsUsed}
              toolLabels={toolLabels}
              provider={message.provider}
              defaultExpanded
            />
          </Box>
        )}
      </Box>
    </Stack>
  )
}
