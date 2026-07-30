package de.avento.app.ui.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import de.avento.app.ui.components.AventoTopBar

@Composable
fun ChatScreen(viewModel: ChatViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var draft by rememberSaveable { mutableStateOf("") }
    Scaffold(topBar = { AventoTopBar("Baseline Cycling Insights") }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            LazyColumn(
                Modifier.weight(1f).fillMaxWidth(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (state.messages.isEmpty()) {
                    item {
                        Text(
                            "Frag Baseline Cycling nach deinen Trainings, Zielen oder passenden privaten Herausforderungen.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
                items(state.messages) { message ->
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) {
                            Text(if (message.role == "user") "Du" else "Baseline Cycling Insights", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
                            Text(message.content, Modifier.padding(top = 5.dp))
                        }
                    }
                }
                if (state.sending) item { CircularProgressIndicator(Modifier.padding(8.dp), strokeWidth = 2.dp) }
                state.error?.let { error -> item { Text(error, color = MaterialTheme.colorScheme.error) } }
            }
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it; viewModel.clearError() },
                modifier = Modifier.fillMaxWidth().padding(12.dp),
                label = { Text("Nachricht") },
                trailingIcon = {
                    IconButton(onClick = { viewModel.send(draft); draft = "" }, enabled = draft.isNotBlank() && !state.sending) {
                        Icon(Icons.AutoMirrored.Filled.Send, "Senden")
                    }
                },
                minLines = 1,
                maxLines = 4,
            )
        }
    }
}
