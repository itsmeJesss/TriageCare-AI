
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Language, translations, translations as allTranslations } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof typeof allTranslations['en']) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('app-language');
    return (saved as Language) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('app-language', language);
  }, [language]);

  const t = (key: keyof typeof allTranslations['en']): string => {
    const translation = translations[language] || translations['en'];
    return (translation as any)[key] || (translations['en'] as any)[key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
