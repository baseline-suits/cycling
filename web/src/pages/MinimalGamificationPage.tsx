import { useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import ShieldRoundedIcon from '@mui/icons-material/ShieldRounded'
import {
  Alert,
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
  Typography,
} from '@mui/material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink } from 'react-router-dom'
import {
  gamificationApi,
  gamificationOverviewQueryKey,
  type GamificationChallenge,
  type GamificationGoal,
  type GamificationGoalInput,
  type GamificationOverview,
} from '../api'
import { GoalDialog } from '../components/gamification/GoalDialog'
import { DiscoveryGeocodingControl } from '../components/gamification/DiscoveryGeocodingControl'
import { formatGamificationValue, formatXp, periodLabel } from '../components/gamification/gamificationFormat'
import { ErrorState } from '../components/States'
import { errorMessage, formatDate } from '../utils/format'

type ChallengeAction = 'accept' | 'decline'
const safetyFallback = 'Wetter, Sicht und Streckenzustand gehen immer vor. Passe die Challenge an oder brich sie ab, wenn sich die Bedingungen nicht sicher anfühlen.'

export function MinimalGamificationPage() {
  const queryClient = useQueryClient()
  const [goalDialogOpen, setGoalDialogOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GamificationGoal | null>(null)
  const [deletingGoal, setDeletingGoal] = useState<GamificationGoal | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const overview = useQuery({ queryKey: gamificationOverviewQueryKey, queryFn: gamificationApi.overview })
  const refresh = () => queryClient.invalidateQueries({ queryKey: gamificationOverviewQueryKey })
  const saveGoal = useMutation({
    mutationFn: ({ goal, input }: { goal: GamificationGoal | null; input: GamificationGoalInput }) => goal ? gamificationApi.updateGoal(goal.id, input) : gamificationApi.createGoal(input),
    onSuccess: (_, variables) => { setGoalDialogOpen(false); setEditingGoal(null); setNotice(variables.goal ? 'Ziel aktualisiert.' : 'Ziel angelegt.'); void refresh() },
  })
  const deleteGoal = useMutation({
    mutationFn: (goal: GamificationGoal) => gamificationApi.deleteGoal(goal.id),
    onSuccess: () => { setDeletingGoal(null); setNotice('Ziel gelöscht.'); void refresh() },
  })
  const challenge = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ChallengeAction }) => action === 'accept' ? gamificationApi.acceptChallenge(id) : gamificationApi.declineChallenge(id),
    onSuccess: (_, variables) => { setNotice(variables.action === 'accept' ? 'Challenge angenommen. Geh sie in deinem Tempo an.' : 'Vorschlag ausgeblendet.'); void refresh() },
  })

  const openCreate = () => { saveGoal.reset(); setEditingGoal(null); setGoalDialogOpen(true) }
  const openEdit = (goal: GamificationGoal) => { saveGoal.reset(); setEditingGoal(goal); setGoalDialogOpen(true) }

  return (
    <>
      <Box component="header" sx={{ maxWidth: 850, mb: { xs: 6, md: 8 }, pt: { md: 2 } }}>
        <Typography variant="overline" color="primary.main">Deine Meilensteine</Typography>
        <Typography component="h1" variant="h1" sx={{ mt: 1 }}>Was du dir erfahren hast.</Typography>
        <Typography color="text.secondary" sx={{ mt: 2, maxWidth: 700, fontSize: { xs: '1.05rem', md: '1.2rem' } }}>Ziele, Erinnerungen und persönliche Entwicklung – privat, ohne Rangliste und ohne Druck.</Typography>
      </Box>

      {overview.isLoading && <Stack spacing={3}><Skeleton variant="rounded" height={210} /><Skeleton variant="rounded" height={420} /><Skeleton variant="rounded" height={300} /></Stack>}
      {overview.isError && <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />}
      {overview.data && (
        <Stack spacing={{ xs: 7, md: 10 }}>
          <LevelSummary data={overview.data} />
          <YearMoments data={overview.data} />
          <GoalsSection goals={overview.data.goals} onCreate={openCreate} onEdit={openEdit} onDelete={setDeletingGoal} />
          <ChallengesSection data={overview.data} pending={challenge.isPending ? challenge.variables : undefined} error={challenge.error} onAction={(id, action) => { challenge.reset(); challenge.mutate({ id, action }) }} />
          <RhythmAndDiscoveries data={overview.data} />
          <BadgesSection data={overview.data} />
          <Alert severity="info" icon={<ShieldRoundedIcon />} sx={{ bgcolor: 'rgba(185,232,120,.055)', border: '1px solid', borderColor: 'divider' }}>Diese Ansicht ist privat. Baseline Cycling erstellt keine sozialen Ranglisten und teilt deine Ziele, Serien oder Auszeichnungen nicht mit anderen Konten.</Alert>
        </Stack>
      )}

      <GoalDialog open={goalDialogOpen} goal={editingGoal} pending={saveGoal.isPending} error={saveGoal.error} onClose={() => { setGoalDialogOpen(false); setEditingGoal(null); saveGoal.reset() }} onSubmit={(input) => saveGoal.mutate({ goal: editingGoal, input })} />
      <DeleteGoalDialog goal={deletingGoal} pending={deleteGoal.isPending} error={deleteGoal.error} onClose={() => { setDeletingGoal(null); deleteGoal.reset() }} onConfirm={() => deletingGoal && deleteGoal.mutate(deletingGoal)} />
      <Snackbar open={Boolean(notice)} autoHideDuration={4200} onClose={() => setNotice(null)} message={notice} />
    </>
  )
}

function SectionIntro({ id, eyebrow, title, description, action }: { id: string; eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2.5} alignItems={{ xs: 'stretch', sm: 'flex-end' }}><Box><Typography variant="overline" color="primary.main">{eyebrow}</Typography><Typography id={id} variant="h2" sx={{ mt: 1 }}>{title}</Typography><Typography color="text.secondary" sx={{ mt: 1, maxWidth: 650 }}>{description}</Typography></Box>{action}</Stack>
}

function LevelSummary({ data }: { data: GamificationOverview }) {
  const level = data.level
  return (
    <Box component="section" aria-labelledby="level-title" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(270px, .55fr)' }, gap: { xs: 4, md: 8 }, alignItems: 'end' }}>
      <Box>
        <Typography variant="overline" color="text.secondary">Dein Weg</Typography>
        <Typography id="level-title" variant="h2" sx={{ mt: 1 }}>Level {level.level} · {level.name}</Typography>
        <LinearProgress variant="determinate" value={level.progress_percent} aria-label="Fortschritt zum nächsten Level" sx={{ mt: 3, height: 6, borderRadius: 999, maxWidth: 720 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{level.current_xp.toLocaleString('de-DE')} von {level.next_level_xp.toLocaleString('de-DE')} XP bis zum nächsten Abschnitt</Typography>
      </Box>
      <Box sx={{ borderLeft: { md: '1px solid' }, borderColor: 'divider', pl: { md: 4 } }}><Typography variant="body2" color="text.secondary">Insgesamt gesammelt</Typography><Typography sx={{ fontSize: 'clamp(2.8rem, 7vw, 5rem)', lineHeight: 1, fontWeight: 660, letterSpacing: '-.055em', mt: 1 }}>{level.total_xp.toLocaleString('de-DE')}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>XP als leiser Begleiter, nicht als Mittelpunkt.</Typography></Box>
    </Box>
  )
}

function YearMoments({ data }: { data: GamificationOverview }) {
  const moments = [...data.annual_awards.filter((item) => item.earned), ...data.annual_awards.filter((item) => !item.earned)].slice(0, 3)
  return (
    <Box component="section" aria-labelledby="moments-title">
      <SectionIntro id="moments-title" eyebrow={`Rückblick ${new Date().getFullYear()}`} title="Momente, die bleiben." description="Persönliche Marken aus deinen eigenen Fahrten – als Erinnerung statt als Wettbewerb." />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2, mt: 4 }}>
        {moments.map((award) => <Card key={`${award.year}-${award.id}`} sx={{ bgcolor: award.earned ? 'var(--avento-minimal-surface-raised)' : 'transparent', opacity: award.earned ? 1 : .72 }}><CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}><Stack direction="row" justifyContent="space-between" gap={1}><Typography variant="overline" color="text.secondary">{award.year}</Typography>{award.earned ? <CheckRoundedIcon color="success" /> : <LockRoundedIcon color="disabled" />}</Stack><Typography variant="h3" sx={{ mt: 2 }}>{award.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{award.description}</Typography>{award.value != null && <Typography variant="h3" sx={{ mt: 3 }}>{award.value.toLocaleString('de-DE', { maximumFractionDigits: 1 })} {award.unit}</Typography>}</CardContent></Card>)}
        {!moments.length && <Typography color="text.secondary">Dein Jahresrückblick wächst mit deinen nächsten Fahrten.</Typography>}
      </Box>
      {data.record_chases.length > 0 && <Stack spacing={2} sx={{ mt: 5 }}>{data.record_chases.map((record) => <Box key={record.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }, gap: 2, py: 2.5, borderTop: '1px solid', borderColor: 'divider' }}><Box><Typography variant="h4">{record.title}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{record.description}</Typography><LinearProgress variant="determinate" value={record.progress_percent} aria-label={`Fortschritt für ${record.title}`} sx={{ mt: 2, height: 5, borderRadius: 999 }} /></Box><Box sx={{ textAlign: { sm: 'right' } }}><Typography fontWeight={750}>{formatGamificationValue(record.metric, record.current_value, record.unit)}</Typography><Typography variant="caption" color="text.secondary">Nächste Marke {formatGamificationValue(record.metric, record.target_value, record.unit)}</Typography>{record.activity_id && <Button component={RouterLink} to={`/aktivitaeten/${record.activity_id}`} size="small" sx={{ display: 'block', ml: { sm: 'auto' }, px: 0 }}>Fahrt ansehen</Button>}</Box></Box>)}</Stack>}
    </Box>
  )
}

function GoalsSection({ goals, onCreate, onEdit, onDelete }: { goals: GamificationGoal[]; onCreate: () => void; onEdit: (goal: GamificationGoal) => void; onDelete: (goal: GamificationGoal) => void }) {
  const sorted = [...goals].sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
  return (
    <Box component="section" aria-labelledby="goals-title">
      <SectionIntro id="goals-title" eyebrow="Deine Ziele" title="Du bestimmst Richtung und Tempo." description="Eigene Ziele bleiben flexibel. Eine Pause ist kein Rückschritt." action={<Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onCreate}>Eigenes Ziel</Button>} />
      <Stack spacing={1} sx={{ mt: 4 }}>{sorted.map((goal) => <Box key={goal.id} sx={{ py: 2.5, borderTop: '1px solid', borderColor: 'divider' }}><Stack direction="row" justifyContent="space-between" gap={2} alignItems="flex-start"><Box minWidth={0}><Stack direction="row" gap={1} alignItems="center" flexWrap="wrap"><Typography variant="h3">{goal.title}</Typography>{goal.status === 'completed' && <Chip size="small" color="success" label="Erreicht" />}</Stack>{goal.description && <Typography color="text.secondary" sx={{ mt: .75 }}>{goal.description}</Typography>}</Box><Stack direction="row"><IconButton aria-label={`${goal.title} bearbeiten`} onClick={() => onEdit(goal)}><EditRoundedIcon /></IconButton><IconButton aria-label={`${goal.title} löschen`} onClick={() => onDelete(goal)}><DeleteOutlineRoundedIcon /></IconButton></Stack></Stack><LinearProgress variant="determinate" value={goal.progress_percent} aria-label={`Fortschritt für ${goal.title}`} sx={{ mt: 2.5, height: 6, borderRadius: 999 }} /><Stack direction="row" justifyContent="space-between" gap={2} sx={{ mt: 1 }}><Typography variant="body2" color="text.secondary">{formatGamificationValue(goal.metric, goal.current_value, goal.unit)} · {periodLabel(goal.period)}</Typography><Typography variant="body2" color="text.secondary">Ziel {formatGamificationValue(goal.metric, goal.target_value, goal.unit)}</Typography></Stack></Box>)}{!sorted.length && <Card sx={{ bgcolor: 'var(--avento-minimal-surface-subtle)' }}><CardContent sx={{ p: 4, textAlign: 'center' }}><Typography variant="h3">Noch kein eigenes Ziel</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Lege nur dann eines an, wenn es dich unterstützt.</Typography><Button variant="outlined" onClick={onCreate} sx={{ mt: 2 }}>Erstes Ziel anlegen</Button></CardContent></Card>}</Stack>
    </Box>
  )
}

function ChallengeRow({ challenge, suggestion, busy, disabled, onAction }: { challenge: GamificationChallenge; suggestion?: boolean; busy?: ChallengeAction; disabled: boolean; onAction?: (action: ChallengeAction) => void }) {
  return <Card sx={{ bgcolor: suggestion ? 'rgba(185,232,120,.045)' : 'var(--avento-minimal-surface-subtle)' }}><CardContent sx={{ p: { xs: 2.5, md: 3.5 }, '&:last-child': { pb: { xs: 2.5, md: 3.5 } } }}><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2}><Box><Stack direction="row" gap={1} alignItems="center" flexWrap="wrap"><Typography variant="h3">{challenge.title}</Typography>{suggestion && <Chip size="small" icon={<AutoAwesomeRoundedIcon />} label="Persönlicher Vorschlag" variant="outlined" />}</Stack><Typography color="text.secondary" sx={{ mt: 1 }}>{challenge.personalization_reason || challenge.description}</Typography></Box>{challenge.reward_xp > 0 && <Typography variant="body2" color="text.secondary">{formatXp(challenge.reward_xp)}</Typography>}</Stack><Typography fontWeight={720} sx={{ mt: 2 }}>Ziel: {formatGamificationValue(challenge.metric, challenge.target_value, challenge.unit)} · {challenge.duration_days} Tage</Typography>{!suggestion && <><LinearProgress variant="determinate" value={challenge.progress_percent} aria-label={`Fortschritt für ${challenge.title}`} sx={{ mt: 2, height: 6, borderRadius: 999 }} /><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{formatGamificationValue(challenge.metric, challenge.current_value, challenge.unit)} erreicht</Typography></>}{challenge.weather_sensitive && <Alert severity="warning" sx={{ mt: 2 }}><strong>Sicher unterwegs:</strong> {challenge.safety_note || safetyFallback}</Alert>}{suggestion && <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mt: 2.5 }}><Button variant="contained" disabled={disabled} onClick={() => onAction?.('accept')}>{busy === 'accept' ? 'Wird angenommen …' : 'Annehmen'}</Button><Button disabled={disabled} onClick={() => onAction?.('decline')}>{busy === 'decline' ? 'Wird ausgeblendet …' : 'Nicht jetzt'}</Button></Stack>}</CardContent></Card>
}

function ChallengesSection({ data, pending, error, onAction }: { data: GamificationOverview; pending?: { id: string; action: ChallengeAction }; error: unknown; onAction: (id: string, action: ChallengeAction) => void }) {
  return <Box component="section" aria-labelledby="challenges-title"><SectionIntro id="challenges-title" eyebrow="Trainingsempfehlungen" title="Vorschläge, die zu dir passen." description="Challenges sind Einladungen, keine Verpflichtungen. Sicherheit und Erholung gehen vor." /><Stack spacing={2} sx={{ mt: 4 }}>{data.active_challenges.map((item) => <ChallengeRow key={item.id} challenge={item} disabled />)}{data.ai_challenges_available && data.challenge_suggestions.map((item) => <ChallengeRow key={item.id} challenge={item} suggestion disabled={Boolean(pending)} busy={pending?.id === item.id ? pending.action : undefined} onAction={(action) => onAction(item.id, action)} />)}{!data.active_challenges.length && !data.challenge_suggestions.length && <Typography color="text.secondary">Aktuell wartet keine Challenge auf dich.</Typography>}{Boolean(error) && <Alert severity="error">{errorMessage(error)}</Alert>}</Stack></Box>
}

function RhythmAndDiscoveries({ data }: { data: GamificationOverview }) {
  const streak = data.streak
  const progress = Math.min(100, streak.current_week_progress / Math.max(1, streak.weekly_target) * 100)
  const showDiscoveryCounts = ['ready', 'rate_limited'].includes(data.geocoding.status)
    || data.discoveries.some((item) => item.count > 0)
  return <Box component="section" aria-labelledby="rhythm-title"><SectionIntro id="rhythm-title" eyebrow="Rhythmus & Orte" title="Regelmäßigkeit mit Platz für Pausen." description="Dein Training wächst nicht nur in Zahlen, sondern auch in Wochen und Orten." /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: showDiscoveryCounts ? 'minmax(280px, .7fr) minmax(0, 1.3fr)' : 'minmax(280px, 460px)' }, gap: 2, mt: 4 }}><Card sx={{ bgcolor: 'var(--avento-minimal-surface-raised)' }}><CardContent sx={{ p: 3 }}><Typography variant="body2" color="text.secondary">Wochen im Rhythmus</Typography><Typography sx={{ fontSize: 'clamp(3.5rem, 8vw, 6rem)', lineHeight: 1, fontWeight: 660, letterSpacing: '-.06em', mt: 1 }}>{streak.current_weeks}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Bestwert {streak.best_weeks} Wochen</Typography><LinearProgress variant="determinate" value={progress} aria-label="Fortschritt der Wochenserie" sx={{ mt: 3, height: 6, borderRadius: 999 }} /><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{streak.current_week_progress} von {streak.weekly_target} Fahrten in dieser Woche</Typography>{streak.pause_protection_active && <Chip size="small" color="success" icon={<ShieldRoundedIcon />} label="Pausenschutz aktiv" sx={{ mt: 2 }} />}</CardContent></Card>{showDiscoveryCounts && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>{data.discoveries.map((item) => <Card key={item.scope} sx={{ bgcolor: 'transparent' }}><CardContent sx={{ p: 2.5 }}><Typography variant="body2" color="text.secondary">{item.label}</Typography><Typography variant="h2" sx={{ mt: 1 }}>{item.count}</Typography>{item.places.length > 0 && <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>{item.places.join(', ')}</Typography>}</CardContent></Card>)}</Box>}</Box><DiscoveryGeocodingControl geocoding={data.geocoding} /></Box>
}

function BadgesSection({ data }: { data: GamificationOverview }) {
  const unlocked = data.badges.filter((item) => item.unlocked).length
  return <Box component="section" aria-labelledby="badges-title"><SectionIntro id="badges-title" eyebrow="Abzeichen" title={`${unlocked} persönliche Wegmarken.`} description="Sie erinnern an Erreichtes und zeigen transparent, was noch vor dir liegt." /><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mt: 4 }}>{data.badges.map((badge) => <Card key={badge.id} sx={{ bgcolor: badge.unlocked ? 'var(--avento-minimal-surface-raised)' : 'transparent', opacity: badge.unlocked ? 1 : .7 }}><CardContent sx={{ p: 2.5 }}><Stack direction="row" justifyContent="space-between" gap={1}><Typography variant="h4">{badge.name}</Typography>{badge.unlocked ? <CheckRoundedIcon color="success" /> : <LockRoundedIcon color="disabled" />}</Stack><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{badge.description}</Typography>{!badge.unlocked && badge.target_value > 0 && <LinearProgress variant="determinate" value={badge.progress_percent} aria-label={`Fortschritt für Abzeichen ${badge.name}`} sx={{ mt: 2, height: 5, borderRadius: 999 }} />}{badge.unlocked_at && <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>Seit {formatDate(badge.unlocked_at)}</Typography>}</CardContent></Card>)}</Box></Box>
}

function DeleteGoalDialog({ goal, pending, error, onClose, onConfirm }: { goal: GamificationGoal | null; pending: boolean; error: unknown; onClose: () => void; onConfirm: () => void }) {
  return <Dialog open={Boolean(goal)} onClose={pending ? undefined : onClose} fullWidth maxWidth="xs"><DialogTitle>Ziel löschen?</DialogTitle><DialogContent><Typography>„{goal?.title}“ wird dauerhaft aus deinen persönlichen Zielen entfernt. Deine Aktivitäten bleiben unverändert.</Typography>{Boolean(error) && <Alert severity="error" sx={{ mt: 2 }}>{errorMessage(error)}</Alert>}</DialogContent><DialogActions sx={{ px: 3, pb: 2.5 }}><Button onClick={onClose} disabled={pending}>Abbrechen</Button><Button color="error" variant="contained" onClick={onConfirm} disabled={pending}>{pending ? 'Wird gelöscht …' : 'Ziel löschen'}</Button></DialogActions></Dialog>
}
