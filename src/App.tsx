/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './components/Home';
import Upload from './components/Upload';
import Result from './components/Result';
import { useLanguage } from './lib/LanguageContext';

export default function App() {
  const { t } = useLanguage();

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-brand-bg overflow-hidden font-sans">
        {/* Sidebar Navigation */}
        <Navbar />
        
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col h-screen overflow-y-auto">
          <main className="flex-1 p-6 md:p-10">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/result/:patientId" element={<Result />} />
            </Routes>
          </main>
          
          <footer className="py-6 border-t border-white/5 bg-black/10">
            <div className="max-w-7xl mx-auto px-10 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-500 text-[11px] uppercase tracking-widest font-bold">
              <p>{t('footerCopyright')}</p>
              <p className="italic opacity-50">{t('footerAdvisory')}</p>
            </div>
          </footer>
        </div>
      </div>
    </BrowserRouter>
  );
}
