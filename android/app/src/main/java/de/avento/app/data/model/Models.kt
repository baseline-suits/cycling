package de.avento.app.data.model

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = false)
data class LoginRequest(val email: String, val password: String)

@JsonClass(generateAdapter = false)
data class RegisterRequest(
    val email: String,
    val password: String,
    @param:Json(name = "display_name") val displayName: String,
    @param:Json(name = "invite_token") val inviteToken: String,
)

@JsonClass(generateAdapter = false)
data class BootstrapRequest(
    val email: String,
    val password: String,
    @param:Json(name = "display_name") val displayName: String,
    @param:Json(name = "bootstrap_code") val bootstrapCode: String,
)

@JsonClass(generateAdapter = false)
data class RefreshRequest(@param:Json(name = "refresh_token") val refreshToken: String)

@JsonClass(generateAdapter = false)
data class PasswordResetRequest(
    val token: String,
    @param:Json(name = "new_password") val newPassword: String,
)

@JsonClass(generateAdapter = false)
data class PasswordChangeRequest(
    @param:Json(name = "current_password") val currentPassword: String,
    @param:Json(name = "new_password") val newPassword: String,
)

@JsonClass(generateAdapter = false)
data class TokenResponse(
    @param:Json(name = "access_token") val accessToken: String,
    @param:Json(name = "refresh_token") val refreshToken: String,
    @param:Json(name = "token_type") val tokenType: String = "bearer",
    @param:Json(name = "expires_in") val expiresIn: Long = 0,
)

@JsonClass(generateAdapter = false)
data class HeartRateZone(
    val name: String,
    @param:Json(name = "min_bpm") val minBpm: Int,
    @param:Json(name = "max_bpm") val maxBpm: Int,
    val color: String = "#607D8B",
)

@JsonClass(generateAdapter = false)
data class Profile(
    val id: String,
    val email: String,
    @param:Json(name = "display_name") val displayName: String,
    @param:Json(name = "is_admin") val isAdmin: Boolean = false,
    @param:Json(name = "hr_max") val heartRateMax: Int? = null,
    @param:Json(name = "hr_rest") val heartRateRest: Int? = null,
    @param:Json(name = "hr_zones") val heartRateZones: List<HeartRateZone> = emptyList(),
    @param:Json(name = "training_goals") val trainingGoals: List<String> = emptyList(),
    @param:Json(name = "avatar_data_url") val avatarDataUrl: String? = null,
)

@JsonClass(generateAdapter = false)
data class ProfileUpdate(
    @param:Json(name = "display_name") val displayName: String? = null,
    @param:Json(name = "hr_max") val heartRateMax: Int? = null,
    @param:Json(name = "hr_rest") val heartRateRest: Int? = null,
    @param:Json(name = "hr_zones") val heartRateZones: List<HeartRateZone>? = null,
    @param:Json(name = "training_goals") val trainingGoals: List<String>? = null,
)

@JsonClass(generateAdapter = false)
data class Activity(
    val id: String,
    val title: String? = null,
    val type: String? = null,
    val notes: String? = null,
    @param:Json(name = "hydration_ml") val hydrationMilliliters: Int? = null,
    @param:Json(name = "original_filename") val originalFilename: String? = null,
    @param:Json(name = "started_at") val startedAt: String? = null,
    @param:Json(name = "ended_at") val endedAt: String? = null,
    @param:Json(name = "distance_m") val distanceMeters: Double? = null,
    @param:Json(name = "duration_s") val durationSeconds: Double? = null,
    @param:Json(name = "moving_time_s") val movingTimeSeconds: Double? = null,
    @param:Json(name = "pause_time_s") val pauseTimeSeconds: Double? = null,
    @param:Json(name = "avg_speed_mps") val averageSpeedMps: Double? = null,
    @param:Json(name = "max_speed_mps") val maxSpeedMps: Double? = null,
    @param:Json(name = "elevation_gain_m") val elevationGainMeters: Double? = null,
    @param:Json(name = "avg_hr_bpm") val averageHeartRate: Double? = null,
    @param:Json(name = "max_hr_bpm") val maxHeartRate: Double? = null,
    @param:Json(name = "avg_cadence_rpm") val averageCadence: Double? = null,
    @param:Json(name = "max_cadence_rpm") val maxCadence: Double? = null,
    @param:Json(name = "avg_power_w") val averagePower: Double? = null,
    @param:Json(name = "max_power_w") val maxPower: Double? = null,
    @param:Json(name = "training_load") val trainingLoad: Double? = null,
    @param:Json(name = "hr_zone_seconds") val heartRateZoneSeconds: Map<String, Double> = emptyMap(),
    val weather: Map<String, Any?>? = null,
    @param:Json(name = "weather_status") val weatherStatus: String? = null,
    @param:Json(name = "ai_summary") val aiSummary: String? = null,
    @param:Json(name = "ai_provider") val aiProvider: String? = null,
    @param:Json(name = "ai_data_basis") val aiDataBasis: AIDataBasis? = null,
    @param:Json(name = "created_at") val createdAt: String? = null,
    @param:Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class ActivityList(
    val items: List<Activity> = emptyList(),
    val total: Int = 0,
    val limit: Int = 50,
    val offset: Int = 0,
)

data class ActivityFilters(
    val query: String = "",
    val type: String = "",
    val dateFrom: String = "",
    val dateTo: String = "",
    val limit: Int = 20,
    val offset: Int = 0,
)

@JsonClass(generateAdapter = false)
data class ActivityUpdate(
    val title: String,
    val type: String,
    val notes: String = "",
    @param:Json(name = "hydration_ml") val hydrationMilliliters: Int? = null,
)

@JsonClass(generateAdapter = false)
data class TrackPoint(
    val time: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    @param:Json(name = "altitude_m") val altitudeMeters: Double? = null,
    @param:Json(name = "distance_m") val distanceMeters: Double? = null,
    @param:Json(name = "heart_rate_bpm") val heartRate: Double? = null,
    @param:Json(name = "cadence_rpm") val cadence: Double? = null,
    @param:Json(name = "power_w") val power: Double? = null,
    @param:Json(name = "speed_mps") val speedMps: Double? = null,
)

@JsonClass(generateAdapter = false)
data class ActivityTrack(
    @param:Json(name = "activity_id") val activityId: String,
    val points: List<TrackPoint> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class WeatherResponse(
    val status: String,
    val data: Map<String, Any?>? = null,
    @param:Json(name = "updated_at") val updatedAt: String? = null,
)

@JsonClass(generateAdapter = false)
data class SummaryResponse(
    val summary: String,
    val provider: String? = null,
    @param:Json(name = "updated_at") val updatedAt: String? = null,
    @param:Json(name = "data_basis") val dataBasis: AIDataBasis? = null,
)

@JsonClass(generateAdapter = false)
data class AIDataPeriod(
    @param:Json(name = "started_at") val startedAt: String? = null,
    @param:Json(name = "ended_at") val endedAt: String? = null,
    val timezone: String? = null,
    val label: String? = null,
)

@JsonClass(generateAdapter = false)
data class AIDataMetric(
    val name: String,
    val value: Any? = null,
    val unit: String? = null,
    @param:Json(name = "activity_id") val activityId: String? = null,
    val source: String = "",
    val method: String = "",
)

@JsonClass(generateAdapter = false)
data class AIDataMethod(
    val name: String,
    val description: String = "",
    val parameters: Map<String, Any?> = emptyMap(),
)

@JsonClass(generateAdapter = false)
data class AIDataBasis(
    @param:Json(name = "schema_version") val schemaVersion: String = "1.0",
    @param:Json(name = "generated_at") val generatedAt: String? = null,
    val period: AIDataPeriod? = null,
    @param:Json(name = "activity_ids") val activityIds: List<String> = emptyList(),
    val metrics: List<AIDataMetric> = emptyList(),
    val methods: List<AIDataMethod> = emptyList(),
    val limitations: List<String> = emptyList(),
    val facts: Map<String, Any?> = emptyMap(),
)

@JsonClass(generateAdapter = false)
data class MonthStatistics(
    val month: String,
    @param:Json(name = "activity_count") val activityCount: Int = 0,
    @param:Json(name = "distance_m") val distanceMeters: Double = 0.0,
    @param:Json(name = "duration_s") val durationSeconds: Double = 0.0,
    @param:Json(name = "elevation_gain_m") val elevationGainMeters: Double = 0.0,
    @param:Json(name = "training_load") val trainingLoad: Double = 0.0,
)

@JsonClass(generateAdapter = false)
data class StatisticsSeriesPoint(
    @param:Json(name = "period_start") val periodStart: String,
    @param:Json(name = "activity_count") val activityCount: Int = 0,
    @param:Json(name = "distance_m") val distanceMeters: Double = 0.0,
    @param:Json(name = "duration_s") val durationSeconds: Double = 0.0,
    @param:Json(name = "moving_time_s") val movingTimeSeconds: Double = 0.0,
    @param:Json(name = "elevation_gain_m") val elevationGainMeters: Double = 0.0,
    @param:Json(name = "training_load") val trainingLoad: Double = 0.0,
    @param:Json(name = "avg_speed_mps") val averageSpeedMps: Double? = null,
    @param:Json(name = "avg_hr_bpm") val averageHeartRate: Double? = null,
    @param:Json(name = "hydration_ml") val hydrationMilliliters: Int = 0,
    @param:Json(name = "hydration_activity_count") val hydrationActivityCount: Int = 0,
)

@JsonClass(generateAdapter = false)
data class StatisticsComparison(
    @param:Json(name = "date_from") val dateFrom: String,
    @param:Json(name = "date_to") val dateTo: String,
    @param:Json(name = "activity_count") val activityCount: Int = 0,
    @param:Json(name = "distance_m") val distanceMeters: Double = 0.0,
    @param:Json(name = "duration_s") val durationSeconds: Double = 0.0,
    @param:Json(name = "moving_time_s") val movingTimeSeconds: Double = 0.0,
    @param:Json(name = "elevation_gain_m") val elevationGainMeters: Double = 0.0,
    @param:Json(name = "training_load") val trainingLoad: Double = 0.0,
    @param:Json(name = "avg_speed_mps") val averageSpeedMps: Double? = null,
    @param:Json(name = "avg_hr_bpm") val averageHeartRate: Double? = null,
    @param:Json(name = "hydration_ml") val hydrationMilliliters: Int = 0,
    @param:Json(name = "hydration_activity_count") val hydrationActivityCount: Int = 0,
    val changes: Map<String, Double?> = emptyMap(),
)

@JsonClass(generateAdapter = false)
data class OverviewStatistics(
    @param:Json(name = "activity_count") val activityCount: Int = 0,
    @param:Json(name = "distance_m") val distanceMeters: Double = 0.0,
    @param:Json(name = "duration_s") val durationSeconds: Double = 0.0,
    @param:Json(name = "moving_time_s") val movingTimeSeconds: Double = 0.0,
    @param:Json(name = "elevation_gain_m") val elevationGainMeters: Double = 0.0,
    @param:Json(name = "training_load") val trainingLoad: Double = 0.0,
    @param:Json(name = "avg_speed_mps") val averageSpeedMps: Double? = null,
    @param:Json(name = "avg_hr_bpm") val averageHeartRate: Double? = null,
    @param:Json(name = "hydration_ml") val hydrationMilliliters: Int = 0,
    @param:Json(name = "hydration_activity_count") val hydrationActivityCount: Int = 0,
    val granularity: String = "month",
    val series: List<StatisticsSeriesPoint> = emptyList(),
    val comparison: StatisticsComparison? = null,
    @param:Json(name = "by_month") val byMonth: List<MonthStatistics> = emptyList(),
)

data class StatisticsRange(
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val granularity: String = "auto",
)

@JsonClass(generateAdapter = false)
data class CompareRequest(@param:Json(name = "activity_ids") val activityIds: List<String>)

@JsonClass(generateAdapter = false)
data class ComparisonMetric(
    @param:Json(name = "activity_id") val activityId: String,
    val title: String,
    @param:Json(name = "distance_m") val distanceMeters: Double = 0.0,
    @param:Json(name = "duration_s") val durationSeconds: Double = 0.0,
    @param:Json(name = "moving_time_s") val movingTimeSeconds: Double = 0.0,
    @param:Json(name = "elevation_gain_m") val elevationGainMeters: Double = 0.0,
    @param:Json(name = "avg_speed_mps") val averageSpeedMps: Double? = null,
    @param:Json(name = "avg_hr_bpm") val averageHeartRate: Double? = null,
    @param:Json(name = "max_hr_bpm") val maxHeartRate: Double? = null,
    @param:Json(name = "efficiency_kmh_per_bpm") val efficiencyKmhPerBpm: Double? = null,
    @param:Json(name = "headwind_kmh") val headwindKmh: Double? = null,
    @param:Json(name = "hydration_ml") val hydrationMilliliters: Int? = null,
    @param:Json(name = "hydration_rate_ml_per_hour") val hydrationRateMlPerHour: Double? = null,
    @param:Json(name = "relative_score") val relativeScore: Double? = null,
)

@JsonClass(generateAdapter = false)
data class ComparisonProfilePoint(
    @param:Json(name = "progress_percent") val progressPercent: Double,
    @param:Json(name = "distance_km") val distanceKilometers: Double,
    @param:Json(name = "elevation_m") val elevationMeters: Double? = null,
    @param:Json(name = "speed_kmh") val speedKmh: Double? = null,
    @param:Json(name = "heart_rate_bpm") val heartRate: Double? = null,
)

@JsonClass(generateAdapter = false)
data class ComparisonProfile(
    @param:Json(name = "activity_id") val activityId: String,
    val title: String,
    val points: List<ComparisonProfilePoint> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class CompareResponse(
    val activities: List<Activity> = emptyList(),
    val metrics: List<ComparisonMetric> = emptyList(),
    val profiles: List<ComparisonProfile> = emptyList(),
    @param:Json(name = "ai_summary") val aiSummary: String? = null,
    @param:Json(name = "ai_provider") val aiProvider: String? = null,
    @param:Json(name = "ai_data_basis") val aiDataBasis: AIDataBasis? = null,
)

@JsonClass(generateAdapter = false)
data class ActivityPhoto(
    val id: String,
    @param:Json(name = "activity_id") val activityId: String,
    val caption: String? = null,
    @param:Json(name = "captured_at") val capturedAt: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
    @param:Json(name = "original_filename") val originalFilename: String,
    @param:Json(name = "content_type") val contentType: String,
    @param:Json(name = "size_bytes") val sizeBytes: Long,
    val width: Int,
    val height: Int,
    @param:Json(name = "file_url") val fileUrl: String,
    @param:Json(name = "created_at") val createdAt: String,
    @param:Json(name = "updated_at") val updatedAt: String,
)

@JsonClass(generateAdapter = false)
data class ActivityPhotoList(val items: List<ActivityPhoto> = emptyList(), val total: Int = 0)

@JsonClass(generateAdapter = false)
data class ActivityPhotoUpdate(
    val caption: String,
    @param:Json(name = "captured_at") val capturedAt: String? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
)

@JsonClass(generateAdapter = false)
data class DistanceRecord(
    @param:Json(name = "target_distance_m") val targetDistanceMeters: Int,
    @param:Json(name = "duration_s") val durationSeconds: Double,
    @param:Json(name = "avg_speed_mps") val averageSpeedMps: Double,
    @param:Json(name = "activity_id") val activityId: String,
    val title: String,
    @param:Json(name = "started_at") val startedAt: String,
    val source: String,
    val estimated: Boolean,
    @param:Json(name = "segment_start_m") val segmentStartMeters: Double,
    @param:Json(name = "segment_end_m") val segmentEndMeters: Double,
)

@JsonClass(generateAdapter = false)
data class ActivityRecord(
    @param:Json(name = "activity_id") val activityId: String,
    val title: String,
    @param:Json(name = "started_at") val startedAt: String,
    @param:Json(name = "distance_m") val distanceMeters: Double,
    @param:Json(name = "moving_time_s") val movingTimeSeconds: Double,
    @param:Json(name = "avg_speed_mps") val averageSpeedMps: Double,
    @param:Json(name = "elevation_gain_m") val elevationGainMeters: Double,
)

@JsonClass(generateAdapter = false)
data class PersonalRecords(
    @param:Json(name = "generated_at") val generatedAt: String,
    @param:Json(name = "distance_records") val distanceRecords: List<DistanceRecord> = emptyList(),
    @param:Json(name = "longest_ride") val longestRide: ActivityRecord? = null,
    @param:Json(name = "highest_average_speed") val highestAverageSpeed: ActivityRecord? = null,
    @param:Json(name = "highest_elevation_gain") val highestElevationGain: ActivityRecord? = null,
    val methods: List<AIDataMethod> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class InsightPeriod(
    @param:Json(name = "date_from") val dateFrom: String,
    @param:Json(name = "date_to") val dateTo: String,
)

@JsonClass(generateAdapter = false)
data class InsightAggregate(
    val period: String,
    @param:Json(name = "period_start") val periodStart: String,
    @param:Json(name = "period_end") val periodEnd: String,
    @param:Json(name = "activity_count") val activityCount: Int,
    @param:Json(name = "distance_m") val distanceMeters: Double,
    @param:Json(name = "moving_time_s") val movingTimeSeconds: Double,
    @param:Json(name = "elevation_gain_m") val elevationGainMeters: Double,
    @param:Json(name = "training_load") val trainingLoad: Double,
    @param:Json(name = "avg_speed_mps") val averageSpeedMps: Double? = null,
    @param:Json(name = "avg_hr_bpm") val averageHeartRate: Double? = null,
    @param:Json(name = "hydration_ml") val hydrationMilliliters: Int = 0,
    @param:Json(name = "changes_from_previous") val changesFromPrevious: Map<String, Double?> = emptyMap(),
)

@JsonClass(generateAdapter = false)
data class FitnessTrend(
    val status: String,
    val confidence: String,
    @param:Json(name = "sample_size") val sampleSize: Int,
    @param:Json(name = "speed_change_percent") val speedChangePercent: Double? = null,
    @param:Json(name = "heart_rate_efficiency_change_percent") val heartRateEfficiencyChangePercent: Double? = null,
    val statement: String,
)

@JsonClass(generateAdapter = false)
data class InsightPattern(
    val kind: String,
    val confidence: String,
    @param:Json(name = "sample_size") val sampleSize: Int,
    val statement: String,
    val evidence: Map<String, Any?> = emptyMap(),
    val method: String,
)

@JsonClass(generateAdapter = false)
data class LongTermInsights(
    @param:Json(name = "generated_at") val generatedAt: String,
    val period: InsightPeriod,
    val current: Map<String, Any?> = emptyMap(),
    @param:Json(name = "previous_period") val previousPeriod: InsightPeriod,
    val previous: Map<String, Any?> = emptyMap(),
    val changes: Map<String, Double?> = emptyMap(),
    val monthly: List<InsightAggregate> = emptyList(),
    val yearly: List<InsightAggregate> = emptyList(),
    @param:Json(name = "fitness_trend") val fitnessTrend: FitnessTrend,
    val patterns: List<InsightPattern> = emptyList(),
    val methods: List<AIDataMethod> = emptyList(),
    val disclaimer: String,
)

@JsonClass(generateAdapter = false)
data class PeriodReview(
    val year: Int,
    val season: String,
    val period: InsightPeriod,
    val summary: String,
    val provider: String,
    @param:Json(name = "generated_at") val generatedAt: String,
    @param:Json(name = "data_basis") val dataBasis: AIDataBasis,
)

@JsonClass(generateAdapter = false)
data class ApiError(val detail: Any? = null, val message: String? = null)

@JsonClass(generateAdapter = false)
data class GamificationLevel(
    val level: Int = 1,
    val name: String = "Entdecker:in",
    @param:Json(name = "total_xp") val totalXp: Int = 0,
    @param:Json(name = "current_xp") val currentXp: Int = 0,
    @param:Json(name = "next_level_xp") val nextLevelXp: Int = 100,
    @param:Json(name = "progress_percent") val progressPercent: Double = 0.0,
    val breakdown: Map<String, Int> = emptyMap(),
)

@JsonClass(generateAdapter = false)
data class GamificationGoal(
    val id: String,
    val title: String,
    val description: String? = null,
    val metric: String,
    @param:Json(name = "current_value") val currentValue: Double = 0.0,
    @param:Json(name = "target_value") val targetValue: Double = 0.0,
    val unit: String = "",
    val period: String = "custom",
    @param:Json(name = "progress_percent") val progressPercent: Double = 0.0,
    @param:Json(name = "remaining_value") val remainingValue: Double = 0.0,
    val status: String = "active",
    @param:Json(name = "starts_at") val startsAt: String? = null,
    val deadline: String? = null,
    @param:Json(name = "completed_at") val completedAt: String? = null,
    @param:Json(name = "reward_xp") val rewardXp: Int = 0,
)

@JsonClass(generateAdapter = false)
data class GamificationChallenge(
    val id: String,
    val title: String,
    val description: String = "",
    val metric: String,
    @param:Json(name = "current_value") val currentValue: Double = 0.0,
    @param:Json(name = "target_value") val targetValue: Double = 0.0,
    val unit: String = "",
    @param:Json(name = "progress_percent") val progressPercent: Double = 0.0,
    @param:Json(name = "remaining_value") val remainingValue: Double = 0.0,
    @param:Json(name = "duration_days") val durationDays: Int = 7,
    @param:Json(name = "reward_xp") val rewardXp: Int = 0,
    val status: String = "suggested",
    val source: String = "local",
    @param:Json(name = "ai_generated") val aiGenerated: Boolean = false,
    @param:Json(name = "personalization_reason") val personalizationReason: String? = null,
    @param:Json(name = "weather_sensitive") val weatherSensitive: Boolean = false,
    @param:Json(name = "safety_note") val safetyNote: String? = null,
)

@JsonClass(generateAdapter = false)
data class GamificationBadge(
    val id: String,
    val key: String,
    val name: String,
    val description: String = "",
    val category: String = "Allgemein",
    val tier: String = "bronze",
    @param:Json(name = "reward_xp") val rewardXp: Int = 0,
    val unlocked: Boolean = false,
    @param:Json(name = "current_value") val currentValue: Double = 0.0,
    @param:Json(name = "target_value") val targetValue: Double = 0.0,
    val unit: String = "",
    @param:Json(name = "progress_percent") val progressPercent: Double = 0.0,
)

@JsonClass(generateAdapter = false)
data class GamificationStreak(
    @param:Json(name = "current_weeks") val currentWeeks: Int = 0,
    @param:Json(name = "best_weeks") val bestWeeks: Int = 0,
    @param:Json(name = "weekly_target") val weeklyTarget: Int = 1,
    @param:Json(name = "current_week_progress") val currentWeekProgress: Int = 0,
    @param:Json(name = "pause_protection_available") val pauseProtectionAvailable: Boolean = false,
    @param:Json(name = "pause_protection_active") val pauseProtectionActive: Boolean = false,
    @param:Json(name = "protected_until") val protectedUntil: String? = null,
    val method: String = "",
)

@JsonClass(generateAdapter = false)
data class GamificationRecordChase(
    val id: String,
    val title: String,
    val description: String = "",
    val metric: String,
    @param:Json(name = "current_value") val currentValue: Double = 0.0,
    @param:Json(name = "target_value") val targetValue: Double = 0.0,
    val unit: String = "",
    @param:Json(name = "progress_percent") val progressPercent: Double = 0.0,
    @param:Json(name = "activity_id") val activityId: String? = null,
    val achieved: Boolean = false,
)

@JsonClass(generateAdapter = false)
data class GamificationDiscoverySummary(
    val scope: String,
    val label: String,
    val count: Int = 0,
    val places: List<String> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class GamificationAnnualAward(
    val id: String,
    val key: String,
    val year: Int,
    val title: String,
    val description: String = "",
    val value: Double? = null,
    val unit: String? = null,
    val earned: Boolean = false,
    @param:Json(name = "earned_at") val earnedAt: String? = null,
    @param:Json(name = "reward_xp") val rewardXp: Int = 0,
    @param:Json(name = "is_final") val isFinal: Boolean = false,
)

@JsonClass(generateAdapter = false)
data class GamificationOverview(
    @param:Json(name = "generated_at") val generatedAt: String? = null,
    val privacy: String = "private",
    val level: GamificationLevel = GamificationLevel(),
    val goals: List<GamificationGoal> = emptyList(),
    @param:Json(name = "active_challenges") val activeChallenges: List<GamificationChallenge> = emptyList(),
    @param:Json(name = "challenge_suggestions") val challengeSuggestions: List<GamificationChallenge> = emptyList(),
    @param:Json(name = "ai_challenges_available") val aiChallengesAvailable: Boolean = false,
    val badges: List<GamificationBadge> = emptyList(),
    val streak: GamificationStreak = GamificationStreak(),
    @param:Json(name = "record_chases") val recordChases: List<GamificationRecordChase> = emptyList(),
    val discoveries: List<GamificationDiscoverySummary> = emptyList(),
    @param:Json(name = "annual_awards") val annualAwards: List<GamificationAnnualAward> = emptyList(),
)

@JsonClass(generateAdapter = false)
data class GamificationGoalRequest(
    val title: String,
    val description: String? = null,
    val metric: String,
    @param:Json(name = "target_value") val targetValue: Double,
    val period: String,
    val deadline: String? = null,
)
