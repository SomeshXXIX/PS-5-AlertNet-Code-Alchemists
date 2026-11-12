// Translations Dictionary
const TRANSLATIONS = {
  en: {
    sosTitle: "EMERGENCY SOS",
    sosSubtitle: "Direct channel to Disaster Management Command Control",
    catLabel: "EMERGENCY TYPE",
    descLabel: "SITUATION DETAILS (English / हिंदी / తెలుగు)",
    peopleLabel: "PEOPLE AFFECTED",
    vulLabel: "VULNERABLE (Kids/Seniors)",
    locLabel: "LOCATION",
    phoneLabel: "CONTACT PHONE NUMBER",
    submitText: "SEND EMERGENCY SOS NOW",
    statusReceived: "RECEIVED",
    statusUnderReview: "UNDER REVIEW",
    statusAssigned: "TEAM ASSIGNED",
    statusEnRoute: "TEAM EN ROUTE",
    statusResolved: "RESOLVED"
  },
  hi: {
    sosTitle: "आपातकालीन एसओएस",
    sosSubtitle: "आपदा प्रबंधन नियंत्रण कक्ष से सीधा संपर्क",
    catLabel: "आपातकाल का प्रकार",
    descLabel: "स्थिति का विवरण (हिंदी / English / తెలుగు)",
    peopleLabel: "प्रभावित व्यक्तियों की संख्या",
    vulLabel: "अतिसंवेदनशील (बच्चे/बुजुर्ग)",
    locLabel: "स्थान",
    phoneLabel: "संपर्क फोन नंबर",
    submitText: "आपातकालीन सहायता मांगें",
    statusReceived: "प्राप्त हुआ (RECEIVED)",
    statusUnderReview: "समीक्षा जारी (UNDER REVIEW)",
    statusAssigned: "टीम नियुक्त (TEAM ASSIGNED)",
    statusEnRoute: "टीम रास्ते में है (EN ROUTE)",
    statusResolved: "समाधान संपन्न (RESOLVED)"
  },
  te: {
    sosTitle: "అత్యవసర SOS",
    sosSubtitle: "విపత్తు నిర్వహణ కమాండ్ కంట్రోల్ ప్రత్యక్ష మార్గం",
    catLabel: "అత్యవసర రకం",
    descLabel: "పరిస్థితి వివరాలు (తెలుగు / English / हिंदी)",
    peopleLabel: "ప్రభావితమైన వ్యక్తుల సంఖ్య",
    vulLabel: "పిల్లలు / వృద్ధులు",
    locLabel: "స్థానం",
    phoneLabel: "ఫోన్ నంబర్",
    submitText: "అత్యవసర సహాయం పంపండి",
    statusReceived: "అందుకుంది (RECEIVED)",
    statusUnderReview: "పరిశీలనలో ఉంది (UNDER REVIEW)",
    statusAssigned: "రెస్క్యూ బృందం నియమించబడింది",
    statusEnRoute: "రెస్క్యూ బృందం బయలుదేరింది",
    statusResolved: "సహాయం అందించబడింది (RESOLVED)"
  }
};

let currentLang = 'en';
let activeReportKey = localStorage.getItem('alertnet_active_sos_key');

// Offline SOS Queue (in LocalStorage)
function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem('alertnet_offline_sos_queue') || '[]');
  } catch (e) {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem('alertnet_offline_sos_queue', JSON.stringify(queue));
}

// Navigation Tabs
const tabs = {
  tabCitizen: document.getElementById('viewCitizen'),
  tabDashboard: document.getElementById('viewDashboard'),
  tabBroadcast: document.getElementById('viewBroadcast'),
  tabDrills: document.getElementById('viewDrills')
};

function switchTab(activeTabId) {
  Object.keys(tabs).forEach(tabId => {
    const btn = document.getElementById(tabId);
    const view = tabs[tabId];
    if (tabId === activeTabId) {
      btn.className = "px-3 py-1 text-xs font-semibold rounded-md bg-red-600 text-white transition";
      view.classList.remove('hidden');
    } else {
      btn.className = "px-3 py-1 text-xs font-semibold rounded-md text-slate-400 hover:text-white transition";
      view.classList.add('hidden');
    }
  });

  if (activeTabId === 'tabDashboard') {
    fetchIncidents();
    fetchTeams();
    fetchMetrics();
  } else if (activeTabId === 'tabBroadcast') {
    fetchBroadcasts();
  }
}

Object.keys(tabs).forEach(tabId => {
  document.getElementById(tabId).addEventListener('click', () => switchTab(tabId));
});

// Language Switcher
const langSelect = document.getElementById('langSelect');
langSelect.addEventListener('change', (e) => {
  currentLang = e.target.value;
  applyTranslations();
});

function applyTranslations() {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  document.getElementById('txtSosTitle').textContent = t.sosTitle;
  document.getElementById('txtSosSubtitle').textContent = t.sosSubtitle;
  document.getElementById('lblFormCategory').textContent = t.catLabel;
  document.getElementById('lblFormDesc').textContent = t.descLabel;
  document.getElementById('lblFormPeople').textContent = t.peopleLabel;
  document.getElementById('lblFormVulnerable').textContent = t.vulLabel;
  document.getElementById('lblFormLoc').textContent = t.locLabel;
  document.getElementById('lblFormPhone').textContent = t.phoneLabel;
  document.getElementById('btnSubmitText').textContent = t.submitText;
}

// Online/Offline detection & Banner
window.addEventListener('online', () => {
  document.getElementById('offlineBanner').classList.add('hidden');
  syncOfflineSOSQueue();
});
window.addEventListener('offline', () => {
  document.getElementById('offlineBanner').classList.remove('hidden');
});

// Detect Geolocation
document.getElementById('btnGetLocation').addEventListener('click', () => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById('latitude').value = pos.coords.latitude.toFixed(4);
        document.getElementById('longitude').value = pos.coords.longitude.toFixed(4);
        document.getElementById('addressText').value = `GPS: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
      },
      (err) => alert('Unable to fetch GPS. You can enter location manually.')
    );
  }
});

// Submit SOS Form
document.getElementById('sosForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const idempotencyKey = 'sos-key-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
  const payload = {
    idempotencyKey,
    category: document.getElementById('category').value,
    description: document.getElementById('description').value,
    affectedPeople: parseInt(document.getElementById('affectedPeople').value) || 1,
    vulnerableCount: parseInt(document.getElementById('vulnerableCount').value) || 0,
    latitude: parseFloat(document.getElementById('latitude').value) || 17.3850,
    longitude: parseFloat(document.getElementById('longitude').value) || 78.4867,
    addressText: document.getElementById('addressText').value,
    phone: document.getElementById('phone').value,
    language: currentLang
  };

  // If offline, save in queue
  if (!navigator.onLine) {
    const queue = getOfflineQueue();
    queue.push(payload);
    saveOfflineQueue(queue);
    alert('You are offline! SOS report queued securely on device and will sync immediately once online.');
    showSosStatus({ ...payload, id: 'LOCAL-QUEUED', status: 'PENDING_SYNC' });
    return;
  }

  try {
    const res = await fetch('/api/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('alertnet_active_sos_key', idempotencyKey);
      activeReportKey = idempotencyKey;
      showSosStatus(data.report);
      startPollingActiveStatus();
    } else {
      alert('Error submitting SOS: ' + data.error);
    }
  } catch (err) {
    // Fallback to offline queue on network drop
    const queue = getOfflineQueue();
    queue.push(payload);
    saveOfflineQueue(queue);
    alert('Network error. SOS saved offline and will auto-retry!');
    showSosStatus({ ...payload, id: 'LOCAL-QUEUED', status: 'PENDING_SYNC' });
  }
});

function showSosStatus(report) {
  document.getElementById('sosFormContainer').classList.add('hidden');
  const card = document.getElementById('sosStatusCard');
  card.classList.remove('hidden');

  document.getElementById('sosReportId').textContent = 'ID: ' + report.id;
  document.getElementById('sosStatusText').textContent = report.status;
  document.getElementById('sosReportCat').textContent = report.category;
  document.getElementById('sosReportLoc').textContent = `${report.latitude}, ${report.longitude}`;
  document.getElementById('sosReportTeam').textContent = report.team_name || 'Assessing incoming reports...';
  document.getElementById('sosReportTeamStatus').textContent = report.status;
}

document.getElementById('btnNewSOS').addEventListener('click', () => {
  localStorage.removeItem('alertnet_active_sos_key');
  activeReportKey = null;
  document.getElementById('sosStatusCard').classList.add('hidden');
  document.getElementById('sosFormContainer').classList.remove('hidden');
  document.getElementById('sosForm').reset();
});

// Auto Sync Offline Queue
async function syncOfflineSOSQueue() {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

  console.log(`[Offline Sync] Attempting to sync ${queue.length} reports...`);
  const remaining = [];

  for (const item of queue) {
    try {
      const res = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (!res.ok) remaining.push(item);
    } catch (e) {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  if (remaining.length === 0) {
    console.log('[Offline Sync] All offline SOS reports synced successfully!');
  }
}

// Polling active SOS status for citizen
function startPollingActiveStatus() {
  if (!activeReportKey) return;
  setInterval(async () => {
    if (!activeReportKey) return;
    try {
      const res = await fetch('/api/sos/' + activeReportKey);
      if (res.ok) {
        const data = await res.json();
        showSosStatus(data);
      }
    } catch (e) {}
  }, 3000);
}

// ---------------- COMMAND CENTER LOGIC ----------------

async function fetchMetrics() {
  try {
    const res = await fetch('/api/metrics');
    const data = await res.json();
    document.getElementById('mTotalSOS').textContent = data.totalSOS;
    document.getElementById('mCritical').textContent = data.criticalIncidents;
    document.getElementById('mUrgent').textContent = data.urgentIncidents;
    document.getElementById('mInfo').textContent = data.informationalIncidents;
    document.getElementById('mUnassigned').textContent = data.unassignedIncidents;
    document.getElementById('mActiveTeams').textContent = data.activeRescueTeams;
    document.getElementById('mAvailableTeams').textContent = data.availableRescueTeams;
  } catch (e) {}
}

async function fetchIncidents() {
  try {
    const res = await fetch('/api/incidents');
    const incidents = await res.json();
    const tbody = document.getElementById('incidentsTableBody');
    tbody.innerHTML = '';

    incidents.forEach(inc => {
      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-900/60 transition";

      const sevColor = inc.severity === 'CRITICAL' ? 'bg-red-950 text-red-400 border-red-800' :
                       (inc.severity === 'URGENT' ? 'bg-amber-950 text-amber-400 border-amber-800' : 'bg-blue-950 text-blue-400 border-blue-800');

      let needs = [];
      try { needs = JSON.parse(inc.extracted_needs || '[]'); } catch (e) {}

      tr.innerHTML = `
        <td class="p-2.5 font-bold">
          <span class="px-2 py-0.5 rounded text-[10px] border ${sevColor}">
            ${inc.severity}
          </span>
        </td>
        <td class="p-2.5">
          <p class="font-semibold text-slate-200">${inc.category}</p>
          <p class="text-[10px] text-slate-400">${inc.address_hint}</p>
          <div class="flex flex-wrap gap-1 mt-1">
            ${needs.map(n => `<span class="bg-slate-800 text-[9px] px-1.5 py-0.2 rounded text-slate-300">${n}</span>`).join('')}
          </div>
        </td>
        <td class="p-2.5 font-mono font-bold text-slate-100">${inc.priority_score}</td>
        <td class="p-2.5 text-slate-300">${inc.report_count} reports</td>
        <td class="p-2.5">
          ${inc.team_name ? `<span class="text-emerald-400 font-medium">${inc.team_name}</span>` : '<span class="text-orange-400 italic">Unassigned</span>'}
        </td>
        <td class="p-2.5 text-right space-x-1">
          <button onclick="overrideSeverityPrompt('${inc.id}')" class="bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded text-[10px]">
            Override
          </button>
          ${inc.status !== 'RESOLVED' ? `
            <button onclick="resolveIncident('${inc.id}')" class="bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 px-2 py-1 rounded text-[10px]">
              Resolve
            </button>
          ` : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (e) {}
}

async function fetchTeams() {
  try {
    const res = await fetch('/api/teams');
    const teams = await res.json();
    const list = document.getElementById('teamsList');
    list.innerHTML = '';

    teams.forEach(t => {
      const div = document.createElement('div');
      div.className = "bg-slate-950 border border-slate-800 p-2.5 rounded-lg flex items-center justify-between text-xs";
      
      const isAvail = t.status === 'AVAILABLE';
      const statusBadge = isAvail ? 'text-emerald-400 bg-emerald-950 border-emerald-800' : 'text-amber-400 bg-amber-950 border-amber-800';

      div.innerHTML = `
        <div>
          <p class="font-bold text-slate-200">${t.name}</p>
          <p class="text-[10px] text-slate-400">${t.leader_name} &bull; ${t.zone}</p>
        </div>
        <div class="flex items-center space-x-2">
          <span class="text-[9px] px-1.5 py-0.5 rounded border ${statusBadge}">${t.status}</span>
          ${isAvail ? `
            <button onclick="promptAssignTeam('${t.id}')" class="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-[10px] font-semibold">
              Assign
            </button>
          ` : ''}
        </div>
      `;
      list.appendChild(div);
    });
  } catch (e) {}
}

window.promptAssignTeam = async function(teamId) {
  const incId = prompt("Enter Incident ID to assign this team to (e.g. from the Live Queue):");
  if (!incId) return;

  try {
    const res = await fetch(`/api/incidents/${incId}/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, requestedBy: 'Commander_Dashboard' })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Team assigned successfully to incident ${incId}!`);
      fetchIncidents();
      fetchTeams();
      fetchMetrics();
    } else {
      alert(`Assignment Failed: ${data.error}`);
    }
  } catch (e) {
    alert('Error connecting to server.');
  }
};

window.resolveIncident = async function(incidentId) {
  if (!confirm("Are you sure you want to mark this incident as RESOLVED?")) return;
  try {
    await fetch(`/api/incidents/${incidentId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED' })
    });
    fetchIncidents();
    fetchTeams();
    fetchMetrics();
  } catch (e) {}
};

window.overrideSeverityPrompt = async function(incidentId) {
  const newSev = prompt("Enter new severity (CRITICAL, URGENT, INFORMATIONAL):");
  if (!newSev) return;
  const reason = prompt("Enter rationale for commander override:");
  try {
    await fetch(`/api/incidents/${incidentId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ severity: newSev.toUpperCase(), reason })
    });
    fetchIncidents();
  } catch (e) {}
};

document.getElementById('btnRefreshIncidents').addEventListener('click', () => {
  fetchIncidents();
  fetchTeams();
  fetchMetrics();
});

// ---------------- BROADCAST & FAN-OUT LOGIC ----------------

document.getElementById('broadcastForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    zone: document.getElementById('bZone').value,
    severity: document.getElementById('bSeverity').value,
    title: document.getElementById('bTitle').value,
    messageEn: document.getElementById('bMsgEn').value,
    messageHi: document.getElementById('bMsgHi').value,
    messageTe: document.getElementById('bMsgTe').value
  };

  try {
    const res = await fetch('/api/broadcasts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      alert(`Broadcast Campaign Dispatched!\nCampaign ID: ${data.campaignId}\nRecipients: ${data.totalResidents}\nTarget Jobs: ${data.totalTargetDeliveries}`);
      fetchBroadcasts();
    } else {
      alert('Broadcast dispatch failed: ' + data.error);
    }
  } catch (e) {
    alert('Network error while dispatching broadcast.');
  }
});

document.getElementById('btnSeedResidents').addEventListener('click', async () => {
  if (!confirm("Seed 100,000 synthetic residents in database?")) return;
  alert('Seeding 100,000 residents in background. This will take ~5 seconds...');
  try {
    const res = await fetch('/api/seed/residents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 100000 })
    });
    const data = await res.json();
    alert(`Success! Database now has ${data.residentCount} synthetic residents ready.`);
  } catch (e) {
    alert('Error seeding residents.');
  }
});

async function fetchBroadcasts() {
  try {
    const res = await fetch('/api/broadcasts');
    const data = await res.json();

    let smsCount = 0;
    let pushCount = 0;
    let emailCount = 0;

    (data.deliveryStats || []).forEach(st => {
      if (st.status === 'DELIVERED') {
        if (st.channel === 'SMS') smsCount += st.count;
        if (st.channel === 'PUSH') pushCount += st.count;
        if (st.channel === 'EMAIL') emailCount += st.count;
      }
    });

    document.getElementById('smsDeliveredCount').textContent = smsCount.toLocaleString();
    document.getElementById('pushDeliveredCount').textContent = pushCount.toLocaleString();
    document.getElementById('emailDeliveredCount').textContent = emailCount.toLocaleString();

    const list = document.getElementById('campaignsList');
    list.innerHTML = '';

    (data.campaigns || []).forEach(c => {
      const div = document.createElement('div');
      div.className = "bg-slate-950 border border-slate-800 p-3 rounded-lg text-xs";
      div.innerHTML = `
        <div class="flex justify-between font-bold text-slate-200">
          <span>${c.title}</span>
          <span class="text-amber-400">${c.status}</span>
        </div>
        <p class="text-[10px] text-slate-400 mt-1">Zone: ${c.zone} &bull; Total Target Residents: ${c.total_residents.toLocaleString()}</p>
        <div class="flex space-x-3 text-[10px] mt-2 text-slate-300">
          <span>SMS: <b class="text-blue-400">${c.sms_count.toLocaleString()}</b></span>
          <span>Push: <b class="text-purple-400">${c.push_count.toLocaleString()}</b></span>
          <span>Email: <b class="text-amber-400">${c.email_count.toLocaleString()}</b></span>
        </div>
      `;
      list.appendChild(div);
    });
  } catch (e) {}
}

document.getElementById('btnRefreshBroadcasts').addEventListener('click', fetchBroadcasts);

// ---------------- FAILURE SIMULATION DRILLS ----------------

let simState = { SMS: false, EMAIL: false };

document.getElementById('toggleSmsFailure').addEventListener('click', async () => {
  simState.SMS = !simState.SMS;
  await fetch('/api/simulation/failure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'SMS', enabled: simState.SMS })
  });

  const txt = document.getElementById('txtSmsStatus');
  const btn = document.getElementById('toggleSmsFailure');
  const badge = document.getElementById('smsStatusBadge');

  if (simState.SMS) {
    txt.textContent = "SIMULATED OUTAGE ACTIVE";
    txt.className = "text-xs text-red-500 font-bold";
    btn.textContent = "Restore SMS Gateway";
    badge.textContent = "OUTAGE / RETRYING";
    badge.className = "text-[10px] px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 mt-2 inline-block";
  } else {
    txt.textContent = "Provider Online";
    txt.className = "text-xs text-emerald-400";
    btn.textContent = "Simulate Outage";
    badge.textContent = "HEALTHY";
    badge.className = "text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 mt-2 inline-block";
  }
});

document.getElementById('toggleEmailFailure').addEventListener('click', async () => {
  simState.EMAIL = !simState.EMAIL;
  await fetch('/api/simulation/failure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: 'EMAIL', enabled: simState.EMAIL })
  });

  const txt = document.getElementById('txtEmailStatus');
  const btn = document.getElementById('toggleEmailFailure');
  const badge = document.getElementById('emailStatusBadge');

  if (simState.EMAIL) {
    txt.textContent = "SIMULATED OUTAGE ACTIVE";
    txt.className = "text-xs text-red-500 font-bold";
    btn.textContent = "Restore Email Gateway";
    badge.textContent = "OUTAGE / RETRYING";
    badge.className = "text-[10px] px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 mt-2 inline-block";
  } else {
    txt.textContent = "Provider Online";
    txt.className = "text-xs text-emerald-400";
    btn.textContent = "Simulate Outage";
    badge.textContent = "HEALTHY";
    badge.className = "text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 mt-2 inline-block";
  }
});

document.getElementById('btnInstanceProbe').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    document.getElementById('instanceProbeResult').textContent = `Served by: ${data.instanceId} (${data.status})`;
  } catch (e) {
    document.getElementById('instanceProbeResult').textContent = "Probe Failed";
  }
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Initial checks on page load
if (activeReportKey) {
  fetch('/api/sos/' + activeReportKey).then(r => r.json()).then(data => {
    if (data && !data.error) showSosStatus(data);
  }).catch(() => {});
  startPollingActiveStatus();
}
