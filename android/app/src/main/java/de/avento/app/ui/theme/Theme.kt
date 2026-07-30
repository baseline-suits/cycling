package de.avento.app.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat

/** Feste Markenfarben, die Web und Android miteinander verbinden. */
object AventoPalette {
    val Teal = Color(0xFF61D8DD)
    val DeepTeal = Color(0xFF080A0D)
    val Lime = Color(0xFFB9E878)
    val Amber = Color(0xFFF0B65E)
    val Coral = Color(0xFFFF8D91)
    val Blue = Color(0xFF73A7FF)
    val Violet = Color(0xFF8F86FF)
}

private val LightColors = lightColorScheme(
    primary = Color(0xFF5E7F1C),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE4F5C8),
    onPrimaryContainer = Color(0xFF263600),
    secondary = Color(0xFF655CC5),
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFE6E3FF),
    onSecondaryContainer = Color(0xFF211B65),
    tertiary = Color(0xFF18898F),
    onTertiary = Color.White,
    tertiaryContainer = Color(0xFFC6F2F3),
    onTertiaryContainer = Color(0xFF002F32),
    background = Color(0xFFF2F5EF),
    onBackground = Color(0xFF151A12),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF151A12),
    surfaceVariant = Color(0xFFE9EDE5),
    onSurfaceVariant = Color(0xFF62695E),
    outline = Color(0xFF7C8476),
    outlineVariant = Color(0xFFDCE2D7),
    error = Color(0xFFBA1A1A),
)

private val DarkColors = darkColorScheme(
    primary = AventoPalette.Lime,
    onPrimary = Color(0xFF11170B),
    primaryContainer = Color(0xFF3E5215),
    onPrimaryContainer = Color(0xFFE4F5C8),
    secondary = AventoPalette.Violet,
    onSecondary = Color(0xFF080A0D),
    secondaryContainer = Color(0xFF393279),
    onSecondaryContainer = Color(0xFFE6E3FF),
    tertiary = AventoPalette.Teal,
    onTertiary = Color(0xFF002F32),
    tertiaryContainer = Color(0xFF164E52),
    onTertiaryContainer = Color(0xFFC6F2F3),
    background = Color(0xFF080A0D),
    onBackground = Color(0xFFF2F5EF),
    surface = Color(0xFF11151B),
    onSurface = Color(0xFFF2F5EF),
    surfaceVariant = Color(0xFF20242C),
    onSurfaceVariant = Color(0xFFC4CBC0),
    outline = Color(0xFF8C9488),
    outlineVariant = Color(0xFF3A4037),
    error = Color(0xFFFFB4AB),
)

private val AventoTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 38.sp,
        lineHeight = 44.sp,
        letterSpacing = (-1.2).sp,
    ),
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.8).sp,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 27.sp,
        lineHeight = 33.sp,
        letterSpacing = (-0.55).sp,
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 23.sp,
        lineHeight = 29.sp,
        letterSpacing = (-0.35).sp,
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
        letterSpacing = (-0.2).sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 16.sp,
        lineHeight = 22.sp,
    ),
    titleSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 24.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 21.sp,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp,
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Bold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
        lineHeight = 17.sp,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        lineHeight = 15.sp,
    ),
)

private val AventoShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(16.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp),
)

@Composable
fun AventoTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AventoTypography,
        shapes = AventoShapes,
        content = content,
    )
}
