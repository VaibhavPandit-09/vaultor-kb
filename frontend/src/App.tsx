import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import { EscapeManagerProvider } from './lib/escape/EscapeManagerProvider';
import { ThemeProvider } from './lib/ThemeContext';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const token = localStorage.getItem('vaultor_auth_token');
  if (!token) return <Navigate to="/auth" />;
  return <>{children}</>;
};

function App() {
  return (
    <ThemeProvider>
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
    </ThemeProvider>
  );
}

export default App;
