import { Routes, Route } from 'react-router-dom'
import MainLayout from './components/Layout/MainLayout'
import Home from './pages/Home'
import Counter from './pages/Counter'
import Weather from './pages/Weather'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/counter" element={<Counter />} />
        <Route path="/weather" element={<Weather />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
