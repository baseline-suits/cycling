package de.avento.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import de.avento.app.AppContainer
import de.avento.app.ServerState
import de.avento.app.data.network.toGermanMessage
import de.avento.app.ui.auth.AuthViewModel
import de.avento.app.ui.auth.LoginScreen
import de.avento.app.ui.auth.PasswordResetScreen
import de.avento.app.ui.auth.RegistrationMode
import de.avento.app.ui.auth.RegistrationScreen
import de.avento.app.ui.auth.ServerSetupScreen
import de.avento.app.ui.activities.ActivitiesScreen
import de.avento.app.ui.activities.ActivitiesViewModel
import de.avento.app.ui.compare.CompareScreen
import de.avento.app.ui.compare.CompareViewModel
import de.avento.app.ui.dashboard.DashboardScreen
import de.avento.app.ui.dashboard.DashboardViewModel
import de.avento.app.ui.detail.DetailScreen
import de.avento.app.ui.detail.DetailViewModel
import de.avento.app.ui.gamification.GamificationScreen
import de.avento.app.ui.gamification.GamificationViewModel
import de.avento.app.ui.insights.InsightsScreen
import de.avento.app.ui.insights.InsightsViewModel
import de.avento.app.ui.profile.ProfileScreen
import de.avento.app.ui.profile.ProfileViewModel
import de.avento.app.ui.records.RecordsScreen
import de.avento.app.ui.records.RecordsViewModel
import de.avento.app.ui.statistics.StatisticsScreen
import de.avento.app.ui.statistics.StatisticsViewModel
import kotlinx.coroutines.flow.map

private object Routes {
    const val Login = "login"
    const val Register = "register"
    const val Bootstrap = "bootstrap"
    const val PasswordReset = "password-reset"
    const val Dashboard = "dashboard"
    const val Activities = "activities"
    const val Statistics = "statistics"
    const val Records = "records"
    const val Compare = "compare"
    const val Gamification = "gamification"
    const val Insights = "insights"
    const val Profile = "profile"
    const val Detail = "activity/{activityId}"
    fun detail(id: String) = "activity/$id"
}

@Composable
fun AventoApp(container: AppContainer) {
    val serverState by container.serverState.collectAsStateWithLifecycle()
    when (val state = serverState) {
        ServerState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        ServerState.Missing -> ServerSetupScreen(onSave = container::configureServer)
        is ServerState.Connected -> key(state.serverUrl) {
            ConnectedAventoApp(container, state)
        }
    }
}

@Composable
private fun ConnectedAventoApp(container: AppContainer, connection: ServerState.Connected) {
    val repository = connection.repository
    val initiallyAuthenticated by produceState<Boolean?>(null, repository) {
        value = runCatching { repository.currentSession() != null }.getOrDefault(false)
    }
    if (initiallyAuthenticated == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        return
    }

    val navController = rememberNavController()
    val sessionFlow = remember(repository) { repository.session.map { it != null } }
    val sessionPresent by sessionFlow
        .collectAsStateWithLifecycle(initialValue = initiallyAuthenticated == true)
    LaunchedEffect(sessionPresent) {
        if (!sessionPresent && navController.currentDestination?.route !in setOf(
                Routes.Login,
                Routes.Register,
                Routes.Bootstrap,
                Routes.PasswordReset,
            )
        ) {
            navController.navigate(Routes.Login) { popUpTo(0) }
        }
    }
    val errorMapper: (Throwable) -> String = { it.toGermanMessage(connection.errorMoshi) }
    NavHost(
        navController = navController,
        startDestination = if (initiallyAuthenticated == true) Routes.Dashboard else Routes.Login,
    ) {
        composable(Routes.Login) {
            val vm: AuthViewModel = viewModel(factory = SimpleViewModelFactory {
                AuthViewModel(repository, errorMapper)
            })
            LoginScreen(
                viewModel = vm,
                onLoggedIn = { navController.navigate(Routes.Dashboard) { popUpTo(Routes.Login) { inclusive = true } } },
                onRegister = { navController.navigate(Routes.Register) },
                onResetPassword = { navController.navigate(Routes.PasswordReset) },
                onBootstrap = { navController.navigate(Routes.Bootstrap) },
                serverUrl = connection.serverUrl,
                onChangeServer = container::forgetServer,
            )
        }
        composable(Routes.PasswordReset) {
            val vm: AuthViewModel = viewModel(factory = SimpleViewModelFactory {
                AuthViewModel(repository, errorMapper)
            })
            PasswordResetScreen(
                viewModel = vm,
                onBack = { navController.popBackStack() },
                onReturnToLogin = { navController.popBackStack() },
            )
        }
        composable(Routes.Register) {
            val vm: AuthViewModel = viewModel(factory = SimpleViewModelFactory {
                AuthViewModel(repository, errorMapper)
            })
            RegistrationScreen(
                mode = RegistrationMode.Invitation,
                viewModel = vm,
                onComplete = { navController.navigate(Routes.Dashboard) { popUpTo(Routes.Login) { inclusive = true } } },
                onBack = { navController.popBackStack() },
            )
        }
        composable(Routes.Bootstrap) {
            val vm: AuthViewModel = viewModel(factory = SimpleViewModelFactory {
                AuthViewModel(repository, errorMapper)
            })
            RegistrationScreen(
                mode = RegistrationMode.Bootstrap,
                viewModel = vm,
                onComplete = { navController.navigate(Routes.Dashboard) { popUpTo(Routes.Login) { inclusive = true } } },
                onBack = { navController.popBackStack() },
            )
        }
        composable(Routes.Dashboard) {
            val vm: DashboardViewModel = viewModel(factory = SimpleViewModelFactory {
                DashboardViewModel(repository, errorMapper)
            })
            val pendingImport by container.pendingImport.collectAsStateWithLifecycle()
            DashboardScreen(
                viewModel = vm,
                pendingImport = pendingImport,
                onImportOffered = container::offerImport,
                onImportConsumed = container::consumeImport,
                onOpenActivity = { navController.navigate(Routes.detail(it)) },
                onNavigate = { route -> navController.navigate(route) },
                onLoggedOut = {
                    navController.navigate(Routes.Login) { popUpTo(Routes.Dashboard) { inclusive = true } }
                },
            )
        }
        composable(Routes.Activities) {
            val vm: ActivitiesViewModel = viewModel(factory = SimpleViewModelFactory { ActivitiesViewModel(repository, errorMapper) })
            ActivitiesScreen(vm, onOpenActivity = { navController.navigate(Routes.detail(it)) })
        }
        composable(Routes.Statistics) {
            val vm: StatisticsViewModel = viewModel(factory = SimpleViewModelFactory { StatisticsViewModel(repository, errorMapper) })
            StatisticsScreen(vm)
        }
        composable(Routes.Records) {
            val vm: RecordsViewModel = viewModel(factory = SimpleViewModelFactory { RecordsViewModel(repository, errorMapper) })
            RecordsScreen(vm, onBack = { navController.popBackStack() }, onOpenActivity = { navController.navigate(Routes.detail(it)) })
        }
        composable(Routes.Compare) {
            val vm: CompareViewModel = viewModel(factory = SimpleViewModelFactory { CompareViewModel(repository, errorMapper) })
            CompareScreen(vm, onOpenActivity = { navController.navigate(Routes.detail(it)) })
        }
        composable(Routes.Gamification) {
            val vm: GamificationViewModel = viewModel(factory = SimpleViewModelFactory { GamificationViewModel(repository, errorMapper) })
            GamificationScreen(vm)
        }
        composable(Routes.Insights) {
            val vm: InsightsViewModel = viewModel(factory = SimpleViewModelFactory { InsightsViewModel(repository, errorMapper) })
            InsightsScreen(vm)
        }
        composable(Routes.Profile) {
            val vm: ProfileViewModel = viewModel(factory = SimpleViewModelFactory { ProfileViewModel(repository, errorMapper) })
            ProfileScreen(vm)
        }
        composable(
            route = Routes.Detail,
            arguments = listOf(navArgument("activityId") { type = NavType.StringType }),
        ) { entry ->
            val id = requireNotNull(entry.arguments?.getString("activityId"))
            val vm: DetailViewModel = viewModel(factory = SimpleViewModelFactory {
                DetailViewModel(id, repository, errorMapper)
            })
            DetailScreen(
                viewModel = vm,
                onBack = { navController.popBackStack() },
                onDeleted = {
                    navController.navigate(Routes.Dashboard) {
                        popUpTo(Routes.Dashboard) { inclusive = true }
                    }
                },
            )
        }
    }
}
