import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Animated } from 'react-native';

const TABS = [
  { name: 'Home',      icon: '🏠', label: 'Home' },
  { name: 'Map',       icon: '🗺️', label: 'Map' },
  { name: 'Report',    icon: '📸', label: 'Report' },
  { name: 'Supplies',  icon: '📦', label: 'Supplies' },
  { name: 'Analytics', icon: '📊', label: 'Analytics' },
];

export function FloatingNavBar({ state, descriptors, navigation }) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.pill}>
        {state.routes.map((route, index) => {
          const tabInfo = TABS.find(t => t.name === route.name) || { icon: '●', label: route.name };
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={[styles.tab, isFocused && styles.tabActive]}
              onPress={onPress}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
            >
              <Text style={[styles.tabIcon, isFocused && styles.tabIconActive]}>
                {tabInfo.icon}
              </Text>
              {isFocused && (
                <Text style={styles.tabLabel}>{tabInfo.label}</Text>
              )}
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
    bottom: Platform.OS === 'ios' ? 32 : 20,
    left: 20,
    right: 20,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.97)',
    borderRadius: 40,
    paddingVertical: 6,
    paddingHorizontal: 6,
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    width: '100%',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 32,
    gap: 5,
    minHeight: 44,
  },
  tabActive: {
    flex: 2,
    backgroundColor: '#FF5B22',
    shadowColor: '#FF5B22',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  tabIcon: {
    fontSize: 18,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
    fontSize: 18,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
