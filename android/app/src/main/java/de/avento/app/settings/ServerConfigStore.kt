package de.avento.app.settings

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import java.net.URI
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.serverConfigDataStore by preferencesDataStore(name = "server_config")

class ServerConfigStore(private val context: Context) {
    val serverUrl: Flow<String?> = context.serverConfigDataStore.data.map { it[SERVER_URL] }

    suspend fun save(url: String) {
        context.serverConfigDataStore.edit { it[SERVER_URL] = url }
    }

    suspend fun clear() {
        context.serverConfigDataStore.edit { it.clear() }
    }

    private companion object {
        val SERVER_URL = stringPreferencesKey("api_base_url_v1")
    }
}

fun normalizeServerUrl(input: String): String {
    val trimmed = input.trim().trimEnd('/')
    require(trimmed.isNotEmpty()) { "Bitte gib die Adresse deines Baseline Cycling-Servers ein." }
    val withScheme = if (trimmed.contains("://")) trimmed else "https://$trimmed"
    val uri = runCatching { URI(withScheme) }.getOrNull()
        ?: throw IllegalArgumentException("Die Server-Adresse ist ungültig.")
    require(uri.scheme in setOf("http", "https") && !uri.host.isNullOrBlank()) {
        "Die Adresse muss mit http:// oder https:// beginnen und einen Servernamen enthalten."
    }
    require(uri.userInfo == null && uri.query == null && uri.fragment == null) {
        "Die Server-Adresse darf keine Zugangsdaten, Abfrage oder Sprungmarke enthalten."
    }
    val inputPath = uri.path.orEmpty().trimEnd('/')
    val apiPath = if (inputPath.endsWith("/api/v1")) inputPath else "$inputPath/api/v1"
    return URI(uri.scheme.lowercase(), null, uri.host, uri.port, "$apiPath/", null, null).toASCIIString()
}
