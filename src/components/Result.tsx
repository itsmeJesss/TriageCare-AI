import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, 
  MapPin, 
  Calendar, 
  Stethoscope,
  Loader2,
  Award,
} from 'lucide-react';
import { useLanguage } from '../lib/LanguageContext';
import { PatientSymptomLog, AISignals } from '../lib/severityEngine';

interface TriageResult {
  patientId: string;
  status: 'PENDING' | 'COMPLETED';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  possibleCondition?: string;
  confidence?: string;
  clinicalSummary?: string;
  recommendedAction?: string;
  emergency?: boolean;
  location: string;
  timestamp: string;
  imageUrl?: string;
  patientSymptoms?: PatientSymptomLog;
  aiSymptoms?: AISignals;
  triageReasoning?: string[];
  hospital?: {
    name: string;
    address: string;
    mapsUrl: string;
  };
}

export default function Result() {
  const { patientId } = useParams();
  const [result, setResult] = useState<TriageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, language, setLanguage } = useLanguage();
  const [analyzingForNewLanguage, setAnalyzingForNewLanguage] = useState(false);

  // Handle language change re-triggering analysis
  useEffect(() => {
    // Only re-analyze if we already have an image and aren't already loading the initial result
    if (result?.imageUrl && !loading) {
      setAnalyzingForNewLanguage(true);
      analyzeImage(result.imageUrl);
    }
  }, [language]);

  const analyzeImage = async (imageUrl: string, initialSymptoms?: PatientSymptomLog) => {
    try {
      setAnalyzing(true);
      setError(null);
      
      console.log(`[CLIENT] Triggering server-side analysis for Patient ID: ${patientId}`);
      
      const response = await fetch(`/api/analyze/${patientId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language })
      });

      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Analysis failed on the server.");
        } else {
          const text = await response.text();
          console.error("Non-JSON error response:", text);
          throw new Error(`Server error (${response.status}): Unexpected response format.`);
        }
      }

      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON success? response:", text);
        throw new Error("Server returned unexpected format instead of data.");
      }

      const analyzedRecord = await response.json();
      setResult(analyzedRecord);
    } catch (err: any) {
      console.error("Analysis Error:", err);
      setError(err.message || "An unexpected error occurred during analysis.");
    } finally {
      setAnalyzing(false);
      setAnalyzingForNewLanguage(false);
    }
  };

  useEffect(() => {
    const fetchResult = async () => {
      try {
        const response = await fetch(`/api/result/${patientId}`);
        const contentType = response.headers.get("content-type");

        if (!response.ok) {
          if (contentType && contentType.includes("application/json")) {
            const data = await response.json();
            throw new Error(data.error || 'Result not found');
          } else {
            const text = await response.text();
            console.error("Non-JSON error response for result fetch:", text);
            throw new Error(`Server error (${response.status}) when fetching result.`);
          }
        }

        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Server returned non-JSON format for result.");
        }

        const data = await response.json();
        setResult(data);
        setLoading(false);

        // If still pending, trigger the Gemini AI analysis
        if (data.status === 'PENDING' && data.imageUrl) {
          analyzeImage(data.imageUrl, data.patientSymptoms);
        }
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchResult();
  }, [patientId]);

  if (loading) {
    return (
      <div className="pt-32 flex flex-col items-center justify-center space-y-4">
        <Loader2 className="w-12 h-12 text-brand-primary animate-spin" />
        <p className="text-slate-500 font-medium">{t('processing')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-32 px-4 max-w-2xl mx-auto text-center space-y-6">
        <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
          <AlertTriangle className="text-red-500 w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-white">Analysis Interrupted</h2>
        <div className="glass-panel p-6 rounded-2xl border border-red-500/10 bg-red-500/5">
          <p className="text-slate-300 text-sm leading-relaxed">{error}</p>
        </div>
        
        <div className="flex justify-center gap-4">
          <Link to="/upload" className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:scale-105 transition-all">
            Try Another Image
          </Link>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-3 bg-white/5 text-slate-300 border border-white/10 rounded-xl font-bold hover:bg-white/10 transition-all"
          >
            Retry Analysis
          </button>
        </div>
      </div>
    );
  }

  const isPending = result?.status === 'PENDING' || analyzing;

  const LangSwitcher = () => (
    <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5">
      {['en', 'hi', 'ta', 'te', 'kn'].map((code) => {
        const langMap: Record<string, string> = {
          en: 'EN',
          hi: 'हि',
          ta: 'त',
          te: 'ते',
          kn: 'क'
        };
        const lang = langMap[code];
        return (
          <button
            key={code}
            onClick={() => setLanguage(code as any)}
            className={`px-2 py-1 text-[10px] font-black rounded transition-all ${
              language === code 
              ? 'bg-brand-accent text-brand-bg' 
              : 'text-slate-500 hover:text-slate-300'
            } ${analyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={analyzing}
          >
            {lang}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="pt-8 space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{t('visionEngineAnalysis')}</h1>
          <p className="text-slate-400 mt-1 uppercase text-[11px] tracking-widest font-bold">Patient ID: <b className="text-slate-200 font-mono">{patientId?.slice(0, 8).toUpperCase()}</b> &bull; {t('rualNode')}</p>
        </div>
        <div className="status-pill text-brand-accent border-brand-accent/20 bg-brand-accent/10">
          <div className="w-2 h-2 bg-brand-accent rounded-full animate-pulse" />
          LOCAL AI ENGINE: ONLINE
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left Column: Result Card */}
        <div className="lg:col-span-5 space-y-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-10 rounded-[2.5rem] flex flex-col items-center justify-center text-center relative overflow-hidden"
          >
            <div className="w-full flex justify-between items-center mb-8">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">{t('visionEngineAnalysis')}</span>
                {analyzingForNewLanguage && <Loader2 className="w-3 h-3 text-brand-accent animate-spin" />}
              </div>
              <LangSwitcher />
            </div>
            
            <AnimatePresence mode="wait">
              {isPending ? (
                <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto">
                    <Loader2 className="w-10 h-10 text-brand-accent animate-spin" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-300">{t('analyzing')}</h3>
                </motion.div>
              ) : (
                <motion.div key="done" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full space-y-6">
                  <div className={`severity-badge w-full ${
                    result?.severity === 'CRITICAL' ? 'bg-red-600/20 text-red-500 border border-red-600/40 ring-4 ring-red-600/10' :
                    result?.severity === 'HIGH' ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
                    result?.severity === 'MEDIUM' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 
                    'bg-green-500/15 text-green-400 border border-green-500/30'
                  }`}>
                    {result?.severity} {t('severity')}
                  </div>

                  <div className="pt-4 pb-2 border-b border-white/5 text-left">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-accent mb-1 block">Inferred Condition</span>
                    <h2 className="text-3xl font-black text-white tracking-tight uppercase leading-tight">
                      {result?.possibleCondition || (analyzing ? t('analyzing') : t('awaitingAi'))}
                    </h2>
                    <div className="flex items-center gap-2 mt-2">
                       <p className="text-slate-500 text-[10px] leading-relaxed uppercase tracking-tighter">
                         {t('visionEngineAnalysis')}
                       </p>
                       {!isPending && result?.confidence && (
                         <div className="flex items-center gap-1 px-2 py-0.5 bg-brand-accent/10 rounded-full border border-brand-accent/20">
                            <Award className="w-3 h-3 text-brand-accent" />
                            <span className="text-[9px] font-bold text-brand-accent">{result.confidence} {t('confidence')}</span>
                         </div>
                       )}
                    </div>
                    {result?.clinicalSummary && (
                      <p className="text-xs text-slate-400 mt-4 leading-relaxed border-t border-white/5 pt-4">
                        <b>SUMMARY:</b> {result.clinicalSummary}
                      </p>
                    )}
                  </div>

                  {!isPending && result?.triageReasoning && (
                    <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-left space-y-2">
                       <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Clinical Triage Reasoning</span>
                       <ul className="space-y-1">
                          {result.triageReasoning.map((r, i) => (
                            <li key={i} className="text-[10px] text-slate-400 flex gap-2">
                               <span className="text-brand-accent tabular-nums">{i+1}.</span>
                               {r}
                            </li>
                          ))}
                       </ul>
                    </div>
                  )}

                  {(result?.severity === 'HIGH' || result?.severity === 'CRITICAL' || result?.emergency) && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-red-500/10 border-l-4 border-red-500 p-4 text-left space-y-2 mt-4 text-red-500"
                    >
                      <strong className="text-xs uppercase font-black flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        {result?.severity === 'CRITICAL' ? 'CRITICAL EMERGENCY ALERT' : 'HIGH SEVERITY ALERT'}
                      </strong>
                      <p className="text-[12px] leading-relaxed">
                        {result?.severity === 'CRITICAL' 
                          ? 'Life-threatening condition suspected. Immediate emergency dispatch required. Visual evidence suggests severe trauma or systemic infection.' 
                          : 'High severity condition detected. Immediate consultation required. System has logged a priority alert to the clinical console.'}
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-brand-accent/20 to-transparent" />
          </motion.div>

          <div className="glass-panel p-6 rounded-3xl space-y-4">
             <div className="flex items-center gap-3 text-slate-400">
                <MapPin className="w-4 h-4 text-brand-accent" />
                <span className="text-xs font-mono">{result?.location}</span>
             </div>
             <div className="flex items-center gap-3 text-slate-400">
                <Calendar className="w-4 h-4 text-brand-accent" />
                <span className="text-xs font-mono">{new Date(result?.timestamp || '').toLocaleString()}</span>
             </div>
          </div>
        </div>

        {/* Right Column: Reference & Actions */}
        <div className="lg:col-span-7 space-y-6">
          {!isPending && result?.hospital && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel rounded-3xl p-8 border border-brand-accent/20 relative group"
            >
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <span className="text-[10px] uppercase tracking-widest text-brand-accent font-bold block mb-2">{t('nearestHospital')}</span>
                  <h3 className="text-xl font-bold text-white">{result.hospital.name}</h3>
                  <p className="text-sm text-slate-500 mt-1">{result.hospital.address}</p>
                </div>
                <a 
                  href={result.hospital.mapsUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-5 py-2.5 bg-brand-accent text-brand-bg rounded-lg font-bold text-xs uppercase tracking-widest hover:scale-105 transition-all shadow-[0_0_20px_rgba(56,189,248,0.2)]"
                >
                  <MapPin className="w-4 h-4" />
                  {t('getDirections')}
                </a>
              </div>
            </motion.div>
          )}

          <div className="glass-panel rounded-[2.5rem] p-8 md:p-10 relative overflow-hidden">
            <div className="w-full flex justify-between items-center mb-8">
              <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold">{t('clinicalRecs')}</span>
              <LangSwitcher />
            </div>
            
            {!isPending ? (
              <div className="space-y-8">
                <div className="grid grid-cols-1 gap-8 relative z-10">
                  <div className="space-y-4">
                    <h4 className="text-slate-100 font-bold flex items-center gap-2 underline decoration-brand-accent underline-offset-4">
                      Care & Prevention Methods
                    </h4>
                  <div className="bg-white/5 p-6 rounded-2xl border border-white/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity">
                      <Stethoscope className="w-5 h-5 text-brand-accent" />
                    </div>
                    <p className="text-base text-slate-200 leading-relaxed font-medium">
                      {result?.recommendedAction || 'No specific care instructions provided.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            ) : (
                <div className="space-y-4">
                    <div className="h-4 bg-white/5 rounded w-full animate-pulse" />
                    <div className="h-4 bg-white/5 rounded w-5/6 animate-pulse" />
                    <div className="h-4 bg-white/5 rounded w-4/6 animate-pulse" />
                </div>
            )}
            
            <Stethoscope className="absolute -bottom-12 -right-12 w-64 h-64 text-white opacity-[0.02] -rotate-12" />
          </div>

          <div className="flex justify-end gap-4">
             <Link to="/upload" className="px-6 py-3 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-widest border border-white/10 transition-all">{t('backToRoom')}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
