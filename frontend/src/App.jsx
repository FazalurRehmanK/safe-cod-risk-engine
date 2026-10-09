import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import StorefrontPage     from './pages/StorefrontPage';
import CartPage           from './pages/CartPage';
import CheckoutPage       from './pages/CheckoutPage';
import MyOrdersPage       from './pages/MyOrdersPage';
import LoginPage          from './pages/LoginPage';
import RegisterPage       from './pages/RegisterPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

function App() {
  return (
    <Router>
      <AuthProvider>
        <CartProvider>
          <div className="min-h-screen">
            <Navbar />
            <Routes>
              <Route path="/"         element={<StorefrontPage />} />
              <Route path="/login"    element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/cart"     element={<CartPage />} />
              <Route path="/checkout" element={
                <ProtectedRoute><CheckoutPage /></ProtectedRoute>
              } />
              <Route path="/orders"   element={
                <ProtectedRoute><MyOrdersPage /></ProtectedRoute>
              } />
              <Route path="/admin"    element={
                <ProtectedRoute role="admin"><AdminDashboardPage /></ProtectedRoute>
              } />
            </Routes>
          </div>

          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#1a1a24',
                color: '#f1f5f9',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '0.875rem',
                fontSize: '0.875rem',
                fontFamily: 'Inter, sans-serif',
              },
              success: {
                iconTheme: { primary: '#10b981', secondary: '#1a1a24' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#1a1a24' },
              },
            }}
          />
        </CartProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
