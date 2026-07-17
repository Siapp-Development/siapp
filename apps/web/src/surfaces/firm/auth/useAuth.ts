import { useContext } from 'react';

import { AuthContext, type IAuthContextValue } from './AuthProvider.tsx';

/** Auth state + sign-out for the firm dashboard. Must be under <AuthProvider>. */
export function useAuth(): IAuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return value;
}
