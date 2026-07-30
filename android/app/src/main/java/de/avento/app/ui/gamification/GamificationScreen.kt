package de.avento.app.ui.gamification

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.EmojiEvents
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.avento.app.data.model.GamificationChallenge
import de.avento.app.data.model.GamificationGoal
import de.avento.app.data.model.GamificationGoalRequest
import de.avento.app.ui.components.AventoTopBar
import de.avento.app.ui.components.EmptyPane
import de.avento.app.ui.components.ErrorPane
import de.avento.app.ui.components.LoadingPane
import de.avento.app.ui.components.SectionTitle
import java.util.Locale

@Composable
fun GamificationScreen(viewModel: GamificationViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val overview = state.overview
    val snackbar = remember { SnackbarHostState() }

    LaunchedEffect(state.error, state.message) {
        (state.error ?: state.message)?.let {
            snackbar.showSnackbar(it)
            viewModel.clearNotice()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            AventoTopBar(
                title = "Meilensteine",
                actions = { IconButton(onClick = viewModel::load) { Icon(Icons.Default.Refresh, "Aktualisieren") } },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 18.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (state.loading && overview == null) {
                item { LoadingPane("Meilensteine werden berechnet …") }
            } else if (state.error != null && overview == null) {
                item { ErrorPane(state.error.orEmpty(), viewModel::load) }
            } else if (overview != null) {
                item { LevelCard(overview) }
                item {
                    SectionTitle(
                        "Private Ziele",
                        "Nur für dein Konto sichtbar · beliebige Metrik und Zeitraum",
                    )
                }
                item { Button(onClick = viewModel::beginCreate, modifier = Modifier.fillMaxWidth()) { Icon(Icons.Default.Add, null); Text("Eigenes Ziel anlegen", Modifier.padding(start = 8.dp)) } }
                if (overview.goals.isEmpty()) {
                    item { EmptyPane("Noch keine Ziele", "Lege ein persönliches Trainingsziel an.") }
                } else {
                    items(overview.goals, key = { it.id }) { goal -> GoalCard(goal, viewModel::beginEdit, viewModel::deleteGoal) }
                }

                item { SectionTitle("Herausforderungen", "Vorschläge können lokal oder durch Baseline Cycling Insights personalisiert sein.") }
                if (overview.challengeSuggestions.isNotEmpty()) {
                    items(overview.challengeSuggestions, key = { "suggestion-${it.id}" }) { challenge -> ChallengeSuggestionCard(challenge, viewModel) }
                } else {
                    item {
                        EmptyPane(
                            "Keine neuen Vorschläge",
                            if (overview.aiChallengesAvailable) "Baseline Cycling Insights schlägt später passende Herausforderungen vor."
                            else "Ohne OpenAI-Schlüssel sind lokale Vorschläge verfügbar; KI-Vorschläge bleiben deaktiviert.",
                        )
                    }
                }
                if (overview.activeChallenges.isNotEmpty()) {
                    item { SectionTitle("Aktive Herausforderungen") }
                    items(overview.activeChallenges, key = { "active-${it.id}" }) { challenge -> ProgressCard(challenge.title, challenge.description, challenge.currentValue, challenge.targetValue, challenge.unit) }
                }

                item { StreakCard(overview) }
                item { SectionTitle("Abzeichen", "Fortschritt und freigeschaltete Belohnungen") }
                if (overview.badges.isEmpty()) item { EmptyPane("Noch keine Abzeichen", "Importiere Aktivitäten, um Fortschritt zu sammeln.") }
                else items(overview.badges, key = { it.id }) { badge -> BadgeCard(badge.name, badge.description, badge.currentValue, badge.targetValue, badge.unit, badge.unlocked, badge.rewardXp) }

                item { SectionTitle("Rekordjagd") }
                if (overview.recordChases.isEmpty()) item { EmptyPane("Keine Rekordziele", "Sobald Aktivitäten vorliegen, erscheinen hier die nächsten erreichbaren Marken.") }
                else items(overview.recordChases, key = { it.id }) { chase -> ProgressCard(chase.title, chase.description, chase.currentValue, chase.targetValue, chase.unit) }

                item { SectionTitle("Entdeckungen") }
                if (overview.discoveries.isEmpty()) item { EmptyPane("Noch keine Ortsdaten", "Orte werden nur mit aktivierter Geocodierung und nach einer Aktivität erfasst.") }
                else items(overview.discoveries, key = { it.scope }) { discovery -> DiscoveryCard(discovery.label, discovery.count, discovery.places) }

                item { SectionTitle("Jahresauszeichnungen") }
                if (overview.annualAwards.isEmpty()) item { EmptyPane("Noch keine Jahreswerte", "Mit deinen Aktivitäten werden Jahresauszeichnungen automatisch fortgeschrieben.") }
                else items(overview.annualAwards, key = { it.id }) { award -> AwardCard(award.title, award.description, award.year, award.value, award.unit, award.earned, award.rewardXp) }
            }
        }
    }

    if (state.goalEditorOpen) {
        GoalDialog(
            initial = state.editingGoal,
            saving = state.saving,
            onDismiss = viewModel::closeEditor,
            onSave = { request -> viewModel.saveGoal(state.editingGoal?.id, request) {} },
        )
    }
}

@Composable
private fun LevelCard(overview: de.avento.app.data.model.GamificationOverview) {
    val level = overview.level
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.primaryContainer) {
                    Icon(Icons.Default.Star, null, Modifier.padding(12.dp), tint = MaterialTheme.colorScheme.onPrimaryContainer)
                }
                Column(Modifier.weight(1f).padding(start = 14.dp)) {
                    Text("Level ${level.level} · ${level.name}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.ExtraBold)
                    Text("${level.totalXp} XP insgesamt", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            LinearProgressIndicator(
                progress = { (level.progressPercent / 100.0).toFloat().coerceIn(0f, 1f) },
                modifier = Modifier.fillMaxWidth(),
            )
            Text("${formatNumber(level.currentXp)} / ${formatNumber(level.nextLevelXp)} XP bis zum nächsten Level", style = MaterialTheme.typography.bodySmall)
            Text("Deine Fortschritte bleiben privat und werden nicht öffentlich gerankt.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun GoalCard(goal: GamificationGoal, onEdit: (GamificationGoal) -> Unit, onDelete: (GamificationGoal) -> Unit) {
    var confirmDelete by remember { mutableStateOf(false) }
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(goal.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                TextButton(onClick = { onEdit(goal) }) { Text("Bearbeiten") }
            }
            goal.description?.takeIf(String::isNotBlank)?.let { Text(it) }
            ProgressBar(goal.currentValue, goal.targetValue, goal.unit, goal.progressPercent)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${goal.period} · ${goal.status}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = { confirmDelete = true }) { Text("Löschen") }
            }
        }
    }
    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("Ziel löschen?") },
            text = { Text("Das private Ziel wird dauerhaft entfernt.") },
            confirmButton = { Button(onClick = { confirmDelete = false; onDelete(goal) }) { Text("Löschen") } },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("Abbrechen") } },
        )
    }
}

@Composable
private fun ChallengeSuggestionCard(challenge: GamificationChallenge, viewModel: GamificationViewModel) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Icon(if (challenge.aiGenerated) Icons.Default.AutoAwesome else Icons.Default.Timeline, null, tint = MaterialTheme.colorScheme.primary)
                Text(challenge.title, Modifier.weight(1f).padding(start = 10.dp), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
            }
            Text(challenge.description)
            challenge.personalizationReason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            challenge.safetyNote?.let { Text("Sicherheit: $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
            ProgressBar(challenge.currentValue, challenge.targetValue, challenge.unit, challenge.progressPercent)
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = { viewModel.accept(challenge) }, modifier = Modifier.weight(1f)) { Text("Annehmen") }
                OutlinedButton(onClick = { viewModel.decline(challenge) }, modifier = Modifier.weight(1f)) { Text("Ausblenden") }
            }
        }
    }
}

@Composable
private fun ProgressCard(title: String, description: String, current: Double, target: Double, unit: String) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
            Text(description, color = MaterialTheme.colorScheme.onSurfaceVariant)
            ProgressBar(current, target, unit, if (target == 0.0) 0.0 else current / target * 100.0)
        }
    }
}

@Composable
private fun ProgressBar(current: Double, target: Double, unit: String, percent: Double) {
    LinearProgressIndicator(progress = { (percent / 100.0).toFloat().coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth())
    Text("${formatNumber(current)} / ${formatNumber(target)} $unit · ${formatNumber(percent)} %", style = MaterialTheme.typography.bodySmall)
}

@Composable
private fun StreakCard(overview: de.avento.app.data.model.GamificationOverview) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Timeline, null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.padding(start = 12.dp)) {
                Text("Trainingsserie", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold)
                Text("${overview.streak.currentWeeks} Wochen aktuell · ${overview.streak.bestWeeks} Wochen Bestwert")
                Text("Diese Woche: ${overview.streak.currentWeekProgress} / ${overview.streak.weeklyTarget} Aktivität(en)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun BadgeCard(name: String, description: String, current: Double, target: Double, unit: String, unlocked: Boolean, rewardXp: Int) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.EmojiEvents, null, tint = if (unlocked) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text(name, fontWeight = FontWeight.ExtraBold)
                Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (!unlocked) ProgressBar(current, target, unit, if (target == 0.0) 0.0 else current / target * 100.0)
            }
            Text(if (unlocked) "+$rewardXp XP" else "offen", style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun DiscoveryCard(label: String, count: Int, places: List<String>) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Explore, null, tint = MaterialTheme.colorScheme.primary)
                Text("$label: $count", Modifier.padding(start = 10.dp), fontWeight = FontWeight.ExtraBold)
            }
            if (places.isNotEmpty()) Text(places.take(8).joinToString(" · "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun AwardCard(title: String, description: String, year: Int, value: Double?, unit: String?, earned: Boolean, rewardXp: Int) {
    Card(Modifier.fillMaxWidth()) {
        Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.EmojiEvents, null, tint = MaterialTheme.colorScheme.primary)
            Column(Modifier.weight(1f).padding(start = 12.dp)) {
                Text("$year · $title", fontWeight = FontWeight.ExtraBold)
                Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                value?.let { Text("${formatNumber(it)} ${unit.orEmpty()}", style = MaterialTheme.typography.bodySmall) }
            }
            Text(if (earned) "+$rewardXp XP" else "läuft", style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun GoalDialog(
    initial: GamificationGoal?,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (GamificationGoalRequest) -> Unit,
) {
    var title by rememberSaveable(initial?.id) { mutableStateOf(initial?.title.orEmpty()) }
    var description by rememberSaveable(initial?.id) { mutableStateOf(initial?.description.orEmpty()) }
    var metric by rememberSaveable(initial?.id) { mutableStateOf(initial?.metric ?: "distance_m") }
    var target by rememberSaveable(initial?.id) { mutableStateOf(initial?.targetValue?.toString().orEmpty()) }
    var period by rememberSaveable(initial?.id) { mutableStateOf(initial?.period ?: "custom") }
    val metrics = listOf("distance_m" to "Distanz", "activity_count" to "Aktivitäten", "elevation_gain_m" to "Höhenmeter", "moving_time_s" to "Bewegungszeit")
    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        title = { Text(if (initial == null) "Eigenes Ziel" else "Ziel bearbeiten") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("Titel") }, singleLine = true)
                OutlinedTextField(description, { description = it }, label = { Text("Beschreibung") }, minLines = 2)
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    metrics.forEach { (value, label) -> FilterChip(metric == value, { metric = value }, label = { Text(label) }) }
                }
                OutlinedTextField(target, { target = it }, label = { Text("Zielwert") }, singleLine = true)
                OutlinedTextField(period, { period = it }, label = { Text("Zeitraum (z. B. month, year, custom)") }, singleLine = true)
            }
        },
        confirmButton = {
            Button(
                enabled = !saving && title.isNotBlank() && (target.toDoubleOrNull() ?: 0.0) > 0.0,
                onClick = {
                    onSave(GamificationGoalRequest(title.trim(), description.trim().ifBlank { null }, metric, target.toDouble(), period.trim().ifBlank { "custom" }))
                },
            ) { Text(if (saving) "Speichern …" else "Speichern") }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Abbrechen") } },
    )
}

private fun formatNumber(value: Double): String = String.format(Locale.GERMANY, "%.1f", value).removeSuffix(",0")
private fun formatNumber(value: Int): String = value.toString()
