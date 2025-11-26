import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import Footer from './components/Footer';
import DashboardHub from './pages/DashboardHub';
import BacktesterPage from './pages/BacktesterPage';
import FundamentalAnalysis from './pages/FundamentalAnalysis';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
  const location = useLocation();

  if (!isLoggedIn) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

function App() {
  return (
    <div className="app-container min-h-screen bg-gray-900 text-white font-sans flex flex-col">
      <Navbar />
      <div className="flex-grow">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardHub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/backtester"
            element={
              <ProtectedRoute>
                <BacktesterPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/fundamental/:symbol"
            element={
              <ProtectedRoute>
                <FundamentalAnalysis />
              </ProtectedRoute>
            }
          />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}

export default App;
