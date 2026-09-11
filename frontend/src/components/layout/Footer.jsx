import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import { Zap, Upload, Download, BookOpen, Layers, HelpCircle } from 'lucide-react';
import brandLogo from '../../image/icons.png';

/**
 * App Footer Component
 * Primary Responsibility: Display footer brand, slogan, and sitemap anchor navigation links.
 */
export const Footer = memo(function Footer({ onScrollToSection }) {
  return (
    <footer className="footer" aria-label="Footer">
      <div className="footer-container">
        <div className="footer-brand">
          <div className="footer-logo">
            <img src={brandLogo} alt="FileShare Logo" className="footer-logo-img" />
            <span>FileShare</span>
          </div>
          <p className="footer-quote-text">
            FileShare &mdash; Secure, simple file sharing.
          </p>
        </div>
        <div className="footer-links">
          <Link to="/"><Zap size={13} /> Home</Link>
          <Link to="/upload"><Upload size={13} /> Send Files</Link>
          <Link to="/download"><Download size={13} /> Receive Files</Link>
          <Link to="/#how-to-use" onClick={(e) => onScrollToSection(e, 'how-to-use')}>
            <BookOpen size={13} /> How to Use
          </Link>
          <Link to="/#faq" onClick={(e) => onScrollToSection(e, 'faq')}>
            <HelpCircle size={13} /> FAQ
          </Link>
        </div>
      </div>
      <div className="footer-credits">
        Built by Sujal Kathait
      </div>
    </footer>
  );
});
