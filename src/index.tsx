// Include Telegram UI styles first to allow our code override the package CSS.
import '@telegram-apps/telegram-ui/dist/styles.css';

import ReactDOM from 'react-dom/client';
import { retrieveLaunchParams } from '@tma.js/sdk-react';

import { Root } from '@/components/Root.tsx';
import { EnvUnsupported } from '@/components/EnvUnsupported.tsx';
import { init } from '@/init.ts';

import './index.css';

// Mock the environment in case we are outside Telegram.
import './mockEnv.ts';

const root = ReactDOM.createRoot(document.getElementById('root')!);

async function bootstrap() {
  try {
    const launchParams = retrieveLaunchParams();
    const { tgWebAppPlatform: platform } = launchParams;

    const debug =
      (launchParams.tgWebAppStartParam || '').includes('debug') ||
      import.meta.env.DEV;

    // Configure all application dependencies
    await init({
      debug,
      eruda: false,
      mockForMacOS: platform === 'macos',
    });

    root.render(<Root />);

  } catch (e) {
    root.render(<EnvUnsupported />);
  }
}

bootstrap();