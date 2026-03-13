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

type BootScreenProps = {
  message: string;
  error?: any;
};

function BootScreen(props: BootScreenProps) {
  return (
    <div
      style={{
        fontFamily: 'Arial, sans-serif',
        padding: 20,
      }}
    >
      <h2>{props.message}</h2>

      {props.error ? (
        <pre
          style={{
            background: '#eee',
            padding: 10,
            marginTop: 10,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {String((props.error && (props.error.stack || props.error.message)) || props.error)}
        </pre>
      ) : null}
    </div>
  );
}

root.render(<BootScreen message="Passo 1: index carregou" />);

async function bootstrap() {
  try {
    root.render(<BootScreen message="Passo 2: importando sdk..." />);

    const sdk = await import('@tma.js/sdk-react');

    root.render(<BootScreen message="Passo 3: lendo launch params..." />);

    let launchParams: any = null;

    try {
      launchParams = sdk.retrieveLaunchParams();
    } catch (e) {
      console.warn('Falha ao ler launch params', e);
    }

    root.render(<BootScreen message="Passo 4: rodando init..." />);

    const platform = launchParams?.tgWebAppPlatform;
    const debug = (launchParams?.tgWebAppStartParam || '').indexOf('debug') >= 0;

    await init({
      debug,
      eruda: false,
      mockForMacOS: platform === 'macos',
    });

    root.render(<BootScreen message="Passo 5: renderizando Root..." />);

    root.render(<Root />);
  } catch (e) {
    console.error('Erro real do bootstrap:', e);
    root.render(<BootScreen message="Erro no bootstrap" error={e} />);
  }
}

bootstrap().catch(function (e) {
  console.error('Erro fatal no bootstrap:', e);
  root.render(<EnvUnsupported />);
});