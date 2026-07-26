import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// No React StrictMode: it remounts effects in dev, which exits the running
// Nostalgist/RetroArch WASM instance after launch (pending already cleared) and
// leaves a black canvas plus memory-access OOB from a half-torn-down core.
createRoot(document.getElementById('root')!).render(<App />)
