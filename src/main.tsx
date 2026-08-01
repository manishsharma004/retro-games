import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { JoinPage, resolveJoinRoute } from './pages/JoinPage.tsx'

const join = resolveJoinRoute()

const root = createRoot(document.getElementById('root')!)

if (join && join.mode !== 'coop') {
  root.render(<JoinPage initialRoom={join.room} initialMode={join.mode} />)
} else {
  root.render(<App initialCoopJoin={join?.mode === 'coop' ? join.room : null} />)
}
