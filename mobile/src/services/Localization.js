import AsyncStorage from '@react-native-async-storage/async-storage';

const DICTIONARY = {
  'Assam': {
    'Report': 'প্ৰতিবেদন কৰক (Report)',
    'Supplies': 'সামগ্ৰী (Supplies)',
    'Dashboard': 'ডেশ্ববোৰ্ড (Dashboard)',
    'Home': 'মুখ্য পৃষ্ঠা (Home)',
    'Setup': 'ছেটআপ (Setup)',
    'Login': 'লগ ইন (Login)'
  },
  'Tripura': {
    'Report': 'রিপোর্ট করুন (Report)',
    'Supplies': 'সরবরাহ (Supplies)',
    'Dashboard': 'ড্যাশবোর্ড (Dashboard)',
    'Home': 'হোম (Home)',
    'Setup': 'সেটআপ (Setup)',
    'Login': 'লগইন (Login)'
  },
  'Meghalaya': {
    'Report': 'Ka Ripot (Report)',
    'Supplies': 'Ki Mar (Supplies)',
    'Dashboard': 'Dashboard',
    'Home': 'Khmat (Home)',
    'Setup': 'Pynbeit (Setup)',
    'Login': 'Pynrung (Login)'
  }
};

// Default fallback to Hindi for other states if not specifically mapped
const DEFAULT_LANG = {
  'Report': 'रिपोर्ट (Report)',
  'Supplies': 'आपूर्ति (Supplies)',
  'Dashboard': 'डैशबोर्ड (Dashboard)',
  'Home': 'होम (Home)',
  'Setup': 'सेटअप (Setup)',
  'Login': 'लॉगिन (Login)'
};

class LocalizationService {
  constructor() {
    this.currentState = null;
  }

  async loadLanguageState() {
    try {
      const data = await AsyncStorage.getItem('@jurisdiction_setup');
      if (data) {
        const parsed = JSON.parse(data);
        this.currentState = parsed.state;
      }
    } catch (e) {
      console.error('Failed to load language state', e);
    }
  }

  t(englishText) {
    if (!this.currentState) return englishText; // Fallback if no state loaded
    
    const stateDict = DICTIONARY[this.currentState] || DEFAULT_LANG;
    return stateDict[englishText] || englishText;
  }
}

export const localization = new LocalizationService();
