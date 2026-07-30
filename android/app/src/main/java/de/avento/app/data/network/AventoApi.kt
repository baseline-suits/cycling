package de.avento.app.data.network

import de.avento.app.data.model.Activity
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
import de.avento.app.data.model.SummaryResponse
import de.avento.app.data.model.TokenResponse
import de.avento.app.data.model.WeatherResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query
import retrofit2.http.Streaming
import retrofit2.http.Url

interface AventoApi {
    @POST("auth/bootstrap")
    suspend fun bootstrap(@Body request: BootstrapRequest): TokenResponse

    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): TokenResponse

    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): TokenResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body request: RefreshRequest): TokenResponse

    @POST("auth/logout")
    suspend fun logout(@Body request: RefreshRequest): Response<Unit>

    @POST("auth/password-reset")
    suspend fun resetPassword(@Body request: PasswordResetRequest): Response<Unit>

    @GET("profile")
    suspend fun profile(): Profile

    @PATCH("profile")
    suspend fun updateProfile(@Body request: ProfileUpdate): Profile

    @Multipart
    @POST("profile/avatar")
    suspend fun uploadAvatar(@Part file: MultipartBody.Part): Profile

    @DELETE("profile/avatar")
    suspend fun deleteAvatar(): Profile

    @POST("profile/password")
    suspend fun changePassword(@Body request: PasswordChangeRequest): Response<Unit>

    @GET("activities")
    suspend fun activities(
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0,
        @Query("q") query: String? = null,
        @Query("type") type: String? = null,
        @Query("date_from") dateFrom: String? = null,
        @Query("date_to") dateTo: String? = null,
    ): ActivityList

    @Multipart
    @POST("activities")
    suspend fun uploadActivity(
        @Part file: MultipartBody.Part,
        @Part("title") title: RequestBody? = null,
        @Part("type") type: RequestBody? = null,
        @Part("notes") notes: RequestBody? = null,
        @Part("hydration_ml") hydrationMilliliters: RequestBody? = null,
    ): Activity

    @POST("activities/compare")
    suspend fun compare(@Body request: CompareRequest): CompareResponse

    @GET("activities/{id}")
    suspend fun activity(@Path("id") id: String): Activity

    @PATCH("activities/{id}")
    suspend fun updateActivity(@Path("id") id: String, @Body request: ActivityUpdate): Activity

    @POST("activities/{id}/reanalyze")
    suspend fun reanalyzeActivity(@Path("id") id: String): Activity

    @DELETE("activities/{id}")
    suspend fun deleteActivity(@Path("id") id: String): Response<Unit>

    @GET("activities/{id}/track")
    suspend fun track(@Path("id") id: String): ActivityTrack

    @GET("activities/{id}/weather")
    suspend fun weather(@Path("id") id: String): WeatherResponse

    @POST("activities/{id}/weather/refresh")
    suspend fun refreshWeather(@Path("id") id: String): WeatherResponse

    @GET("activities/{id}/summary")
    suspend fun summary(@Path("id") id: String): SummaryResponse

    @POST("activities/{id}/summary")
    suspend fun generateSummary(
        @Path("id") id: String,
        @Query("force") force: Boolean = false,
    ): SummaryResponse

    @GET("statistics/overview")
    suspend fun statistics(
        @Query("date_from") dateFrom: String? = null,
        @Query("date_to") dateTo: String? = null,
        @Query("granularity") granularity: String = "auto",
    ): OverviewStatistics

    @GET("statistics/records")
    suspend fun personalRecords(): PersonalRecords

    @GET("statistics/insights")
    suspend fun longTermInsights(
        @Query("date_from") dateFrom: String? = null,
        @Query("date_to") dateTo: String? = null,
    ): LongTermInsights

    @GET("statistics/reviews/{year}")
    suspend fun periodReview(
        @Path("year") year: Int,
        @Query("season") season: String = "year",
    ): PeriodReview

    @GET("gamification/overview")
    suspend fun gamificationOverview(): GamificationOverview

    @POST("gamification/goals")
    suspend fun createGamificationGoal(@Body request: GamificationGoalRequest): GamificationGoal

    @PATCH("gamification/goals/{id}")
    suspend fun updateGamificationGoal(
        @Path("id") id: String,
        @Body request: GamificationGoalRequest,
    ): GamificationGoal

    @DELETE("gamification/goals/{id}")
    suspend fun deleteGamificationGoal(@Path("id") id: String): Response<Unit>

    @POST("gamification/challenges/{id}/accept")
    suspend fun acceptGamificationChallenge(@Path("id") id: String): GamificationChallenge

    @POST("gamification/challenges/{id}/decline")
    suspend fun declineGamificationChallenge(@Path("id") id: String): GamificationChallenge

    @GET("activities/{activityId}/photos")
    suspend fun activityPhotos(@Path("activityId") activityId: String): ActivityPhotoList

    @Multipart
    @POST("activities/{activityId}/photos")
    suspend fun uploadActivityPhoto(
        @Path("activityId") activityId: String,
        @Part file: MultipartBody.Part,
        @Part("caption") caption: RequestBody? = null,
        @Part("captured_at") capturedAt: RequestBody? = null,
        @Part("latitude") latitude: RequestBody? = null,
        @Part("longitude") longitude: RequestBody? = null,
        @Part("client_timezone") clientTimezone: RequestBody? = null,
    ): ActivityPhoto

    @PATCH("activities/{activityId}/photos/{photoId}")
    suspend fun updateActivityPhoto(
        @Path("activityId") activityId: String,
        @Path("photoId") photoId: String,
        @Body request: ActivityPhotoUpdate,
    ): ActivityPhoto

    @DELETE("activities/{activityId}/photos/{photoId}")
    suspend fun deleteActivityPhoto(
        @Path("activityId") activityId: String,
        @Path("photoId") photoId: String,
    ): Response<Unit>

    @Streaming
    @GET
    suspend fun downloadPhoto(@Url url: String): ResponseBody
}
