import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StudyService, type Repo } from '@spaced/core';
import { createRepo } from './createRepo';

interface Store { repo: Repo; svc: StudyService }
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, fallback }: { children: React.ReactNode; fallback: React.ReactNode }) {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    createRepo().then(setRepo, (e) => setError(String(e?.message ?? e)));
  }, []);
  const value = useMemo(() => (repo ? { repo, svc: new StudyService(repo) } : null), [repo]);
  if (error) return <>{fallback}</>;
  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
