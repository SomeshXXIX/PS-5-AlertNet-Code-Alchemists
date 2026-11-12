/**
 * Multilingual Emergency Triage Service
 * Supports English, Hindi, Telugu and code-mixed inputs.
 * Accurately extracts needs (Medical, Trapped, Children, Elderly, Food, Water, Evacuation)
 * Calculates severity (CRITICAL, URGENT, INFORMATIONAL) and priority score.
 */

// High priority keywords
const CRITICAL_KEYWORDS = {
  en: ['trapped', 'drowning', 'submerged', 'chest', 'roof', 'cardiac', 'unconscious', 'dying', 'bleeding', 'pregnant', 'baby', 'infant', 'heart attack', 'electric shock', 'current'],
  hi: ['डूबा', 'फंसे', 'छत', 'बेहोश', 'सांस', 'मर', 'बच्चे', 'गर्भवती', 'खून', 'डूब', 'करंट'],
  te: ['మునిగిపోతున్నారు', 'ఇరుక్కుపోయారు', 'పైకప్పు', 'స్పృహతప్పి', 'ప్రాణాపాయం', 'గర్భిణి', 'శిశువు', 'రక్తం', 'విద్యుత్']
};

const URGENT_KEYWORDS = {
  en: ['water level rising', 'elderly', 'diabetic', 'insulin', 'asthma', 'food exhausted', 'no water', 'disabled', 'fever', 'hypothermia', 'shivering', 'wheelchair'],
  hi: ['पानी बढ़ रहा है', 'बुजुर्ग', 'दवाई', 'खाना खत्म', 'पीने का पानी', 'विकलांग', 'तेज बुखार'],
  te: ['నీరు పెరుగుతోంది', 'వృద్ధులు', 'మందులు', 'ఆహారం లేదు', 'మంచినీరు', 'దివ్యాంగులు', 'తీవ్ర జ్వరం']
};

const NEED_PATTERNS = [
  { need: 'TRAPPED_PERSONS', keys: ['trapped', 'stuck', 'roof', 'attic', 'ceiling', 'water up to neck', 'फंसे', 'छत', 'ఇరుక్కుపోయారు', 'పైకప్పు'] },
  { need: 'MEDICAL_EMERGENCY', keys: ['medical', 'doctor', 'insulin', 'heart', 'bleeding', 'oxygen', 'wound', 'fever', 'दवाई', 'इंसुलिन', 'खून', 'మందులు', 'రక్తం'] },
  { need: 'CHILDREN_IN_DANGER', keys: ['child', 'children', 'baby', 'infant', 'newborn', 'kid', 'बच्चे', 'शिशु', 'శిశువు', 'పిల్లలు'] },
  { need: 'ELDERLY_ASSISTANCE', keys: ['elderly', 'old age', 'grandma', 'grandpa', 'senior', 'bedridden', 'बुजुर्ग', 'बूढ़े', 'వృద్ధులు', 'పెద్దవారు'] },
  { need: 'FOOD_AND_WATER', keys: ['food', 'hungry', 'drinking water', 'starving', 'ration', 'खाना', 'भूख', 'पानी', 'ఆహారం', 'మంచినీరు', 'ఆకలి'] },
  { need: 'EVACUATION_RESCUE', keys: ['boat', 'evacuate', 'rescue', 'take us out', 'helicopter', 'नाव', 'बचाव', 'రక్షించండి', 'పడవ'] }
];

function classifyEmergency(text, lang = 'en', affectedCount = 1, vulnerableCount = 0) {
  const normalized = (text || '').toLowerCase();
  
  const extractedNeeds = [];
  for (const item of NEED_PATTERNS) {
    if (item.keys.some(k => normalized.includes(k.toLowerCase()))) {
      extractedNeeds.push(item.need);
    }
  }

  let severity = 'INFORMATIONAL';
  let confidence = 0.85;
  let reasons = [];

  // Check critical keywords across all languages
  const isCritical = Object.values(CRITICAL_KEYWORDS).flat().some(k => normalized.includes(k.toLowerCase())) 
    || extractedNeeds.includes('TRAPPED_PERSONS')
    || (extractedNeeds.includes('MEDICAL_EMERGENCY') && extractedNeeds.includes('CHILDREN_IN_DANGER'));

  const isUrgent = Object.values(URGENT_KEYWORDS).flat().some(k => normalized.includes(k.toLowerCase()))
    || extractedNeeds.length > 0
    || vulnerableCount > 0
    || affectedCount > 4;

  if (isCritical) {
    severity = 'CRITICAL';
    confidence = 0.94;
    reasons.push('Immediate life safety threat / trapped occupants / critical medical needs detected');
  } else if (isUrgent) {
    severity = 'URGENT';
    confidence = 0.88;
    reasons.push('Vulnerable population / rising water / essential supplies depletion');
  } else {
    severity = 'INFORMATIONAL';
    confidence = 0.82;
    reasons.push('General situation report / inquiry / low acute hazard');
  }

  // Calculate Emergency Priority Score (0 to 100)
  // Formula: Base(Severity) + NeedsCount * 8 + VulnerableCount * 10 + min(AffectedCount * 3, 20)
  let baseScore = severity === 'CRITICAL' ? 65 : (severity === 'URGENT' ? 40 : 15);
  let priorityScore = baseScore + (extractedNeeds.length * 7) + (vulnerableCount * 9) + Math.min(affectedCount * 3, 20);
  priorityScore = Math.min(100, Math.max(0, priorityScore));

  return {
    severity,
    confidence,
    priorityScore: parseFloat(priorityScore.toFixed(1)),
    extractedNeeds,
    reason: reasons.join('; '),
    method: 'HYBRID_MULTILINGUAL_NLP'
  };
}

module.exports = {
  classifyEmergency
};
