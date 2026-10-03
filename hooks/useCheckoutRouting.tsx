import { useEffect, useState } from 'react';
import { CheckoutSuccessPage, CheckoutCancelPage } from '../pages/CheckoutPages';
import React from 'react';

type CheckoutPageType = 'success' | 'cancel' | null;

interface CheckoutRoutingResult {
  isCheckoutPage: boolean;
  shouldOpenUpgradeDialog: boolean;
  page: React.ReactNode;
}

/**
 * Hook to handle checkout page routing based on window.location.pathname
 */
export function useCheckoutRouting(): CheckoutRoutingResult {
  const [checkoutPage, setCheckoutPage] = useState<CheckoutPageType>(null);
  const [shouldOpenUpgradeDialog, setShouldOpenUpgradeDialog] = useState(false);

  useEffect(() => {
    const pathname = window.location.pathname;

    if (pathname === '/checkout/success') {
      setCheckoutPage('success');
    } else if (pathname === '/checkout/cancel') {
      setCheckoutPage('cancel');
    } else if (pathname === '/upgrade' || pathname === '/purchase') {
      setCheckoutPage(null);
      setShouldOpenUpgradeDialog(true);
    } else {
      setCheckoutPage(null);
      setShouldOpenUpgradeDialog(false);
    }
  }, []);

  if (checkoutPage === 'success') {
    return {
      isCheckoutPage: true,
      shouldOpenUpgradeDialog: false,
      page: React.createElement(CheckoutSuccessPage, { onClose: () => { window.location.href = '/'; } }),
    };
  }

  if (checkoutPage === 'cancel') {
    return {
      isCheckoutPage: true,
      shouldOpenUpgradeDialog: false,
      page: React.createElement(CheckoutCancelPage, { onClose: () => { window.location.href = '/'; } }),
    };
  }

  return {
    isCheckoutPage: false,
    shouldOpenUpgradeDialog,
    page: null,
  };
}

export default useCheckoutRouting;
