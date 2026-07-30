package de.avento.app.share

import de.avento.app.data.model.Activity
import de.avento.app.data.model.ActivityTrack
import de.avento.app.data.model.OverviewStatistics

enum class OverlayTemplate(val label: String, val description: String) {
    CLASSIC("Classic", "Karte und Statistiken"),
    MINIMAL("Minimal", "Transparent und reduziert"),
    PHOTO("Photo", "Foto im Mittelpunkt"),
    STATS("Stats", "Große Leistungswerte"),
    MAP("Map", "Maximaler Routenbereich"),
    ACHIEVEMENT("Achievement", "Rekorde und Meilensteine"),
}

enum class OverlayFormat(val label: String, val width: Int, val height: Int) {
    SQUARE("1:1", 1080, 1080),
    PORTRAIT("4:5", 1080, 1350),
    STORY("9:16", 1080, 1920),
    LANDSCAPE("16:9", 1920, 1080),
}

enum class OverlayTheme { LIGHT, DARK }
enum class OverlayBackground { TRANSPARENT, SOLID, MAP, PHOTO }

enum class OverlayMetric(val label: String) {
    DISTANCE("Distanz"), MOVING_TIME("Fahrzeit"), DURATION("Gesamtzeit"),
    ELEVATION("Höhenmeter"), AVG_SPEED("Ø Tempo"), MAX_SPEED("Max. Tempo"),
    HEART_RATE("Ø Puls"), POWER("Ø Leistung"), CADENCE("Ø Trittfrequenz"),
    HYDRATION("Trinkmenge"), ACTIVITIES("Aktivitäten"), TRAINING_LOAD("Trainingslast"),
}

data class AchievementInfo(
    val label: String,
    val value: String,
    val detail: String? = null,
    val segmentStartMeters: Double? = null,
    val segmentEndMeters: Double? = null,
)

sealed interface OverlayShareContent {
    val title: String
    val dateLabel: String

    data class ActivityContent(
        val activity: Activity,
        val track: ActivityTrack?,
        val achievement: AchievementInfo? = null,
    ) : OverlayShareContent {
        override val title: String = activity.title ?: "Radfahrt"
        override val dateLabel: String = activity.startedAt.orEmpty()
    }

    data class PeriodContent(
        override val title: String,
        override val dateLabel: String,
        val statistics: OverviewStatistics,
        val summary: String? = null,
    ) : OverlayShareContent
}

data class OverlayConfig(
    val template: OverlayTemplate = OverlayTemplate.CLASSIC,
    val format: OverlayFormat = OverlayFormat.PORTRAIT,
    val theme: OverlayTheme = OverlayTheme.DARK,
    val background: OverlayBackground = OverlayBackground.SOLID,
    val solidColor: Int = 0xFF080A0D.toInt(),
    val photoId: String? = null,
    val photoPositionPercent: Float = 50f,
    val metrics: List<OverlayMetric> = listOf(OverlayMetric.DISTANCE, OverlayMetric.MOVING_TIME, OverlayMetric.AVG_SPEED, OverlayMetric.ELEVATION),
    val showRoute: Boolean = true,
    val showTitle: Boolean = true,
    val showDate: Boolean = true,
    val showWeather: Boolean = true,
    val showBrand: Boolean = true,
)
