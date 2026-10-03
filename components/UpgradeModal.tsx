import React, { useState } from 'react';
import { useAppState } from '../contexts/AppStateContext.tsx';
import './UpgradeModal.css';

interface UpgradePlan {
  id: string;
  name: string;
  description: string;
  price: number;
  period: 'month' | 'lifetime';
  features: string[];
  priceId: string;
  recommended?: boolean;
}

const PLANS: UpgradePlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    description: 'Perfect for getting started',
    price: 9.99,
    period: 'month',
    priceId: 'price_basic_monthly', // Will be set from environment
    features: [
      'Unlimited surveys',
      'Email support',
      'Basic data export',
      'Mobile access',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For professionals',
    price: 24.99,
    period: 'month',
    priceId: 'price_pro_monthly', // Will be set from environment
    recommended: true,
    features: [
      'Everything in Basic',
      'Priority support',
      'Advanced analytics',
      'API access',
      'Team collaboration',
      'Custom integrations',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For organizations',
    price: 99.99,
    period: 'month',
    priceId: 'price_enterprise_monthly', // Will be set from environment
    features: [
      'Everything in Pro',
      '24/7 phone support',
      'Dedicated account manager',
      'Custom training',
      'SLA guarantee',
      'On-premise option',
    ],
  },
];

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userEmail?: string;
  backendUrl: string;
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  userId,
  userEmail,
  backendUrl,
}) => {
  const [selectedPlan, setSelectedPlan] = useState<string>('pro');
  const [isLoading, setIsLoading] = useState(false);
  const { addNotification } = useAppState();

  const handleSelectPlan = (planId: string) => {
    setSelectedPlan(planId);
  };

  const handleUpgradeClick = async () => {
    const plan = PLANS.find((p) => p.id === selectedPlan);
    if (!plan || !plan.priceId) {
      addNotification({ kind: 'upgrade', severity: 'error', title: 'Upgrade', message: 'Please select a valid plan' });
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': userId,
          'x-user-email': userEmail || '',
        },
        body: JSON.stringify({
          priceId: plan.priceId,
          successUrl: `${window.location.origin}/checkout/success`,
          cancelUrl: `${window.location.origin}/checkout/cancel`,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create checkout session');
      }

      const { url } = await response.json();
      window.location.href = url;
    } catch (err: any) {
      console.error('Error upgrading:', err);
      addNotification({ kind: 'upgrade', severity: 'error', title: 'Upgrade', message: err.message || 'Failed to process upgrade. Please try again.' });
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="upgrade-modal-overlay">
      <div className="upgrade-modal">
        <div className="upgrade-modal-header">
          <h2>Upgrade to Unlock More Features</h2>
          <button className="close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <p className="upgrade-modal-subtitle">
          Choose the plan that's right for you. Upgrade anytime, cancel anytime.
        </p>

        <div className="upgrade-plans">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={`plan-card ${selectedPlan === plan.id ? 'selected' : ''} ${
                plan.recommended ? 'recommended' : ''
              }`}
              onClick={() => handleSelectPlan(plan.id)}
            >
              {plan.recommended && <div className="recommended-badge">Recommended</div>}

              <div className="plan-header">
                <h3>{plan.name}</h3>
                <p className="plan-description">{plan.description}</p>
              </div>

              <div className="plan-pricing">
                <span className="price">${plan.price}</span>
                <span className="period">/{plan.period === 'month' ? 'month' : 'lifetime'}</span>
              </div>

              <ul className="plan-features">
                {plan.features.map((feature, idx) => (
                  <li key={idx}>
                    <span className="checkmark">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                className={`select-btn ${selectedPlan === plan.id ? 'active' : ''}`}
                onClick={() => handleSelectPlan(plan.id)}
              >
                {selectedPlan === plan.id ? 'Selected' : 'Select'}
              </button>
            </div>
          ))}
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="upgrade-modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleUpgradeClick}
            disabled={isLoading || !selectedPlan}
          >
            {isLoading ? 'Processing...' : 'Continue to Checkout'}
          </button>
        </div>

        <p className="upgrade-modal-footer">
          Secure payment powered by <strong>Stripe</strong>. Your payment information is never stored
          on our servers.
        </p>
      </div>
    </div>
  );
};

export default UpgradeModal;
