import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.signifikation.app',
  appName: 'Signifikation',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: '#faf9f7',
      showSpinner: false,
    },
    Browser: {
      windowScaleType: 'FitScreen',
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
