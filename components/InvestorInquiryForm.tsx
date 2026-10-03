import React, { useState, FormEvent } from 'react';
import { XMarkIcon } from './icons';
import { AgentType } from '../types';
import { useAppState } from '../contexts/AppStateContext.tsx';

interface InvestorInquiryFormProps {
  onClose: () => void;
  activeAgent: AgentType;
}

const InvestorInquiryForm: React.FC<InvestorInquiryFormProps> = ({ onClose, activeAgent }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showScrollIndicator, setShowScrollIndicator] = useState(true);
  const { addNotification } = useAppState();

  const isRawAgent = activeAgent === AgentType.RAW_CRAWLER;
  const themeColor = isRawAgent ? 'text-cyan-400' : 'text-green-400';
  const themeShadow = isRawAgent ? 'shadow-cyan-500/20' : 'shadow-green-500/20';
  const themeFocusRing = isRawAgent ? 'focus:ring-cyan-500' : 'focus:ring-green-500';
  const themeButtonBg = isRawAgent ? 'bg-cyan-600 hover:bg-cyan-700' : 'bg-green-600 hover:bg-green-700';

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) {
      addNotification({ kind: 'investor-inquiry', severity: 'error', title: 'Investor Inquiry', message: 'All fields are required.' });
      return;
    }
    setIsSubmitting(true);

    // In a real application, you would send this data to a secure backend endpoint.
    // The recipient's email (msersen@gmail.com) would be handled on the server-side,
    // never exposed in the frontend code.
    // e.g., fetch('/api/send-inquiry', { method: 'POST', body: JSON.stringify({ name, email, message }) });

    // For this demo, we'll simulate a successful submission.
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 1500);
  };

  return (
    <div 
      className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div 
        className={`bg-gray-800 border border-gray-700 rounded-lg shadow-2xl ${themeShadow} max-w-xl w-full max-h-[90vh] flex flex-col animate-modal-panel-fade-in-down`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
          <h2 className={`text-2xl font-bold ${themeColor}`}>Investor Inquiry</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 transition-colors" aria-label="Close">
            <XMarkIcon className="w-6 h-6 text-gray-400" />
          </button>
        </header>

        <main className="flex-grow p-6 text-gray-300 overflow-y-auto scrollbar-hide relative" onScroll={() => setShowScrollIndicator(false)}>
          {isSuccess ? (
            <div className="text-center">
              <h3 className="text-xl font-semibold text-green-400 mb-2">Thank You!</h3>
              <p className="text-gray-400">Your inquiry has been received. We will get back to you shortly.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-400 mb-4">
                  We are seeking strategic partners to accelerate our mission of revolutionizing the civil engineering and land surveying industries with AI. If you are interested in investment opportunities, please reach out.
              </p>
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-400 mb-1">Full Name</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:outline-none focus:ring-2 ${themeFocusRing}`}
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-400 mb-1">Email Address</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 focus:outline-none focus:ring-2 ${themeFocusRing}`}
                />
              </div>
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-400 mb-1">Message</label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className={`w-full bg-gray-700 border border-gray-600 rounded-md p-2 resize-none focus:outline-none focus:ring-2 ${themeFocusRing}`}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className={`w-full py-2.5 px-4 font-semibold text-white rounded-md transition-colors ${themeButtonBg} disabled:bg-gray-600`}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Inquiry'}
              </button>
            </form>
          )}
          
          {/* Scroll Indicator */}
          {showScrollIndicator && !isSuccess && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 animate-bounce opacity-60 pointer-events-none">
              <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default InvestorInquiryForm;