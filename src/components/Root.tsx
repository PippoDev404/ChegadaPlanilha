import { App } from '@/components/App.tsx';
import { ErrorBoundary } from '@/components/ErrorBoundary.tsx';

function ErrorBoundaryError({ error }: { error: unknown }) {
  return (
    <div style={{ padding: 16, fontFamily: 'Arial, sans-serif' }}>
      <p>Ocorreu um erro:</p>
      <blockquote>
        <code style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {error instanceof Error
            ? error.message
            : typeof error === 'string'
            ? error
            : JSON.stringify(error)}
        </code>
      </blockquote>
    </div>
  );
}

export function Root() {
  return (
    <ErrorBoundary fallback={ErrorBoundaryError}>
      <App />
    </ErrorBoundary>
  );
}