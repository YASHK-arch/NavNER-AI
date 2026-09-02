import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, { useSharedValue, useAnimatedProps, withTiming, withRepeat, Easing, withSequence, withDelay } from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function SplashScreen({ navigation }) {
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
    
    // Check auth status after 2.5 seconds
    const checkAuth = async () => {
      try {
        const user = await AsyncStorage.getItem('@user_profile');
        const jurisdiction = await AsyncStorage.getItem('@jurisdiction_setup');
        
        opacity.value = withTiming(0, { duration: 500 });
        
        setTimeout(() => {
          if (!user) {
            navigation.replace('Login');
          } else if (!jurisdiction) {
            navigation.replace('Setup');
          } else {
            navigation.replace('MainTabs');
          }
        }, 500);
      } catch (e) {
        navigation.replace('Login');
      }
    };

    setTimeout(checkAuth, 2500);
  }, []);

  const animatedProps = useAnimatedProps(() => {
    return {
      strokeDashoffset: 100 * (1 - progress.value),
    };
  });

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <Svg height="150" width="150" viewBox="0 0 100 100">
        <Circle cx="50" cy="50" r="45" stroke="#333" strokeWidth="4" fill="none" />
        <AnimatedPath
          animatedProps={animatedProps}
          d="M30 70 L30 30 L70 70 L70 30"
          fill="none"
          stroke="#EF4444"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="100"
        />
        <AnimatedCircle
          cx="50"
          cy="50"
          r="45"
          stroke="#EF4444"
          strokeWidth="4"
          fill="none"
          strokeDasharray="283"
          animatedProps={useAnimatedProps(() => ({
            strokeDashoffset: 283 * (1 - progress.value)
          }))}
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1C',
    justifyContent: 'center',
    alignItems: 'center',
  }
});
