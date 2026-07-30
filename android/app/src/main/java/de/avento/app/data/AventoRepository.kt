package de.avento.app.data

import de.avento.app.data.model.Activity
import de.avento.app.data.model.ActivityFilters
import de.avento.app.data.model.ActivityList
import de.avento.app.data.model.ActivityPhoto
import de.avento.app.data.model.ActivityPhotoList
import de.avento.app.data.model.ActivityPhotoUpdate
import de.avento.app.data.model.ActivityTrack
import de.avento.app.data.model.ActivityUpdate
import de.avento.app.data.model.BootstrapRequest
import de.avento.app.data.model.CompareRequest
import de.avento.app.data.model.CompareResponse
import de.avento.app.data.model.GamificationChallenge
import de.avento.app.data.model.GamificationGoal
import de.avento.app.data.model.GamificationGoalRequest
import de.avento.app.data.model.GamificationOverview
import de.avento.app.data.model.LoginRequest
import de.avento.app.data.model.LongTermInsights
import de.avento.app.data.model.OverviewStatistics
import de.avento.app.data.model.PasswordChangeRequest
import de.avento.app.data.model.PasswordResetRequest
import de.avento.app.data.model.PeriodReview
import de.avento.app.data.model.PersonalRecords
import de.avento.app.data.model.Profile
import de.avento.app.data.model.ProfileUpdate
import de.avento.app.data.model.RefreshRequest
import de.avento.app.data.model.RegisterRequest
import de.avento.app.data.model.StatisticsRange
import de.avento.app.data.model.SummaryResponse
import de.avento.app.data.model.WeatherResponse
import de.avento.app.data.network.AventoApi
import de.avento.app.data.security.AuthTokens
import de.avento.app.data.security.TokenStore
import kotlinx.coroutines.flow.Flow
import okhttp3.MediaType
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.time.ZoneId
import retrofit2.HttpException

interface AventoRepository {
    val session: Flow<AuthTokens?>
    suspend fun currentSession(): AuthTokens?
    suspend fun login(email: String, password: String)
    suspend fun register(email: String, password: String, displayName: String, inviteToken: String)
    suspend fun bootstrap(email: String, password: String, displayName: String, bootstrapCode: String)
    suspend fun resetPassword(token: String, newPassword: String)
    suspend fun changePassword(currentPassword: String, newPassword: String)
    suspend fun logout()

    suspend fun profile(): Profile
    suspend fun updateProfile(update: ProfileUpdate): Profile = error("Profiländerung wird von diesem Repository nicht unterstützt.")
    suspend fun uploadAvatar(bytes: ByteArray, fileName: String, contentType: String): Profile = error("Avatar-Upload wird von diesem Repository nicht unterstützt.")
    suspend fun deleteAvatar(): Profile = error("Avatar-Löschung wird von diesem Repository nicht unterstützt.")

    suspend fun activities(query: String? = null): ActivityList
    suspend fun activities(filters: ActivityFilters): ActivityList = activities(filters.query)
    suspend fun statistics(): OverviewStatistics
    suspend fun statistics(range: StatisticsRange): OverviewStatistics = statistics()
    suspend fun uploadTcx(bytes: ByteArray, fileName: String, title: String?, type: String?, notes: String?): Activity
    suspend fun uploadTcx(
        bytes: ByteArray,
        fileName: String,
        title: String?,
        type: String?,
        notes: String?,
        hydrationMilliliters: Int? = null,
    ): Activity = uploadTcx(bytes, fileName, title, type, notes)
    suspend fun activity(id: String): Activity
    suspend fun track(id: String): ActivityTrack
    suspend fun weather(id: String): WeatherResponse
    suspend fun refreshWeather(id: String): WeatherResponse
    suspend fun summary(id: String): SummaryResponse
    suspend fun generateSummary(id: String, force: Boolean = false): SummaryResponse
    suspend fun updateActivity(id: String, title: String?, type: String?, notes: String?): Activity
    suspend fun updateActivity(
        id: String,
        title: String?,
        type: String?,
        notes: String?,
        hydrationMilliliters: Int? = null,
    ): Activity = updateActivity(id, title, type, notes)
    suspend fun reanalyzeActivity(id: String): Activity = error("Reanalyse wird von diesem Repository nicht unterstützt.")
    suspend fun deleteActivity(id: String)
    suspend fun compareActivities(activityIds: List<String>): CompareResponse = error("Vergleich wird von diesem Repository nicht unterstützt.")

    suspend fun activityPhotos(activityId: String): ActivityPhotoList = error("Fotos werden von diesem Repository nicht unterstützt.")
    suspend fun uploadActivityPhoto(
        activityId: String,
        bytes: ByteArray,
        fileName: String,
        contentType: String,
        caption: String?,
        capturedAt: String? = null,
        latitude: Double? = null,
        longitude: Double? = null,
    ): ActivityPhoto = error("Foto-Upload wird von diesem Repository nicht unterstützt.")
    suspend fun updateActivityPhoto(activityId: String, photo: ActivityPhoto, caption: String): ActivityPhoto = error("Fotobearbeitung wird von diesem Repository nicht unterstützt.")
    suspend fun deleteActivityPhoto(activityId: String, photoId: String): Unit = error("Fotolöschung wird von diesem Repository nicht unterstützt.")
    suspend fun activityPhotoBytes(photo: ActivityPhoto): ByteArray = error("Fotoanzeige wird von diesem Repository nicht unterstützt.")

    suspend fun personalRecords(): PersonalRecords = error("Rekorde werden von diesem Repository nicht unterstützt.")
    suspend fun longTermInsights(dateFrom: String?, dateTo: String?): LongTermInsights = error("Insights werden von diesem Repository nicht unterstützt.")
    suspend fun periodReview(year: Int, season: String): PeriodReview = error("Rückblicke werden von diesem Repository nicht unterstützt.")
    suspend fun gamificationOverview(): GamificationOverview = error("Gamification wird von diesem Repository nicht unterstützt.")
    suspend fun createGamificationGoal(request: GamificationGoalRequest): GamificationGoal = error("Ziele werden von diesem Repository nicht unterstützt.")
    suspend fun updateGamificationGoal(id: String, request: GamificationGoalRequest): GamificationGoal = error("Ziele werden von diesem Repository nicht unterstützt.")
    suspend fun deleteGamificationGoal(id: String) { error("Ziele werden von diesem Repository nicht unterstützt.") }
    suspend fun acceptGamificationChallenge(id: String): GamificationChallenge = error("Herausforderungen werden von diesem Repository nicht unterstützt.")
    suspend fun declineGamificationChallenge(id: String): GamificationChallenge = error("Herausforderungen werden von diesem Repository nicht unterstützt.")
}

class DefaultAventoRepository(
    private val publicApi: AventoApi,
    private val api: AventoApi,
    private val tokenStore: TokenStore,
) : AventoRepository {
    override val session: Flow<AuthTokens?> = tokenStore.tokens

    override suspend fun currentSession(): AuthTokens? = tokenStore.read()

    override suspend fun login(email: String, password: String) {
        publicApi.login(LoginRequest(email.trim(), password)).save()
    }

    override suspend fun register(
        email: String,
        password: String,
        displayName: String,
        inviteToken: String,
    ) {
        publicApi.register(RegisterRequest(email.trim(), password, displayName.trim(), inviteToken.trim())).save()
    }

    override suspend fun bootstrap(email: String, password: String, displayName: String, bootstrapCode: String) {
        publicApi.bootstrap(BootstrapRequest(email.trim(), password, displayName.trim(), bootstrapCode.trim())).save()
    }

    override suspend fun resetPassword(token: String, newPassword: String) {
        val response = publicApi.resetPassword(PasswordResetRequest(token.trim(), newPassword))
        if (!response.isSuccessful) throw HttpException(response)
    }

    override suspend fun changePassword(currentPassword: String, newPassword: String) {
        val response = api.changePassword(PasswordChangeRequest(currentPassword, newPassword))
        if (!response.isSuccessful) throw HttpException(response)
    }

    override suspend fun logout() {
        val refreshToken = tokenStore.read()?.refreshToken
        try {
            if (refreshToken != null) api.logout(RefreshRequest(refreshToken))
        } finally {
            tokenStore.clear()
        }
    }

    override suspend fun profile(): Profile = api.profile()

    override suspend fun updateProfile(update: ProfileUpdate): Profile = api.updateProfile(update)

    override suspend fun uploadAvatar(bytes: ByteArray, fileName: String, contentType: String): Profile {
        require(bytes.isNotEmpty()) { "Das Profilbild ist leer." }
        val mediaType = contentType.toMediaTypeOrNull() ?: IMAGE_MEDIA_TYPE
        val file = MultipartBody.Part.createFormData("file", fileName, bytes.toRequestBody(mediaType))
        return api.uploadAvatar(file)
    }

    override suspend fun deleteAvatar(): Profile = api.deleteAvatar()

    override suspend fun activities(query: String?): ActivityList = activities(
        ActivityFilters(query = query.orEmpty(), limit = 50),
    )

    override suspend fun activities(filters: ActivityFilters): ActivityList = api.activities(
        limit = filters.limit.coerceIn(1, 200),
        offset = filters.offset.coerceAtLeast(0),
        query = filters.query.clean(),
        type = filters.type.clean(),
        dateFrom = filters.dateFrom.clean(),
        dateTo = filters.dateTo.clean(),
    )

    override suspend fun statistics(): OverviewStatistics = statistics(StatisticsRange())

    override suspend fun statistics(range: StatisticsRange): OverviewStatistics = api.statistics(
        dateFrom = range.dateFrom.clean(),
        dateTo = range.dateTo.clean(),
        granularity = range.granularity,
    )

    override suspend fun uploadTcx(
        bytes: ByteArray,
        fileName: String,
        title: String?,
        type: String?,
        notes: String?,
    ): Activity = uploadTcx(bytes, fileName, title, type, notes, null)

    override suspend fun uploadTcx(
        bytes: ByteArray,
        fileName: String,
        title: String?,
        type: String?,
        notes: String?,
        hydrationMilliliters: Int?,
    ): Activity {
        require(bytes.isNotEmpty()) { "Die Aktivitätsdatei ist leer." }
        require(hydrationMilliliters == null || hydrationMilliliters in 0..20_000) {
            "Die Trinkmenge muss zwischen 0 und 20.000 ml liegen."
        }
        val mediaType = when (fileName.substringAfterLast('.', "").lowercase()) {
            "fit" -> FIT_MEDIA_TYPE
            "gpx" -> GPX_MEDIA_TYPE
            else -> TCX_MEDIA_TYPE
        }
        val file = MultipartBody.Part.createFormData("file", fileName, bytes.toRequestBody(mediaType))
        return api.uploadActivity(
            file = file,
            title = title.partOrNull(TEXT_MEDIA_TYPE),
            type = type.partOrNull(TEXT_MEDIA_TYPE),
            notes = notes.partOrNull(TEXT_MEDIA_TYPE),
            hydrationMilliliters = hydrationMilliliters?.toString()?.toRequestBody(TEXT_MEDIA_TYPE),
        )
    }

    override suspend fun activity(id: String): Activity = api.activity(id)
    override suspend fun track(id: String): ActivityTrack = api.track(id)
    override suspend fun weather(id: String): WeatherResponse = api.weather(id)
    override suspend fun refreshWeather(id: String): WeatherResponse = api.refreshWeather(id)
    override suspend fun summary(id: String): SummaryResponse = api.summary(id)
    override suspend fun generateSummary(id: String, force: Boolean): SummaryResponse =
        api.generateSummary(id, force)

    override suspend fun updateActivity(
        id: String,
        title: String?,
        type: String?,
        notes: String?,
    ): Activity = updateActivity(id, title, type, notes, null)

    override suspend fun updateActivity(
        id: String,
        title: String?,
        type: String?,
        notes: String?,
        hydrationMilliliters: Int?,
    ): Activity {
        val cleanTitle = title?.trim().orEmpty()
        val cleanType = type?.trim().orEmpty()
        require(cleanTitle.isNotEmpty()) { "Bitte gib einen Titel ein." }
        require(cleanType.isNotEmpty()) { "Bitte wähle einen Aktivitätstyp." }
        require(hydrationMilliliters == null || hydrationMilliliters in 0..20_000) {
            "Die Trinkmenge muss zwischen 0 und 20.000 ml liegen."
        }
        return api.updateActivity(
            id,
            ActivityUpdate(cleanTitle, cleanType, notes.orEmpty().trim(), hydrationMilliliters),
        )
    }

    override suspend fun reanalyzeActivity(id: String): Activity = api.reanalyzeActivity(id)

    override suspend fun deleteActivity(id: String) {
        val response = api.deleteActivity(id)
        if (!response.isSuccessful) throw HttpException(response)
    }

    override suspend fun compareActivities(activityIds: List<String>): CompareResponse {
        val unique = activityIds.distinct()
        require(unique.size in 2..10) { "Wähle zwei bis zehn unterschiedliche Aktivitäten aus." }
        return api.compare(CompareRequest(unique))
    }

    override suspend fun activityPhotos(activityId: String): ActivityPhotoList = api.activityPhotos(activityId)

    override suspend fun uploadActivityPhoto(
        activityId: String,
        bytes: ByteArray,
        fileName: String,
        contentType: String,
        caption: String?,
        capturedAt: String?,
        latitude: Double?,
        longitude: Double?,
    ): ActivityPhoto {
        require(bytes.isNotEmpty()) { "Das Foto ist leer." }
        val mediaType = contentType.toMediaTypeOrNull() ?: IMAGE_MEDIA_TYPE
        require(mediaType.type == "image") { "Bitte wähle eine Bilddatei aus." }
        val file = MultipartBody.Part.createFormData("file", fileName, bytes.toRequestBody(mediaType))
        return api.uploadActivityPhoto(
            activityId = activityId,
            file = file,
            caption = caption.partOrNull(TEXT_MEDIA_TYPE),
            capturedAt = capturedAt.partOrNull(TEXT_MEDIA_TYPE),
            latitude = latitude?.toString()?.toRequestBody(TEXT_MEDIA_TYPE),
            longitude = longitude?.toString()?.toRequestBody(TEXT_MEDIA_TYPE),
            clientTimezone = ZoneId.systemDefault().id.toRequestBody(TEXT_MEDIA_TYPE),
        )
    }

    override suspend fun updateActivityPhoto(
        activityId: String,
        photo: ActivityPhoto,
        caption: String,
    ): ActivityPhoto = api.updateActivityPhoto(
        activityId,
        photo.id,
        ActivityPhotoUpdate(
            caption = caption.trim(),
            capturedAt = photo.capturedAt,
            latitude = photo.latitude,
            longitude = photo.longitude,
        ),
    )

    override suspend fun deleteActivityPhoto(activityId: String, photoId: String) {
        val response = api.deleteActivityPhoto(activityId, photoId)
        if (!response.isSuccessful) throw HttpException(response)
    }

    override suspend fun activityPhotoBytes(photo: ActivityPhoto): ByteArray =
        api.downloadPhoto(photo.fileUrl).use { body ->
            require(body.contentLength() <= MAX_IN_MEMORY_PHOTO_BYTES || body.contentLength() < 0) {
                "Das Foto ist für die Anzeige zu groß."
            }
            body.bytes().also {
                require(it.size <= MAX_IN_MEMORY_PHOTO_BYTES) { "Das Foto ist für die Anzeige zu groß." }
            }
        }

    override suspend fun personalRecords(): PersonalRecords = api.personalRecords()

    override suspend fun longTermInsights(dateFrom: String?, dateTo: String?): LongTermInsights =
        api.longTermInsights(dateFrom.clean(), dateTo.clean())

    override suspend fun periodReview(year: Int, season: String): PeriodReview =
        api.periodReview(year, season)

    override suspend fun gamificationOverview(): GamificationOverview = api.gamificationOverview()

    override suspend fun createGamificationGoal(request: GamificationGoalRequest): GamificationGoal =
        api.createGamificationGoal(request)

    override suspend fun updateGamificationGoal(id: String, request: GamificationGoalRequest): GamificationGoal =
        api.updateGamificationGoal(id, request)

    override suspend fun deleteGamificationGoal(id: String) {
        val response = api.deleteGamificationGoal(id)
        if (!response.isSuccessful) throw HttpException(response)
    }

    override suspend fun acceptGamificationChallenge(id: String): GamificationChallenge =
        api.acceptGamificationChallenge(id)

    override suspend fun declineGamificationChallenge(id: String): GamificationChallenge =
        api.declineGamificationChallenge(id)

    private suspend fun de.avento.app.data.model.TokenResponse.save() {
        tokenStore.save(accessToken, refreshToken)
    }

    private fun String?.partOrNull(mediaType: MediaType) =
        clean()?.toRequestBody(mediaType)

    private companion object {
        val TCX_MEDIA_TYPE = "application/vnd.garmin.tcx+xml".toMediaType()
        val FIT_MEDIA_TYPE = "application/octet-stream".toMediaType()
        val GPX_MEDIA_TYPE = "application/gpx+xml".toMediaType()
        val TEXT_MEDIA_TYPE = "text/plain".toMediaType()
        val IMAGE_MEDIA_TYPE = "image/jpeg".toMediaType()
        const val MAX_IN_MEMORY_PHOTO_BYTES = 20 * 1024 * 1024
    }
}

private fun String?.clean(): String? = this?.trim()?.takeIf(String::isNotEmpty)
