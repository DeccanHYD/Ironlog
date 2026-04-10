
import React, { useContext } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import FloatingWorkoutWidget from '../components/FloatingWorkoutWidget';
import HomeScreen from '../screens/HomeScreen';
import HistoryScreen from '../screens/HistoryScreen';
import StatsScreen from '../screens/StatsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PlansScreen from '../screens/PlansScreen';
import ActiveWorkoutScreen from '../screens/ActiveWorkoutScreen';
import PlanEditorScreen from '../screens/PlanEditorScreen';
import ExerciseLibraryScreen from '../screens/ExerciseLibraryScreen';
import BodyWeightScreen from '../screens/BodyWeightScreen';
import CreateExerciseScreen from '../screens/CreateExerciseScreen';
import ProgressPhotosScreen from '../screens/ProgressPhotosScreen';
import ProgramPickerScreen from '../screens/ProgramPickerScreen';
import ExerciseProgressScreen from '../screens/ExerciseProgressScreen';
import WorkoutCalendarScreen from '../screens/WorkoutCalendarScreen';
import VolumeAnalyticsScreen from '../screens/VolumeAnalyticsScreen';
import RecoveryMapScreen from '../screens/RecoveryMapScreen';
import ProgramInsightsScreen from '../screens/ProgramInsightsScreen';
import BodyMeasurementsScreen from '../screens/BodyMeasurementsScreen';
import GymProfilesScreen from '../screens/GymProfilesScreen';
import GymProfileEditorScreen from '../screens/GymProfileEditorScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import BackupCenterScreen from '../screens/BackupCenterScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import RestoreDataScreen from '../screens/RestoreDataScreen';
import ImportCenterScreen from '../screens/ImportCenterScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const STACK_ANIMATION = Platform.OS === 'android' ? 'default' : 'slide_from_right';

function Tabs({ navigation }) {
  const colors = useTheme();
  const navOpts = {
    headerStyle: { backgroundColor: colors.bg, shadowColor: 'transparent', elevation: 0, borderBottomWidth: 1, borderBottomColor: colors.faint },
    headerTintColor: colors.text,
    headerTitleStyle: { fontWeight: '900', letterSpacing: 2, fontSize: 16 },
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tab.Navigator detachInactiveScreens screenOptions={({ route }) => ({
        ...navOpts,
        lazy: true,
        freezeOnBlur: true,
        tabBarIcon: ({ color, size }) => {
          const icons = { Home: 'barbell', Plans: 'list', Log: 'time', Stats: 'stats-chart', Settings: 'settings-outline' };
          return <Ionicons name={icons[route.name]} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.tabBg, borderTopColor: colors.faint, borderTopWidth: 1 },
        tabBarLabelStyle: { fontSize: 10, letterSpacing: 1 },
      })}>
        <Tab.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Tab.Screen name="Plans" component={PlansScreen} options={{ title: 'PLANS' }} />
        <Tab.Screen name="Log" component={HistoryScreen} options={{ title: 'LOG' }} />
        <Tab.Screen name="Stats" component={StatsScreen} options={{ title: 'STATS' }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: 'SETTINGS' }} />
      </Tab.Navigator>
      <View style={{ position: 'absolute', bottom: 70, left: 0, right: 0, zIndex: 100 }}>
        <FloatingWorkoutWidget navigation={navigation} />
      </View>
    </View>
  );
}

const headerOpts = (colors) => ({
  headerShown: true,
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '900', letterSpacing: 2, fontSize: 16 },
  animation: STACK_ANIMATION,
});

export default function AppNavigator() {
  const { initialized, onboardingComplete } = useContext(AppContext);
  const colors = useTheme();

  if (!initialized) return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator color={colors.accent} size="large" />
    </View>
  );

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: STACK_ANIMATION,
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
          freezeOnBlur: true,
        }}
        initialRouteName={onboardingComplete ? 'Tabs' : 'Onboarding'}
      >
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Tabs" component={Tabs} />
        <Stack.Screen
          name="ActiveWorkout"
          component={ActiveWorkoutScreen}
          options={{ gestureEnabled: false, animation: Platform.OS === 'android' ? 'default' : 'fade' }}
        />
        <Stack.Screen name="PlanEditor" component={PlanEditorScreen} options={{ ...headerOpts(colors), title: 'EDIT PLAN' }} />
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} options={{ ...headerOpts(colors), title: 'EXERCISE LIBRARY' }} />
        <Stack.Screen name="BodyWeight" component={BodyWeightScreen} options={{ ...headerOpts(colors), title: 'BODY WEIGHT' }} />
        <Stack.Screen name="CreateExercise" component={CreateExerciseScreen} options={{ ...headerOpts(colors), title: 'CREATE EXERCISE' }} />
        <Stack.Screen name="ProgressPhotos" component={ProgressPhotosScreen} options={{ ...headerOpts(colors), title: 'PROGRESS PHOTOS' }} />
        <Stack.Screen name="ProgramPicker" component={ProgramPickerScreen} options={{ ...headerOpts(colors), title: 'PROGRAMS' }} />
        <Stack.Screen name="ExerciseProgress" component={ExerciseProgressScreen} options={{ ...headerOpts(colors), title: 'PROGRESS' }} />
        <Stack.Screen name="WorkoutCalendar" component={WorkoutCalendarScreen} options={{ ...headerOpts(colors), title: 'CALENDAR' }} />
        <Stack.Screen name="VolumeAnalytics" component={VolumeAnalyticsScreen} options={{ ...headerOpts(colors), title: 'VOLUME ANALYTICS' }} />
        <Stack.Screen name="RecoveryMap" component={RecoveryMapScreen} options={{ ...headerOpts(colors), title: 'MUSCLE RECOVERY' }} />
        <Stack.Screen name="ProgramInsights" component={ProgramInsightsScreen} options={{ ...headerOpts(colors), title: 'PROGRAM INSIGHTS' }} />
        <Stack.Screen name="BodyMeasurements" component={BodyMeasurementsScreen} options={{ ...headerOpts(colors), title: 'BODY TRACKER' }} />
        <Stack.Screen name="GymProfiles" component={GymProfilesScreen} options={{ ...headerOpts(colors), title: 'GYM PROFILES' }} />
        <Stack.Screen name="GymProfileEditor" component={GymProfileEditorScreen} options={{ ...headerOpts(colors), title: 'EDIT PROFILE' }} />
        <Stack.Screen name="BackupCenter" component={BackupCenterScreen} options={{ ...headerOpts(colors), title: 'BACKUP CENTER' }} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ ...headerOpts(colors), title: 'PRIVACY' }} />
        <Stack.Screen name="RestoreData" component={RestoreDataScreen} options={{ ...headerOpts(colors), title: 'RESTORE DATA' }} />
        <Stack.Screen name="ImportCenter" component={ImportCenterScreen} options={{ ...headerOpts(colors), title: 'IMPORT CENTER' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
