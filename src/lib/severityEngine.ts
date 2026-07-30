
export interface AISignals {
  condition: string;
  swelling: boolean;
  redness: boolean;
  spread: 'LOCALIZED' | 'REGIONAL' | 'SYSTEMIC';
  tissueDamage: 'NONE' | 'SURFACE' | 'NECROTIC';
  discoloration: 'MILD' | 'SEVERE';
  streaking: boolean;
  rapidSpread: boolean;
}

export interface PatientSymptomLog {
  fever: boolean;
  difficultyBreathing: boolean;
  extremePain: boolean;
  confusion: boolean;
}

export interface TriageLogicResult {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  emergency: boolean;
  reasoning: string[];
}

export function calculateClinicalSeverity(
  ai: AISignals,
  patient: PatientSymptomLog,
  lang: string = 'en'
): TriageLogicResult {
  let score = 0;
  const reasoning: string[] = [];

  const conditionPriorities: Record<string, number> = {
    'Cellulitis': 3,
    'Sepsis Indicator': 4,
    'Sepsis': 4,
    'Septic Shock': 4,
    'Necrotizing Fasciitis': 4,
    'Gangrene': 4,
    'Second Degree Burn': 3,
    'Third Degree Burn': 4,
    'Anaphylaxis': 4,
    'Severe Allergic Reaction': 3,
    'Chickenpox': 2,
    'Skin Abcess': 2,
    'Fungal Infection': 1,
    'Vitiligo': 1,
    'Bruise': 1,
    'Rash': 1,
  };

  const reasoningDict: Record<string, Record<string, string>> = {
    basePriorityPrefix: {
      en: `Base clinical priority for "${ai.condition}" is `,
      hi: `"${ai.condition}" के लिए मूल नैदानिक प्राथमिकता है `,
      ta: `"${ai.condition}" க்கான அடிப்படை மருத்துவ முன்னுரிமை `,
      te: `"${ai.condition}" కి ప్రాథమిక క్లినికల్ ప్రాధాన్యత `,
      kn: `"${ai.condition}" ಗೆ ಮೂಲ ಕ್ಲಿನಿಕಲ್ ಆದ್ಯತೆ `
    },
    necrotic: {
      en: "CRITICAL: Visual evidence of necrotic tissue/gangrene detected.",
      hi: "गंभीर: नेक्रोटिक ऊतक/गैंग्रीन का दृश्य साक्ष्य मिला।",
      ta: "முக்கியமானது: நசிவு திசு/கேங்க்ரீனின் காட்சி சான்றுகள் கண்டறியப்பட்டன.",
      te: "క్లిష్టమైనది: నెక్రోటిక్ కణజాలం/గాంగ్రీన్ యొక్క దృశ్య ఆధారాలు కనుగొనబడ్డాయి.",
      kn: "ಕ್ಲಿಷ್ಟಕರ: ನೆಕ್ರೋಟಿಕ್ ಅಂಗಾಂಶ/ಗ್ಯಾಂಗ್ರೀನ್‌ನ ದೃಶ್ಯ ಪುರಾವೆಗಳು ಕಂಡುಬಂದಿವೆ."
    },
    chickenpox: {
      en: "Chickenpox typically presents with systemic spread; considered medium severity.",
      hi: "चेचक आमतौर पर प्रणालीगत प्रसार के साथ प्रस्तुत होता है; मध्यम गंभीरता माना जाता है।",
      ta: "சின்னம்மை பொதுவாக உடலளவிலான பரவலுடன் வெளிப்படும்; மிதமான தீவிரமாகக் கருதப்படுகிறது.",
      te: "అమ్మవారు సాధారణగా శరీరం అంతటా వ్యాపిస్తుంది; మధ్యస్థ తీవ్రతగా పరిగణించబడుతుంది.",
      kn: "ನೀರುಅಮ್ಮೆ ಸಾಮಾನ್ಯವಾಗಿ ದೇಹದಾದ್ಯಂತ ಹರಡುತ್ತದೆ; ಮಧ್ಯಮ ತೀವ್ರತೆ ಎಂದು ಪರಿಗಣಿಸಲಾಗಿದೆ."
    },
    systemic: {
      en: "HIGH: Rapidly advancing or systemic distribution observed.",
      hi: "उच्च: तेजी से बढ़ता या प्रणालीगत वितरण देखा गया।",
      ta: "அதிகம்: வேகமாக முன்னேறும் அல்லது உடலளவிலான பரவல் அவதானிக்கப்பட்டது.",
      te: "అధికం: వేగంగా పెరుగుతున్న లేదా శరీరం అంతటా విస్తరించిన వితరణ గమనించబడింది.",
      kn: "ಹೆಚ್ಚಿನ: ವೇಗವಾಗಿ ಮುನ್ನಡೆಯುತ್ತಿರುವ ಅಥವಾ ದೇಹದಾದ್ಯಂತ ಹರಡುವಿಕೆ ಕಂಡುಬಂದಿದೆ."
    },
    regional: {
      en: "Regional spread detected (+0.5).",
      hi: "क्षेत्रीय प्रसार का पता चला (+0.5)।",
      ta: "பிராந்திய பரவல் கண்டறியப்பட்டது (+0.5).",
      te: "ప్రాంతీయ వ్యాప్తి గుర్తించబడింది (+0.5).",
      kn: "ಪ್ರಾದೇಶಿಕ ಹರಡುವಿಕೆ ಕಂಡುಬಂದಿದೆ (+0.5)."
    },
    streaking: {
      en: "CRITICAL ALERT: Lymphangitis (red streaking) detected. Primary sign of infection entering vascular system (Sepsis risk).",
      hi: "गंभीर चेतावनी: लिम्फैंगाइटिस (लाल धारियां) का पता चला। यह सेप्सिस जोखिम का प्राथमिक संकेत है।",
      ta: "முக்கிய எச்சரிக்கை: நிணநீர் அழற்சி (சிவப்பு கோடுகள்) கண்டறியப்பட்டது. இரத்த நாள அமைப்பில் தொற்று நுழைவதற்கான முதன்மை அறிகுறி (செப்சிஸ் ஆபத்து).",
      te: "క్లిష్టమైన హెచ్చరిక: లింఫాంగైటిస్ (ఎర్ரటి గీతలు) గుర్తించబడింది. ఇది సెప్సిస్ ప్రమాదానికి ప్రాథమిక సంకేతం.",
      kn: "ಕ್ಲಿಷ್ಟಕರ ಎಚ್ಚರಿಕೆ: ಲಿಂಫಾಂಜೈಟಿಸ್ (ಕೆಂಪು ಗೆರೆಗಳು) ಕಂಡುಬಂದಿದೆ. ಇದು ಸೆಪ್ಸಿಸ್ ಅಪಾಯದ ಪ್ರಾಥಮಿಕ ಲಕ್ಷಣವಾಗಿದೆ."
    },
    inflammatory: {
      en: "Active inflammatory pattern (+0.25).",
      hi: "सक्रिय सूजन पैटर्न (+0.25)।",
      ta: "செயலில் உள்ள அழற்சி மாதிரி (+0.25).",
      te: "క్రియాశీల మంట నమూనా (+0.25).",
      kn: "ಸಕ್ರಿಯ ಉರಿಯೂತದ ಮಾದರಿ (+0.25)."
    },
    respiratory: {
      en: "EMERGENCY OVERRIDE: Respiratory distress or Neurological confusion detected (Organ dysfunction signs).",
      hi: "आपातकालीन ओवरराइड: सांस की तकलीफ या भ्रम का पता चला (अंग शिथिलता के संकेत)।",
      ta: "அவசர மேலெழுதல்: சுவாசக் கோளாறு அல்லது மனக்குழப்பம் கண்டறியப்பட்டது (உறுப்பு செயலிழப்பு அறிகுறிகள்).",
      te: "అత్యవసర ఓవర్‌రైడ్: శ్వాసకోశ ఇబ్బంది లేదా గందరగోళం గుర్తించబడింది (అంగాల బలహీనత సంకేతాలు).",
      kn: "ತುರ್ತು ಓವರ್‌ರೈಡ್: ಉಸಿರಾಟದ ತೊಂದರೆ ಅಥವಾ ಗೊಂದಲ ಕಂಡುಬಂದಿದೆ (ಅಂಗ ವೈಫಲ್ಯದ ಲಕ್ಷಣಗಳು)."
    },
    feverSepsis: {
      en: "CRITICAL: Localized infection combined with systemic fever indicates Sepsis or Bacteremia risk.",
      hi: "गंभीर: प्रणालीगत बुखार के साथ स्थानीयकृत संक्रमण सेप्सिस या बैक्टीरिमिया जोखिम का संकेत देता है।",
      ta: "முக்கியமானது: காய்ச்சலுடன் கூடிய உள்ளூர் தொற்று செப்சிஸ் ஆபத்தை குறிக்கிறது.",
      te: "క్లిష్టమైనది: జ్వరంతో కూడిన స్థానిక ఇన్ఫెక్షన్ సెప్సిస్ ప్రమాదాన్ని సూచిస్తుంది.",
      kn: "ಕ್ಲಿಷ್ಟಕರ: ಜ್ವರದೊಂದಿಗೆ ಸ್ಥಳೀಯ ಸೋಂಕು ಸೆಪ್ಸಿಸ್ ಅಪಾಯವನ್ನು ಸೂಚಿಸುತ್ತದೆ."
    },
    feverModerate: {
      en: "Moderate escalation: Local infection paired with systemic fever (+0.5).",
      hi: "मध्यम वृद्धि: स्थानीय संक्रमण के साथ बुखार (+0.5)।",
      ta: "மிதமான அதிகரிப்பு: உள்ளூர் தொற்றோடு காய்ச்சல் (+0.5).",
      te: "మధ్యస్థ పెరుగుదల: స్థానిక ఇన్ఫెక్షన్‌తో పాటు జ్వరం (+0.5).",
      kn: "ಮಧ್ಯಮ ಹೆಚ್ಚಳ: ಸ್ಥಳೀಯ ಸೋಂಕಿನೊಂದಿಗೆ ಜ್ವರ (+0.5)."
    },
    feverMild: {
      en: "Mild escalation: Fever reported (+0.5).",
      hi: "हल्की वृद्धि: बुखार की सूचना दी गई (+0.5)।",
      ta: "லேசான அதிகரிப்பு: காய்ச்சல் அறிக்கை செய்யப்பட்டது (+0.5).",
      te: "తేలికపాటి పెరుగుదల: జ్వరం నమోదైంది (+0.5)।",
      kn: "ಸಣ್ಣ ಹೆಚ್ಚಳ: ಜ್ವರ ವರದಿಯಾಗಿದೆ (+0.5)."
    },
    pain: {
      en: "Pain management escalation (+0.25).",
      hi: "दर्द प्रबंधन वृद्धि (+0.25)।",
      ta: "வலி மேலாண்மை அதிகரிப்பு (+0.25).",
      te: "నొప్పి నిర్వహణ పెరుగుదల (+0.25).",
      kn: "ನೋವು ನಿರ್ವಹಣೆ ಹೆಚ್ಚಳ (+0.25)."
    }
  };

  const getMsg = (key: string) => {
    const entry = reasoningDict[key];
    if (!entry) return '';
    return entry[lang] || entry['en'] || '';
  };

  const basePriority = conditionPriorities[ai.condition] || 1;
  score = basePriority;
  reasoning.push(`${getMsg('basePriorityPrefix')}${basePriority}/4.`);

  if (ai.tissueDamage === 'NECROTIC') {
    score = 4;
    reasoning.push(getMsg('necrotic'));
  } else if (ai.spread === 'SYSTEMIC' || ai.rapidSpread) {
    if (ai.condition?.toLowerCase() === 'chickenpox') {
      score = Math.max(score, 2.5);
      reasoning.push(getMsg('chickenpox'));
    } else {
      score = Math.max(score, 3.5);
      reasoning.push(getMsg('systemic'));
    }
  } else if (ai.spread === 'REGIONAL') {
    score += 0.5;
    reasoning.push(getMsg('regional'));
  }

  // 2b. Sepsis Indicators (Streaking)
  if (ai.streaking) {
    score = Math.max(score, 3.75);
    reasoning.push(getMsg('streaking'));
  }

  if (ai.swelling && ai.redness) {
    score += 0.25;
    reasoning.push(getMsg('inflammatory'));
  }

  // 3. Systemic Patient Symptom Logic (Escalation)
  if (patient.difficultyBreathing || patient.confusion) {
    score = 4;
    reasoning.push(getMsg('respiratory'));
  } else if (patient.fever) {
    if (score >= 3 || ai.condition === 'Cellulitis') {
      score = 4;
      reasoning.push(getMsg('feverSepsis'));
    } else if (score >= 2) {
      score = Math.max(score, 2.5);
      reasoning.push(getMsg('feverModerate'));
    } else {
      score += 0.5;
      reasoning.push(getMsg('feverMild'));
    }
  }

  if (patient.extremePain && score < 3) {
    score += 0.25;
    reasoning.push(getMsg('pain'));
  }

  // Final Mapping
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
  if (score >= 3.75) severity = 'CRITICAL';
  else if (score >= 3) severity = 'HIGH';
  else if (score >= 2) severity = 'MEDIUM';

  return {
    severity,
    emergency: score >= 3.5,
    reasoning
  };
}
