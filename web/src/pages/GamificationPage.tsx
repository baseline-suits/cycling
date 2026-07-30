import { useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import CottageRoundedIcon from '@mui/icons-material/CottageRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import FlagRoundedIcon from '@mui/icons-material/FlagRounded'
import LocalFireDepartmentRoundedIcon from '@mui/icons-material/LocalFireDepartmentRounded'
import LocationCityRoundedIcon from '@mui/icons-material/LocationCityRounded'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import MilitaryTechRoundedIcon from '@mui/icons-material/MilitaryTechRounded'
import PauseCircleRoundedIcon from '@mui/icons-material/PauseCircleRounded'
import PublicRoundedIcon from '@mui/icons-material/PublicRounded'
import RouteRoundedIcon from '@mui/icons-material/RouteRounded'
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded'
import StarsRoundedIcon from '@mui/icons-material/StarsRounded'
import WorkspacePremiumRoundedIcon from '@mui/icons-material/WorkspacePremiumRounded'
import {
  Alert,
  alpha,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  LinearProgress,
  Skeleton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'
import {
  gamificationApi,
  gamificationOverviewQueryKey,
  type GamificationAnnualAward,
  type GamificationBadge,
  type GamificationChallenge,
  type GamificationDiscovery,
  type GamificationDiscoveryScope,
  type GamificationGoal,
  type GamificationGoalInput,
  type GamificationOverview,
  type GamificationRecordChase,
  type GamificationStreak,
} from '../api'
import { GamificationLevelCard } from '../components/gamification/GamificationLevelCard'
import { DiscoveryGeocodingControl } from '../components/gamification/DiscoveryGeocodingControl'
import { GoalDialog } from '../components/gamification/GoalDialog'
import { formatGamificationValue, formatXp, periodLabel } from '../components/gamification/gamificationFormat'
import { PageHeader } from '../components/PageHeader'
import { ErrorState } from '../components/States'
import { errorMessage, formatDate } from '../utils/format'

type ChallengeAction = 'accept' | 'decline'

const weatherSafetyFallback = 'Wetter, Sicht und Streckenzustand gehen immer vor. Passe die Challenge an oder brich sie ab, wenn sich die Bedingungen nicht sicher anfühlen.'

export function GamificationPage() {
  const queryClient = useQueryClient()
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GamificationGoal | null>(null)
  const [deletingGoal, setDeletingGoal] = useState<GamificationGoal | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const overview = useQuery({
    queryKey: gamificationOverviewQueryKey,
    queryFn: gamificationApi.overview,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: gamificationOverviewQueryKey })
  const saveGoal = useMutation({
    mutationFn: ({ goal, input }: { goal: GamificationGoal | null; input: GamificationGoalInput }) =>
      goal ? gamificationApi.updateGoal(goal.id, input) : gamificationApi.createGoal(input),
    onSuccess: (_, variables) => {
      setGoalDialogOpen(false)
      setEditingGoal(null)
      setNotice(variables.goal ? 'Ziel aktualisiert.' : 'Ziel angelegt.')
      void refresh()
    },
  })
  const deleteGoal = useMutation({
    mutationFn: (goal: GamificationGoal) => gamificationApi.deleteGoal(goal.id),
    onSuccess: () => {
      setDeletingGoal(null)
      setNotice('Ziel gelöscht.')
      void refresh()
    },
  })
  const challenge = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ChallengeAction }) =>
      action === 'accept' ? gamificationApi.acceptChallenge(id) : gamificationApi.declineChallenge(id),
    onSuccess: (_, variables) => {
      setNotice(variables.action === 'accept' ? 'Challenge angenommen. Du kannst sie in deinem Tempo angehen.' : 'Vorschlag ausgeblendet.')
      void refresh()
    },
  })

  function openCreateGoal() {
    saveGoal.reset()
    setEditingGoal(null)
    setGoalDialogOpen(true)
  }

  function openEditGoal(goal: GamificationGoal) {
    saveGoal.reset()
    setEditingGoal(goal)
    setGoalDialogOpen(true)
  }

  return (
    <>
      <PageHeader
        eyebrow="DEINE MEILENSTEINE"
        title="Fortschritt, der dir gehört"
        description="Setze eigene Ziele, entdecke neue Orte und würdige deine persönlichen Leistungen – privat und ohne Rangliste."
        action={<Button variant="contained" startIcon={<AddRoundedIcon />} onClick={openCreateGoal}>Eigenes Ziel</Button>}
      />

      {overview.isLoading && <GamificationPageSkeleton />}
      {overview.isError && <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />}
      {overview.data && (
        <Stack spacing={{ xs: 2, md: 2.5 }}>
          <GamificationLevelCard overview={overview.data} />

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.55fr) minmax(320px, .75fr)' }, gap: 2.5, alignItems: 'start' }}>
            <Stack spacing={2.5} minWidth={0}>
              <GoalsPanel goals={overview.data.goals} onCreate={openCreateGoal} onEdit={openEditGoal} onDelete={setDeletingGoal} />
              <ActiveChallengesPanel challenges={overview.data.active_challenges} />
              {overview.data.ai_challenges_available && overview.data.challenge_suggestions.length > 0 && (
                <ChallengeSuggestionsPanel
                  challenges={overview.data.challenge_suggestions}
                  pending={challenge.isPending ? challenge.variables : undefined}
                  error={challenge.error}
                  onAction={(id, action) => { challenge.reset(); challenge.mutate({ id, action }) }}
                />
              )}
            </Stack>

            <Stack spacing={2.5} minWidth={0}>
              <StreakPanel streak={overview.data.streak} />
              <RecordChasesPanel records={overview.data.record_chases} />
            </Stack>
          </Box>

          <BadgesPanel badges={overview.data.badges} />
          <DiscoveriesPanel data={overview.data} />
          <AnnualAwardsPanel awards={overview.data.annual_awards} />

          <Alert severity="info" icon={<ShieldRoundedIcon />} sx={{ borderRadius: 3 }}>
            Diese Ansicht ist privat. Baseline Cycling erstellt keine sozialen Ranglisten und teilt deine Ziele, Serien oder Auszeichnungen nicht mit anderen Konten.
          </Alert>
        </Stack>
      )}

      <GoalDialog
        open={goalDialogOpen}
        goal={editingGoal}
        pending={saveGoal.isPending}
        error={saveGoal.error}
        onClose={() => { setGoalDialogOpen(false); setEditingGoal(null); saveGoal.reset() }}
        onSubmit={(input) => saveGoal.mutate({ goal: editingGoal, input })}
      />
      <DeleteGoalDialog
        goal={deletingGoal}
        pending={deleteGoal.isPending}
        error={deleteGoal.error}
        onClose={() => { setDeletingGoal(null); deleteGoal.reset() }}
        onConfirm={() => deletingGoal && deleteGoal.mutate(deletingGoal)}
      />
      <Snackbar open={Boolean(notice)} autoHideDuration={4200} onClose={() => setNotice(null)} message={notice} />
    </>
  )
}

function GoalsPanel({ goals, onCreate, onEdit, onDelete }: {
  goals: GamificationGoal[]
  onCreate: () => void
  onEdit: (goal: GamificationGoal) => void
  onDelete: (goal: GamificationGoal) => void
}) {
  const sortedGoals = [...goals].sort((left, right) => Number(left.status === 'completed') - Number(right.status === 'completed'))
  return (
    <Card component="section" aria-labelledby="goals-heading">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <SectionHeading
          id="goals-heading"
          icon={<FlagRoundedIcon />}
          title="Deine Ziele"
          description="Du bestimmst Ziel, Zeitraum und Tempo."
          action={<Button size="small" startIcon={<AddRoundedIcon />} onClick={onCreate}>Ziel anlegen</Button>}
        />
        {sortedGoals.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mt: 2.5 }}>
            {sortedGoals.map((goal) => <GoalCard key={goal.id} goal={goal} onEdit={() => onEdit(goal)} onDelete={() => onDelete(goal)} />)}
          </Box>
        ) : (
          <GentleEmptyState
            icon={<FlagRoundedIcon />}
            title="Noch kein eigenes Ziel"
            description="Lege ein realistisches Ziel an, wenn es dich unterstützt. Es gibt keinen Nachteil, wenn du darauf verzichtest."
            action={<Button variant="outlined" onClick={onCreate}>Erstes Ziel anlegen</Button>}
          />
        )}
      </CardContent>
    </Card>
  )
}

function GoalCard({ goal, onEdit, onDelete }: { goal: GamificationGoal; onEdit: () => void; onDelete: () => void }) {
  const completed = goal.status === 'completed'
  return (
    <Box sx={{ p: 1.75, minWidth: 0, border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: completed ? 'action.hover' : 'background.paper' }}>
      <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
        <Box minWidth={0}>
          <Stack direction="row" gap={.75} alignItems="center" flexWrap="wrap">
            <Typography variant="h4">{goal.title}</Typography>
            <Chip
              size="small"
              color={completed ? 'success' : goal.status === 'paused' ? 'default' : 'primary'}
              variant={completed ? 'filled' : 'outlined'}
              icon={completed ? <CheckCircleRoundedIcon /> : goal.status === 'paused' ? <PauseCircleRoundedIcon /> : undefined}
              label={completed ? 'Erreicht' : goal.status === 'paused' ? 'Pausiert' : periodLabel(goal.period)}
            />
          </Stack>
          {goal.deadline && <Typography variant="caption" color="text.secondary">Bis {formatDate(goal.deadline)}</Typography>}
        </Box>
        <Stack direction="row" sx={{ mt: -.75, mr: -.75 }}>
          <Tooltip title="Ziel bearbeiten"><IconButton size="small" aria-label={`${goal.title} bearbeiten`} onClick={onEdit}><EditRoundedIcon fontSize="small" /></IconButton></Tooltip>
          <Tooltip title="Ziel löschen"><IconButton size="small" aria-label={`${goal.title} löschen`} onClick={onDelete}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></Tooltip>
        </Stack>
      </Stack>
      <Stack direction="row" justifyContent="space-between" gap={1} alignItems="baseline" sx={{ mt: 2 }}>
        <Typography fontWeight={800}>{formatGamificationValue(goal.metric, goal.current_value, goal.unit)}</Typography>
        <Typography variant="caption" color="text.secondary">von {formatGamificationValue(goal.metric, goal.target_value, goal.unit)}</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={goal.progress_percent} aria-label={`Fortschritt für ${goal.title}`} sx={{ height: 7, borderRadius: 999, mt: .75 }} />
    </Box>
  )
}

function ActiveChallengesPanel({ challenges }: { challenges: GamificationChallenge[] }) {
  return (
    <Card component="section" aria-labelledby="active-challenges-heading">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <SectionHeading id="active-challenges-heading" icon={<RouteRoundedIcon />} title="Angenommene Challenges" description="Optionale Impulse, die du jederzeit in deinem Tempo angehen kannst." />
        {challenges.length ? (
          <Stack spacing={1.5} sx={{ mt: 2.5 }}>
            {challenges.map((item) => (
              <Box key={item.id} sx={{ p: 1.75, borderRadius: 3, border: '1px solid', borderColor: 'divider' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                  <Box>
                    <Stack direction="row" gap={.75} alignItems="center" flexWrap="wrap">
                      <Typography variant="h4">{item.title}</Typography>
                      {item.status === 'completed' && <Chip size="small" color="success" icon={<CheckCircleRoundedIcon />} label="Geschafft" />}
                      {item.reward_xp > 0 && <Chip size="small" variant="outlined" label={formatXp(item.reward_xp)} />}
                    </Stack>
                    {item.description && <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{item.description}</Typography>}
                  </Box>
                  <Typography fontWeight={800} whiteSpace="nowrap">{Math.round(item.progress_percent)} %</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={item.progress_percent} aria-label={`Fortschritt für ${item.title}`} sx={{ height: 7, borderRadius: 999, mt: 1.5 }} />
                <Stack direction="row" justifyContent="space-between" gap={1} sx={{ mt: .75 }}>
                  <Typography variant="caption" color="text.secondary">{formatGamificationValue(item.metric, item.current_value, item.unit)}</Typography>
                  <Typography variant="caption" color="text.secondary">Ziel {formatGamificationValue(item.metric, item.target_value, item.unit)}</Typography>
                </Stack>
                {item.weather_sensitive && <WeatherSafetyNote note={item.safety_note} />}
              </Box>
            ))}
          </Stack>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>Aktuell hast du keine Challenge angenommen. Vorschläge bleiben immer optional.</Typography>
        )}
      </CardContent>
    </Card>
  )
}

function ChallengeSuggestionsPanel({ challenges, pending, error, onAction }: {
  challenges: GamificationChallenge[]
  pending?: { id: string; action: ChallengeAction }
  error: unknown
  onAction: (id: string, action: ChallengeAction) => void
}) {
  return (
    <Card component="section" aria-labelledby="suggestions-heading" sx={{ background: (theme) => `linear-gradient(145deg, ${alpha(theme.palette.primary.main, .1)}, ${theme.palette.background.paper} 70%)` }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <SectionHeading id="suggestions-heading" icon={<AutoAwesomeRoundedIcon />} title="KI-Challenge-Vorschläge" description="Nur Vorschläge, die für dein Konto verfügbar sind. Du entscheidest ohne Nachteil." />
        <Stack spacing={1.5} sx={{ mt: 2.5 }}>
          {challenges.map((item) => {
            const busy = pending?.id === item.id
            return (
              <Box key={item.id} sx={{ p: 1.75, borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}>
                  <Box>
                    <Stack direction="row" alignItems="center" gap={.75} flexWrap="wrap">
                      <Typography variant="h4">{item.title}</Typography>
                      <Chip size="small" icon={<AutoAwesomeRoundedIcon />} label="KI-Vorschlag" color="primary" variant="outlined" />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{item.description}</Typography>
                  </Box>
                  {item.reward_xp > 0 && <Chip size="small" label={formatXp(item.reward_xp)} />}
                </Stack>
                <Typography variant="body2" fontWeight={750} sx={{ mt: 1.25 }}>Ziel: {formatGamificationValue(item.metric, item.target_value, item.unit)}</Typography>
                {item.weather_sensitive && <WeatherSafetyNote note={item.safety_note} />}
                <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
                  <Button variant="contained" size="small" disabled={Boolean(pending)} onClick={() => onAction(item.id, 'accept')}>
                    {busy && pending.action === 'accept' ? 'Wird angenommen …' : 'Annehmen'}
                  </Button>
                  <Button size="small" disabled={Boolean(pending)} onClick={() => onAction(item.id, 'decline')}>
                    {busy && pending.action === 'decline' ? 'Wird ausgeblendet …' : 'Nicht jetzt'}
                  </Button>
                </Stack>
              </Box>
            )
          })}
          {Boolean(error) && <Alert severity="error">{errorMessage(error)}</Alert>}
        </Stack>
      </CardContent>
    </Card>
  )
}

function WeatherSafetyNote({ note }: { note: string | null }) {
  return (
    <Alert severity="warning" sx={{ mt: 1.5, borderRadius: 2.5, alignItems: 'flex-start' }}>
      <strong>Sicher unterwegs:</strong> {note || weatherSafetyFallback}
    </Alert>
  )
}

function StreakPanel({ streak }: { streak: GamificationStreak }) {
  const weekProgress = Math.min(100, streak.current_week_progress / Math.max(1, streak.weekly_target) * 100)
  return (
    <Card component="section" aria-labelledby="streak-heading">
      <CardContent sx={{ p: 2.5 }}>
        <SectionHeading id="streak-heading" icon={<LocalFireDepartmentRoundedIcon />} title="Wochenserie" description="Regelmäßigkeit mit Platz für Pausen." />
        <Stack direction="row" alignItems="baseline" gap={1} sx={{ mt: 2.5 }}>
          <Typography variant="h2">{streak.current_weeks}</Typography>
          <Typography color="text.secondary">{streak.current_weeks === 1 ? 'Woche im Rhythmus' : 'Wochen im Rhythmus'}</Typography>
        </Stack>
        <Stack direction="row" justifyContent="space-between" gap={1} sx={{ mt: 1.5 }}>
          <Typography variant="body2" fontWeight={750}>Diese Woche</Typography>
          <Typography variant="body2" color="text.secondary">{streak.current_week_progress} von {streak.weekly_target} Fahrten</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={weekProgress} aria-label="Fortschritt der Wochenserie" sx={{ height: 8, borderRadius: 999, mt: .75 }} />
        <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 1.5 }}>
          <Chip size="small" variant="outlined" label={`Bestwert ${streak.best_weeks} Wochen`} />
          {streak.pause_protection_active ? (
            <Chip size="small" color="success" icon={<ShieldRoundedIcon />} label="Pausenschutz aktiv" />
          ) : streak.pause_protection_available ? (
            <Chip size="small" color="primary" variant="outlined" icon={<ShieldRoundedIcon />} label="Pausenschutz verfügbar" />
          ) : null}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, lineHeight: 1.65 }}>
          Erholung zählt. Der Pausenschutz bewahrt deinen Wochenrhythmus, wenn Training gerade nicht passt – ohne dass du etwas nachholen musst.
        </Typography>
        {streak.protected_until && <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Geschützt bis {formatDate(streak.protected_until)}</Typography>}
      </CardContent>
    </Card>
  )
}

function RecordChasesPanel({ records }: { records: GamificationRecordChase[] }) {
  return (
    <Card component="section" aria-labelledby="records-heading">
      <CardContent sx={{ p: 2.5 }}>
        <SectionHeading id="records-heading" icon={<StarsRoundedIcon />} title="Persönliche Rekordjagd" description="Dein eigener Referenzpunkt – kein Vergleich mit anderen." />
        {records.length ? <Stack spacing={1.5} sx={{ mt: 2.5 }}>{records.map((record) => <RecordChase key={record.id} record={record} />)}</Stack> : (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>Mit weiteren Aktivitäten erkennt Baseline Cycling persönliche Rekorde und passende nächste Marken.</Typography>
        )}
      </CardContent>
    </Card>
  )
}

function RecordChase({ record }: { record: GamificationRecordChase }) {
  return (
    <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 3 }}>
      <Stack direction="row" justifyContent="space-between" gap={1}>
        <Box>
          <Typography variant="h4">{record.title}</Typography>
          {record.description && <Typography variant="caption" color="text.secondary">{record.description}</Typography>}
        </Box>
        {record.achieved && <CheckCircleRoundedIcon color="success" />}
      </Stack>
      <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={1} sx={{ mt: 1.5 }}>
        <Typography fontWeight={800}>{formatGamificationValue(record.metric, record.current_value, record.unit)}</Typography>
        <Typography variant="caption" color="text.secondary">Nächste Marke {formatGamificationValue(record.metric, record.target_value, record.unit)}</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={record.progress_percent} aria-label={`Fortschritt für ${record.title}`} sx={{ height: 6, borderRadius: 999, mt: .75 }} />
      {record.activity_id && <Button component={RouterLink} to={`/aktivitaeten/${record.activity_id}`} size="small" sx={{ px: 0, mt: .5 }}>Rekordfahrt ansehen</Button>}
    </Box>
  )
}

function BadgesPanel({ badges }: { badges: GamificationBadge[] }) {
  const unlocked = badges.filter((badge) => badge.unlocked).length
  return (
    <Card component="section" aria-labelledby="badges-heading">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <SectionHeading id="badges-heading" icon={<MilitaryTechRoundedIcon />} title="Abzeichen" description={`${unlocked} von ${badges.length} freigeschaltet. Gesperrte Abzeichen zeigen transparent, was dahintersteht.`} />
        {badges.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mt: 2.5 }}>
            {badges.map((badge) => <BadgeCard key={badge.id} badge={badge} />)}
          </Box>
        ) : <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>Abzeichen werden angezeigt, sobald sie für dein Konto verfügbar sind.</Typography>}
      </CardContent>
    </Card>
  )
}

function BadgeCard({ badge }: { badge: GamificationBadge }) {
  return (
    <Box sx={{ p: 1.75, border: '1px solid', borderColor: 'divider', borderRadius: 3, opacity: badge.unlocked ? 1 : .72, bgcolor: badge.unlocked ? 'background.paper' : 'action.hover' }}>
      <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <Avatar sx={{ bgcolor: badge.unlocked ? 'secondary.light' : 'action.disabledBackground', color: badge.unlocked ? 'secondary.dark' : 'text.secondary' }}>
          {badge.unlocked ? <WorkspacePremiumRoundedIcon /> : <LockRoundedIcon />}
        </Avatar>
        <Box minWidth={0} flex={1}>
          <Stack direction="row" gap={.75} alignItems="center" flexWrap="wrap">
            <Typography variant="h4">{badge.name}</Typography>
            <Chip size="small" color={badge.unlocked ? 'success' : 'default'} variant="outlined" label={badge.unlocked ? 'Freigeschaltet' : 'Gesperrt'} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{badge.description}</Typography>
          {!badge.unlocked && badge.target_value != null && (
            <>
              <LinearProgress variant="determinate" value={badge.progress_percent} aria-label={`Fortschritt für Abzeichen ${badge.name}`} sx={{ mt: 1.25, height: 5, borderRadius: 999 }} />
              <Typography variant="caption" color="text.secondary">{Math.round(badge.progress_percent)} %</Typography>
            </>
          )}
          {badge.unlocked_at && <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: .75 }}>Seit {formatDate(badge.unlocked_at)}</Typography>}
        </Box>
      </Stack>
    </Box>
  )
}

const discoverySpecs: Array<{ scope: GamificationDiscoveryScope; label: string; singular: string; icon: React.ReactNode }> = [
  { scope: 'village', label: 'Dörfer', singular: 'Dorf', icon: <CottageRoundedIcon /> },
  { scope: 'municipality', label: 'Städte & Kommunen', singular: 'Stadt / Kommune', icon: <LocationCityRoundedIcon /> },
  { scope: 'state', label: 'Bundesländer', singular: 'Bundesland', icon: <MapRoundedIcon /> },
  { scope: 'country', label: 'Länder', singular: 'Land', icon: <PublicRoundedIcon /> },
]

function DiscoveriesPanel({ data }: { data: GamificationOverview }) {
  const discoveries = data.discoveries
  const showDiscoveryCounts = ['ready', 'rate_limited'].includes(data.geocoding.status)
    || discoveries.some((item) => item.count > 0)
  return (
    <Card component="section" aria-labelledby="discoveries-heading">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <SectionHeading id="discoveries-heading" icon={<PublicRoundedIcon />} title="Deine Entdeckungen" description="Orte aus deinen eigenen Fahrten, von der kleinen Gemeinde bis zum Land." />
        {showDiscoveryCounts && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mt: 2.5 }}>
          {discoverySpecs.map((spec) => {
            const discovery = discoveries.find((item) => item.scope === spec.scope)
            return <DiscoveryCard key={spec.scope} spec={spec} discovery={discovery} />
          })}
        </Box>}
        <DiscoveryGeocodingControl geocoding={data.geocoding} />
      </CardContent>
    </Card>
  )
}

function DiscoveryCard({ spec, discovery }: { spec: typeof discoverySpecs[number]; discovery?: GamificationDiscovery }) {
  const count = discovery?.count ?? 0
  return (
    <Box sx={{ p: 1.75, borderRadius: 3, border: '1px solid', borderColor: 'divider', minWidth: 0 }}>
      <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
        <Box>
          <Typography variant="overline" color="text.secondary" fontWeight={800}>{spec.label}</Typography>
          <Typography variant="h3">{count}</Typography>
        </Box>
        <Avatar sx={{ bgcolor: 'action.hover', color: 'primary.main' }}>{spec.icon}</Avatar>
      </Stack>
      {discovery?.progress_percent != null && <LinearProgress variant="determinate" value={discovery.progress_percent} aria-label={`Entdeckungsfortschritt ${spec.label}`} sx={{ mt: 1.25, height: 5, borderRadius: 999 }} />}
      {discovery?.places.length ? (
        <Stack direction="row" gap={.75} flexWrap="wrap" sx={{ mt: 1.25 }}>
          {discovery.places.slice(0, 3).map((place) => <Chip key={place} size="small" variant="outlined" label={place} />)}
          {discovery.places.length > 3 && <Chip size="small" label={`+${discovery.places.length - 3}`} />}
        </Stack>
      ) : <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>Noch kein {spec.singular} erkannt.</Typography>}
    </Box>
  )
}

function AnnualAwardsPanel({ awards }: { awards: GamificationAnnualAward[] }) {
  return (
    <Card component="section" aria-labelledby="awards-heading">
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <SectionHeading id="awards-heading" icon={<WorkspacePremiumRoundedIcon />} title="Jahresauszeichnungen" description="Ein persönlicher Rückblick auf besondere Momente deines Radjahres." />
        {awards.length ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mt: 2.5 }}>
            {awards.map((award) => <AnnualAwardCard key={`${award.year}-${award.id}`} award={award} />)}
          </Box>
        ) : (
          <GentleEmptyState icon={<WorkspacePremiumRoundedIcon />} title="Dein Jahresrückblick wächst" description="Sobald genug eigene Aktivitäten vorliegen, erscheinen hier deine Jahresauszeichnungen." />
        )}
      </CardContent>
    </Card>
  )
}

function AnnualAwardCard({ award }: { award: GamificationAnnualAward }) {
  return (
    <Box sx={{ p: 1.75, borderRadius: 3, border: '1px solid', borderColor: 'divider', bgcolor: award.earned ? 'background.paper' : 'action.hover' }}>
      <Stack direction="row" justifyContent="space-between" gap={1} alignItems="flex-start">
        <Avatar sx={{ bgcolor: award.earned ? 'secondary.light' : 'action.disabledBackground', color: award.earned ? 'secondary.dark' : 'text.secondary' }}>
          {award.earned ? <WorkspacePremiumRoundedIcon /> : <LockRoundedIcon />}
        </Avatar>
        <Chip size="small" variant="outlined" label={award.year} />
      </Stack>
      <Typography variant="h4" sx={{ mt: 1.5 }}>{award.title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{award.description}</Typography>
      {award.value != null && <Typography fontWeight={800} sx={{ mt: 1 }}>{[award.value.toLocaleString('de-DE', { maximumFractionDigits: 1 }), award.unit].filter(Boolean).join(' ')}</Typography>}
      <Chip size="small" color={award.earned ? 'success' : 'default'} variant={award.earned ? 'filled' : 'outlined'} label={award.earned ? 'Freigeschaltet' : 'Noch offen'} sx={{ mt: 1.25 }} />
    </Box>
  )
}

function DeleteGoalDialog({ goal, pending, error, onClose, onConfirm }: {
  goal: GamificationGoal | null
  pending: boolean
  error: unknown
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={Boolean(goal)} onClose={pending ? undefined : onClose} fullWidth maxWidth="xs" transitionDuration={0}>
      <DialogTitle>Ziel löschen?</DialogTitle>
      <DialogContent>
        <Typography>„{goal?.title}“ wird dauerhaft aus deinen persönlichen Zielen entfernt. Deine Aktivitäten bleiben unverändert.</Typography>
        {Boolean(error) && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(error)}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={pending}>Abbrechen</Button>
        <Button color="error" variant="contained" onClick={onConfirm} disabled={pending}>{pending ? 'Wird gelöscht …' : 'Ziel löschen'}</Button>
      </DialogActions>
    </Dialog>
  )
}

function SectionHeading({ id, icon, title, description, action }: {
  id: string
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'flex-start' }} gap={1.5}>
      <Stack direction="row" spacing={1.25} alignItems="flex-start">
        <Box sx={{ width: 38, height: 38, display: 'grid', placeItems: 'center', flex: 'none', borderRadius: 2.5, bgcolor: 'action.hover', color: 'primary.main', '& svg': { fontSize: 21 } }}>{icon}</Box>
        <Box>
          <Typography id={id} variant="h3">{title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: .25 }}>{description}</Typography>
        </Box>
      </Stack>
      {action}
    </Stack>
  )
}

function GentleEmptyState({ icon, title, description, action }: { icon: React.ReactNode; title: string; description: string; action?: React.ReactNode }) {
  return (
    <Stack alignItems="center" textAlign="center" spacing={1} sx={{ py: 4, px: 2, mt: 1.5, borderRadius: 3, bgcolor: 'action.hover' }}>
      <Avatar sx={{ bgcolor: 'background.paper', color: 'text.secondary' }}>{icon}</Avatar>
      <Typography variant="h4">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>{description}</Typography>
      {action && <Box sx={{ pt: .5 }}>{action}</Box>}
    </Stack>
  )
}

function GamificationPageSkeleton() {
  return (
    <Stack spacing={2.5} aria-label="Meilensteine werden geladen">
      <Skeleton variant="rounded" height={210} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.55fr) minmax(320px, .75fr)' }, gap: 2.5 }}>
        <Stack spacing={2.5}><Skeleton variant="rounded" height={360} /><Skeleton variant="rounded" height={240} /></Stack>
        <Stack spacing={2.5}><Skeleton variant="rounded" height={280} /><Skeleton variant="rounded" height={300} /></Stack>
      </Box>
      <Skeleton variant="rounded" height={280} />
    </Stack>
  )
}
