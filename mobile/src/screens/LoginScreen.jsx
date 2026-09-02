import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

export function LoginScreen({ navigation }) {
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: 'PLACEHOLDER_ANDROID_CLIENT_ID',
    webClientId: 'PLACEHOLDER_WEB_CLIENT_ID',
    expoClientId: 'PLACEHOLDER_EXPO_CLIENT_ID',
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      fetchUserInfo(authentication.accessToken);
    }
  }, [response]);

  const fetchUserInfo = async (token) => {
    setLoading(true);
    try {
      const res = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const user = await res.json();
      await AsyncStorage.setItem('@user_profile', JSON.stringify(user));
      navigation.replace('Setup');
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  };

  const handleMockLogin = async () => {
    setLoading(true);
    const mockUser = { name: 'Demo User', email: 'demo@navner.org', picture: 'https://ui-avatars.com/api/?name=Demo+User&background=EF4444&color=fff' };
    await AsyncStorage.setItem('@user_profile', JSON.stringify(mockUser));
    
    // Simulate network delay
    setTimeout(() => {
      navigation.replace('Setup');
    }, 1000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>NavNER Field Auth</Text>
      <Text style={styles.subtitle}>Secure Access for Authorized Logistics Personnel</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#EF4444" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={styles.googleButton} 
            disabled={!request}
            onPress={() => promptAsync()}
          >
            <Text style={styles.googleButtonText}>Sign In with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.mockButton} onPress={handleMockLogin}>
            <Text style={styles.mockButtonText}>Bypass for Demo</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1C',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 50,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
  },
  googleButton: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  googleButtonText: {
    color: '#1C1C1C',
    fontWeight: 'bold',
    fontSize: 16,
  },
  mockButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#EF4444',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  mockButtonText: {
    color: '#EF4444',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
