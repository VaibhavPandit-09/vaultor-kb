import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import { EscapeManagerProvider } from './lib/escape/EscapeManagerProvider';
import { SettingsProvider } from './lib/settings';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('vaultor_auth_token');
  if (!token) return <Navigate to="/auth" />;
  return <>{children}</>;
};

function App() {
  return (
    <SettingsProvider>
      <EscapeManagerProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </BrowserRouter>
      </EscapeManagerProvider>
    </SettingsProvider>
  );
}

export default App;
