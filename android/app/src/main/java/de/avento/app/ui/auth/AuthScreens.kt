package de.avento.app.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onLoggedIn: () -> Unit,
    onRegister: () -> Unit,
    onResetPassword: () -> Unit,
    onBootstrap: () -> Unit,
    serverUrl: String,
    onChangeServer: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    val submit = { viewModel.login(email, password, onLoggedIn) }

    Scaffold { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Column(Modifier.widthIn(max = 460.dp)) {
                Text("Baseline Cycling", style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Bold)
                Text("Deine Radfahrten. Klar analysiert.", style = MaterialTheme.typography.titleMedium)
                Spacer(Modifier.height(8.dp))
                Text(
                    "Server: ${serverUrl.removeSuffix("api/v1/").removeSuffix("/")}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = onChangeServer) { Text("Server ändern") }
                Spacer(Modifier.height(32.dp))
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it; viewModel.clearError() },
                    label = { Text("E-Mail-Adresse") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; viewModel.clearError() },
                    label = { Text("Passwort") },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { submit() }),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                state.error?.let {
                    Spacer(Modifier.height(8.dp))
                    Text(it, color = MaterialTheme.colorScheme.error)
                }
                Spacer(Modifier.height(20.dp))
                Button(onClick = submit, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
                    if (state.loading) CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp)
                    else Text("Anmelden")
                }
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = onRegister, modifier = Modifier.fillMaxWidth()) {
                    Text("Mit Einladung registrieren")
                }
                TextButton(onClick = onResetPassword, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                    Text("Passwort zurücksetzen")
                }
                TextButton(onClick = onBootstrap, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                    Text("Erste Server-Einrichtung")
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PasswordResetScreen(
    viewModel: AuthViewModel,
    onBack: () -> Unit,
    onReturnToLogin: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var token by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirmation by remember { mutableStateOf("") }
    var completed by remember { mutableStateOf(false) }
    val submit = { viewModel.resetPassword(token, password, confirmation) { completed = true } }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Passwort zurücksetzen") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Column(Modifier.widthIn(max = 460.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (completed) {
                    Text("Passwort geändert", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    Text("Du kannst dich jetzt mit deinem neuen Passwort anmelden.")
                    Button(onClick = onReturnToLogin, modifier = Modifier.fillMaxWidth()) {
                        Text("Zur Anmeldung")
                    }
                } else {
                    Text("Gib den Reset-Token aus deiner E-Mail und dein neues Passwort ein.")
                    OutlinedTextField(
                        value = token,
                        onValueChange = { token = it; viewModel.clearError() },
                        label = { Text("Reset-Token") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it; viewModel.clearError() },
                        label = { Text("Neues Passwort (mindestens 10 Zeichen)") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = confirmation,
                        onValueChange = { confirmation = it; viewModel.clearError() },
                        label = { Text("Neues Passwort bestätigen") },
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { submit() }),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                    Button(onClick = submit, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
                        if (state.loading) CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp)
                        else Text("Passwort ändern")
                    }
                }
            }
        }
    }
}

enum class RegistrationMode { Invitation, Bootstrap }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RegistrationScreen(
    mode: RegistrationMode,
    viewModel: AuthViewModel,
    onComplete: () -> Unit,
    onBack: () -> Unit,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var inviteToken by remember { mutableStateOf("") }
    var bootstrapCode by remember { mutableStateOf("") }
    val isBootstrap = mode == RegistrationMode.Bootstrap
    val submit = {
        if (isBootstrap) viewModel.bootstrap(email, password, name, bootstrapCode, onComplete)
        else viewModel.register(email, password, name, inviteToken, onComplete)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (isBootstrap) "Erste Einrichtung" else "Registrieren") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Zurück")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(Modifier.widthIn(max = 460.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (isBootstrap) {
                    Text("Nur verwenden, solange der Server noch kein Benutzerkonto besitzt.")
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it; viewModel.clearError() },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it; viewModel.clearError() },
                    label = { Text("E-Mail-Adresse") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it; viewModel.clearError() },
                    label = { Text("Passwort (mindestens 10 Zeichen)") },
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (!isBootstrap) {
                    OutlinedTextField(
                        value = inviteToken,
                        onValueChange = { inviteToken = it; viewModel.clearError() },
                        label = { Text("Einladungscode") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    OutlinedTextField(
                        value = bootstrapCode,
                        onValueChange = { bootstrapCode = it; viewModel.clearError() },
                        label = { Text("Einrichtungscode") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
                Button(onClick = submit, enabled = !state.loading, modifier = Modifier.fillMaxWidth()) {
                    if (state.loading) CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp)
                    else Text(if (isBootstrap) "Administrator anlegen" else "Konto erstellen")
                }
            }
        }
    }
}
