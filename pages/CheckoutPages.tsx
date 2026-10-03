import React, { useEffect, useState } from 'react';
import './CheckoutPages.css';

interface CheckoutSuccessPageProps {
  onClose?: () => void;
}

const CheckoutBrand: React.FC = () => (
  <header className="checkout-brand" aria-label="LandSurv.ai">
    <div className="checkout-wordmark">
      Land<span className="brand-surv">Surv</span><span className="brand-ai">.ai</span><sup>™</sup>
    </div>
    <p>AI-powered land surveying &amp; civil engineering</p>
  </header>
);

const SERVICE_LABELS: Record<string, string> = {
  '1M': '1 month of service access',
  '3M': '3 months of service access',
  '6M': '6 months of service access',
  '1Y': '1 year of service access',
};

const COMPUTE_LABELS: Record<string, string> = {
  '1K': '2,250 hosted compute units',
  '5K': '4,500 hosted compute units',
  '10K': '6,750 hosted compute units',
};

export function getCheckoutSuccessContent(search: string) {
  const params = new URLSearchParams(search);
  const purchaseType = params.get('type');
  const service = SERVICE_LABELS[params.get('service') || ''] || 'Service access';
  const compute = COMPUTE_LABELS[params.get('credits') || ''] || 'Hosted compute credits';

  if (purchaseType === 'bundle') {
    return {
      message: 'Thank you! Your service access and hosted compute are being added to your account.',
      purchases: [service, compute],
      nextSteps: [
        'Check your email for your Enabling Key and purchase summary',
        'Enter your Enabling Key in the Service Access tab',
        'Your hosted compute balance will update automatically',
      ],
    };
  }

  if (purchaseType === 'service') {
    return {
      message: 'Thank you! Your service access is being activated.',
      purchases: [service],
      nextSteps: [
        'Check your email for your Enabling Key and purchase summary',
        'Enter your Enabling Key in the Service Access tab',
        'Use your own Google key or add hosted compute whenever you need it',
      ],
    };
  }

  return {
    message: 'Thank you! Your hosted compute is being added to your account.',
    purchases: [compute],
    nextSteps: [
      'Your hosted compute balance will update automatically',
      'Open the usage dashboard to view your updated balance',
      'You can add service access separately at any time',
    ],
  };
}

type CheckoutStatus = 'paid' | 'processing' | 'fulfilled' | 'failed';

export function getCheckoutStatusPresentation(status: CheckoutStatus) {
  if (status === 'fulfilled') {
    return {
      title: 'Purchase Confirmed',
      message: 'Payment and account fulfillment are complete.',
      icon: '✓',
    };
  }
  if (status === 'failed') {
    return {
      title: 'Fulfillment Needs Review',
      message: 'Your payment status needs manual review. No additional purchase is needed right now.',
      icon: '!',
    };
  }
  return {
    title: status === 'paid' ? 'Payment Received' : 'Finalizing Purchase',
    message: 'Stripe is confirming payment and LandSurv is applying your purchase.',
    icon: '…',
  };
}

export const CheckoutSuccessPage: React.FC<CheckoutSuccessPageProps> = ({ onClose }) => {
  const content = getCheckoutSuccessContent(window.location.search);
  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  const [status, setStatus] = useState<CheckoutStatus>('processing');
  const [statusUnavailable, setStatusUnavailable] = useState(!sessionId);
  const returnToApp = () => onClose ? onClose() : (window.location.href = '/');

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/billing/checkout-status?session_id=${encodeURIComponent(sessionId)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json() as { status?: CheckoutStatus };
        if (cancelled) return;
        if (result.status === 'fulfilled' || result.status === 'failed') {
          setStatus(result.status);
          setStatusUnavailable(false);
          return;
        }
        setStatus(result.status === 'paid' ? 'paid' : 'processing');
        setStatusUnavailable(false);
      } catch {
        if (!cancelled) setStatusUnavailable(true);
      }

      attempt += 1;
      if (!cancelled && attempt < 10) timeoutId = setTimeout(poll, 2000);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [sessionId]);

  const presentation = getCheckoutStatusPresentation(status);

  return (
    <div className="checkout-page success">
      <div className="checkout-container">
        <CheckoutBrand />
        <div className="success-icon">{presentation.icon}</div>
        <h1>{presentation.title}</h1>
        <p className="success-message">{status === 'fulfilled' ? content.message : presentation.message}</p>

        <div className="details">
          <h3>Your Purchase</h3>
          <ul className="purchase-summary">
            {content.purchases.map((purchase) => <li key={purchase}>{purchase}</li>)}
          </ul>
          <h3 className="next-steps-heading">What Happens Next</h3>
          <ul>
            {content.nextSteps.map((step) => <li key={step}>{step}</li>)}
          </ul>
        </div>

        <p className="checkout-note">
          {status === 'fulfilled'
            ? 'A detailed confirmation has also been sent to your email.'
            : statusUnavailable
              ? `Status is temporarily unavailable. Keep this support reference: ${sessionId || 'missing-session-reference'}`
              : `This page updates automatically. Support reference: ${sessionId}`}
        </p>
        <button className="btn-primary" onClick={returnToApp}>
          Return to LandSurv.ai
        </button>
      </div>
    </div>
  );
};

interface CheckoutCancelPageProps {
  onClose?: () => void;
}

export const CheckoutCancelPage: React.FC<CheckoutCancelPageProps> = ({ onClose }) => {
  return (
    <div className="checkout-page cancel">
      <div className="checkout-container">
        <CheckoutBrand />
        <div className="cancel-icon">↩</div>
        <h1>Payment Canceled</h1>
        <p className="cancel-message">
          Your payment was not processed. You can try again or contact support if you have any
          questions.
        </p>

        <div className="details">
          <h3>What Happened?</h3>
          <ul>
            <li>• Your payment was canceled</li>
            <li>• No charges were made to your account</li>
            <li>• You can try again anytime</li>
          </ul>
        </div>

        <div className="help-section">
          <h3>Need Help?</h3>
          <p>If you encountered any issues during checkout, please:</p>
          <ul>
            <li>Check your internet connection</li>
            <li>Verify your card information</li>
            <li>Try a different payment method</li>
            <li>Contact our support team</li>
          </ul>
        </div>

        <div className="buttons">
          <button className="btn-secondary" onClick={() => (window.location.href = '/')}>
            Back to App
          </button>
          <button className="btn-primary" onClick={() => (window.location.href = '/upgrade')}>
            Try Again
          </button>
        </div>
      </div>
    </div>
  );
};

export default { CheckoutSuccessPage, CheckoutCancelPage };
