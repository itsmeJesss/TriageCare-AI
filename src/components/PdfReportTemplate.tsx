import React from 'react';
import { Shield, AlertTriangle, Stethoscope, CheckCircle2, Clock, MapPin, User, FileText, Activity } from 'lucide-react';
import { PatientSymptomLog, AISignals } from '../lib/severityEngine';

export interface FullTriageReportData {
  patientId: string;
  timestamp?: string;
  location?: string;
  imageUrl?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  possibleCondition?: string;
  confidence?: string;
  clinicalSummary?: string;
  recommendedAction?: string;
  careDirectives?: string[];
  followUpSuggestion?: string;
  emergency?: boolean;
  patientSymptoms?: PatientSymptomLog;
  aiSymptoms?: AISignals;
  triageReasoning?: string[];
  hospital?: {
    name: string;
    address: string;
    mapsUrl: string;
  };
}

interface PdfReportTemplateProps {
  data: FullTriageReportData;
  reportRef?: React.RefObject<HTMLDivElement | null>;
  lang?: string;
}

export const PdfReportTemplate: React.FC<PdfReportTemplateProps> = ({ data, reportRef, lang = 'en' }) => {
  const dateStr = data.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString();
  const severity = data.severity || 'LOW';

  // Severity color mapping for clean printable PDF badges
  const severityColors = {
    CRITICAL: { 
      style: { backgroundColor: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }, 
      badgeStyle: { backgroundColor: '#dc2626', color: '#ffffff' } 
    },
    HIGH: { 
      style: { backgroundColor: '#fef2f2', borderColor: '#fca5a5', color: '#991b1b' }, 
      badgeStyle: { backgroundColor: '#ef4444', color: '#ffffff' } 
    },
    MEDIUM: { 
      style: { backgroundColor: '#fffbeb', borderColor: '#fcd34d', color: '#92400e' }, 
      badgeStyle: { backgroundColor: '#f59e0b', color: '#ffffff' } 
    },
    LOW: { 
      style: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7', color: '#065f46' }, 
      badgeStyle: { backgroundColor: '#059669', color: '#ffffff' } 
    },
  };

  const color = severityColors[severity] || severityColors.LOW;

  // Default care directives if AI didn't return specific list
  const defaultCareDirectives = (severity === 'LOW' || severity === 'MEDIUM') ? [
    "Wound Hygiene: Gentle cleansing with clean water and mild non-perfumed soap twice daily. Gently pat dry with a clean single-use cloth.",
    "Redness Border Tracking: Draw a clean line along the outer edge of redness with a skin-safe pen. Re-assess every 6 to 12 hours. If redness expands beyond lines, seek immediate medical care.",
    "Protection & Elevation: Apply clean sterile gauze/dressing. Elevate affected limb above heart level when resting to reduce localized swelling.",
    "Symptom & Temperature Monitoring: Track body temperature twice daily. Do NOT pick, scratch, pop, or squeeze any lesions or pustules.",
    "Hydration & Rest: Maintain adequate fluid intake and rest the affected area to support immune recovery."
  ] : [
    "Immediate Emergency Referral: Proceed directly to the nearest emergency department or clinical facility.",
    "Vital Signs Monitoring: Check temperature, pulse rate, blood pressure, and breathing rate every 15 minutes while awaiting transport.",
    "Keep Patient Calm & Elevated: Keep the patient lying down in a comfortable position and keep affected area covered with clean dressing."
  ];

  const directivesToDisplay = (data.careDirectives && data.careDirectives.length > 0) 
    ? data.careDirectives 
    : defaultCareDirectives;

  const followUpToDisplay = data.followUpSuggestion || (
    (severity === 'LOW' || severity === 'MEDIUM') 
      ? "Re-assess in 12-24 hours. Seek urgent medical evaluation immediately if fever > 38°C develops, redness spreads past pen markings, or severe pain occurs."
      : "Immediate hospital or clinical re-evaluation required. Do not delay emergency consultation."
  );

  return (
    <div 
      ref={reportRef} 
      id="pdf-report-container"
      className="bg-white text-slate-900 p-8 max-w-4xl mx-auto shadow-2xl rounded-none border border-slate-200 font-sans leading-relaxed"
      style={{ width: '800px', minHeight: '1050px', color: '#0f172a' }}
    >
      {/* 1. REPORT HEADER */}
      <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-600 rounded-lg flex items-center justify-center text-white font-black text-xl">
              T
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">TriageCare AI</h1>
              <p className="text-xs font-bold text-sky-700 tracking-widest uppercase">Clinical Triage & Infection Management Report</p>
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-slate-600 space-y-1">
          <p><span className="font-bold text-slate-800">Report ID:</span> <span className="font-mono text-slate-900">TC-{(data.patientId || '0000').slice(0, 8).toUpperCase()}</span></p>
          <p><span className="font-bold text-slate-800">Date/Time:</span> {dateStr}</p>
          <p><span className="font-bold text-slate-800">Node Location:</span> {data.location || 'District Health Facility'}</p>
        </div>
      </div>

      {/* 2. PATIENT INFORMATION */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2">
          <User className="w-4 h-4 text-sky-600" />
          Patient Information & Logged Symptoms
        </h2>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-slate-500">Patient Identifier:</p>
            <p className="font-mono font-bold text-slate-900 text-sm">{data.patientId}</p>
          </div>
          <div>
            <p className="text-slate-500">Current Health Center / Location:</p>
            <p className="font-semibold text-slate-900">{data.location || 'District Health Center'}</p>
          </div>
          <div className="col-span-2 pt-2 border-t border-slate-200">
            <p className="text-slate-500 mb-1">Reported Systemic Symptoms:</p>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${data.patientSymptoms?.fever ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-slate-200 text-slate-600'}`}>
                Fever / Chills: {data.patientSymptoms?.fever ? 'YES (POSITIVE)' : 'NO'}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${data.patientSymptoms?.difficultyBreathing ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-slate-200 text-slate-600'}`}>
                Breathing Difficulty: {data.patientSymptoms?.difficultyBreathing ? 'YES (POSITIVE)' : 'NO'}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${data.patientSymptoms?.extremePain ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-200 text-slate-600'}`}>
                Severe Local Pain: {data.patientSymptoms?.extremePain ? 'YES (POSITIVE)' : 'NO'}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${data.patientSymptoms?.confusion ? 'bg-red-100 text-red-800 border border-red-300' : 'bg-slate-200 text-slate-600'}`}>
                Dizziness / Confusion: {data.patientSymptoms?.confusion ? 'YES (POSITIVE)' : 'NO'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. UPLOADED IMAGE & AI FINDINGS */}
      <div className="grid grid-cols-12 gap-6 mb-6">
        <div className="col-span-5 bg-slate-900 rounded-xl p-3 text-white flex flex-col items-center justify-center border border-slate-800 min-h-[200px]">
          {data.imageUrl ? (
            <img 
              src={data.imageUrl} 
              alt="Patient Infection Scan" 
              className="max-h-48 rounded object-contain w-full"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="text-slate-400 text-xs text-center p-4">No image uploaded</div>
          )}
          <span className="text-[10px] text-slate-400 uppercase tracking-wider mt-2 font-mono">Patient Clinical Imagery</span>
        </div>

        <div className="col-span-7 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-600" />
              AI Detected Findings & Visual Signs
            </h2>
            <div className="mb-3">
              <span className="text-[10px] text-slate-500 uppercase tracking-widest block font-bold">Inferred Clinical Condition</span>
              <p className="text-xl font-black text-slate-900 tracking-tight uppercase">{data.possibleCondition || 'Dermatological Infection'}</p>
              {data.confidence && (
                <span className="inline-block mt-1 px-2 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-bold rounded">
                  AI Confidence: {data.confidence}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200">
              <div><span className="text-slate-500">Swelling:</span> <b className="text-slate-900">{data.aiSymptoms?.swelling ? 'Present' : 'None'}</b></div>
              <div><span className="text-slate-500">Redness:</span> <b className="text-slate-900">{data.aiSymptoms?.redness ? 'Present' : 'None'}</b></div>
              <div><span className="text-slate-500">Spread:</span> <b className="text-slate-900">{data.aiSymptoms?.spread || 'Localized'}</b></div>
              <div><span className="text-slate-500">Tissue Damage:</span> <b className="text-slate-900">{data.aiSymptoms?.tissueDamage || 'None'}</b></div>
              <div><span className="text-slate-500">Red Streaking:</span> <b className={data.aiSymptoms?.streaking ? 'text-red-700 font-black' : 'text-slate-900'}>{data.aiSymptoms?.streaking ? 'DETECTED (Sepsis Sign)' : 'Absent'}</b></div>
              <div><span className="text-slate-500">Rapid Spread:</span> <b className={data.aiSymptoms?.rapidSpread ? 'text-red-700 font-black' : 'text-slate-900'}>{data.aiSymptoms?.rapidSpread ? 'YES' : 'NO'}</b></div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. SEVERITY CLASSIFICATION */}
      <div className="p-4 rounded-xl border mb-6" style={color.style}>
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            <h2 className="text-xs font-black uppercase tracking-wider">Severity Classification & Priority Score</h2>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider" style={color.badgeStyle}>
            {severity} SEVERITY
          </span>
        </div>
        {data.triageReasoning && data.triageReasoning.length > 0 && (
          <ul className="text-xs text-slate-800 space-y-1 list-disc list-inside mt-2">
            {data.triageReasoning.map((r, idx) => (
              <li key={idx} className="leading-snug">{r}</li>
            ))}
          </ul>
        )}
      </div>

      {/* 5. CLINICAL SUMMARY */}
      {data.clinicalSummary && (
        <div className="mb-6 bg-slate-50 border border-slate-200 p-4 rounded-xl">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-600" />
            Clinical Summary
          </h2>
          <p className="text-xs text-slate-800 leading-relaxed font-medium">{data.clinicalSummary}</p>
        </div>
      )}

      {/* 6. RECOMMENDED ACTIONS & CARE DIRECTIVES */}
      <div className="mb-6 bg-slate-50 border border-slate-200 p-4 rounded-xl">
        <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 mb-3 flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-sky-600" />
          Infection Care & Management Directives (Step-By-Step)
        </h2>
        {data.recommendedAction && (
          <p className="text-xs text-slate-900 font-bold mb-3 p-2 bg-sky-50 border border-sky-200 rounded">
            Primary Recommendation: {data.recommendedAction}
          </p>
        )}
        <ol className="space-y-2 text-xs text-slate-800">
          {directivesToDisplay.map((step, idx) => (
            <li key={idx} className="flex items-start gap-2 bg-white p-2.5 rounded border border-slate-200">
              <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold flex items-center justify-center shrink-0 text-[10px]">
                {idx + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* 7. FOLLOW-UP SUGGESTION */}
      <div className="mb-6 bg-sky-50 border border-sky-200 p-4 rounded-xl">
        <h2 className="text-xs font-black uppercase tracking-wider text-sky-900 mb-1 flex items-center gap-2">
          <Clock className="w-4 h-4 text-sky-700" />
          Follow-Up & Reassessment Directive
        </h2>
        <p className="text-xs text-sky-950 font-medium leading-relaxed">{followUpToDisplay}</p>
      </div>

      {/* 8. DISCLAIMER & BRANDING */}
      <div className="border-t-2 border-slate-200 pt-4 mt-8 flex justify-between items-end text-[10px] text-slate-500">
        <div className="max-w-xl space-y-1">
          <p className="font-bold uppercase tracking-wider text-slate-700">Medical Disclaimer:</p>
          <p className="leading-snug">
            This report is AI-generated and assistive only. It does not constitute a clinical diagnosis. Please consult a qualified healthcare professional.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-black text-slate-900 uppercase">TriageCare AI Engine v2.4</p>
          <p className="text-slate-400">Rural Healthcare Node Alpha</p>
        </div>
      </div>
    </div>
  );
};
