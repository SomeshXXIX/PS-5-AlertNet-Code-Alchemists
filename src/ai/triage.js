/**
 * Multilingual Emergency Triage Service
 * Supports English, Hindi, Telugu and code-mixed inputs.
 * Accurately extracts needs (Medical, Trapped, Children, Elderly, Food, Water, Evacuation)
 * Calculates severity (CRITICAL, URGENT, INFORMATIONAL) and priority score.
 */

// Regex patterns to detect gibberish, spam, repeated letters/symbols
const REPEATED_CHAR_REGEX = /(.)\1{4,}/i; // 5 or more identical chars in a row (e.g. aaaaa, !!!!!)
const REPEATED_WORD_REGEX = /\b(\w+)\b(\s+\1\b){3,}/i; // same word repeated 4+ times

// Common keyboard smash patterns or meaningless tokens
const KEYBOARD_SMASH_PATTERNS = [
  /[asdfghjkl]{6,}/i,
  /[qwertyuiop]{6,}/i,
  /[zxcvbnm]{6,}/i,
  /^[^a-zA-Z0-9\u0900-\u097F\u0c00-\u0c7F]+$/ // symbols only e.g. "!!!!!!!"
];

/**
 * Validates citizen emergency situation description
 * Supports English, Hindi (Devanagari \u0900-\u097F), Telugu (\u0C00-\u0C7F)
 */
function validateSituationDescription(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, code: 'EMPTY_DESCRIPTION', error: 'Emergency description is required.' };
  }

  const trimmed = text.trim();
  if (trimmed.length < 5) {
    return { valid: false, code: 'TOO_SHORT', error: 'Description is too short. Please provide brief situation details (minimum 5 characters).' };
  }

  if (trimmed.length > 2000) {
    return { valid: false, code: 'TOO_LONG', error: 'Description exceeds maximum allowed length (2000 characters).' };
  }

  // Check for repeated characters like 'aaaaaaa' or '!!!!!!!'
  if (REPEATED_CHAR_REGEX.test(trimmed)) {
    return { valid: false, code: 'REPEATED_CHARS', error: 'Input contains excessive repeated characters. Please enter a meaningful description.' };
  }

  // Check for repeated words like 'nothing nothing nothing nothing'
  if (REPEATED_WORD_REGEX.test(trimmed)) {
    return { valid: false, code: 'SPAM_REPEATED_WORDS', error: 'Input contains repetitive words. Please enter meaningful emergency details.' };
  }

  // Check if text has any valid letters (Latin, Devanagari, Telugu)
  const hasLetters = /[a-zA-Z\u0900-\u097F\u0c00-\u0c7F]/.test(trimmed);
  if (!hasLetters) {
    return { valid: false, code: 'NO_READABLE_TEXT', error: 'Description must contain readable words in English, Hindi, or Telugu.' };
  }

  // Check keyboard smash patterns
  const cleanWord = trimmed.replace(/[^a-zA-Z]/g, '').toLowerCase();
  for (const pattern of KEYBOARD_SMASH_PATTERNS) {
    if (pattern.test(cleanWord) || pattern.test(trimmed)) {
      return { valid: false, code: 'GIBBERISH_DETECTED', error: 'Description appears to be keyboard mash or invalid text. Please describe your situation.' };
    }
  }

  return { valid: true };
}

// Word boundary matching for clean English keywords; substring for Hindi/Telugu
function matchesKeyword(text, keyword) {
  const isAscii = /^[\x00-\x7F]+$/.test(keyword);
  if (isAscii && keyword.length <= 15) {
    // Use word boundary for English words to prevent false substrings
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    return regex.test(text);
  }
  return text.toLowerCase().includes(keyword.toLowerCase());
}

// High priority keywords
const CRITICAL_KEYWORDS = {
  en: ['trapped', 'drowning', 'submerged', 'chest pain', 'roof', 'rooftop', 'cardiac', 'unconscious', 'dying', 'bleeding', 'pregnant', 'baby', 'infant', 'heart attack', 'electric shock', 'current'],
  hi: ['डूबा', 'फंसे', 'छत', 'बेहोश', 'सांस', 'मर', 'बच्चे', 'गर्भवती', 'खून', 'डूब', 'करंट'],
  te: ['మునిగిపోతున్నారు', 'ఇరుక్కుపోయారు', 'పైకప్పు', 'స్పృహతప్పి', 'ప్రాణాపాయం', 'గర్భిణి', 'శిశువు', 'రక్తం', 'విద్యుత్']
};

const URGENT_KEYWORDS = {
  en: ['water level rising', 'elderly', 'diabetic', 'insulin', 'asthma', 'food exhausted', 'no water', 'disabled', 'fever', 'hypothermia', 'shivering', 'wheelchair'],
  hi: ['पानी बढ़ रहा है', 'बुजुर्ग', 'दवाई', 'खाना खत्म', 'पीने का पानी', 'विकलांग', 'तेज बुखार'],
  te: ['నీరు పెరుగుతోంది', 'వృద్ధులు', 'మందులు', 'ఆహారం లేదు', 'మంచినీరు', 'దివ్యాంగులు', 'తీవ్ర జ్వరం']
};

const NEED_PATTERNS = [
  { need: 'TRAPPED_PERSONS', keys: ['trapped', 'stuck', 'roof', 'rooftop', 'attic', 'ceiling', 'water up to neck', 'फंसे', 'छत', 'ఇరుక్కుపోయారు', 'పైకప్పు'] },
  { need: 'MEDICAL_EMERGENCY', keys: ['medical', 'doctor', 'insulin', 'heart', 'bleeding', 'oxygen', 'wound', 'fever', 'unconscious', 'cardiac', 'दवाई', 'इंसुलिन', 'खून', 'మందులు', 'రక్తం'] },
  { need: 'CHILDREN_IN_DANGER', keys: ['child', 'children', 'baby', 'infant', 'newborn', 'kid', 'बच्चे', 'शिशु', 'శిశువు', 'పిల్లలు'] },
  { need: 'ELDERLY_ASSISTANCE', keys: ['elderly', 'old age', 'grandma', 'grandpa', 'senior', 'bedridden', 'बुजुर्ग', 'बूढ़े', 'వృద్ధులు', 'పెద్దవారు'] },
  { need: 'FOOD_AND_WATER', keys: ['food', 'hungry', 'drinking water', 'starving', 'ration', 'खाना', 'भूख', 'पानी', 'ఆహారం', 'మంచినీరు', 'ఆకలి'] },
  { need: 'EVACUATION_RESCUE', keys: ['boat', 'evacuate', 'evacuation', 'rescue', 'take us out', 'helicopter', 'नाव', 'बचाव', 'రక్షించండి', 'పడవ'] }
];

function classifyEmergency(text, lang = 'en', affectedCount = 1, vulnerableCount = 0) {
  const normalized = (text || '').toLowerCase();
  
  const extractedNeeds = [];
  for (const item of NEED_PATTERNS) {
    if (item.keys.some(k => matchesKeyword(normalized, k))) {
      extractedNeeds.push(item.need);
    }
  }

  let severity = 'INFORMATIONAL';
  let confidence = 0.85;
  let reasons = [];

  // Check critical keywords across all languages
  const isCritical = Object.values(CRITICAL_KEYWORDS).flat().some(k => matchesKeyword(normalized, k)) 
    || extractedNeeds.includes('TRAPPED_PERSONS')
    || (extractedNeeds.includes('MEDICAL_EMERGENCY') && extractedNeeds.includes('CHILDREN_IN_DANGER'));

  const isUrgent = Object.values(URGENT_KEYWORDS).flat().some(k => matchesKeyword(normalized, k))
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
  validateSituationDescription,
  classifyEmergency,
  matchesKeyword
};
