import { useEffect, useState } from 'react';
import React from 'react';
import { CheckoutSuccessPage, CheckoutCancelPage } from '../pages/CheckoutPages';

/**
 * Hook to handle checkout page routing based on window.location.pathname
 */
export function useCheckoutRouting() {
  const [checkoutPage, setCheckoutPage] = useState<'success' | 'cancel' | null>(null);

  useEffect(() => {
    const pathname = window.location.pathname;

    if (pathname === '/checkout/success') {
      setCheckoutPage('success');
    } else if (pathname === '/checkout/cancel') {
      setCheckoutPage('cancel');
    } else {
      setCheckoutPage(null);
    }
  }, []);

  if (checkoutPage === 'success') {
    return {
      isCheckoutPage: true,
      page: React.createElement(CheckoutSuccessPage, { onClose: () => (window.location.href = '/') }),
    };
  }

  if (checkoutPage === 'cancel') {
    return {
      isCheckoutPage: true,
      page: React.createElement(CheckoutCancelPage, { onClose: () => (window.location.href = '/') }),
    };
  }

  return {
    isCheckoutPage: false,
    page: null,
  };
}

export default useCheckoutRouting;
