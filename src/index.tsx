import ReactDOM from 'react-dom';

import { App } from './components/App';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento #root não encontrado.');
}

ReactDOM.render(<App />, rootElement);