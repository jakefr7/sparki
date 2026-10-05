'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { SparkiLogo } from '../sparki-logo';
import s from './public-header.module.css';

const SECTIONS = [['product', 'How it works'], ['solutions', 'Solutions']] as const;

// The one header row for every public page, so the pages cannot drift apart.
// The landing page links to its own sections in place; other pages link back
// to them. A page that starts signup itself passes onGetStarted instead of
// sending the visitor to /pricing.
export function PublicHeader({ landing = false, onGetStarted }: { landing?: boolean; onGetStarted?: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
  }, []);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuToggle.current?.focus();
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);
  const closeMenu = () => setMenuOpen(false);
  const getStarted = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onGetStarted) return;
    event.preventDefault();
    onGetStarted();
  };
  return <header className={`${s.header} ${scrolled ? s.headerScrolled : ''}`}>
    <div className={s.headerInner}>
      <Link href={landing ? '#top' : '/'} className={s.brand} aria-label="Sparki home"><SparkiLogo kind="mark" /><SparkiLogo kind="wordmark" /></Link>
      <nav className={`${s.nav} ${menuOpen ? s.navOpen : ''}`} id="public-navigation" aria-label="Main navigation">
        {SECTIONS.map(([id, label]) => landing
          ? <a key={id} href={`#${id}`} onClick={closeMenu}>{label}</a>
          : <Link key={id} href={`/#${id}`} onClick={closeMenu}>{label}</Link>)}
        <Link href="/pricing" onClick={closeMenu}>Pricing</Link>
      </nav>
      <div className={s.headerActions}>
        <Link href="/login" className={s.signIn}>Sign In</Link>
        <Link href="/pricing" className={s.buttonSmall} onClick={getStarted}>Get Started <span aria-hidden="true">↗</span></Link>
        <button ref={menuToggle} type="button" className={s.menuToggle} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-controls="public-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? '×' : '☰'}</button>
      </div>
    </div>
  </header>;
}
