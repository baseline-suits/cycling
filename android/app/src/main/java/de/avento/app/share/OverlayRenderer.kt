package de.avento.app.share

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.RectF
import android.graphics.Rect
import android.graphics.Shader
import android.graphics.Typeface
import de.avento.app.data.model.Activity
import de.avento.app.data.model.TrackPoint
import de.avento.app.util.asDistance
import de.avento.app.util.asDuration
import de.avento.app.util.asElevation
import de.avento.app.util.asGermanDateTime
import de.avento.app.util.asInteger
import de.avento.app.util.asSpeed
import java.util.Locale
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.tan

object OverlayRenderer {
    private data class Palette(val canvas: Int, val surface: Int, val text: Int, val muted: Int, val accent: Int, val achievement: Int, val halo: Int)
    private data class MetricValue(val label: String, val value: String)
    private val layouts: Map<OverlayTemplate, (Canvas, Paint, OverlayShareContent, OverlayConfig, Palette, List<MetricValue>) -> Unit> = mapOf(
        OverlayTemplate.CLASSIC to ::drawClassic,
        OverlayTemplate.MINIMAL to ::drawMinimal,
        OverlayTemplate.PHOTO to ::drawPhotoLayout,
        OverlayTemplate.STATS to ::drawStats,
        OverlayTemplate.MAP to ::drawMapLayout,
        OverlayTemplate.ACHIEVEMENT to ::drawAchievement,
    )

    fun render(content: OverlayShareContent, config: OverlayConfig, photo: Bitmap? = null, mapBitmap: Bitmap? = null, scale: Float = 1f): Bitmap {
        val width = (config.format.width * scale).toInt().coerceAtLeast(1)
        val height = (config.format.height * scale).toInt().coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.TRANSPARENT, PorterDuff.Mode.CLEAR)
        canvas.scale(scale, scale)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG)
        val palette = palette(config.theme)
        drawBackground(canvas, paint, content, config, palette, photo, mapBitmap)
        layouts.getValue(config.template)(canvas, paint, content, config, palette, metricValues(content, config.metrics))
        return bitmap
    }

    private fun palette(theme: OverlayTheme) = if (theme == OverlayTheme.DARK) Palette(
        0xFF080A0D.toInt(), 0xE8171923.toInt(), 0xFFF2F5EF.toInt(), 0xFFC4CBC0.toInt(),
        0xFFB9E878.toInt(), 0xFFF0B65E.toInt(), 0xDD080A0D.toInt(),
    ) else Palette(
        0xFFF2F5EF.toInt(), 0xEFFFFFFF.toInt(), 0xFF151A12.toInt(), 0xFF62695E.toInt(),
        0xFF5E7F1C.toInt(), 0xFFB97616.toInt(), 0xEEFFFFFF.toInt(),
    )

    private fun drawBackground(canvas: Canvas, paint: Paint, content: OverlayShareContent, config: OverlayConfig, palette: Palette, photo: Bitmap?, mapBitmap: Bitmap?) {
        when (config.background) {
            OverlayBackground.TRANSPARENT -> Unit
            OverlayBackground.PHOTO -> if (photo != null) drawCoverBitmap(canvas, photo, config.format.width, config.format.height, config.photoPositionPercent) else canvas.drawColor(config.solidColor)
            OverlayBackground.MAP -> {
                if (mapBitmap != null) {
                    drawCoverBitmap(canvas, mapBitmap, config.format.width, config.format.height, 50f)
                    if (config.theme == OverlayTheme.DARK) { paint.color = 0x66031817; canvas.drawRect(0f, 0f, config.format.width.toFloat(), config.format.height.toFloat(), paint) }
                } else {
                    canvas.drawColor(if (config.theme == OverlayTheme.DARK) 0xFF171923.toInt() else 0xFFE9EDE5.toInt())
                    paint.color = if (config.theme == OverlayTheme.DARK) 0x2261D8DD else 0x225E7F1C
                    paint.strokeWidth = 2f
                    for (x in -config.format.height until config.format.width step 120) canvas.drawLine(x.toFloat(), 0f, (x + config.format.height).toFloat(), config.format.height.toFloat(), paint)
                }
                activity(content)?.let { if (config.showRoute) drawRoute(canvas, paint, it.track?.points.orEmpty(), RectF(70f, 70f, config.format.width - 70f, config.format.height - 70f), palette, it.achievement) }
                if (mapBitmap != null) text(canvas, paint, "© OpenFreeMap · © OpenStreetMap", config.format.width - 350f, config.format.height - 18f, 15f, 0xCC253330.toInt(), false)
            }
            OverlayBackground.SOLID -> {
                canvas.drawColor(config.solidColor)
                paint.shader = LinearGradient(0f, 0f, config.format.width.toFloat(), config.format.height.toFloat(), config.solidColor, palette.canvas, Shader.TileMode.CLAMP)
                canvas.drawRect(0f, 0f, config.format.width.toFloat(), config.format.height.toFloat(), paint)
                paint.shader = null
            }
        }
    }

    private fun drawClassic(canvas: Canvas, paint: Paint, content: OverlayShareContent, config: OverlayConfig, palette: Palette, metrics: List<MetricValue>) {
        header(canvas, paint, content, config, palette, 72f, 82f)
        val landscape = config.format == OverlayFormat.LANDSCAPE
        val map = if (landscape) RectF(72f, 150f, 1120f, 920f) else RectF(72f, 155f, config.format.width - 72f, config.format.height * .58f)
        roundRect(canvas, paint, map, 44f, palette.surface)
        if (config.showRoute) drawRoute(canvas, paint, activity(content)?.track?.points.orEmpty(), inset(map, 40f), palette, activity(content)?.achievement)
        val textLeft = if (landscape) 1210f else 72f
        val titleTop = if (landscape) 300f else map.bottom + 62f
        if (config.showTitle) drawWrapped(canvas, paint, content.title, textLeft, titleTop, if (landscape) 620f else config.format.width - 144f, 60f, palette.text, 3)
        drawMetricGrid(canvas, paint, metrics, textLeft, if (landscape) 610f else titleTop + 160f, if (landscape) 620f else config.format.width - 144f, if (landscape) 2 else 3, palette)
    }

    private fun drawMinimal(canvas: Canvas, paint: Paint, content: OverlayShareContent, config: OverlayConfig, palette: Palette, metrics: List<MetricValue>) {
        if (config.showRoute) drawRoute(canvas, paint, activity(content)?.track?.points.orEmpty(), RectF(90f, 80f, config.format.width - 90f, config.format.height * .68f), palette, activity(content)?.achievement, false)
        val bottom = config.format.height - 72f
        if (config.showTitle) drawWrapped(canvas, paint, content.title, 72f, bottom - 190f, config.format.width - 144f, 58f, palette.text, 2)
        drawMetricGrid(canvas, paint, metrics.take(4), 72f, bottom - 60f, config.format.width - 144f, min(4, metrics.size.coerceAtLeast(1)), palette)
        header(canvas, paint, content, config, palette, 72f, bottom - 270f)
    }

    private fun drawPhotoLayout(canvas: Canvas, paint: Paint, content: OverlayShareContent, config: OverlayConfig, palette: Palette, metrics: List<MetricValue>) {
        paint.shader = LinearGradient(0f, config.format.height * .35f, 0f, config.format.height.toFloat(), Color.TRANSPARENT, 0xEE03100F.toInt(), Shader.TileMode.CLAMP)
        canvas.drawRect(0f, 0f, config.format.width.toFloat(), config.format.height.toFloat(), paint)
        paint.shader = null
        val white = palette.copy(text = Color.WHITE, muted = 0xFFD8E3E0.toInt(), surface = 0xBB051C1A.toInt())
        val y = config.format.height - 390f
        header(canvas, paint, content, config, white, 72f, y)
        if (config.showTitle) drawWrapped(canvas, paint, content.title, 72f, y + 85f, config.format.width - 144f, 66f, Color.WHITE, 3)
        val panel = RectF(72f, config.format.height - 235f, config.format.width - 72f, config.format.height - 55f)
        roundRect(canvas, paint, panel, 36f, white.surface)
        drawMetricGrid(canvas, paint, metrics, panel.left + 28f, panel.top + 48f, panel.width() - 56f, 3, white)
    }

    private fun drawStats(canvas: Canvas, paint: Paint, content: OverlayShareContent, config: OverlayConfig, palette: Palette, metrics: List<MetricValue>) {
        header(canvas, paint, content, config, palette, 72f, 82f)
        val hero = metrics.firstOrNull()
        text(canvas, paint, hero?.label?.uppercase(Locale.GERMANY).orEmpty(), 72f, 240f, 28f, palette.accent, true)
        fitText(canvas, paint, hero?.value ?: "Dein Moment", 72f, 410f, config.format.width * .62f, 150f, palette.text)
        if (config.showTitle) drawWrapped(canvas, paint, content.title, 72f, 500f, config.format.width * .58f, 50f, palette.text, 3)
        val routeRect = RectF(config.format.width * .64f, 180f, config.format.width - 60f, config.format.height * .66f)
        roundRect(canvas, paint, routeRect, 40f, palette.surface)
        if (config.showRoute) drawRoute(canvas, paint, activity(content)?.track?.points.orEmpty(), inset(routeRect, 24f), palette, activity(content)?.achievement)
        drawMetricGrid(canvas, paint, metrics.drop(1), 72f, config.format.height - 300f, config.format.width - 144f, 3, palette)
    }

    private fun drawMapLayout(canvas: Canvas, paint: Paint, content: OverlayShareContent, config: OverlayConfig, palette: Palette, metrics: List<MetricValue>) {
        val top = RectF(55f, 55f, config.format.width - 55f, 260f)
        roundRect(canvas, paint, top, 36f, palette.surface)
        header(canvas, paint, content, config, palette, 86f, 110f)
        if (config.showTitle) drawWrapped(canvas, paint, content.title, 86f, 175f, top.width() - 62f, 46f, palette.text, 2)
        val bottom = RectF(55f, config.format.height - 245f, config.format.width - 55f, config.format.height - 55f)
        roundRect(canvas, paint, bottom, 36f, palette.surface)
        drawMetricGrid(canvas, paint, metrics.take(4), bottom.left + 30f, bottom.top + 55f, bottom.width() - 60f, min(4, metrics.size.coerceAtLeast(1)), palette)
    }

    private fun drawAchievement(canvas: Canvas, paint: Paint, content: OverlayShareContent, config: OverlayConfig, palette: Palette, metrics: List<MetricValue>) {
        val achievement = activity(content)?.achievement
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 80f
        paint.color = palette.achievement
        paint.alpha = 32
        canvas.drawCircle(config.format.width - 30f, 50f, 270f, paint)
        paint.alpha = 255
        paint.style = Paint.Style.FILL
        header(canvas, paint, content, config, palette, 72f, 82f)
        text(canvas, paint, "★  ${(achievement?.label ?: "Persönlicher Meilenstein").uppercase(Locale.GERMANY)}", 72f, 205f, 28f, palette.achievement, true)
        fitText(canvas, paint, achievement?.value ?: metrics.firstOrNull()?.value.orEmpty(), 72f, 390f, config.format.width - 144f, 145f, palette.text)
        if (config.showTitle) drawWrapped(canvas, paint, content.title, 72f, 475f, config.format.width - 144f, 54f, palette.text, 2)
        val routeRect = RectF(72f, 590f, config.format.width - 72f, config.format.height - 330f)
        roundRect(canvas, paint, routeRect, 44f, palette.surface)
        if (config.showRoute) drawRoute(canvas, paint, activity(content)?.track?.points.orEmpty(), inset(routeRect, 34f), palette, achievement)
        drawMetricGrid(canvas, paint, metrics.take(4), 72f, config.format.height - 240f, config.format.width - 144f, min(4, metrics.size.coerceAtLeast(1)), palette)
    }

    private fun header(canvas: Canvas, paint: Paint, content: OverlayShareContent, config: OverlayConfig, palette: Palette, x: Float, y: Float) {
        if (config.showBrand) text(canvas, paint, "Baseline Cycling", x, y, 38f, palette.text, true)
        if (config.showDate) {
            val date = if (content is OverlayShareContent.ActivityContent) content.activity.startedAt.asGermanDateTime() else content.dateLabel
            val weather = if (config.showWeather && content is OverlayShareContent.ActivityContent) {
                val temperature = (content.activity.weather?.get("temperature_c") as? Number)?.toDouble()?.let { " · ${it.toInt()}°" }.orEmpty()
                temperature
            } else ""
            text(canvas, paint, date + weather, x + 220f, y, 24f, palette.muted, true)
        }
    }

    private fun metricValues(content: OverlayShareContent, selected: List<OverlayMetric>): List<MetricValue> = selected.mapNotNull { key ->
        when (content) {
            is OverlayShareContent.ActivityContent -> activityMetric(content.activity, key)
            is OverlayShareContent.PeriodContent -> periodMetric(content, key)
        }
    }

    private fun activityMetric(activity: Activity, key: OverlayMetric): MetricValue? = when (key) {
        OverlayMetric.DISTANCE -> MetricValue(key.label, activity.distanceMeters.asDistance())
        OverlayMetric.MOVING_TIME -> MetricValue(key.label, activity.movingTimeSeconds.asDuration())
        OverlayMetric.DURATION -> MetricValue(key.label, activity.durationSeconds.asDuration())
        OverlayMetric.ELEVATION -> MetricValue(key.label, activity.elevationGainMeters.asElevation())
        OverlayMetric.AVG_SPEED -> activity.averageSpeedMps?.let { MetricValue(key.label, it.asSpeed()) }
        OverlayMetric.MAX_SPEED -> activity.maxSpeedMps?.let { MetricValue(key.label, it.asSpeed()) }
        OverlayMetric.HEART_RATE -> activity.averageHeartRate?.let { MetricValue(key.label, it.asInteger("bpm")) }
        OverlayMetric.POWER -> activity.averagePower?.let { MetricValue(key.label, it.asInteger("W")) }
        OverlayMetric.CADENCE -> activity.averageCadence?.let { MetricValue(key.label, it.asInteger("rpm")) }
        OverlayMetric.HYDRATION -> activity.hydrationMilliliters?.let { MetricValue(key.label, "$it ml") }
        OverlayMetric.ACTIVITIES -> MetricValue(key.label, "1")
        OverlayMetric.TRAINING_LOAD -> activity.trainingLoad?.let { MetricValue(key.label, it.toInt().toString()) }
    }

    private fun periodMetric(content: OverlayShareContent.PeriodContent, key: OverlayMetric): MetricValue? = with(content.statistics) {
        when (key) {
            OverlayMetric.ACTIVITIES -> MetricValue(key.label, activityCount.toString())
            OverlayMetric.DISTANCE -> MetricValue(key.label, distanceMeters.asDistance())
            OverlayMetric.MOVING_TIME -> MetricValue(key.label, movingTimeSeconds.asDuration())
            OverlayMetric.DURATION -> MetricValue(key.label, durationSeconds.asDuration())
            OverlayMetric.ELEVATION -> MetricValue(key.label, elevationGainMeters.asElevation())
            OverlayMetric.AVG_SPEED -> averageSpeedMps?.let { MetricValue(key.label, it.asSpeed()) }
            OverlayMetric.HEART_RATE -> averageHeartRate?.let { MetricValue(key.label, it.asInteger("bpm")) }
            OverlayMetric.HYDRATION -> hydrationMilliliters.takeIf { hydrationActivityCount > 0 }?.let { MetricValue(key.label, "$it ml") }
            OverlayMetric.TRAINING_LOAD -> MetricValue(key.label, trainingLoad.toInt().toString())
            else -> null
        }
    }

    private fun drawMetricGrid(canvas: Canvas, paint: Paint, metrics: List<MetricValue>, left: Float, top: Float, width: Float, columns: Int, palette: Palette) {
        if (metrics.isEmpty()) return
        val cell = width / columns.coerceAtLeast(1)
        metrics.forEachIndexed { index, metric ->
            val x = left + (index % columns) * cell
            val y = top + (index / columns) * 145f
            text(canvas, paint, metric.label.uppercase(Locale.GERMANY), x, y, 20f, palette.muted, true)
            fitText(canvas, paint, metric.value, x, y + 54f, cell - 20f, 39f, palette.text)
        }
    }

    private fun drawRoute(canvas: Canvas, paint: Paint, raw: List<TrackPoint>, bounds: RectF, palette: Palette, achievement: AchievementInfo?, halo: Boolean = true) {
        val points = raw.filter { it.latitude != null && it.longitude != null }
        if (points.size < 2) {
            text(canvas, paint, "Keine GPS-Strecke", bounds.left + 20f, bounds.centerY(), 28f, palette.muted, true)
            return
        }
        val stride = max(1, points.size / 1200)
        val sampled = points.filterIndexed { index, _ -> index % stride == 0 }.toMutableList().apply { if (last() !== points.last()) add(points.last()) }
        val projected = sampled.map { it.longitude!! to ln(tan(Math.PI / 4 + Math.toRadians(it.latitude!!) / 2)) }
        val minX = projected.minOf { it.first }; val maxX = projected.maxOf { it.first }
        val minY = projected.minOf { it.second }; val maxY = projected.maxOf { it.second }
        val rangeX = max(maxX - minX, .000001); val rangeY = max(maxY - minY, .000001)
        val scale = min(bounds.width() / rangeX, bounds.height() / rangeY)
        val offsetX = bounds.left + (bounds.width() - rangeX * scale).toFloat() / 2
        val offsetY = bounds.top + (bounds.height() - rangeY * scale).toFloat() / 2
        fun path(filter: (TrackPoint) -> Boolean): Path {
            val path = Path(); var started = false
            sampled.forEachIndexed { index, point -> if (filter(point)) {
                val x = offsetX + ((projected[index].first - minX) * scale).toFloat()
                val y = bounds.bottom - (offsetY - bounds.top) - ((projected[index].second - minY) * scale).toFloat()
                if (!started) { path.moveTo(x, y); started = true } else path.lineTo(x, y)
            } }
            return path
        }
        paint.style = Paint.Style.STROKE; paint.strokeCap = Paint.Cap.ROUND; paint.strokeJoin = Paint.Join.ROUND
        if (halo) { paint.color = palette.halo; paint.strokeWidth = 18f; canvas.drawPath(path { true }, paint) }
        paint.color = palette.accent; paint.strokeWidth = 10f; canvas.drawPath(path { true }, paint)
        if (achievement?.segmentStartMeters != null && achievement.segmentEndMeters != null) {
            val start = achievement.segmentStartMeters
            val end = achievement.segmentEndMeters
            paint.color = palette.achievement; paint.strokeWidth = 15f
            canvas.drawPath(path { (it.distanceMeters ?: -1.0) in start..end }, paint)
        }
        paint.style = Paint.Style.FILL
    }

    private fun drawCoverBitmap(canvas: Canvas, bitmap: Bitmap, width: Int, height: Int, position: Float) {
        val scale = max(width.toFloat() / bitmap.width, height.toFloat() / bitmap.height)
        val sourceWidth = width / scale; val sourceHeight = height / scale
        val left = (bitmap.width - sourceWidth) / 2
        val top = (bitmap.height - sourceHeight) * (position / 100f)
        val source = Rect(left.toInt(), top.toInt(), (left + sourceWidth).toInt(), (top + sourceHeight).toInt())
        canvas.drawBitmap(bitmap, source, RectF(0f, 0f, width.toFloat(), height.toFloat()), Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
    }

    private fun text(canvas: Canvas, paint: Paint, value: String, x: Float, y: Float, size: Float, color: Int, bold: Boolean) {
        paint.shader = null; paint.style = Paint.Style.FILL; paint.color = color; paint.textSize = size
        paint.typeface = Typeface.create("sans-serif", if (bold) Typeface.BOLD else Typeface.NORMAL)
        canvas.drawText(value, x, y, paint)
    }

    private fun fitText(canvas: Canvas, paint: Paint, value: String, x: Float, y: Float, width: Float, maximum: Float, color: Int) {
        var size = maximum
        paint.typeface = Typeface.create("sans-serif", Typeface.BOLD)
        while (size > 20f) { paint.textSize = size; if (paint.measureText(value) <= width) break; size -= 2f }
        text(canvas, paint, value, x, y, size, color, true)
    }

    private fun drawWrapped(canvas: Canvas, paint: Paint, value: String, x: Float, y: Float, width: Float, size: Float, color: Int, maximumLines: Int) {
        paint.textSize = size; paint.typeface = Typeface.create("sans-serif", Typeface.BOLD)
        var remaining = value.trim(); var lineY = y
        repeat(maximumLines) { index ->
            if (remaining.isBlank()) return
            val count = paint.breakText(remaining, true, width, null).coerceAtLeast(1)
            val split = remaining.lastIndexOf(' ', min(count, remaining.lastIndex)).takeIf { it > 0 } ?: min(count, remaining.length)
            val last = index == maximumLines - 1 && split < remaining.length
            text(canvas, paint, remaining.take(split).trimEnd() + if (last) "…" else "", x, lineY, size, color, true)
            remaining = remaining.drop(split).trimStart(); lineY += size * 1.12f
        }
    }

    private fun roundRect(canvas: Canvas, paint: Paint, rect: RectF, radius: Float, color: Int) { paint.style = Paint.Style.FILL; paint.shader = null; paint.color = color; canvas.drawRoundRect(rect, radius, radius, paint) }
    private fun inset(rect: RectF, value: Float) = RectF(rect.left + value, rect.top + value, rect.right - value, rect.bottom - value)
    private fun activity(content: OverlayShareContent) = content as? OverlayShareContent.ActivityContent
}
