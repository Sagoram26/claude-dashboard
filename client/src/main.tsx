import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

createRoot(root).render(
  <StrictMode>
    <p>Claude Dashboard</p>
  </StrictMode>
);
