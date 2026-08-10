import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.signifikation.app',
  appName: 'Signifikation',
  webDir: 'dist',
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
  ios: {
    contentInset: 'never',
    backgroundColor: '#faf9f7',
  },
  android: {
    backgroundColor: '#faf9f7',
    allowMixedContent: false,
  },
};

export default config;
