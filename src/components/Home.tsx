import React from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Zap, Globe, Activity, Eye, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../lib/LanguageContext';

export default function Home() {
  const { t } = useLanguage();

  return (
    <div className="pt-8 space-y-12 max-w-6xl mx-auto">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-4xl font-bold text-white tracking-tight">{t('diagnosticCenter')}</h1>
          <p className="text-slate-400 mt-1 uppercase text-xs tracking-widest font-bold">{t('rualNode')} &bull; {t('syncStatusActive')}</p>
        </div>
        <div className="status-pill text-brand-accent border-brand-accent/20 bg-brand-accent/10">
          <div className="w-2 h-2 bg-brand-accent rounded-full animate-pulse" />
          {t('localAiOnline')}
        </div>
      </div>

      {/* Hero Section / Dashboard Grid */}
      <div className="grid lg:grid-cols-3 gap-8">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2 glass-panel rounded-3xl p-10 flex flex-col justify-center gap-8 relative overflow-hidden"
        >
          <div className="relative z-10 space-y-6">
            <h2 className="text-5xl font-extrabold text-white leading-tight">
              {t('tagline')} <br/>
              <span className="text-brand-accent">{t('forRuralHealth')}</span>
            </h2>
            <p className="text-slate-400 text-lg max-w-lg leading-relaxed">
              {t('heroDescription')}
            </p>
            <div className="flex gap-4 pt-4">
              <Link 
                to="/upload" 
                className="px-8 py-4 bg-brand-accent text-brand-bg rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_30px_rgba(56,189,248,0.2)]"
              >
                {t('startScan')}
              </Link>
            </div>
          </div>
          
          <div className="absolute top-0 right-0 w-1/3 h-full bg-brand-accent/5 blur-3xl rounded-full -z-0" />
        </motion.div>

        <div className="glass-panel rounded-3xl p-8 space-y-6">
           <div className="space-y-4">
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center">
                 <ShieldCheck className="text-brand-accent w-5 h-5" />
               </div>
               <span className="text-sm font-bold text-slate-300">{t('privacyFirstEdge')}</span>
             </div>
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-green-500/10 rounded-xl flex items-center justify-center">
                 <Zap className="text-green-400 w-5 h-5" />
               </div>
               <span className="text-sm font-bold text-slate-300">{t('instantAnalysis')}</span>
             </div>
             <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center">
                 <Activity className="text-blue-400 w-5 h-5" />
               </div>
               <span className="text-sm font-bold text-slate-300">{t('automatedTriage')}</span>
             </div>
           </div>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid md:grid-cols-3 gap-6">
        {[
          { icon: <Heart className="text-red-400" />, title: t('skinScreening'), desc: t('skinScreeningDesc') },
          { icon: <Eye className="text-brand-accent" />, title: t('ocularHealth'), desc: t('ocularHealthDesc') },
          { icon: <Globe className="text-green-400" />, title: t('globalNode'), desc: t('globalNodeDesc') },
        ].map((f, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-panel p-8 rounded-3xl hover:bg-white/5 transition-colors group"
          >
            <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mb-6 group-hover:bg-brand-accent/20 transition-colors">
              {f.icon}
            </div>
            <h3 className="text-xl font-bold text-white mb-3">{f.title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
