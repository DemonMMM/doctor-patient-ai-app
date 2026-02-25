import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mediflow.app',
  appName: 'mediflow',
  webDir: 'public',
  server: {
    cleartext: true
  }
};

export default config;
