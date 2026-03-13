import ReactDOM from 'react-dom/client';

import { Root } from '@/components/Root';
import { EnvUnsupported } from '@/components/EnvUnsupported';
import { init } from '@/init';

import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento #root não encontrado.');
}

const root = ReactDOM.createRoot(rootElement);

function BootScreen(message: string, error?: any) {
  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        padding: 20,
      }}
    >
      <h2>{message}</h2>

      {error ? (
        <pre
          style={{
            background: '#eee',
            padding: 10,
            marginTop: 10,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {String((error && (error.stack || error.message)) || error)}
        </pre>
      ) : null}
    </div>
  );
}

root.render(BootScreen('Inicializando Mini App...'));

async function bootstrap() {
  try {
    const { retrieveLaunchParams } = await import('@tma.js/sdk-react');

    let launchParams: any = null;

    try {
      launchParams = retrieveLaunchParams();
    } catch (e) {
      console.warn('Não foi possível obter launchParams do Telegram.', e);
    }

    const platform = launchParams?.tgWebAppPlatform;
    const debug = (launchParams?.tgWebAppStartParam || '').indexOf('debug') >= 0;

    await init({
      debug,
      eruda: false,
      mockForMacOS: platform === 'macos',
    });

    root.render(<Root />);
  } catch (e) {
    console.error('Erro no bootstrap:', e);
    root.render(<EnvUnsupported />);
  }
}

bootstrap();