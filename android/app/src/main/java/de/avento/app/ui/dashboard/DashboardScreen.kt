package de.avento.app.ui.dashboard

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.DirectionsBike
import androidx.compose.material.icons.automirrored.filled.TrendingFlat
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Landscape
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.avento.app.PendingImport
import de.avento.app.data.model.Activity
import de.avento.app.data.model.MonthStatistics
import de.avento.app.data.model.OverviewStatistics
import de.avento.app.ui.components.LineChart
import de.avento.app.ui.components.ProfileAvatar
import de.avento.app.ui.theme.AventoPalette
import de.avento.app.util.asDistance
import de.avento.app.util.asDuration
import de.avento.app.util.asElevation
import de.avento.app.util.asGermanDateTime
import de.avento.app.util.asSpeed
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel,
    pendingImport: PendingImport?,
    onImportOffered: (PendingImport) -> Unit,
    onImportConsumed: () -> Unit,
    onOpenActivity: (String) -> Unit,
    onNavigate: (String) -> Unit,
    onLoggedOut: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    var query by rememberSaveable { mutableStateOf("") }
    var showAccountMenu by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
        uri?.let {
            runCatching {
                context.contentResolver.takePersistableUriPermission(
                    it,
                    android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION,
                )
            }
            onImportOffered(PendingImport(it))
        }
    }
    val openPicker = {
        picker.launch(
            arrayOf(
                "application/vnd.garmin.tcx+xml",
                "application/xml",
                "text/xml",
                "application/octet-stream",
                "application/gpx+xml",
                "application/gpx",
            ),
        )
    }

    LaunchedEffect(state.error, state.message) {
        val notice = state.error ?: state.message
        if (notice != null) {
            snackbar.showSnackbar(notice)
            viewModel.clearNotice()
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    scrolledContainerColor = MaterialTheme.colorScheme.surface,
                ),
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            Modifier.size(11.dp)
                                .background(AventoPalette.Lime, RoundedCornerShape(4.dp)),
                        )
                        Spacer(Modifier.width(10.dp))
                        Text("Baseline Cycling", style = MaterialTheme.typography.titleLarge)
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.refresh(query) }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Aktualisieren")
                    }
                    ProfileAvatar(
                        displayName = state.profile?.displayName,
                        avatarDataUrl = state.profile?.avatarDataUrl,
                        modifier = Modifier.size(38.dp),
                    )
                    Box {
                        IconButton(onClick = { showAccountMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "Kontomenü")
                        }
                        DropdownMenu(
                            expanded = showAccountMenu,
                            onDismissRequest = { showAccountMenu = false },
                        ) {
                            state.profile?.let { profile ->
                                DropdownMenuItem(
                                    text = {
                                        Column {
                                            Text(profile.displayName, fontWeight = FontWeight.Bold)
                                            Text(
                                                profile.email,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    },
                                    onClick = { showAccountMenu = false },
                                    enabled = false,
                                )
                                HorizontalDivider()
                            }
                            DropdownMenuItem(
                                text = { Text("Aktivitäten") },
                                onClick = { showAccountMenu = false; onNavigate("activities") },
                            )
                            DropdownMenuItem(
                                text = { Text("Statistiken") },
                                onClick = { showAccountMenu = false; onNavigate("statistics") },
                            )
                            DropdownMenuItem(
                                text = { Text("Meilensteine") },
                                onClick = { showAccountMenu = false; onNavigate("gamification") },
                            )
                            DropdownMenuItem(
                                text = { Text("Entwicklung & Rückblicke") },
                                onClick = { showAccountMenu = false; onNavigate("insights") },
                            )
                            DropdownMenuItem(
                                text = { Text("Baseline Cycling Insights") },
                                onClick = { showAccountMenu = false; onNavigate("chat") },
                            )
                            DropdownMenuItem(
                                text = { Text("Profil") },
                                onClick = { showAccountMenu = false; onNavigate("profile") },
                            )
                            HorizontalDivider()
                            DropdownMenuItem(
                                text = { Text("Abmelden") },
                                leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, null) },
                                onClick = {
                                    showAccountMenu = false
                                    viewModel.logout(onLoggedOut)
                                },
                            )
                        }
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = openPicker,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("TCX importieren") },
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 18.dp, bottom = 110.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item {
                DashboardHeader(state.profile?.displayName)
            }
            item {
                StatisticsPanel(state.statistics)
            }
            state.statistics?.byMonth?.takeIf { it.isNotEmpty() }?.let { months ->
                item {
                    TrendPanel(months)
                }
            }
            item {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                    label = { Text("Aktivitäten durchsuchen") },
                    placeholder = { Text("Titel oder Dateiname") },
                    trailingIcon = {
                        IconButton(onClick = { viewModel.refresh(query) }) {
                            Icon(Icons.AutoMirrored.Filled.TrendingFlat, "Suche ausführen")
                        }
                    },
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { viewModel.refresh(query) }),
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Bottom,
                ) {
                    Column {
                        Text("Deine Fahrten", style = MaterialTheme.typography.headlineSmall)
                        Text(
                            "Zuletzt importiert",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (state.activities.isNotEmpty()) {
                        Text(
                            "${state.activities.size} angezeigt",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                }
            }
            if (state.loading && state.activities.isEmpty()) {
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(44.dp),
                        horizontalArrangement = Arrangement.Center,
                    ) {
                        CircularProgressIndicator()
                    }
                }
            } else if (state.activities.isEmpty()) {
                item {
                    EmptyActivities(onImport = openPicker)
                }
            } else {
                items(state.activities, key = { it.id }) { activity ->
                    ActivityCard(activity, onClick = { onOpenActivity(activity.id) })
                }
            }
        }
    }

    pendingImport?.let { import ->
        ImportDialog(
            fileName = import.displayName,
            loading = state.importing,
            onDismiss = onImportConsumed,
            onImport = { title, type, notes ->
                viewModel.upload(
                    resolver = context.contentResolver,
                    uri = import.uri,
                    fallbackName = import.displayName,
                    title = title,
                    type = type,
                    notes = notes,
                ) { activity ->
                    onImportConsumed()
                    onOpenActivity(activity.id)
                }
            },
        )
    }
}

@Composable
private fun DashboardHeader(displayName: String?) {
    val firstName = displayName?.trim()?.substringBefore(' ')?.takeIf(String::isNotBlank)
    Column {
        Text(
            "DEIN COCKPIT",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.primary,
            letterSpacing = 1.4.sp,
            fontWeight = FontWeight.ExtraBold,
        )
        Text(
            if (firstName == null) "Dein Radjahr" else "Hallo $firstName",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.padding(top = 3.dp),
        )
        Text(
            "Deine Fahrten auf einen Blick – aktuell, verständlich und bereit für die nächste Runde.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 7.dp),
        )
    }
}

@Composable
private fun StatisticsPanel(statistics: OverviewStatistics?) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            DashboardMetric(
                label = "Aktivitäten",
                value = statistics?.activityCount?.toString() ?: "–",
                hint = "importierte Fahrten",
                icon = Icons.AutoMirrored.Filled.DirectionsBike,
                accent = AventoPalette.Teal,
                modifier = Modifier.weight(1f),
            )
            DashboardMetric(
                label = "Distanz",
                value = statistics?.distanceMeters.asDistance(),
                hint = "insgesamt",
                icon = Icons.Default.Route,
                accent = AventoPalette.Blue,
                modifier = Modifier.weight(1f),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            DashboardMetric(
                label = "Fahrzeit",
                value = statistics?.movingTimeSeconds.asDuration(),
                hint = "aktive Zeit",
                icon = Icons.Default.AccessTime,
                accent = AventoPalette.Amber,
                modifier = Modifier.weight(1f),
            )
            DashboardMetric(
                label = "Höhenmeter",
                value = statistics?.elevationGainMeters.asElevation(),
                hint = "positiver Anstieg",
                icon = Icons.Default.Landscape,
                accent = AventoPalette.Coral,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun DashboardMetric(
    label: String,
    value: String,
    hint: String,
    icon: ImageVector,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.height(148.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.62f)),
    ) {
        Column(
            Modifier.fillMaxSize().padding(16.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Box(
                    Modifier.size(39.dp).background(accent.copy(alpha = 0.11f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(icon, null, tint = accent, modifier = Modifier.size(21.dp))
                }
            }
            Column {
                Text(value, style = MaterialTheme.typography.titleLarge, maxLines = 1)
                Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun TrendPanel(months: List<MonthStatistics>) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.62f)),
    ) {
        LineChart(
            title = "Distanz im Verlauf",
            subtitle = "Monatliche Kilometer",
            values = months.map { it.distanceMeters / 1_000.0 },
            unit = "km",
            color = AventoPalette.Teal,
            startLabel = months.firstOrNull()?.month.monthLabel(),
            endLabel = months.lastOrNull()?.month.monthLabel(),
            modifier = Modifier.padding(18.dp),
        )
    }
}

@Composable
private fun ActivityCard(activity: Activity, onClick: () -> Unit) {
    Card(
        Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.62f)),
    ) {
        Column(Modifier.padding(18.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp), verticalAlignment = Alignment.Top) {
                Box(
                    Modifier.size(52.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(16.dp)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.Route, null, tint = MaterialTheme.colorScheme.onPrimary)
                }
                Column(Modifier.weight(1f)) {
                    Row(
                        Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.Top,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                activity.title ?: activity.originalFilename ?: "Radfahrt",
                                style = MaterialTheme.typography.titleMedium,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                activity.startedAt.asGermanDateTime(),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(top = 3.dp),
                            )
                        }
                        Surface(
                            color = MaterialTheme.colorScheme.primaryContainer,
                            contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                            shape = RoundedCornerShape(9.dp),
                            modifier = Modifier.padding(start = 8.dp),
                        ) {
                            Text(
                                activity.type.activityTypeLabel(),
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(horizontal = 9.dp, vertical = 5.dp),
                            )
                        }
                    }
                }
            }
            HorizontalDivider(Modifier.padding(vertical = 16.dp), color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.7f))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MiniMetric(Icons.Default.Route, activity.distanceMeters.asDistance(), Modifier.weight(1f))
                MiniMetric(Icons.Default.AccessTime, activity.movingTimeSeconds.asDuration(), Modifier.weight(1f))
            }
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MiniMetric(Icons.Default.Landscape, activity.elevationGainMeters.asElevation(), Modifier.weight(1f))
                MiniMetric(Icons.Default.Speed, activity.averageSpeedMps.asSpeed(), Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun MiniMetric(icon: ImageVector, value: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
        Text(value, style = MaterialTheme.typography.labelMedium, maxLines = 1)
    }
}

@Composable
private fun EmptyActivities(onImport: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 34.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Box(
                Modifier.size(58.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(18.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(Icons.AutoMirrored.Filled.DirectionsBike, null, tint = MaterialTheme.colorScheme.primary)
            }
            Text("Noch keine Fahrt", style = MaterialTheme.typography.titleLarge)
            Text(
                "Importiere eine TCX-Datei und starte deine persönliche Analyse.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = onImport, modifier = Modifier.padding(top = 6.dp)) {
                Icon(Icons.Default.Add, null)
                Spacer(Modifier.width(8.dp))
                Text("Erste Fahrt importieren")
            }
        }
    }
}

@Composable
private fun ImportDialog(
    fileName: String?,
    loading: Boolean,
    onDismiss: () -> Unit,
    onImport: (String?, String?, String?) -> Unit,
) {
    var title by remember(fileName) { mutableStateOf(fileName?.substringBeforeLast('.').orEmpty()) }
    var type by remember { mutableStateOf("cycling") }
    var notes by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!loading) onDismiss() },
        icon = {
            Box(
                Modifier.size(48.dp).background(MaterialTheme.colorScheme.primaryContainer, RoundedCornerShape(14.dp)),
                contentAlignment = Alignment.Center,
            ) { Icon(Icons.Default.Add, null, tint = MaterialTheme.colorScheme.primary) }
        },
        title = { Text("TCX importieren") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                fileName?.let {
                    Text(it, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                OutlinedTextField(title, { title = it }, label = { Text("Titel") }, singleLine = true)
                OutlinedTextField(type, { type = it }, label = { Text("Aktivitätstyp") }, singleLine = true)
                OutlinedTextField(notes, { notes = it }, label = { Text("Private Notizen") }, minLines = 3)
            }
        },
        confirmButton = {
            Button(
                onClick = { onImport(title.ifBlank { null }, type.ifBlank { null }, notes.ifBlank { null }) },
                enabled = !loading,
            ) {
                if (loading) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                } else {
                    Text("Hochladen")
                }
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !loading) { Text("Abbrechen") } },
    )
}

private fun String?.activityTypeLabel(): String = when (this?.lowercase()) {
    "cycling", "cycle", "ride", "biking" -> "Radfahrt"
    null, "" -> "Aktivität"
    else -> replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.GERMAN) else it.toString() }
}

private fun String?.monthLabel(): String? = this?.let { raw ->
    runCatching {
        YearMonth.parse(raw).format(DateTimeFormatter.ofPattern("MMM yyyy", Locale.GERMAN))
    }.getOrDefault(raw)
}
