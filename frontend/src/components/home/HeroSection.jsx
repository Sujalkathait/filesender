import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Download, ArrowRight, ShieldCheck } from 'lucide-react';

/**
 * Hero Section Component
 * Primary Responsibility: Simple, production-grade landing hero with 2 primary actions.
 */
export const HeroSection = memo(function HeroSection() {
  return (
    <section className="hero" aria-label="Hero">
      <div className="hero-badge-container">
        <div className="hero-pill">
          <ShieldCheck size={14} /> Zero-Knowledge &bull; AES-256-GCM
        </div>
      </div>
      <h1 className="hero-title">
        Send Files Safely.
      </h1>
      <p className="hero-subtitle">
        Secure file sharing with simple, browser-based encryption.
      </p>

      <div className="cta-buttons">
        <Link to="/upload" className="btn btn-primary btn-lg">
          <Upload size={18} /> Send Files <ArrowRight size={16} />
        </Link>
        <Link to="/download" className="btn btn-secondary btn-lg">
          <Download size={18} /> Receive Files
        </Link>
      </div>
    </section>
  );
});

