import React, { useCallback, useEffect, useState } from 'react';
import { AuthGate } from './components/AuthGate.tsx';
import { DonorPortal } from './components/DonorPortal.tsx';
import { PublicHome } from './components/PublicHome.tsx';
import { AdminLayout } from './components/admin/AdminLayout.tsx';
import { LoadingState, ToastBanner } from './components/ui/CommonUI.tsx';
import { apiFetch, clearAuthToken, setUnauthorizedHandler } from './lib/api.ts';
import type { AuthUser } from './types.ts';

type AppRoute = 'public' | 'auth' | 'register' | 'portal';

function resolveInitialRoute(): AppRoute {
  const hash = window.location.hash;
  if (hash === '#/register') return 'register';
  if (hash === '#/auth' || hash === '#/login') return 'auth';
  if (hash === '#/portal' || hash === '#/admin' || hash === '#/donor') return 'portal';
  return 'public';
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [route, setRoute] = useState<AppRoute>(resolveInitialRoute);
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const navigate = useCallback((next: AppRoute) => {
    setRoute(next);
    window.location.hash = next === 'public' ? '' : `#/${next}`;
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(resolveInitialRoute());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      navigate('auth');
      showToast('info', 'انتهت الجلسة، يرجى تسجيل الدخول');
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate, showToast]);

  useEffect(() => {
    apiFetch<{ user: AuthUser | null }>('/api/auth/me')
      .then((res) => {
        if (!res.user) clearAuthToken();
        setUser(res.user);
      })
      .catch(() => {
        clearAuthToken();
        setUser(null);
      })
      .finally(() => {
        setBooting(false);
      });
  }, []);

  const handleAuthenticated = useCallback(
    (authedUser: AuthUser) => {
      setUser(authedUser);
      navigate('portal');
      showToast('success', `مرحبًا ${authedUser.fullName} · ${authedUser.roleNameAr}`);
    },
    [navigate, showToast]
  );

  const handleLogout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Proceed cleanly even if session already expired
    }
    clearAuthToken();
    setUser(null);
    navigate('public');
    showToast('info', 'تم تسجيل الخروج بنجاح');
  }, [navigate, showToast]);

  if (booting) {
    return (
      <div className="min-h-screen bg-[#F8F9F7] flex items-center justify-center p-6">
        <div className="max-w-md w-full">
          <LoadingState label="جارٍ تحميل نظام الجمعية الخيرية بشرباص..." />
        </div>
      </div>
    );
  }

  let screen: React.ReactNode = null;

  if (route === 'portal') {
    if (!user) {
      screen = <AuthGate onAuthenticated={handleAuthenticated} onBackHome={() => navigate('public')} />;
    } else if (user.roleKey === 'donor') {
      screen = (
        <DonorPortal
          user={user}
          onLogout={handleLogout}
          onGoPublic={() => navigate('public')}
          onNotify={showToast}
          onUserUpdated={setUser}
        />
      );
    } else {
      screen = (
        <AdminLayout
          user={user}
          onLogout={handleLogout}
          onGoPublic={() => navigate('public')}
          onNotify={showToast}
          onUserUpdated={setUser}
        />
      );
    }
  } else if (route === 'auth' || route === 'register') {
    if (user) {
      screen =
        user.roleKey === 'donor' ? (
          <DonorPortal
            user={user}
            onLogout={handleLogout}
            onGoPublic={() => navigate('public')}
            onNotify={showToast}
            onUserUpdated={setUser}
          />
        ) : (
          <AdminLayout
            user={user}
            onLogout={handleLogout}
            onGoPublic={() => navigate('public')}
            onNotify={showToast}
            onUserUpdated={setUser}
          />
        );
    } else {
      screen = (
        <AuthGate
          initialMode={route === 'register' ? 'register' : 'login'}
          onAuthenticated={handleAuthenticated}
          onBackHome={() => navigate('public')}
        />
      );
    }
  } else {
    screen = (
      <PublicHome
        currentUser={user}
        onOpenAuth={() => navigate('auth')}
        onOpenRegister={() => navigate('register')}
        onEnterPortal={() => navigate(user ? 'portal' : 'auth')}
      />
    );
  }

  return (
    <>
      {screen}
      <ToastBanner toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
