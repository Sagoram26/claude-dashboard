import { useState } from 'react';
import { HomeScreen } from './screens/HomeScreen.tsx';
import { Session } from './screens/Session.tsx';

export function App() {
  const [screen, setScreen] = useState<'home' | 'session'>('home');

  if (screen === 'session') return <Session />;

  // Naviguer suffit : l'architecture v1 n'a qu'un gestionnaire de session, déjà lié au cwd du
  // serveur. Seule la session que ce serveur a réellement en mémoire est `resumable` (voir
  // server/index.ts) ; HomeScreen n'appelle onOpen que pour celle-là, donc cwd/sessionId n'ont
  // pas besoin d'être transmis plus loin ici.
  return <HomeScreen onOpen={() => setScreen('session')} />;
}
