/**
 * Synthetic Labelled Dataset Generator and Evaluation Script
 * Computes Precision, Recall, F1 Score, and Confusion Matrix.
 * Validates Critical Class F1 score >= 0.80 without data leakage.
 */

const fs = require('fs');
const path = require('path');
const { classifyEmergency } = require('./triage');

const SYNTHETIC_EXAMPLES = [
  // CRITICAL SAMPLES
  { text: "Water entered 1st floor, children and elderly grandma trapped on roof with no food!", lang: "en", label: "CRITICAL", affected: 5, vul: 2 },
  { text: "पानी छत तक पहुँच गया है, 3 लोग डूब रहे हैं मदद भेजो तुरंत!", lang: "hi", label: "CRITICAL", affected: 3, vul: 1 },
  { text: "ఇంట్లో నీళ్లు మెడ వరకు వచ్చాయి, శిశువుతో మహిళ ఇరుక్కుపోయారు!", lang: "te", label: "CRITICAL", affected: 2, vul: 1 },
  { text: "Cardiac patient unconscious due to flood shock, chest pain, needs immediate boat ambulance", lang: "en", label: "CRITICAL", affected: 1, vul: 1 },
  { text: "Electric wire snapped into flood water, people shouting for rescue submerged!", lang: "en", label: "CRITICAL", affected: 4, vul: 0 },
  { text: "Pregnant lady having labour pain, house completely surrounded by 6ft water", lang: "en", label: "CRITICAL", affected: 2, vul: 1 },
  { text: "अस्पताल के आईसीयू में पानी भर गया है, ऑक्सीजन खत्म हो रही है", lang: "hi", label: "CRITICAL", affected: 10, vul: 5 },
  { text: "భవనం కూలిపోతోంది, 5 మంది శిథిలాల కింద ఇరుక్కుపోయారు!", lang: "te", label: "CRITICAL", affected: 5, vul: 2 },
  { text: "Drowning family of four clinging to electric pole near Musi river", lang: "en", label: "CRITICAL", affected: 4, vul: 2 },
  { text: "छत पर फंसे हैं, पानी तेजी से बढ़ रहा है, तुरंत हेलीकॉप्टर भेजो", lang: "hi", label: "CRITICAL", affected: 6, vul: 2 },
  { text: "నీటి ప్రవాహం చాలా బలంగా ఉంది, కొట్టుకుపోతున్నారు రక్షించండి!", lang: "te", label: "CRITICAL", affected: 3, vul: 0 },
  { text: "Submerged ground floor, diabetic grandfather has had no insulin for 24 hours, collapsed", lang: "en", label: "CRITICAL", affected: 3, vul: 1 },
  { text: "Baby suffering from hypothermia, shivering in flood water on terrace", lang: "en", label: "CRITICAL", affected: 3, vul: 1 },

  // URGENT SAMPLES
  { text: "Water level rising on the street, no electricity for 12 hours, request drinking water", lang: "en", label: "URGENT", affected: 4, vul: 1 },
  { text: "हमारे इलाके में राशन खत्म हो गया है, बच्चे भूखे हैं पीने का पानी भेजो", lang: "hi", label: "URGENT", affected: 5, vul: 2 },
  { text: "మా వీధిలో మోకాళ్ళ లోతు నీరు ఉంది, వృద్ధులకు మందులు కావాలి", lang: "te", label: "URGENT", affected: 3, vul: 1 },
  { text: "Wheelchair bound resident needs evacuation before nightfall, water near porch", lang: "en", label: "URGENT", affected: 1, vul: 1 },
  { text: "No drinking water available in relief camp, water purification tablets needed", lang: "en", label: "URGENT", affected: 25, vul: 5 },
  { text: "दुकानें बंद हैं, 2 दिन से खाना नहीं मिला, पानी बढ़ रहा है", lang: "hi", label: "URGENT", affected: 4, vul: 0 },
  { text: "కాలనీ అంతా నీటితో నిండిపోయింది, విద్యుత్ లేదు సహాయం కావాలి", lang: "te", label: "URGENT", affected: 6, vul: 1 },
  { text: "Asthma patient running low on inhalers, road blocked by 2 feet water", lang: "en", label: "URGENT", affected: 2, vul: 1 },
  { text: "Ground floor flooded, family shifted to neighbour terrace, need food packets", lang: "en", label: "URGENT", affected: 4, vul: 1 },
  { text: "मकान में 1 फुट पानी घुस गया है, सुरक्षित स्थान पर जाने के लिए नाव चाहिए", lang: "hi", label: "URGENT", affected: 3, vul: 0 },

  // INFORMATIONAL SAMPLES
  { text: "Is the road towards Begumpet bridge open for vehicles?", lang: "en", label: "INFORMATIONAL", affected: 1, vul: 0 },
  { text: "गांधी हॉस्पिटल जाने वाला रास्ता चालू है या बंद है?", lang: "hi", label: "INFORMATIONAL", affected: 1, vul: 0 },
  { text: "విజయవాడ బస్టాండ్ వైపు బస్సులు తిరుగుతున్నాయా?", lang: "te", label: "INFORMATIONAL", affected: 1, vul: 0 },
  { text: "Reporting clogged storm drain near colony gate, slight water logging on curb", lang: "en", label: "INFORMATIONAL", affected: 0, vul: 0 },
  { text: "When will relief supply trucks arrive at Sector 4 community hall?", lang: "en", label: "INFORMATIONAL", affected: 1, vul: 0 },
  { text: "बारिश रुक गई है, क्या पानी उतर रहा है?", lang: "hi", label: "INFORMATIONAL", affected: 0, vul: 0 },
  { text: "వర్షం తగ్గింది, కరెంట్ ఎప్పుడు వస్తుంది?", lang: "te", label: "INFORMATIONAL", affected: 0, vul: 0 },
  { text: "Inquiring about voluntary rescue helpline contact numbers", lang: "en", label: "INFORMATIONAL", affected: 1, vul: 0 }
];

function evaluateModel() {
  const classes = ['CRITICAL', 'URGENT', 'INFORMATIONAL'];
  const matrix = {
    CRITICAL: { CRITICAL: 0, URGENT: 0, INFORMATIONAL: 0 },
    URGENT: { CRITICAL: 0, URGENT: 0, INFORMATIONAL: 0 },
    INFORMATIONAL: { CRITICAL: 0, URGENT: 0, INFORMATIONAL: 0 }
  };

  for (const sample of SYNTHETIC_EXAMPLES) {
    const res = classifyEmergency(sample.text, sample.lang, sample.affected, sample.vul);
    matrix[sample.label][res.severity]++;
  }

  // Calculate Precision, Recall, F1 for CRITICAL class
  const tp = matrix.CRITICAL.CRITICAL;
  const fp = matrix.URGENT.CRITICAL + matrix.INFORMATIONAL.CRITICAL;
  const fn = matrix.CRITICAL.URGENT + matrix.CRITICAL.INFORMATIONAL;

  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  const f1 = (2 * precision * recall) / (precision + recall || 1);

  const report = {
    totalTestSamples: SYNTHETIC_EXAMPLES.length,
    confusionMatrix: matrix,
    criticalMetrics: {
      truePositives: tp,
      falsePositives: fp,
      falseNegatives: fn,
      precision: parseFloat(precision.toFixed(3)),
      recall: parseFloat(recall.toFixed(3)),
      f1Score: parseFloat(f1.toFixed(3))
    },
    passedTarget: f1 >= 0.80
  };

  return report;
}

if (require.main === module) {
  const results = evaluateModel();
  console.log('=== MULTILINGUAL TRIAGE EVALUATION REPORT ===');
  console.log(JSON.stringify(results, null, 2));
}

module.exports = {
  evaluateModel
};
