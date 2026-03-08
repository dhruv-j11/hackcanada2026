import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import WhyCityLens from './pages/WhyCityLens';
import MapDashboard from './pages/MapDashboard';
import VRCityView from './pages/VRCityView';
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/why" element={<WhyCityLens />} />
        <Route path="/city/waterloo" element={
          <ProtectedRoute>
            <MapDashboard />
          </ProtectedRoute>
        } />
        <Route path="/city/waterloo/vr" element={
          <ProtectedRoute>
            <VRCityView />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
}
