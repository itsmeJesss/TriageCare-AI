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

export function calculateClinicalSeverity(ai: AISignals, patient: PatientSymptomLog) {
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

  const basePriority = conditionPriorities[ai.condition] || 1;
  score = basePriority;
  reasoning.push(`Base clinical priority for "${ai.condition}" is ${basePriority}/4.`);

  if (ai.tissueDamage === 'NECROTIC') {
    score = 4;
    reasoning.push("CRITICAL: Visual evidence of necrotic tissue/gangrene detected.");
  } else if (ai.spread === 'SYSTEMIC' || ai.rapidSpread) {
    if (ai.condition?.toLowerCase() === 'chickenpox') {
      score = Math.max(score, 2.5);
      reasoning.push("Chickenpox typically presents with systemic spread; considered medium severity.");
    } else {
      score = Math.max(score, 3.5);
      reasoning.push("HIGH: Rapidly advancing or systemic distribution observed.");
    }
  } else if (ai.spread === 'REGIONAL') {
    score += 0.5;
    reasoning.push("Regional spread detected (+0.5).");
  }

  // Sepsis risk factors
  if (ai.streaking) {
    score = Math.max(score, 3.75);
    reasoning.push("CRITICAL ALERT: Lymphangitis (red streaking) detected. This is a primary sign of infection entering the lymphatic/vascular system (Sepsis risk).");
  }

  if (ai.swelling && ai.redness) {
    score += 0.25;
    reasoning.push("Active inflammatory pattern (+0.25).");
  }

  // Systemic Overrides
  if (patient.difficultyBreathing || patient.confusion) {
    score = 4;
    reasoning.push("EMERGENCY OVERRIDE: Respiratory distress or Neurological confusion detected (Organ dysfunction signs).");
  } else if (patient.fever) {
    if (score >= 3 || ai.condition === 'Cellulitis') {
      score = 4;
      reasoning.push("CRITICAL: Localized infection (Cellulitis) combined with systemic fever indicates Sepsis or Bacteremia risk.");
    } else if (score >= 2) {
      score = Math.max(score, 2.5);
      reasoning.push("Moderate escalation: Local infection paired with systemic fever (+0.5).");
    } else {
      score += 0.5;
      reasoning.push("Mild escalation: Fever reported (+0.5).");
    }
  }

  if (patient.extremePain && score < 3) {
    score += 0.25;
    reasoning.push("Pain management escalation (+0.25).");
  }

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
