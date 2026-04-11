import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { AppContext } from '../context/AppContext';
import { useTheme } from '../context/ThemeContext';
import { PROGRAM_TEMPLATES, PROGRAM_TEMPLATE_CATEGORIES, resolveProgramTemplateId } from '../data/programTemplates';
import CustomAlert from '../components/CustomAlert';
import { triggerHaptic } from '../services/hapticsEngine';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const DAY_COLORS = ['#FF4500', '#0080FF', '#00C170', '#A020F0', '#FFD700', '#FF6B35', '#00BCD4'];

export default function ProgramPickerScreen({ navigation, route }) {
  const { plans, savePlans, settings } = useContext(AppContext);
  const colors = useTheme();
  const haptic = settings?.hapticFeedback !== false;
  const [confirmTemplate, setConfirmTemplate] = useState(null);
  const [activeCategory, setActiveCategory] = useState('ALL');

  const groupedTemplates = useMemo(() => {
    const grouped = {};
    PROGRAM_TEMPLATES.forEach((template) => {
      if (!grouped[template.category]) grouped[template.category] = [];
      grouped[template.category].push(template);
    });
    Object.keys(grouped).forEach((category) => grouped[category].sort((a, b) => a.sortOrder - b.sortOrder));
    return grouped;
  }, []);

  const visibleCategories = useMemo(() => {
    const available = PROGRAM_TEMPLATE_CATEGORIES.filter((category) => (groupedTemplates[category.id] || []).length > 0);
    if (activeCategory === 'ALL') return available;
    return available.filter((category) => category.id === activeCategory);
  }, [activeCategory, groupedTemplates]);

  useEffect(() => {
    const recommendedTemplateId = resolveProgramTemplateId(route?.params?.recommendedTemplateId);
    if (!recommendedTemplateId) return;
    const recommended = PROGRAM_TEMPLATES.find((template) => template.id === recommendedTemplateId);
    if (!recommended) return;
    setActiveCategory(recommended.category);
    if (route?.params?.autoOpenRecommended) setConfirmTemplate(recommended);
  }, [route?.params?.autoOpenRecommended, route?.params?.recommendedTemplateId]);

  const loadProgram = (template) => {
    triggerHaptic('selection', { enabled: haptic }).catch(() => {});
    setConfirmTemplate(template);
  };

  const confirmAdd = () => {
    const template = confirmTemplate;
    setConfirmTemplate(null);
    const newPlan = {
      id: genId(),
      name: template.name,
      templateId: template.id,
      templateMetadata: {
        progressionModel: template.progressionModel,
        deloadProtocol: template.deloadProtocol,
        effortTarget: template.effortTarget,
        blockDurationWeeks: template.blockDurationWeeks || null,
      },
      days: template.days.map((d, i) => ({
        id: genId(),
        label: `D${i + 1}`,
        name: d.name,
        tag: d.tag || '',
        color: DAY_COLORS[i % DAY_COLORS.length],
        exercises: d.exercises.map((exercise) => ({
          id: genId(),
          name: exercise.name,
          exerciseId: exercise.exerciseId,
          sets: exercise.sets,
          reps: exercise.reps,
          equipment: exercise.equipment,
          isWarmup: false,
        })),
      })),
    };
    savePlans([...plans, newPlan]);
    triggerHaptic('success', { enabled: haptic }).catch(() => {});
    navigation.goBack();
  };

  const startFromScratch = () => {
    triggerHaptic('lightConfirm', { enabled: haptic }).catch(() => {});
    navigation.goBack();
    setTimeout(() => navigation.navigate('Plans'), 100);
  };

  return (
    <ScrollView style={[s.container, { backgroundColor: colors.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 12 }}>
      <Text style={[s.subtitle, { color: colors.muted }]}>
        Choose a built-in program by category, or build your own from scratch.
      </Text>

      {!!route?.params?.fromOnboarding && (
        <View style={[s.onboardingTip, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
          <Text style={[s.onboardingTipText, { color: colors.accent }]}>
            Quick start: pick a featured beginner plan now and tune it later.
          </Text>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryRow}>
        <TouchableOpacity
          style={[s.categoryChip, { borderColor: colors.faint, backgroundColor: activeCategory === 'ALL' ? colors.accentSoft : colors.card }]}
          onPress={() => {
            if (activeCategory !== 'ALL') triggerHaptic('selection', { enabled: haptic }).catch(() => {});
            setActiveCategory('ALL');
          }}>
          <Text style={[s.categoryChipText, { color: activeCategory === 'ALL' ? colors.accent : colors.muted }]}>ALL</Text>
        </TouchableOpacity>
        {PROGRAM_TEMPLATE_CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.id}
            style={[s.categoryChip, { borderColor: colors.faint, backgroundColor: activeCategory === category.id ? colors.accentSoft : colors.card }]}
            onPress={() => {
              if (activeCategory !== category.id) triggerHaptic('selection', { enabled: haptic }).catch(() => {});
              setActiveCategory(category.id);
            }}>
            <Text style={[s.categoryChipText, { color: activeCategory === category.id ? colors.accent : colors.muted }]}>
              {category.name.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {visibleCategories.map((category) => (
        <View key={category.id} style={s.categorySection}>
          <View style={s.categoryHeader}>
            <Text style={[s.categoryTitle, { color: colors.text }]}>{category.name}</Text>
            <Text style={[s.categoryCount, { color: colors.subtext }]}>
              {(groupedTemplates[category.id] || []).length} templates
            </Text>
          </View>
          <Text style={[s.categoryDescription, { color: colors.muted }]}>{category.description}</Text>
          <View style={s.grid}>
            {(groupedTemplates[category.id] || []).map((template) => (
              <TouchableOpacity
                key={template.id}
                style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
                onPress={() => loadProgram(template)}
                activeOpacity={0.75}>
                <View style={[s.daysTag, { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder }]}>
                  <Text style={[s.daysText, { color: colors.accent }]}>{template.daysPerWeek}×/week</Text>
                </View>
                <Text style={[s.cardName, { color: colors.text }]}>{template.name}</Text>
                <Text style={[s.cardDesc, { color: colors.muted }]}>{template.description}</Text>
                <Text style={[s.cardMeta, { color: colors.subtext }]}>{template.goal}</Text>
                <Text style={[s.cardMeta, { color: colors.subtext }]}>{template.experienceLevel} · {template.days.length} days</Text>
                <Text style={[s.cardMeta, { color: colors.subtext }]}>{template.progressionModel} · {template.effortTarget}</Text>
                <View style={s.dayPills}>
                  {template.days.slice(0, 4).map((d, i) => (
                    <View key={i} style={[s.dayPill, { backgroundColor: DAY_COLORS[i % DAY_COLORS.length] + '22', borderColor: DAY_COLORS[i % DAY_COLORS.length] + '55' }]}>
                      <Text style={[s.dayPillText, { color: DAY_COLORS[i % DAY_COLORS.length] }]} numberOfLines={1}>{d.name.split(' ')[0]}</Text>
                    </View>
                  ))}
                  {template.days.length > 4 && (
                    <View style={[s.dayPill, { backgroundColor: colors.faint, borderColor: colors.faint }]}>
                      <Text style={[s.dayPillText, { color: colors.muted }]}>+{template.days.length - 4}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <TouchableOpacity style={[s.scratchBtn, { borderColor: colors.faint }]} onPress={startFromScratch}>
        <Text style={[s.scratchText, { color: colors.muted }]}>Start from Scratch</Text>
      </TouchableOpacity>

      <CustomAlert
        visible={!!confirmTemplate}
        title={confirmTemplate?.name || ''}
        message={
          confirmTemplate
            ? `${confirmTemplate.daysPerWeek} days/week · ${confirmTemplate.days.length} training days\n\n${confirmTemplate.goal}\n${confirmTemplate.description}\n\nThis will be added to your plans.`
            : ''
        }
        onDismiss={() => setConfirmTemplate(null)}
        buttons={[
          { text: 'Cancel', style: 'cancel', onPress: () => setConfirmTemplate(null) },
          { text: 'ADD PROGRAM', style: 'default', onPress: confirmAdd },
        ]}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  subtitle: { fontSize: 13, lineHeight: 20, paddingHorizontal: 4 },
  onboardingTip: { borderWidth: 1, padding: 10 },
  onboardingTipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, lineHeight: 16 },
  categoryRow: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  categoryChip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  categoryChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  categorySection: { gap: 8, marginTop: 2 },
  categoryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  categoryTitle: { fontSize: 15, fontWeight: '900', letterSpacing: 0.4 },
  categoryCount: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  categoryDescription: { fontSize: 11, lineHeight: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%', borderWidth: 1, padding: 16, gap: 6, minHeight: 190 },
  daysTag: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, marginBottom: 4 },
  daysText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  cardName: { fontSize: 16, fontWeight: '900', letterSpacing: -0.5 },
  cardDesc: { fontSize: 11, lineHeight: 15 },
  cardMeta: { fontSize: 10, letterSpacing: 0.4 },
  dayPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  dayPill: { paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, maxWidth: 60 },
  dayPillText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  scratchBtn: { borderWidth: 1, borderStyle: 'dashed', padding: 16, alignItems: 'center', marginTop: 8 },
  scratchText: { fontSize: 13, fontWeight: '600', letterSpacing: 1 },
});
