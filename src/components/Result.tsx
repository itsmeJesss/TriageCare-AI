import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AlertTriangle, 
  MapPin, 
  Calendar, 
  Stethoscope,
  Loader2,
  Award,
  Download,
  FileCheck,
  Clock,
  ShieldAlert,
  CheckCircle2
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { useLanguage } from '../lib/LanguageContext';
import { PatientSymptomLog, AISignals } from '../lib/severityEngine';
import { PdfReportTemplate } from './PdfReportTemplate';

interface TriageResult {
  patientId: string;
  status: 'PENDING' | 'COMPLETED';
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  possibleCondition?: string;
  confidence?: string;
  clinicalSummary?: string;
  recommendedAction?: string;
  careDirectives?: string[];
  followUpSuggestion?: string;
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
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const handleDownloadPdf = async () => {
    if (!result || downloadingPdf) return;
    try {
      setDownloadingPdf(true);
      const element = document.getElementById('pdf-report-container');
      if (!element) {
        throw new Error("PDF Report template element not ready.");
      }

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          // Replace unsupported Tailwind v4 oklch() color functions in cloned document styles
          const styleElements = Array.from(clonedDoc.querySelectorAll('style'));
          styleElements.forEach((styleEl) => {
            if (styleEl.textContent && styleEl.textContent.includes('oklch')) {
              styleEl.textContent = styleEl.textContent.replace(/oklch\([^)]*\)/gi, '#38bdf8');
            }
          });

          const allElements = Array.from(clonedDoc.querySelectorAll<HTMLElement>('*'));
          allElements.forEach((el) => {
            const inlineStyle = el.getAttribute('style');
            if (inlineStyle && inlineStyle.includes('oklch')) {
              el.setAttribute('style', inlineStyle.replace(/oklch\([^)]*\)/gi, '#38bdf8'));
            }
          });
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const imgWidth = 210;
      const pageHeight = 297;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const cleanId = (patientId || 'Patient').slice(0, 8).toUpperCase();
      pdf.save(`TriageCare_Clinical_Report_${cleanId}.pdf`);
    } catch (err: any) {
      console.error("PDF Export Error:", err);
      alert("Unable to generate PDF report: " + (err.message || 'Unknown error'));
    } finally {
      setDownloadingPdf(false);
    }
  };

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
        body: JSON.stringify({ language }),
        credentials: 'include'
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
        const response = await fetch(`/api/result/${patientId}`, {
          credentials: 'include'
        });
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
        <h2 className="text-2xl font-bold text-white">{t('analysisInterrupted')}</h2>
        <div className="glass-panel p-6 rounded-2xl border border-red-500/10 bg-red-500/5">
          <p className="text-slate-300 text-sm leading-relaxed">{error}</p>
        </div>
        
        <div className="flex justify-center gap-4">
          <Link to="/upload" className="px-6 py-3 bg-brand-primary text-white rounded-xl font-bold hover:scale-105 transition-all">
            {t('tryAnotherImage')}
          </Link>
          <button 
            onClick={() => window.location.reload()} 
            className="px-6 py-3 bg-white/5 text-slate-300 border border-white/10 rounded-xl font-bold hover:bg-white/10 transition-all"
          >
            {t('retryAnalysis')}
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
          <p className="text-slate-400 mt-1 uppercase text-[11px] tracking-widest font-bold">{t('patientIdLabel')}: <b className="text-slate-200 font-mono">{patientId?.slice(0, 8).toUpperCase()}</b> &bull; {t('rualNode')}</p>
        </div>
        <div className="status-pill text-brand-accent border-brand-accent/20 bg-brand-accent/10">
          <div className="w-2 h-2 bg-brand-accent rounded-full animate-pulse" />
          {t('localAiOnline')}
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
                    {result?.severity ? t(`severity${result.severity}` as any) : ''} {t('severity')}
                  </div>

                  <div className="pt-4 pb-2 border-b border-white/5 text-left">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-accent mb-1 block">{t('inferredCondition')}</span>
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
                      <p className="text-base text-slate-200 mt-4 leading-relaxed border-t border-white/10 pt-4 font-normal">
                        <b className="text-brand-accent font-bold uppercase tracking-wide">{t('summaryLabel')}:</b> {result.clinicalSummary}
                      </p>
                    )}
                  </div>

                  {!isPending && result?.triageReasoning && (
                    <div className="bg-white/5 rounded-2xl p-5 border border-white/10 text-left space-y-3">
                       <span className="text-xs font-black uppercase tracking-widest text-slate-300 block">{t('triageReasoningTitle')}</span>
                       <ul className="space-y-2">
                          {result.triageReasoning.map((r, i) => (
                            <li key={i} className="text-xs md:text-sm text-slate-200 font-medium flex gap-2.5 leading-relaxed">
                               <span className="text-brand-accent font-bold tabular-nums shrink-0">{i+1}.</span>
                               <span>{r}</span>
                            </li>
                          ))}
                       </ul>
                    </div>
                  )}

                  {(result?.severity === 'HIGH' || result?.severity === 'CRITICAL' || result?.emergency) && (
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-red-500/15 border-l-4 border-red-500 p-5 rounded-r-2xl text-left space-y-2 mt-5 text-red-400"
                    >
                      <strong className="text-sm md:text-base uppercase font-black flex items-center gap-2 text-red-400 tracking-wider">
                        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 animate-pulse" />
                        {result?.severity === 'CRITICAL' ? t('criticalEmergencyAlert') : t('highSeverityAlert')}
                      </strong>
                      <p className="text-sm md:text-base leading-relaxed font-semibold text-red-200">
                        {result?.severity === 'CRITICAL' 
                          ? t('criticalAlertDesc')
                          : t('highAlertDesc')}
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

          <div className="glass-panel rounded-[2.5rem] p-8 md:p-10 relative overflow-hidden space-y-6">
            <div className="w-full flex justify-between items-center mb-2">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-brand-accent" />
                <span className="text-[11px] uppercase tracking-[0.2em] text-slate-300 font-bold">{t('careMethodsTitle')}</span>
              </div>
              <LangSwitcher />
            </div>
            
            {!isPending ? (
              <div className="space-y-6 relative z-10">
                {/* Primary Recommendation */}
                <div className="bg-brand-accent/10 p-5 rounded-2xl border border-brand-accent/30">
                  <span className="text-[10px] font-black uppercase tracking-widest text-brand-accent block mb-1">
                    Primary Action Directives
                  </span>
                  <p className="text-base text-white leading-relaxed font-semibold">
                    {result?.recommendedAction || t('noCareInstructions')}
                  </p>
                </div>

                {/* Step-by-Step Care Directives */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    AI Infection Care Protocol ({result?.severity === 'LOW' || result?.severity === 'MEDIUM' ? 'Low/Medium Severity Focus' : 'Urgent Protocol'})
                  </h4>
                  <ul className="space-y-2.5">
                    {(result?.careDirectives && result.careDirectives.length > 0 ? result.careDirectives : [
                      "Wound Hygiene: Clean gently twice daily with clean water and mild non-perfumed soap. Pat dry with a single-use cloth.",
                      "Redness Border Tracking: Mark the border of redness with a clean pen. Re-inspect every 6-12 hours for expansion.",
                      "Protection & Elevation: Keep covered with a sterile bandage and elevate affected limb to relieve swelling.",
                      "Symptom Tracking: Measure body temperature twice daily. Do NOT pick, squeeze, or pop any lesions."
                    ]).map((step, idx) => (
                      <li key={idx} className="bg-white/5 p-3.5 rounded-xl border border-white/10 text-xs md:text-sm text-slate-200 flex gap-3 items-start leading-relaxed">
                        <span className="w-5 h-5 rounded-full bg-brand-accent text-brand-bg font-black shrink-0 flex items-center justify-center text-[10px]">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Follow-Up Suggestion */}
                {(result?.followUpSuggestion || result?.severity) && (
                  <div className="bg-sky-500/10 p-4 rounded-xl border border-sky-500/20 text-xs text-sky-200 space-y-1">
                    <div className="flex items-center gap-2 font-bold text-sky-400 uppercase tracking-wider text-[11px]">
                      <Clock className="w-4 h-4" />
                      Follow-Up & Reassessment Directive
                    </div>
                    <p className="leading-relaxed font-medium">
                      {result?.followUpSuggestion || (
                        (result?.severity === 'LOW' || result?.severity === 'MEDIUM')
                          ? "Re-assess in 12-24 hours. Seek immediate medical attention if redness spreads past pen lines or fever develops."
                          : "Immediate clinical re-evaluation required. Do not delay emergency consultation."
                      )}
                    </p>
                  </div>
                )}
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

          {/* Actions Bar: Download PDF & Return to Triage Room */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
            {!isPending && result && (
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="w-full sm:w-auto px-6 py-3.5 bg-gradient-to-r from-brand-accent to-sky-500 hover:brightness-110 text-brand-bg font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_25px_rgba(56,189,248,0.3)] flex items-center justify-center gap-2.5 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {downloadingPdf ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Generating PDF Report...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download PDF Clinical Report</span>
                  </>
                )}
              </button>
            )}

            <Link 
              to="/upload" 
              className="w-full sm:w-auto text-center px-6 py-3.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl font-bold text-xs uppercase tracking-widest border border-white/10 transition-all"
            >
              {t('backToRoom')}
            </Link>
          </div>
        </div>
      </div>

      {/* Hidden Off-Screen Container for Pixel-Perfect PDF Generation */}
      {result && (
        <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', overflow: 'hidden' }}>
          <PdfReportTemplate data={result} />
        </div>
      )}
    </div>
  );
}
