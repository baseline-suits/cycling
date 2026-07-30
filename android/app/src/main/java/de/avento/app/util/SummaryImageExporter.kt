package de.avento.app.util

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import androidx.core.content.FileProvider
import java.io.File
import java.io.FileOutputStream

object SummaryImageExporter {
    fun share(context: Context, bitmap: Bitmap, title: String) {
        val directory = File(context.cacheDir, "shared").apply { mkdirs() }
        val safeTitle = title.lowercase().replace(Regex("[^a-z0-9äöüß-]+"), "-").trim('-').ifBlank { "aktivitaet" }
        val file = File(directory, "baseline-cycling-$safeTitle.png")
        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        bitmap.recycle()
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "image/png"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_TEXT, title)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Baseline Cycling-Grafik teilen"))
    }
}
