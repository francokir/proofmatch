import './integration/browser-runtime';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { configuredProofMatchUi } from './integration/browser';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={configuredProofMatchUi?.api} contractAddress={configuredProofMatchUi?.contractAddress} />
  </StrictMode>,
);
