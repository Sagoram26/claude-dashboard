import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Session } from './screens/Session.tsx';
import './tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

createRoot(root).render(
  <StrictMode>
    <Session />
  </StrictMode>
);
