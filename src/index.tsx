import ReactDOM from 'react-dom/client';

import { Root } from '@/components/Root';
import { EnvUnsupported } from '@/components/EnvUnsupported';
import { init } from '@/init';

import './index.css';

// render imediato para evitar tela branca
const root = ReactDOM.createRoot(
  document.getElementById('root')!
);

function BootScreen(message: string, error?: any) {
  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        padding: 20
      }}
    >
      <h2>{message}</h2>

      {error && (
        <pre
          style={{
            background: '#eee',
            padding: 10,
            marginTop: 10
          }}
        >
          {String(error)}
        </pre>
      )}
    </div>
  );
}

root.render(BootScreen('Inicializando Mini App...'));

async function bootstrap() {
  try {
    const { retrieveLaunchParams } = await import('@tma.js/sdk-react');

    let launchParams: any;

    try {
      launchParams = retrieveLaunchParams();
    } catch (e) {
      console.warn('Não está dentro do Telegram');
    }

    const platform = launchParams?.tgWebAppPlatform;

    const debug =
      (launchParams?.tgWebAppStartParam || '').includes('debug');

    await init({
      debug,
      eruda: false,
      mockForMacOS: platform === 'macos'
    });

    root.render(<Root />);

  } catch (e) {
    console.error(e);

    root.render(
      <EnvUnsupported />
    );
  }
}

bootstrap();