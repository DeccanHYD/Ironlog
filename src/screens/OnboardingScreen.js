
import React, { useContext, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  FlatList, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { ONBOARDING_TEMPLATE_ID } from '../data/programTemplates';

const { width, height } = Dimensions.get('window');

const SLIDES = [
  {
    id: 'welcome',
    icon: 'barbell-outline',
    title: 'WELCOME TO\nIRONLOG',
    body: 'The no-nonsense workout tracker built for lifters who mean business.',
    accent: true,
  },
  {
    id: 'program',
    icon: 'list-outline',
    title: 'PICK A\nPROGRAM',
    body: 'Start with the featured Full Body Beginner plan, browse by category, or build your own from scratch.',
  },
  {
    id: 'workout',
    icon: 'flash-outline',
    title: 'START\nWORKING OUT',
    body: 'Log sets with one tap, track PRs automatically, and get rest timer reminders between every set.',
  },
  {
    id: 'recovery',
    icon: 'body-outline',
    title: 'TRACK\nRECOVERY',
    body: 'See which muscles you\'ve trained this week on an interactive body map. Know when to push and when to rest.',
  },
  {
    id: 'setup',
    icon: 'shield-checkmark-outline',
    title: 'SET UP\nSMART FEATURES',
    body: 'IRONLOG 1.1.0 adds smart notifications, encrypted local backups, and optional Google Drive backup. We\'ll guide you through the setup after onboarding.',
  },
  {
    id: 'ready',
    icon: 'trophy-outline',
    title: "YOU'RE\nREADY",
    body: 'Every rep counts. Every session builds. Start your first workout and watch the progress unfold.',
    isLast: true,
  },
];

export default function OnboardingScreen({ navigation }) {
  const { completeOnboarding } = useContext(AppContext);
  const colors = useTheme();
  const flatRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const finish = async ({ openStarterProgram = false } = {}) => {
    await completeOnboarding();
    if (openStarterProgram) {
      navigation.reset({
        index: 1,
        routes: [
          { name: 'Tabs' },
          {
            name: 'ProgramPicker',
            params: {
              fromOnboarding: true,
              recommendedTemplateId: ONBOARDING_TEMPLATE_ID,
              autoOpenRecommended: true,
            },
          },
        ],
      });
      return;
    }
    navigation.replace('Tabs');
  };

  const next = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      finish();
    }
  };

  const renderSlide = ({ item, index }) => (
    <View style={[s.slide, { width }]}>
      <View style={[s.iconCircle, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
        <Ionicons name={item.icon} size={56} color={colors.accent} />
      </View>
      <Text style={[s.title, { color: colors.text }]}>{item.title}</Text>
      <Text style={[s.body, { color: colors.subtext }]}>{item.body}</Text>
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle="light-content" />

      {/* Skip button */}
      <TouchableOpacity style={s.skipBtn} onPress={finish}>
        <Text style={[s.skipText, { color: colors.muted }]}>SKIP</Text>
      </TouchableOpacity>

      {/* Slides */}
      <FlatList
        ref={flatRef}
        data={SLIDES}
        keyExtractor={item => item.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(idx);
        }}
        style={{ flex: 1 }}
      />

      {/* Dots */}
      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              s.dot,
              {
                backgroundColor: i === currentIndex ? colors.accent : colors.faint,
                width: i === currentIndex ? 20 : 6,
              },
            ]}
          />
        ))}
      </View>

      {/* CTA Button */}
      <TouchableOpacity
        style={[s.btn, { backgroundColor: colors.accent }]}
        onPress={next}
        activeOpacity={0.85}>
        <Text style={s.btnText}>
          {currentIndex === SLIDES.length - 1 ? "LET'S GO" : 'NEXT'}
        </Text>
        <Ionicons
          name={currentIndex === SLIDES.length - 1 ? 'flash' : 'arrow-forward'}
          size={18}
          color="#fff"
        />
      </TouchableOpacity>

      {currentIndex === SLIDES.length - 1 && (
        <TouchableOpacity
          style={[s.secondaryBtn, { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft }]}
          onPress={() => finish({ openStarterProgram: true })}
          activeOpacity={0.85}>
          <Text style={[s.secondaryBtnText, { color: colors.accent }]}>PICK STARTER PROGRAM</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[s.restoreBtn, { borderColor: colors.faint }]}
        onPress={() => navigation.navigate('RestoreData')}
        activeOpacity={0.85}>
        <Text style={[s.restoreBtnText, { color: colors.muted }]}>RESTORE PREVIOUS DATA</Text>
      </TouchableOpacity>

      <View style={{ height: 32 }} />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  skipBtn: { position: 'absolute', top: 52, right: 24, zIndex: 10, padding: 8 },
  skipText: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    lineHeight: 42,
    marginBottom: 20,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    fontWeight: '400',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  dot: { height: 6, borderRadius: 3 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 24,
    paddingVertical: 18,
  },
  btnText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 3 },
  secondaryBtn: {
    marginTop: 10,
    marginHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.6 },
  restoreBtn: {
    marginTop: 10,
    marginHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  restoreBtnText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4 },
});
