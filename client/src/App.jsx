import { BrowserRouter, Routes, Route } from 'react-router-dom'
import GameView from './pages/GameView'
import AdminPanel from './pages/AdminPanel'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/:slug" element={<GameView />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
)

export default App
