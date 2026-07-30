package de.avento.app.data.network

import de.avento.app.BuildConfig
import de.avento.app.data.model.ApiError
import de.avento.app.data.model.RefreshRequest
import de.avento.app.data.security.TokenStore
import java.io.IOException
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import retrofit2.HttpException
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit

class NetworkProvider(private val tokenStore: TokenStore, private val baseUrl: String) {
    val moshi: Moshi = Moshi.Builder().addLast(KotlinJsonAdapterFactory()).build()

    private val publicClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(90, TimeUnit.SECONDS)
        .addInterceptor(loggingInterceptor())
        .build()

    val publicApi: AventoApi = retrofit(publicClient).create(AventoApi::class.java)

    val authenticatedApi: AventoApi by lazy {
        val client = OkHttpClient.Builder()
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(90, TimeUnit.SECONDS)
            .writeTimeout(90, TimeUnit.SECONDS)
            .addInterceptor(BearerInterceptor(tokenStore))
            .authenticator(TokenAuthenticator(tokenStore, publicApi))
            .addInterceptor(loggingInterceptor())
            .build()
        retrofit(client).create(AventoApi::class.java)
    }

    private fun retrofit(client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(client)
        .addConverterFactory(MoshiConverterFactory.create(moshi))
        .build()

    private fun loggingInterceptor() = HttpLoggingInterceptor().apply {
        // BASIC logs no credentials or request bodies.
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC
        else HttpLoggingInterceptor.Level.NONE
        redactHeader("Authorization")
    }
}

private class BearerInterceptor(private val tokenStore: TokenStore) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val accessToken = runBlocking { tokenStore.read()?.accessToken }
        val request = accessToken?.let {
            chain.request().newBuilder().header("Authorization", "Bearer $it").build()
        } ?: chain.request()
        return chain.proceed(request)
    }
}

private class TokenAuthenticator(
    private val tokenStore: TokenStore,
    private val publicApi: AventoApi,
) : Authenticator {
    private val lock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null
        return synchronized(lock) {
            runBlocking {
                val current = tokenStore.read() ?: return@runBlocking null
                val failedHeader = response.request.header("Authorization")
                val currentHeader = "Bearer ${current.accessToken}"
                if (failedHeader != currentHeader) {
                    return@runBlocking response.request.newBuilder()
                        .header("Authorization", currentHeader)
                        .build()
                }
                runCatching { publicApi.refresh(RefreshRequest(current.refreshToken)) }
                    .fold(
                        onSuccess = { refreshed ->
                            tokenStore.save(refreshed.accessToken, refreshed.refreshToken)
                            response.request.newBuilder()
                                .header("Authorization", "Bearer ${refreshed.accessToken}")
                                .build()
                        },
                        onFailure = {
                            tokenStore.clear()
                            null
                        },
                    )
            }
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}

fun Throwable.toGermanMessage(moshi: Moshi? = null): String = when (this) {
    is HttpException -> {
        val detail = runCatching {
            val body = response()?.errorBody()?.string().orEmpty()
            moshi?.adapter(ApiError::class.java)?.fromJson(body)?.let { error ->
                error.message ?: error.detail.asMessage()
            }
        }.getOrNull()
        detail ?: when (code()) {
            400 -> "Die Anfrage ist ungültig."
            401 -> "Deine Sitzung ist abgelaufen. Bitte melde dich erneut an."
            403 -> "Du hast dafür keine Berechtigung."
            404 -> "Die angeforderten Daten wurden nicht gefunden."
            409 -> "Diese Aktivität wurde bereits importiert."
            413 -> "Die ausgewählte Datei ist zu groß."
            422 -> "Die eingegebenen Daten sind ungültig."
            429 -> "Zu viele Anfragen. Bitte versuche es später erneut."
            in 500..599 -> "Der Server ist gerade nicht erreichbar."
            else -> "Die Anfrage ist fehlgeschlagen (${code()})."
        }
    }
    is IOException -> "Keine Verbindung zum Baseline Cycling-Server."
    else -> message ?: "Ein unerwarteter Fehler ist aufgetreten."
}

private fun Any?.asMessage(): String? = when (this) {
    is String -> takeIf(String::isNotBlank)
    is Map<*, *> -> (this["message"] ?: this["detail"] ?: this["msg"]).asMessage()
    is List<*> -> mapNotNull { item -> item.asMessage() }.joinToString(" ").takeIf(String::isNotBlank)
    else -> null
}
