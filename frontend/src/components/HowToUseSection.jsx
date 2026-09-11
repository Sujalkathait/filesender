import React, { useState, useCallback, memo } from 'react';
import {
  ShieldCheck, Zap, Flame, Radio,
  ChevronDown, ChevronUp, FileUp, QrCode, DownloadCloud
} from 'lucide-react';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'End-to-End Encryption',
    desc: 'Files are encrypted in your browser using AES-256-GCM. Secret decryption keys never touch our servers.'
  },
  {
    icon: Zap,
    title: 'Fast & High Capacity',
    desc: 'Transfer up to 20 files and up to 1 GB total per session with an instant 6-digit code or QR code.'
  },
  {
    icon: Flame,
    title: 'Burn After Read',
    desc: 'Files permanently self-destruct from server storage immediately after download or upon timer expiration.'
  },
  {
    icon: Radio,
    title: 'Direct P2P Streaming',
    desc: 'Stream directly device-to-device via WebRTC data channels with zero intermediate cloud storage.'
  }
];

const HOW_IT_WORKS_STEPS = [
  {
    step: '1',
    icon: FileUp,
    title: 'Select Files',
    desc: 'Choose up to 20 files. Your browser automatically encrypts them locally with AES-256-GCM.'
  },
  {
    step: '2',
    icon: QrCode,
    title: 'Share Code or QR',
    desc: 'Receive an instant 6-digit transfer code and dynamic QR code to share securely with your recipient.'
  },
  {
    step: '3',
    icon: DownloadCloud,
    title: 'Receive & Decrypt',
    desc: 'The recipient enters the code to decrypt and download files directly in their browser.'
  }
];

const MINIMAL_FAQS = [
  {
    q: 'Is my file transfer really private?',
    a: 'Yes. Encryption and decryption occur entirely inside your browser using AES-256-GCM. The secret decryption key is stored only in your local session and is never sent to our servers.'
  },
  {
    q: 'How does Burn After Read work?',
    a: 'Once your recipient successfully downloads the file, it is automatically and permanently erased from the server. Previews do not trigger deletion, so files can be checked safely first.'
  },
  {
    q: 'What are the file size and transfer limits?',
    a: 'You can share up to 20 files and up to 1 GB total per transfer session, with customizable expiration countdowns between 15 seconds and 3 minutes.'
  },
  {
    q: 'Do I or the recipient need an account?',
    a: 'No. FileShare requires zero registration, zero accounts, and zero app installations. Transfers work entirely in any standard modern web browser.'
  }
];

/**
 * Features Grid Subcomponent (4 core features)
 */
const FeaturesSection = memo(function FeaturesSection() {
  return (
    <section id="features" className="features-section" aria-label="Key Features">
      <div className="section-header">
        <span className="section-tag">SECURITY &amp; PERFORMANCE</span>
        <h2 className="section-title">Built for Secure Sharing</h2>
        <p className="section-subtitle">
          Engineered for privacy, speed, and zero server knowledge.
        </p>
      </div>

      <div className="features-grid">
        {FEATURES.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="feature-card">
              <div className="feature-icon">
                <Icon size={20} />
              </div>
              <h3 className="feature-title">{item.title}</h3>
              <p className="feature-desc">{item.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
});

/**
 * How It Works Subcomponent (3 simple steps)
 */
const HowItWorksSection = memo(function HowItWorksSection() {
  return (
    <section id="how-to-use" className="how-it-works-section" aria-label="How It Works">
      <div className="section-header">
        <span className="section-tag">SIMPLE PROCESS</span>
        <h2 className="section-title">How It Works</h2>
        <p className="section-subtitle">
          Three simple steps from file selection to encrypted transfer.
        </p>
      </div>

      <div className="how-steps-grid">
        {HOW_IT_WORKS_STEPS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.step} className="how-step-card">
              <div className="how-step-header">
                <span className="how-step-badge">Step {item.step}</span>
                <div className="how-step-icon">
                  <Icon size={18} />
                </div>
              </div>
              <h3 className="how-step-title">{item.title}</h3>
              <p className="how-step-desc">{item.desc}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
});

/**
 * Minimal FAQ Accordion Subcomponent (4 questions)
 */
const FaqSection = memo(function FaqSection({ expandedIndex, onToggleFaq }) {
  return (
    <section id="faq" className="faq-section" aria-label="Frequently Asked Questions">
      <div className="section-header">
        <span className="section-tag">COMMON QUESTIONS</span>
        <h2 className="section-title">Frequently Asked Questions</h2>
        <p className="section-subtitle">
          Quick answers to help you understand zero-knowledge security.
        </p>
      </div>

      <div className="faq-accordion-list">
        {MINIMAL_FAQS.map((faq, index) => {
          const isExpanded = expandedIndex === index;
          return (
            <div
              key={index}
              className={`faq-item ${isExpanded ? 'expanded' : ''}`}
            >
              <button
                className="faq-question-btn"
                onClick={() => onToggleFaq(index)}
                aria-expanded={isExpanded}
              >
                <span className="faq-question-text">{faq.q}</span>
                <div className="faq-toggle-icon">
                  {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </div>
              </button>
              {isExpanded && (
                <div className="faq-answer-pane animate-in">
                  <p>{faq.a}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
});

/**
 * Main HowToUseSection orchestrator component
 * Clean, compact, production-grade guide
 */
export function HowToUseSection() {
  const [expandedFaq, setExpandedFaq] = useState(null);

  const handleToggleFaq = useCallback((index) => {
    setExpandedFaq((prev) => (prev === index ? null : index));
  }, []);

  return (
    <div className="how-to-use-wrapper">
      <FeaturesSection />
      <HowItWorksSection />
      <FaqSection expandedIndex={expandedFaq} onToggleFaq={handleToggleFaq} />
    </div>
  );
}

export default HowToUseSection;

