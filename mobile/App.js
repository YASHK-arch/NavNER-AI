/**
 * NER Logistics Field App — Root Entry
 * Issue #36: Multi-tab navigation shell with FloatingNavBar.
 * Tabs: Map | Analytics | Report Incident
 */
import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SetupScreen } from './src/screens/SetupScreen';
import { SuppliesScreen } from './src/screens/SuppliesScreen';
import { FieldReportScreen } from './src/screens/FieldReportScreen';
import { FloatingNavBar } from './src/components/FloatingNavBar';

export default function App() {
  const [activeTab, setActiveTab] = useState('setup');

  return (
    <View style={styles.root}>
      {/* Screens — keep all mounted to preserve state */}
      <View style={[styles.screen, activeTab !== 'setup' && styles.hidden]}>
        <SetupScreen />
      </View>
      <View style={[styles.screen, activeTab !== 'report' && styles.hidden]}>
        <FieldReportScreen />
      </View>
      <View style={[styles.screen, activeTab !== 'supplies' && styles.hidden]}>
        <SuppliesScreen />
      </View>

      {/* Floating Bottom Nav Bar — rendered above all screens */}
      <FloatingNavBar activeTab={activeTab} onTabChange={setActiveTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1C1C1C',
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
  },
  hidden: {
    display: 'none',
  },
});
