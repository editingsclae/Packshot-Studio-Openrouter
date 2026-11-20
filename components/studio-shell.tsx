'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { loadHistory, loadSettings } from '@/lib/db';
import { TopBar, type StudioTab } from '@/components/top-bar';

export interface StudioShellHandlers {
  onTabChange?: (tab: StudioTab) => void;
  onToggleTheme?: () => void;
  onOpenCommandPalette?: () => void;
}

interface StudioChromeState {
  activeTab: StudioTab;
  theme: 'dark' | 'light';
  libraryCount: number;
}

interface StudioShellContextValue {
  syncChrome: (next: StudioChromeState) => void;
  registerHandlers: (handlers: StudioShellHandlers) => () => void;
}

const StudioShellContext = createContext<StudioShellContextValue | null>(null);

export function useStudioShell(): StudioShellContextValue | null {
  return useContext(StudioShellContext);
}

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const initialTab: StudioTab = pathname === '/usage' ? 'usage' : 'generate';

  const [chrome, setChrome] = useState<StudioChromeState>({
    activeTab: initialTab,
    theme: 'dark',
    libraryCount: 0,
  });

  const handlersRef = useRef<StudioShellHandlers>({});
  const hasAppSyncedRef = useRef(false);

  // Pre-hydrate theme and library count once at layout mount so navigation never flashes
  useEffect(() => {
    let active = true;
    (async () => {
      const [settings, history] = await Promise.all([
        loadSettings(),
        loadHistory(),
      ]);
      if (!active || hasAppSyncedRef.current) return;
      const count = history.reduce((sum, r) => sum + r.images.length, 0);
      setChrome((prev) => ({
        ...prev,
        theme: settings.theme,
        libraryCount: count,
      }));
    })();
    return () => {
      active = false;
    };
  }, []);

  const syncChrome = useCallback((next: StudioChromeState) => {
    hasAppSyncedRef.current = true;
    setChrome((prev) => {
      if (
        prev.activeTab === next.activeTab &&
        prev.theme === next.theme &&
        prev.libraryCount === next.libraryCount
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const registerHandlers = useCallback((handlers: StudioShellHandlers) => {
    handlersRef.current = handlers;
    return () => {
      if (handlersRef.current === handlers) {
        handlersRef.current = {};
      }
    };
  }, []);

  const handleTabChange = useCallback(
    (tab: StudioTab) => {
      setChrome((prev) =>
        prev.activeTab === tab ? prev : { ...prev, activeTab: tab }
      );
      if (handlersRef.current.onTabChange) {
        handlersRef.current.onTabChange(tab);
        return;
      }
      const targetPath = tab === 'usage' ? '/usage' : '/';
      if (pathname !== targetPath) {
        router.push(targetPath);
      }
    },
    [pathname, router]
  );

  const handleToggleTheme = useCallback(() => {
    if (handlersRef.current.onToggleTheme) {
      handlersRef.current.onToggleTheme();
      return;
    }
    setChrome((prev) => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark',
    }));
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    handlersRef.current.onOpenCommandPalette?.();
  }, []);

  const contextValue = useMemo<StudioShellContextValue>(
    () => ({ syncChrome, registerHandlers }),
    [syncChrome, registerHandlers]
  );

  return (
    <StudioShellContext.Provider value={contextValue}>
      <div className="min-h-screen flex flex-col bg-[var(--background)] text-[var(--foreground)]">
        <TopBar
          activeTab={chrome.activeTab}
          onTabChange={handleTabChange}
          theme={chrome.theme}
          onToggleTheme={handleToggleTheme}
          onOpenCommandPalette={handleOpenCommandPalette}
          libraryCount={chrome.libraryCount}
        />
        <main className="flex-1">{children}</main>
      </div>
    </StudioShellContext.Provider>
  );
}
