import { LogIn, LogOut, User } from 'lucide-react';
import { useAuth0 } from '@auth0/auth0-react';
import { Link } from 'react-router-dom';

export default function Navbar() {
  const { isAuthenticated, user, loginWithRedirect, logout, isLoading } = useAuth0();

  const handleLogin = () => loginWithRedirect();
  const handleSignup = () => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } });
  const handleLogout = () => logout({ logoutParams: { returnTo: window.location.origin } });

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0041BA]/80 backdrop-blur-xl border-b border-[#04338F]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="CityLens Logo" className="h-8 object-contain" />
          </Link>
        </div>
        
        <div className="flex items-center gap-6">
          <Link to="/why" className="text-white/80 hover:text-white text-[14px] font-medium transition-colors hidden sm:block">
            Why CityLens
          </Link>

          {!isLoading && (
            isAuthenticated ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111D32] border border-[#1E3050]">
                  {user?.picture ? (
                    <img src={user.picture} alt="" className="w-5 h-5 rounded-full" />
                  ) : (
                    <User className="w-4 h-4 text-[#94A3B8]" />
                  )}
                  <span className="text-[13px] text-[#94A3B8] hidden sm:inline">{user?.name || user?.email}</span>
                </div>
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#1E3050] transition-colors text-[13px]"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[#94A3B8] hover:text-white hover:bg-[#1E3050] transition-colors text-[13px]"
                >
                  <LogIn className="w-4 h-4" />
                  Login
                </button>
                <button 
                  onClick={handleSignup}
                  className="px-4 py-1.5 rounded-lg bg-[#3B82F6] hover:bg-blue-500 text-white text-[13px] font-medium transition-colors"
                >
                  Sign Up
                </button>
              </div>
            )
          )}
        </div>
      </div>
    </nav>
  );
}
