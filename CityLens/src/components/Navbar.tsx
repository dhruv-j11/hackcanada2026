import { Hexagon, LogIn, LogOut, User } from 'lucide-react';
import { useAuth0 } from '@auth0/auth0-react';

export default function Navbar() {
  const { isAuthenticated, user, loginWithRedirect, logout, isLoading } = useAuth0();

  const handleLogin = () => loginWithRedirect();
  const handleSignup = () => loginWithRedirect({ authorizationParams: { screen_hint: 'signup' } });
  const handleLogout = () => logout({ logoutParams: { returnTo: window.location.origin } });

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0A1628]/80 backdrop-blur-xl border-b border-[#1E3050]">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Hexagon className="w-6 h-6 text-[#3B82F6]" />
          <span className="text-white font-bold text-[20px] tracking-tight">CityLens</span>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full border border-[#1E3050] text-[#64748B] text-xs font-medium">
            Hack Canada 2026
          </span>

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
