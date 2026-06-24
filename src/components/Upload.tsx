import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useLanguage } from '../lib/LanguageContext';

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [location, setLocation] = useState('');
  const [symptoms, setSymptoms] = useState({
    fever: false,
    difficultyBreathing: false,
    extremePain: false,
    confusion: false,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { t } = useLanguage();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('Image is too large. Maximum size is 10MB.');
        return;
      }
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
      setError(null);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !location) {
      setError('Please provide both an image and your location.');
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('image', file);
    formData.append('location', location);
    formData.append('symptoms', JSON.stringify(symptoms));

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        if (contentType && contentType.includes("application/json")) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to upload');
        } else {
          const text = await response.text();
          console.error("Non-JSON upload error:", text);
          throw new Error(`Upload failed with server error (${response.status})`);
        }
      }

      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON successful upload response:", text);
        throw new Error(`Server returned non-JSON format after upload. Content-Type: ${contentType || 'none'}. Body: ${text.slice(0, 250)}`);
      }

      const data = await response.json();

      // Redirect to results page after a small delay to show progress
      setTimeout(() => {
        navigate(`/result/${data.patientId}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setIsUploading(false);
    }
  };

  return (
    <div className="pt-8 space-y-8 max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{t('diagnosticCenter')}</h1>
          <p className="text-slate-400 mt-1 uppercase text-[11px] tracking-widest font-bold">{t('rualNode')}</p>
        </div>
        <div className="status-pill border-brand-accent/20 text-brand-accent bg-brand-accent/10">
          <div className="w-2 h-2 bg-brand-accent rounded-full" />
          SYSTEM: READY FOR UPLOAD
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-8 md:p-10 rounded-[2rem] grid md:grid-cols-2 gap-12"
      >
        <div className="space-y-8">
           <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold block mb-4">{t('uploadPatientData')}</span>
           
           <AnimatePresence mode="wait">
            {!preview ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/10 rounded-2xl h-64 flex flex-col items-center justify-center gap-4 bg-white/5 cursor-pointer hover:border-brand-accent hover:bg-white/10 transition-all group"
              >
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center font-bold text-2xl text-slate-400 group-hover:scale-110 group-hover:text-brand-accent transition-all">+</div>
                <div className="text-center">
                  <p className="text-slate-200 font-bold">{t('selectImage')}</p>
                  <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">(JPG, PNG up to 10MB)</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </motion.div>
            ) : (
              <motion.div
                key="preview"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="relative rounded-2xl overflow-hidden border border-white/10 group h-64"
              >
                <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-brand-bg/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    type="button"
                    onClick={clearFile}
                    className="p-4 bg-red-500/20 text-red-400 border border-red-500/30 rounded-full hover:bg-red-500/40 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </motion.div>
            )}
           </AnimatePresence>

           <div className="aws-node uppercase">SOURCE: Client_Node_Symmetry</div>
        </div>

        <form onSubmit={handleUpload} className="space-y-8 flex flex-col justify-end">
          <div className="space-y-3">
            <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold block">Patient Current Location</span>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-accent w-5 h-5" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="District Health Center, Block B..."
                className="w-full pl-12 pr-4 py-4 bg-black/20 border border-white/10 rounded-xl text-white placeholder:text-slate-600 focus:border-brand-accent transition-all outline-none"
              />
            </div>
          </div>

          <div className="space-y-4">
             <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-bold block">Patient Systemic Symptoms</span>
             <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'fever', label: 'Fever / Chills' },
                  { id: 'difficultyBreathing', label: 'Breathing Difficulty' },
                  { id: 'extremePain', label: 'Extreme Local Pain' },
                  { id: 'confusion', label: 'Confusion / Dizziness' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSymptoms(prev => ({ ...prev, [s.id]: !prev[s.id as keyof typeof symptoms] }))}
                    className={`p-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all text-left flex items-center justify-between ${
                      symptoms[s.id as keyof typeof symptoms] 
                        ? 'bg-brand-accent/20 border-brand-accent text-brand-accent' 
                        : 'bg-white/5 border-white/10 text-slate-500'
                    }`}
                  >
                    {s.label}
                    <div className={`w-3 h-3 rounded-sm border ${symptoms[s.id as keyof typeof symptoms] ? 'bg-brand-accent border-brand-accent' : 'border-white/20'}`} />
                  </button>
                ))}
             </div>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 text-red-400 rounded-xl border border-red-500/20 text-[11px] uppercase tracking-widest font-bold">
              ERROR: {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isUploading}
            className={`w-full py-5 rounded-xl font-black text-sm uppercase tracking-[0.2em] transition-all shadow-xl flex items-center justify-center gap-4 ${
              isUploading
                ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
                : 'bg-brand-accent text-brand-bg hover:scale-[1.02] shadow-brand-accent/20'
            }`}
          >
            {isUploading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              t('beginAnalysis')
            )}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
