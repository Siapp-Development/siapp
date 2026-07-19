import { useContext } from 'react';

import { AdminAuthContext, type IAdminAuthContextValue } from './AdminAuthProvider.tsx';

/** Admin auth state + actions. Must be used inside <AdminAuthProvider>. */
export function useAdminAuth(): IAdminAuthContextValue {
  const value = useContext(AdminAuthContext);
  if (value === null) {
    throw new Error('useAdminAuth must be used inside <AdminAuthProvider>');
  }
  return value;
}
