/**
 * Pill-shaped floating bottom navigation bar.
 * Three tabs: Map | Analytics | Report Incident.
 * Orange active accent, dark glassmorphism card.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';

const TABS = [
  { key: 'setup', icon: '⚙️', label: 'Setup' },
  { key: 'report', icon: '📸', label: 'Report' },
  { key: 'supplies', icon: '📦', label: 'Supplies' },
];

export function FloatingNavBar({ activeTab, onTabChange }) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.pill}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabChange(tab.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: isActive }}
            >
              <Text style={styles.tabIcon}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    left: 24,
    right: 24,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: 'rgba(28, 28, 28, 0.96)',
    borderRadius: 40,
    paddingVertical: 8,
    paddingHorizontal: 8,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    width: '100%',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 32,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#FF5B22',
    shadowColor: '#FF5B22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  tabIcon: {
    fontSize: 16,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
});
