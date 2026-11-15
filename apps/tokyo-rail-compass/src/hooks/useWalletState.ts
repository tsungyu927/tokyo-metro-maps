import { useCallback, useEffect, useState } from 'react';
import type { PaymentMethod, WalletState } from '@rail-kit/engine';

const STORAGE_KEY = 'tokyo-rail-compass:wallet:v1';

const DEFAULT_WALLET_STATE: WalletState = {
  paymentMethod: 'ic',
  enabledPassIds: [],
};

function readInitialWalletState(): WalletState {
  if (typeof window === 'undefined') return DEFAULT_WALLET_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_WALLET_STATE;
    const parsed = JSON.parse(raw) as Partial<WalletState>;
    return {
      paymentMethod: parsed.paymentMethod === 'cash' ? 'cash' : 'ic',
      enabledPassIds: Array.isArray(parsed.enabledPassIds)
        ? parsed.enabledPassIds.filter((id): id is string => typeof id === 'string')
        : [],
    };
  } catch {
    return DEFAULT_WALLET_STATE;
  }
}

/**
 * Manages persisted user transit wallet selections (payment method + active passes).
 */
export function useWalletState() {
  const [wallet, setWallet] = useState<WalletState>(readInitialWalletState);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(wallet));
    } catch {
      // Ignore storage quota or private browsing errors
    }
  }, [wallet]);

  const setPaymentMethod = useCallback((paymentMethod: PaymentMethod) => {
    setWallet((prev) => ({ ...prev, paymentMethod }));
  }, []);

  const togglePass = useCallback((passId: string) => {
    setWallet((prev) => {
      const exists = prev.enabledPassIds.includes(passId);
      return {
        ...prev,
        enabledPassIds: exists
          ? prev.enabledPassIds.filter((id) => id !== passId)
          : [...prev.enabledPassIds, passId],
      };
    });
  }, []);

  return {
    wallet,
    setPaymentMethod,
    togglePass,
  };
}

