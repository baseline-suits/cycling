package de.avento.app.ui.detail

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.Air
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Landscape
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Route
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.Thermostat
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.WaterDrop
import androidx.compose.material.icons.filled.WbSunny
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.avento.app.data.model.Activity
import de.avento.app.data.model.ActivityPhoto
import de.avento.app.data.model.TrackPoint
import de.avento.app.data.model.WeatherResponse
import de.avento.app.ui.components.ByteArrayImage
import de.avento.app.ui.components.LineChart
import de.avento.app.ui.components.RoutePreview
import de.avento.app.ui.theme.AventoPalette
import de.avento.app.share.OverlayShareContent
import de.avento.app.share.ShareStudio
import de.avento.app.util.SummaryImageExporter
import de.avento.app.util.asDistance
import de.avento.app.util.asDuration
import de.avento.app.util.asElevation
import de.avento.app.util.asGermanDateTime
import de.avento.app.util.asInteger
import de.avento.app.util.asSpeed
import de.avento.app.util.readPhoto
import java.util.Locale
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetailScreen(viewModel: DetailViewModel, onBack: () -> Unit, onDeleted: () -> Unit) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbar = remember { SnackbarHostState() }
    var showEdit by remember { mutableStateOf(false) }
    var showDelete by remember { mutableStateOf(false) }
    var showMenu by remember { mutableStateOf(false) }
    var showShare by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        uri ?: return@rememberLauncherForActivityResult
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { context.contentResolver.readPhoto(uri) } }
                .onSuccess { file -> viewModel.uploadPhoto(file.bytes, file.displayName, file.contentType) }
        }
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
                    Text(
                        "Aktivität",
                        style = MaterialTheme.typography.titleLarge,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, "Zurück")
                    }
                },
                actions = {
                    state.activity?.let { activity ->
                        Box {
                            IconButton(onClick = { showMenu = true }) {
                                Icon(Icons.Default.MoreVert, "Aktionsmenü")
                            }
                            DropdownMenu(
                                expanded = showMenu,
                                onDismissRequest = { showMenu = false },
                            ) {
                                DropdownMenuItem(
                                    text = { Text("Als Bild teilen") },
                                    leadingIcon = { Icon(Icons.Default.Share, null) },
                                    onClick = {
                                        showMenu = false
                                        showShare = true
                                    },
                                )
                                DropdownMenuItem(
                                    text = { Text("KI-Daten neu analysieren") },
                                    leadingIcon = { Icon(Icons.Default.AutoAwesome, null) },
                                    onClick = { showMenu = false; viewModel.reanalyze() },
                                )
                                DropdownMenuItem(
                                    text = { Text("Bearbeiten") },
                                    leadingIcon = { Icon(Icons.Default.Edit, null) },
                                    onClick = {
                                        showMenu = false
                                        showEdit = true
                                    },
                                )
                                HorizontalDivider()
                                DropdownMenuItem(
                                    text = { Text("Aktivität löschen", color = MaterialTheme.colorScheme.error) },
                                    leadingIcon = { Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error) },
                                    onClick = {
                                        showMenu = false
                                        showDelete = true
                                    },
                                )
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        when {
            state.loading && state.activity == null -> Column(
                Modifier.fillMaxSize().padding(padding),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator()
                Text(
                    "Aktivität wird geladen …",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(top = 14.dp),
                )
            }
            state.activity != null -> ActivityContent(
                activity = state.activity!!,
                points = state.track?.points.orEmpty(),
                weather = state.weather,
                summary = state.summary?.summary ?: state.activity?.aiSummary,
                summaryProvider = state.summary?.provider ?: state.activity?.aiProvider,
                refreshingWeather = state.refreshingWeather,
                generatingSummary = state.generatingSummary,
                onRefreshWeather = viewModel::refreshWeather,
                onGenerateSummary = { viewModel.generateSummary(state.summary != null) },
                onEdit = { showEdit = true },
                photos = state.photos,
                uploadingPhoto = state.uploadingPhoto,
                onPickPhoto = { photoPicker.launch("image/*") },
                onDeletePhoto = viewModel::deletePhoto,
                loadPhoto = viewModel::photoBytes,
                contentPadding = padding,
            )
            else -> Column(
                Modifier.fillMaxSize().padding(padding).padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(state.error ?: "Aktivität konnte nicht geladen werden.")
                Button(onClick = viewModel::load, modifier = Modifier.padding(top = 16.dp)) {
                    Text("Erneut versuchen")
                }
            }
        }
    }

    if (showEdit) state.activity?.let { activity ->
        EditDialog(activity, state.saving, { showEdit = false }) { title, type, notes, hydration ->
            viewModel.save(title, type, notes, hydration) { showEdit = false }
        }
    }
    if (showShare) state.activity?.let { activity ->
        ShareStudio(
            content = OverlayShareContent.ActivityContent(activity, state.track),
            photos = state.photos,
            loadPhoto = viewModel::photoBytes,
            onDismiss = { showShare = false },
            onShare = { bitmap, title -> SummaryImageExporter.share(context, bitmap, title) },
        )
    }
    if (showDelete) {
        AlertDialog(
            onDismissRequest = { if (!state.saving) showDelete = false },
            icon = { Icon(Icons.Default.Delete, null, tint = MaterialTheme.colorScheme.error) },
            title = { Text("Aktivität löschen?") },
            text = { Text("Die Aktivität und ihre TCX-Datei werden dauerhaft vom Server entfernt.") },
            confirmButton = {
                Button(
                    onClick = { viewModel.delete(onDeleted) },
                    enabled = !state.saving,
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error,
                        contentColor = MaterialTheme.colorScheme.onError,
                    ),
                ) {
                    Text("Endgültig löschen")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDelete = false }, enabled = !state.saving) { Text("Abbrechen") }
            },
        )
    }
}

@Composable
private fun ActivityContent(
    activity: Activity,
    points: List<TrackPoint>,
    weather: WeatherResponse?,
    summary: String?,
    summaryProvider: String?,
    refreshingWeather: Boolean,
    generatingSummary: Boolean,
    onRefreshWeather: () -> Unit,
    onGenerateSummary: () -> Unit,
    onEdit: () -> Unit,
    photos: List<ActivityPhoto>,
    uploadingPhoto: Boolean,
    onPickPhoto: () -> Unit,
    onDeletePhoto: (ActivityPhoto) -> Unit,
    loadPhoto: suspend (ActivityPhoto) -> ByteArray,
    contentPadding: PaddingValues,
) {
    LazyColumn(
        Modifier.fillMaxSize().padding(contentPadding),
        contentPadding = PaddingValues(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 36.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item { ActivityHeader(activity) }
        item { MetricGrid(activity) }
        if (points.any { it.latitude != null && it.longitude != null }) {
            item { RouteCard(points) }
        }
        item {
            AiCard(summary, summaryProvider, generatingSummary, onGenerateSummary)
        }
        item { PhotoGallery(photos, uploadingPhoto, onPickPhoto, onDeletePhoto, loadPhoto) }
        item {
            WeatherCard(weather, activity.weather, refreshingWeather, onRefreshWeather)
        }
        if (points.any { it.altitudeMeters != null }) {
            item {
                ChartCard {
                    LineChart(
                        title = "Höhenprofil",
                        subtitle = "Höhe entlang der Strecke",
                        values = points.map { it.altitudeMeters },
                        unit = "m",
                        color = AventoPalette.Lime,
                    )
                }
            }
        }
        if (points.any { it.heartRate != null }) {
            item {
                ChartCard {
                    LineChart(
                        title = "Herzfrequenz",
                        subtitle = "Belastung im Fahrtverlauf",
                        values = points.map { it.heartRate },
                        unit = "bpm",
                        color = AventoPalette.Coral,
                    )
                }
            }
        }
        if (points.any { it.speedMps != null }) {
            item {
                ChartCard {
                    LineChart(
                        title = "Geschwindigkeit",
                        subtitle = "Tempo im Fahrtverlauf",
                        values = points.map { it.speedMps?.times(3.6) },
                        unit = "km/h",
                        color = AventoPalette.Blue,
                    )
                }
            }
        }
        item { HeartRateZones(activity) }
        item { NotesCard(activity.notes, onEdit) }
    }
}

@Composable
private fun PhotoGallery(
    photos: List<ActivityPhoto>,
    uploading: Boolean,
    onPick: () -> Unit,
    onDelete: (ActivityPhoto) -> Unit,
    loadPhoto: suspend (ActivityPhoto) -> ByteArray,
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Aktivitätsfotos", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
                OutlinedButton(onClick = onPick, enabled = !uploading) { Text(if (uploading) "Lädt …" else "Hinzufügen") }
            }
            if (photos.isEmpty()) {
                Text("Noch keine Fotos zu dieser Aktivität.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    photos.take(8).forEach { photo ->
                        Column(Modifier.width(150.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            PhotoThumbnail(photo, loadPhoto)
                            Text(photo.caption ?: photo.originalFilename, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodySmall)
                            TextButton(onClick = { onDelete(photo) }) { Text("Löschen") }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PhotoThumbnail(photo: ActivityPhoto, loadPhoto: suspend (ActivityPhoto) -> ByteArray) {
    val bytes by androidx.compose.runtime.produceState<ByteArray?>(initialValue = null, key1 = photo.id) {
        value = runCatching { loadPhoto(photo) }.getOrNull()
    }
    ByteArrayImage(bytes, photo.caption ?: photo.originalFilename, Modifier.size(150.dp))
}

@Composable
private fun ActivityHeader(activity: Activity) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
            Surface(
                color = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary,
                shape = RoundedCornerShape(9.dp),
            ) {
                Text(
                    activity.type.activityTypeLabel(),
                    style = MaterialTheme.typography.labelSmall,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
                )
            }
            Text(
                activity.startedAt.asGermanDateTime(),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            activity.title ?: activity.originalFilename ?: "Radfahrt",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.padding(top = 8.dp),
        )
        activity.originalFilename?.takeIf { it != activity.title }?.let { filename ->
            Text(
                "Importiert aus $filename",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 5.dp),
            )
        }
    }
}

@Composable
private fun MetricGrid(activity: Activity) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PrimaryMetric(
                "Distanz",
                activity.distanceMeters.asDistance(),
                Icons.Default.Route,
                AventoPalette.Blue,
                Modifier.weight(1f),
            )
            PrimaryMetric(
                "Bewegungszeit",
                activity.movingTimeSeconds.asDuration(),
                Icons.Default.Timer,
                AventoPalette.Teal,
                Modifier.weight(1f),
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            PrimaryMetric(
                "Höhenmeter",
                activity.elevationGainMeters.asElevation(),
                Icons.Default.Landscape,
                AventoPalette.Lime,
                Modifier.weight(1f),
            )
            PrimaryMetric(
                "Ø Tempo",
                activity.averageSpeedMps.asSpeed(),
                Icons.Default.Speed,
                AventoPalette.Amber,
                Modifier.weight(1f),
            )
        }
        Card(
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            border = subtleBorder(),
        ) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(15.dp)) {
                SecondaryMetricRow(
                    Icons.Default.Favorite,
                    "Ø Herzfrequenz",
                    activity.averageHeartRate.asInteger("bpm"),
                    "Max. Herzfrequenz",
                    activity.maxHeartRate.asInteger("bpm"),
                    AventoPalette.Coral,
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f))
                SecondaryMetricRow(
                    Icons.Default.AccessTime,
                    "Gesamtzeit",
                    activity.durationSeconds.asDuration(),
                    "Max. Tempo",
                    activity.maxSpeedMps.asSpeed(),
                    AventoPalette.Teal,
                )
            }
        }
    }
}

@Composable
private fun PrimaryMetric(
    label: String,
    value: String,
    icon: ImageVector,
    accent: Color,
    modifier: Modifier = Modifier,
) {
    Card(
        modifier = modifier.height(132.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = subtleBorder(),
    ) {
        Column(
            Modifier.fillMaxSize().padding(15.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Box(
                Modifier.size(39.dp).background(accent.copy(alpha = 0.12f), RoundedCornerShape(12.dp)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(icon, null, tint = accent, modifier = Modifier.size(21.dp))
            }
            Column {
                Text(value, style = MaterialTheme.typography.titleLarge, maxLines = 1)
                Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
private fun SecondaryMetricRow(
    icon: ImageVector,
    firstLabel: String,
    firstValue: String,
    secondLabel: String,
    secondValue: String,
    accent: Color,
) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(
            Modifier.size(38.dp).background(accent.copy(alpha = 0.11f), RoundedCornerShape(11.dp)),
            contentAlignment = Alignment.Center,
        ) { Icon(icon, null, tint = accent, modifier = Modifier.size(20.dp)) }
        SmallMetric(firstLabel, firstValue, Modifier.weight(1f))
        SmallMetric(secondLabel, secondValue, Modifier.weight(1f))
    }
}

@Composable
private fun SmallMetric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 2.dp))
    }
}

@Composable
private fun RouteCard(points: List<TrackPoint>) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = subtleBorder(),
    ) {
        Column {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 15.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("Streckenverlauf", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "${points.count { it.latitude != null && it.longitude != null }} aufgezeichnete Punkte",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Icon(Icons.Default.Route, null, tint = MaterialTheme.colorScheme.primary)
            }
            RoutePreview(points)
        }
    }
}

@Composable
private fun WeatherCard(
    weather: WeatherResponse?,
    embedded: Map<String, Any?>?,
    loading: Boolean,
    onRefresh: () -> Unit,
) {
    val data = weather?.data ?: embedded
    val temperature = data.number("temperature_c", "temperature", "temp_c")
    val feelsLike = data.number("apparent_temperature_c", "feels_like_c")
    val humidity = data.number("relative_humidity_percent", "humidity_percent", "humidity")
    val windSpeed = data.number("wind_speed_kmh", "wind_speed", "windspeed")
    val direction = data.windDirection()
    val description = data.value("description", "condition") ?: data.value("weather_code")?.let(::weatherLabel)
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = subtleBorder(),
    ) {
        Box(
            Modifier.fillMaxWidth().background(
                Brush.linearGradient(
                    listOf(
                        MaterialTheme.colorScheme.tertiaryContainer.copy(alpha = 0.52f),
                        MaterialTheme.colorScheme.surface,
                    ),
                ),
            ),
        ) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                        Icon(Icons.Default.WbSunny, null, tint = AventoPalette.Amber, modifier = Modifier.size(31.dp))
                        Column {
                            Text("Wetter", style = MaterialTheme.typography.titleLarge)
                            Text(
                                "Bedingungen auf der Strecke",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    IconButton(onClick = onRefresh, enabled = !loading) {
                        if (loading) {
                            CircularProgressIndicator(Modifier.size(21.dp), strokeWidth = 2.dp)
                        } else {
                            Icon(Icons.Default.Refresh, "Wetter aktualisieren")
                        }
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f))
                if (data == null) {
                    Text(
                        "Für diese Fahrt liegen noch keine Wetterdaten vor.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedButton(onClick = onRefresh, enabled = !loading) { Text("Wetter abrufen") }
                } else {
                    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                        Text(
                            temperature?.let { "${it.roundToInt()}°" } ?: "–",
                            style = MaterialTheme.typography.headlineLarge,
                        )
                        Text(
                            description ?: "Wetterdaten",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(bottom = 4.dp),
                        )
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        WeatherMetric(
                            icon = Icons.Default.Air,
                            label = "Wind",
                            value = windSpeed?.let { "${it.roundToInt()} km/h" } ?: "–",
                            detail = direction,
                            modifier = Modifier.weight(1f),
                        )
                        WeatherMetric(
                            icon = Icons.Default.Thermostat,
                            label = "Gefühlt",
                            value = feelsLike?.let { "${it.roundToInt()} °C" } ?: "–",
                            modifier = Modifier.weight(1f),
                        )
                        WeatherMetric(
                            icon = Icons.Default.WaterDrop,
                            label = "Feuchte",
                            value = humidity?.let { "${it.roundToInt()} %" } ?: "–",
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun WeatherMetric(
    icon: ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    detail: String? = null,
) {
    Column(
        modifier.background(MaterialTheme.colorScheme.surface.copy(alpha = 0.7f), RoundedCornerShape(12.dp)).padding(10.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        detail?.let {
            Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary, maxLines = 1)
        }
    }
}

private fun Map<String, Any?>?.value(vararg keys: String): String? = keys.firstNotNullOfOrNull { key ->
    this?.get(key)?.toString()?.takeIf { it.isNotBlank() }
}

private fun Map<String, Any?>?.number(vararg keys: String): Double? = keys.firstNotNullOfOrNull { key ->
    when (val raw = this?.get(key)) {
        is Number -> raw.toDouble()
        is String -> raw.replace(',', '.').toDoubleOrNull()
        else -> null
    }
}

private fun Map<String, Any?>?.windDirection(): String? {
    val literal = value("wind_direction", "wind_direction_compass", "wind_direction_cardinal")
    if (literal != null && literal.toDoubleOrNull() == null) return literal.uppercase(Locale.GERMAN)
    val degrees = number(
        "wind_direction_deg",
        "wind_direction_degrees",
        "winddirection_10m",
        "wind_direction",
    ) ?: return null
    val labels = listOf("N", "NO", "O", "SO", "S", "SW", "W", "NW")
    val normalized = ((degrees % 360) + 360) % 360
    return "${labels[((normalized + 22.5) / 45).toInt() % 8]} · ${normalized.roundToInt()}°"
}

private fun weatherLabel(raw: String): String = when (raw.toDoubleOrNull()?.roundToInt()) {
    0 -> "Klar"
    in 1..3 -> "Bewölkt"
    in 45..48 -> "Neblig"
    in 51..67, in 80..82 -> "Regen"
    in 71..77, in 85..86 -> "Schnee"
    else -> "Wechselhaft"
}

@Composable
private fun AiCard(summary: String?, provider: String?, loading: Boolean, onGenerate: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = subtleBorder(),
    ) {
        Box(
            Modifier.fillMaxWidth().background(
                Brush.linearGradient(
                    listOf(
                        MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.62f),
                        MaterialTheme.colorScheme.surface,
                    ),
                ),
            ),
        ) {
            Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(13.dp)) {
                Row(
                    Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.Top,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(11.dp)) {
                        Box(
                            Modifier.size(43.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(13.dp)),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Default.AutoAwesome, null, tint = MaterialTheme.colorScheme.onPrimary)
                        }
                        Column {
                            Text("Baseline Cycling Insight", style = MaterialTheme.typography.titleLarge)
                            Text(
                                "Deine KI-Auswertung",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                    provider?.let {
                        Surface(
                            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.72f),
                            shape = RoundedCornerShape(9.dp),
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                        ) {
                            Text(
                                it,
                                style = MaterialTheme.typography.labelSmall,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 5.dp),
                            )
                        }
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.65f))
                Text(
                    summary ?: "Lass Leistung, Strecke und Wetter zu einer persönlichen Zusammenfassung verbinden.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (summary == null) {
                    Button(onClick = onGenerate, enabled = !loading) {
                        if (loading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        else {
                            Icon(Icons.Default.AutoAwesome, null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Auswertung erstellen")
                        }
                    }
                } else {
                    TextButton(onClick = onGenerate, enabled = !loading, modifier = Modifier.align(Alignment.End)) {
                        if (loading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                        else {
                            Icon(Icons.Default.Refresh, null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(7.dp))
                            Text("Neu erstellen")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HeartRateZones(activity: Activity) {
    val zones = activity.heartRateZoneSeconds.entries.toList()
    val total = zones.sumOf { it.value }
    val colors = listOf(AventoPalette.Blue, AventoPalette.Teal, AventoPalette.Lime, AventoPalette.Amber, AventoPalette.Coral)
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = subtleBorder(),
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column {
                    Text("Herzfrequenzzonen", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "Zeit in den Trainingsbereichen",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Icon(Icons.Default.AccessTime, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (zones.isEmpty()) {
                Text("Keine Herzfrequenzzonen verfügbar.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                zones.forEachIndexed { index, (zone, seconds) ->
                    val fraction = if (total > 0) (seconds / total).toFloat().coerceIn(0f, 1f) else 0f
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text(zone, style = MaterialTheme.typography.labelMedium)
                            Text(
                                seconds.asDuration(),
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Box(
                            Modifier.fillMaxWidth().height(7.dp)
                                .clip(RoundedCornerShape(4.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                        ) {
                            Box(
                                Modifier.fillMaxWidth(fraction).height(7.dp)
                                    .background(colors[index % colors.size]),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun NotesCard(notes: String?, onEdit: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = subtleBorder(),
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Notizen", style = MaterialTheme.typography.titleLarge)
            Text(
                notes?.takeIf(String::isNotBlank) ?: "Noch keine Notizen zu dieser Fahrt.",
                color = if (notes.isNullOrBlank()) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface,
            )
            TextButton(onClick = onEdit, modifier = Modifier.align(Alignment.End)) {
                Icon(Icons.Default.Edit, null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(7.dp))
                Text("Notizen bearbeiten")
            }
        }
    }
}

@Composable
private fun ChartCard(content: @Composable () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = subtleBorder(),
    ) {
        Column(Modifier.padding(18.dp)) { content() }
    }
}

@Composable
private fun subtleBorder(): BorderStroke = BorderStroke(
    1.dp,
    MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.62f),
)

@Composable
private fun EditDialog(
    activity: Activity,
    saving: Boolean,
    onDismiss: () -> Unit,
    onSave: (String?, String?, String?, Int?) -> Unit,
) {
    var title by remember(activity.id) { mutableStateOf(activity.title.orEmpty()) }
    var type by remember(activity.id) { mutableStateOf(activity.type.orEmpty()) }
    var notes by remember(activity.id) { mutableStateOf(activity.notes.orEmpty()) }
    var hydration by remember(activity.id) { mutableStateOf(activity.hydrationMilliliters?.toString().orEmpty()) }
    AlertDialog(
        onDismissRequest = { if (!saving) onDismiss() },
        icon = { Icon(Icons.Default.Edit, null, tint = MaterialTheme.colorScheme.primary) },
        title = { Text("Aktivität bearbeiten") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(title, { title = it }, label = { Text("Titel") })
                OutlinedTextField(type, { type = it }, label = { Text("Typ") })
                OutlinedTextField(notes, { notes = it }, label = { Text("Notizen") }, minLines = 4)
                OutlinedTextField(hydration, { hydration = it }, label = { Text("Trinkmenge (ml, optional)") }, singleLine = true)
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(title.ifBlank { null }, type.ifBlank { null }, notes.ifBlank { null }, hydration.toIntOrNull()) },
                enabled = !saving,
            ) {
                if (saving) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text("Speichern")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !saving) { Text("Abbrechen") } },
    )
}

private fun String?.activityTypeLabel(): String = when (this?.lowercase()) {
    "cycling", "cycle", "ride", "biking" -> "Radfahrt"
    null, "" -> "Aktivität"
    else -> replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.GERMAN) else it.toString() }
}
