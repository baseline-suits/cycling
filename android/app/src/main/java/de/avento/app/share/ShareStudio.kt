package de.avento.app.share

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import de.avento.app.data.model.ActivityPhoto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShareStudio(
    content: OverlayShareContent,
    photos: List<ActivityPhoto>,
    loadPhoto: suspend (ActivityPhoto) -> ByteArray,
    onDismiss: () -> Unit,
    onShare: (Bitmap, String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val routeAvailable = (content as? OverlayShareContent.ActivityContent)?.track?.points?.count { it.latitude != null && it.longitude != null }?.let { it >= 2 } == true
    var config by remember(content) { mutableStateOf(OverlayConfig(showRoute = routeAvailable, showWeather = content is OverlayShareContent.ActivityContent && content.activity.weather != null)) }
    var photoBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var preview by remember { mutableStateOf<Bitmap?>(null) }
    var mapBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var rendering by remember { mutableStateOf(false) }

    LaunchedEffect(config.photoId, photos) {
        val photo = photos.firstOrNull { it.id == config.photoId } ?: photos.firstOrNull()
        photoBitmap = if (config.background == OverlayBackground.PHOTO && photo != null) withContext(Dispatchers.IO) {
            runCatching { loadPhoto(photo) }.getOrNull()?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }
        } else null
        if (config.photoId == null && photo != null) config = config.copy(photoId = photo.id)
    }
    LaunchedEffect(config.background, config.format, content) {
        val points = (content as? OverlayShareContent.ActivityContent)?.track?.points.orEmpty()
        mapBitmap = if (config.background == OverlayBackground.MAP) createShareMapSnapshot(context, points, config.format.width, config.format.height) else null
    }
    LaunchedEffect(config, photoBitmap, mapBitmap, content) {
        delay(100)
        preview = withContext(Dispatchers.Default) { OverlayRenderer.render(content, config, photoBitmap, mapBitmap, .34f) }
    }

    fun selectTemplate(template: OverlayTemplate) {
        val defaults = when (template) {
            OverlayTemplate.MINIMAL -> OverlayBackground.TRANSPARENT to listOf(OverlayMetric.DISTANCE, OverlayMetric.MOVING_TIME, OverlayMetric.AVG_SPEED)
            OverlayTemplate.PHOTO -> (if (photos.isEmpty()) OverlayBackground.SOLID else OverlayBackground.PHOTO) to listOf(OverlayMetric.DISTANCE, OverlayMetric.MOVING_TIME, OverlayMetric.ELEVATION)
            OverlayTemplate.MAP -> (if (routeAvailable) OverlayBackground.MAP else OverlayBackground.SOLID) to listOf(OverlayMetric.DISTANCE, OverlayMetric.MOVING_TIME, OverlayMetric.ELEVATION)
            OverlayTemplate.STATS -> OverlayBackground.SOLID to listOf(OverlayMetric.DISTANCE, OverlayMetric.MOVING_TIME, OverlayMetric.AVG_SPEED, OverlayMetric.ELEVATION, OverlayMetric.HEART_RATE)
            else -> OverlayBackground.SOLID to listOf(OverlayMetric.DISTANCE, OverlayMetric.MOVING_TIME, OverlayMetric.AVG_SPEED, OverlayMetric.ELEVATION)
        }
        config = config.copy(template = template, background = defaults.first, metrics = defaults.second)
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Scaffold(topBar = { TopAppBar(title = { Text("Share-Grafik gestalten") }, navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Schließen") } }) }) { padding ->
                LazyColumn(
                    Modifier.fillMaxSize().padding(padding),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    item {
                        Box(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant).padding(12.dp), contentAlignment = Alignment.Center) {
                            preview?.let { Image(it.asImageBitmap(), "Live-Vorschau", Modifier.fillMaxWidth().widthIn(max = 460.dp).height((it.height.toFloat() / it.width * 360).dp), contentScale = ContentScale.Fit) }
                        }
                    }
                    item { ChoiceRow("Vorlage", OverlayTemplate.entries, config.template, { it.label }) { selectTemplate(it) } }
                    item { ChoiceRow("Format", OverlayFormat.entries, config.format, { it.label }) { config = config.copy(format = it) } }
                    item { ChoiceRow("Design", OverlayTheme.entries, config.theme, { if (it == OverlayTheme.LIGHT) "Hell" else "Dunkel" }) { config = config.copy(theme = it) } }
                    item {
                        ChoiceRow("Hintergrund", OverlayBackground.entries.filter { (it != OverlayBackground.MAP || routeAvailable) && (it != OverlayBackground.PHOTO || photos.isNotEmpty()) }, config.background, { when (it) { OverlayBackground.TRANSPARENT -> "Transparent"; OverlayBackground.SOLID -> "Farbe"; OverlayBackground.MAP -> "Karte"; OverlayBackground.PHOTO -> "Foto" } }) { config = config.copy(background = it) }
                    }
                    if (config.background == OverlayBackground.PHOTO && photos.isNotEmpty()) item { ChoiceRow("Galeriefoto", photos, photos.firstOrNull { it.id == config.photoId } ?: photos.first(), { it.caption ?: it.originalFilename }) { config = config.copy(photoId = it.id) } }
                    if (config.background == OverlayBackground.PHOTO && photos.isNotEmpty()) item {
                        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) { Text("Vertikaler Bildausschnitt", fontWeight = FontWeight.ExtraBold); Slider(config.photoPositionPercent, { config = config.copy(photoPositionPercent = it) }, valueRange = 0f..100f) }
                    }
                    if (config.background == OverlayBackground.SOLID) item {
                        ChoiceRow("Farbe", listOf(0xFF080A0D.toInt(), 0xFFB9E878.toInt(), 0xFF8F86FF.toInt(), 0xFFF2F5EF.toInt()), config.solidColor, { color -> when (color) { 0xFF080A0D.toInt() -> "Baseline"; 0xFFB9E878.toInt() -> "Lime"; 0xFF8F86FF.toInt() -> "Violett"; else -> "Off-White" } }) { config = config.copy(solidColor = it) }
                    }
                    item {
                        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                            Text("Inhalte", fontWeight = FontWeight.ExtraBold)
                            ToggleRow("Route", config.showRoute, routeAvailable) { config = config.copy(showRoute = it) }
                            ToggleRow("Titel", config.showTitle) { config = config.copy(showTitle = it) }
                            ToggleRow("Datum", config.showDate) { config = config.copy(showDate = it) }
                            ToggleRow("Wetter", config.showWeather, content is OverlayShareContent.ActivityContent && content.activity.weather != null) { config = config.copy(showWeather = it) }
                            ToggleRow("Baseline Cycling-Branding", config.showBrand) { config = config.copy(showBrand = it) }
                        }
                    }
                    item {
                        Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                            Text("Kennzahlen · maximal sechs", fontWeight = FontWeight.ExtraBold)
                            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OverlayMetric.entries.forEach { metric ->
                                    FilterChip(
                                        selected = metric in config.metrics,
                                        onClick = { config = config.copy(metrics = if (metric in config.metrics) config.metrics - metric else if (config.metrics.size < 6) config.metrics + metric else config.metrics) },
                                        label = { Text(metric.label) },
                                    )
                                }
                            }
                        }
                    }
                    item {
                        Button(
                            enabled = !rendering,
                            onClick = {
                                rendering = true
                                scope.launch {
                                    val bitmap = withContext(Dispatchers.Default) { OverlayRenderer.render(content, config, photoBitmap, mapBitmap) }
                                    onShare(bitmap, content.title)
                                    rendering = false
                                }
                            },
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                        ) { Icon(Icons.Default.Share, null); Spacer(Modifier.padding(4.dp)); Text(if (rendering) "PNG wird erstellt …" else "PNG teilen") }
                    }
                    item { Spacer(Modifier.height(24.dp)) }
                }
            }
        }
    }
}

@Composable
private fun <T> ChoiceRow(title: String, values: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        Text(title, fontWeight = FontWeight.ExtraBold)
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            values.forEach { value -> FilterChip(selected = value == selected, onClick = { onSelect(value) }, label = { Text(label(value)) }) }
        }
    }
}

@Composable
private fun ToggleRow(label: String, checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), color = if (enabled) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant)
        Switch(checked = checked, onCheckedChange = onChange, enabled = enabled)
    }
}
