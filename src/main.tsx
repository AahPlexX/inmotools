import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installPreloadErrorRecovery } from './lib/deployment-recovery';
import { WorkspaceProvider } from './lib/workspace-context';
import './styles.css';

installPreloadErrorRecovery();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WorkspaceProvider>
      <App />
    </WorkspaceProvider>
  </StrictMode>,
);
