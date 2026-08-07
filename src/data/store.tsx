/**
 * App-wide data context.
 *
 * Holds the two things almost every screen needs (session, tenancy) and hands
 * out the repository for everything else. Screens talk to this, never to
 * `mockRepository` directly — swapping in Supabase should touch this file and
 * nothing above it.
 *
 * `revision` is a deliberately crude cache-invalidation signal: recording a
 * payment bumps it, and any screen showing derived ledger data re-fetches.
 * A real app would reach for React Query here; a prototype does not need to.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { mockRepository, resetToSeed } from './mock/mockRepository';
import { supabaseRepository } from './supabase/supabaseRepository';
import { isSupabaseConfigured } from './supabase/client';
import type { Repository, Session, SignUpInput } from './repository';
import type { Role } from './lifecycleTypes';
import type { TenancySummary } from './types';

interface AppContextValue {
  repo: Repository;
  session: Session | null;
  tenancy: TenancySummary | null;
  /**
   * Which side of the tenancy is being shown.
   *
   * In the real app this comes from the user's membership of a tenancy. In the
   * prototype it is a lens you flip from More, so connected mode can be
   * demonstrated on one device — the landlord view is a separate persona with
   * its own properties, not this account's landlord.
   */
  role: Role;
  setRole: (role: Role) => void;
  /** True until the initial session + tenancy load settles. */
  booting: boolean;
  /** Bumped whenever ledger-affecting data changes. */
  revision: number;
  invalidate: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  refreshTenancy: () => Promise<void>;
  /** Prototype affordance — jump straight back to the seeded demo ledger. */
  useDemoData: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const repo: Repository = isSupabaseConfigured ? supabaseRepository : mockRepository;

/**
 * The chosen role outlives a reload.
 *
 * Everything else in the prototype resets to the seed on refresh, which is
 * deliberate — but being thrown back to the tenant side every time you refresh
 * the landlord view is just friction. `localStorage` only exists on web; on a
 * device this quietly does nothing, which is fine.
 */
const ROLE_KEY = 'rentloop.role';

function readStoredRole(): Role {
  try {
    return globalThis.localStorage?.getItem(ROLE_KEY) === 'landlord' ? 'landlord' : 'tenant';
  } catch {
    return 'tenant';
  }
}

function storeRole(role: Role): void {
  try {
    globalThis.localStorage?.setItem(ROLE_KEY, role);
  } catch {
    // No storage on this platform — the role just resets, which is acceptable.
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [tenancy, setTenancy] = useState<TenancySummary | null>(null);
  const [booting, setBooting] = useState(true);
  const [revision, setRevision] = useState(0);
  const [role, setRoleState] = useState<Role>(readStoredRole);

  const setRole = useCallback((next: Role) => {
    storeRole(next);
    setRoleState(next);
  }, []);

  const invalidate = useCallback(() => setRevision((n) => n + 1), []);

  const refreshTenancy = useCallback(async () => {
    setTenancy(await repo.getTenancySummary());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await repo.getSession();
      const summary = current ? await repo.getTenancySummary() : null;
      if (cancelled) return;
      setSession(current);
      setTenancy(summary);
      setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setSession(await repo.signIn(email, password));
    setTenancy(await repo.getTenancySummary());
    setRevision((n) => n + 1);
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    setSession(await repo.signUp(input));
    setTenancy(await repo.getTenancySummary());
    setRevision((n) => n + 1);
  }, []);

  const signOut = useCallback(async () => {
    await repo.signOut();
    setSession(null);
    setTenancy(null);
    setRevision((n) => n + 1);
  }, []);

  const useDemoData = useCallback(async () => {
    resetToSeed();
    setSession(await repo.getSession());
    setTenancy(await repo.getTenancySummary());
    setRevision((n) => n + 1);
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      repo,
      session,
      tenancy,
      role,
      setRole,
      booting,
      revision,
      invalidate,
      signIn,
      signUp,
      signOut,
      refreshTenancy,
      useDemoData,
    }),
    [
      session,
      tenancy,
      role,
      setRole,
      booting,
      revision,
      invalidate,
      signIn,
      signUp,
      signOut,
      refreshTenancy,
      useDemoData,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppProvider>');
  return value;
}

/**
 * Small async-load helper so screens do not each reinvent
 * loading/error/refetch. Re-runs whenever `deps` or the store revision change.
 */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: React.DependencyList,
): { data: T | null; loading: boolean; error: string | null } {
  const { revision } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, revision]);

  return { data, loading, error };
}
