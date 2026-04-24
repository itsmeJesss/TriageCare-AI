import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Menu, X, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../lib/LanguageContext';
import { languages, Language } from '../lib/translations';

export default function Navbar() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [showLangs, setShowLangs] = React.useState(false);
  const location = useLocation();
  const { t, language, setLanguage } = useLanguage();

  const navLinks = [
    { name: t('home'), path: '/', icon: <Activity className="w-4 h-4" /> },
    { name: t('triageRoom'), path: '/upload', icon: <Menu className="w-4 h-4" /> },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 sidebar-glass h-screen p-8 gap-8">
        <Link to="/" className="flex items-center gap-3 font-bold text-lg text-brand-accent tracking-tighter">
          <div className="w-8 h-8 bg-brand-accent rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.4)]">
             <Activity className="text-brand-bg w-5 h-5" />
          </div>
          {t('appName')}
        </Link>

        {/* Language Selector */}
        <div className="relative">
          <button 
            onClick={() => setShowLangs(!showLangs)}
            className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-white/5 text-slate-300 hover:bg-white/10 transition-all text-sm font-medium"
          >
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-brand-accent" />
              {languages.find(l => l.code === language)?.name}
            </div>
          </button>
          
          <AnimatePresence>
            {showLangs && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute top-full left-0 right-0 mt-2 bg-slate-900 border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50"
              >
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      setLanguage(lang.code as Language);
                      setShowLangs(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${
                      language === lang.code ? 'bg-brand-accent/20 text-brand-accent' : 'text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex flex-col gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-200 font-medium text-sm ${
                location.pathname === link.path 
                  ? 'bg-brand-accent/10 text-brand-accent shadow-[inset_0_0_10px_rgba(56,189,248,0.05)]' 
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
              }`}
            >
              {link.icon}
              {link.name}
            </Link>
          ))}
        </nav>

        <div className="mt-auto pt-8 border-t border-white/5">
          <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{t('nodeIdentity')}</div>
          <div className="text-xs text-brand-accent/60 font-mono mt-1 italic">{t('ruralAccess')}</div>
        </div>
      </aside>

      {/* Mobile Nav Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 glass-panel border-b border-white/5 px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-brand-accent">
          <Activity className="w-5 h-5" />
          {t('appName')}
        </Link>
        <button onClick={() => setIsOpen(!isOpen)} className="p-2 text-slate-400">
          {isOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, x: -100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            className="fixed inset-0 z-40 bg-brand-bg pt-20 px-6 space-y-4 md:hidden"
          >
             {/* Mobile Language Selector */}
             <div className="grid grid-cols-2 gap-2 mb-6">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setLanguage(lang.code as Language);
                  }}
                  className={`px-4 py-3 rounded-xl text-xs font-bold text-center border ${
                    language === lang.code 
                    ? 'bg-brand-accent/20 border-brand-accent text-brand-accent' 
                    : 'bg-white/5 border-white/5 text-slate-400'
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>

            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-4 p-4 rounded-2xl text-lg font-bold ${
                  location.pathname === link.path ? 'bg-brand-accent/20 text-brand-accent' : 'text-slate-400'
                }`}
              >
                {link.icon}
                {link.name}
              </Link>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
