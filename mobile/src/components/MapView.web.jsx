import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const MapView = ({ children, style }) => (
  <View style={[style, styles.container]}>
    <Text style={styles.text}>Map is not supported on Web.</Text>
    <Text style={styles.subtext}>Please use Android Studio Emulator for the full native experience.</Text>
    {children}
  </View>
);

export const Marker = () => null;
export const Polyline = () => null;

export const PROVIDER_DEFAULT = 'default';

export default MapView;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#2A2A2A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    borderRadius: 8,
  },
  text: {
    color: '#EF4444',
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtext: {
    color: '#9CA3AF',
    textAlign: 'center',
  }
});
