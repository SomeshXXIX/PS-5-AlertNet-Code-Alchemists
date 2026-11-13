// AlertNet Tactical Operations Frontend Logic
// Translations Dictionary
const TRANSLATIONS = {
  en: {
    sosTitle: "EMERGENCY SOS",
    sosSubtitle: "Direct priority ingestion to Flood Incident Command. Every request is backed by durable outbox transactions.",
    catLabel: "1. EMERGENCY TYPE",
    descLabel: "2. SITUATION DETAILS (English / हिंदी / తెలుగు)",
    peopleLabel: "PEOPLE AFFECTED",
    vulLabel: "VULNERABLE (Kids/Elderly)",
    locLabel: "3. INCIDENT LOCATION",
    phoneLabel: "4. CONTACT PHONE NUMBER",
    submitText: "SEND EMERGENCY SOS NOW",
    statusReceived: "RECEIVED",
    statusUnderReview: "UNDER REVIEW",
    statusAssigned: "TEAM ASSIGNED",
    statusEnRoute: "TEAM EN ROUTE",
    statusResolved: "RESOLVED"
  },
  hi: {
    sosTitle: "आपातकालीन एसओएस (EMERGENCY SOS)",
    sosSubtitle: "बाढ़ आपदा नियंत्रण केंद्र से सीधा संपर्क। डेटा तुरंत सुरक्षित किया जाता है।",
    catLabel: "1. आपातकाल का प्रकार",
    descLabel: "2. स्थिति का विवरण (हिंदी / English / తెలుగు)",
    peopleLabel: "प्रभावित व्यक्तियों की संख्या",
    vulLabel: "अतिसंवेदनशील (बच्चे/बुजुर्ग)",
    locLabel: "3. घटना स्थल",
    phoneLabel: "4. संपर्क फोन नंबर",
    submitText: "आपातकालीन सहायता मांगें (SEND SOS)",
    statusReceived: "प्राप्त हुआ (RECEIVED)",
    statusUnderReview: "समीक्षा जारी (UNDER REVIEW)",
    statusAssigned: "टीम नियुक्त (TEAM ASSIGNED)",
    statusEnRoute: "टीम रास्ते में है (EN ROUTE)",
    statusResolved: "समाधान संपन्न (RESOLVED)"
  },
  te: {
    sosTitle: "అత్యవసర SOS (EMERGENCY SOS)",
    sosSubtitle: "వరద విపత్తు కమాండ్ కంట్రోల్ ప్రత్యక్ష మార్గం. అత్యవసర డేటా భద్రపరచబడుతుంది.",
    catLabel: "1. అత్యవసర రకం",
    descLabel: "2. పరిస్థితి వివరాలు (తెలుగు / English / हिंदी)",
    peopleLabel: "ప్రభావితమైన వ్యక్తుల సంఖ్య",
    vulLabel: "పిల్లలు / వృద్ధులు",
    locLabel: "3. సంఘటన స్థలం",
    phoneLabel: "4. సంప్రదింపు ఫోన్ నంబర్",
    submitText: "అత్యవసర సహాయం పంపండి (SEND SOS)",
    statusReceived: "అందుకుంది (RECEIVED)",
    statusUnderReview: "పరిశీలనలో ఉంది (UNDER REVIEW)",
    statusAssigned: "రెస్క్యూ బృందం నియమించబడింది",
    statusEnRoute: "రెస్క్యూ బృందం బయలుదేరింది",
    statusResolved: "సహాయం అందించబడింది (RESOLVED)"
  }
};

let currentLang = 'en';
let activeReportKey = localStorage.getItem('alertnet_active_sos_key');

// Toast Notification System
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'ops-toast';

  let icon = '<i class="fa-solid fa-circle-info text-opsSky"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check text-opsEmerald"></i>';
  if (type === 'error') icon = '<i class="fa-solid fa-circle-exclamation text-red-400"></i>';
  if (type === 'warning') icon = '<i class="fa-solid fa-triangle-exclamation text-amber-400"></i>';

  toast.innerHTML = `
    ${icon}
    <div class="font-medium">${message}</div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Live Mission Clock (IST)
function updateClock() {
  const clockEl = document.getElementById('missionClock');
  if (!clockEl) return;
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const ist = new Date(utc + (3600000 * 5.5));
  clockEl.textContent = ist.toTimeString().split(' ')[0] + ' IST';
}
setInterval(updateClock, 1000);
updateClock();

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
      if (btn) btn.className = "px-3.5 py-1.5 text-xs font-semibold rounded-md bg-red-600 text-white shadow-sm transition flex items-center gap-2";
      if (view) view.classList.remove('hidden');
    } else {
      if (btn) btn.className = "px-3.5 py-1.5 text-xs font-semibold rounded-md text-slate-400 hover:text-white transition flex items-center gap-2";
      if (view) view.classList.add('hidden');
    }
  });

  // Mobile menu buttons sync
  const mobTabs = {
    mobTabCitizen: 'tabCitizen',
    mobTabDashboard: 'tabDashboard',
    mobTabBroadcast: 'tabBroadcast',
    mobTabDrills: 'tabDrills'
  };
  Object.keys(mobTabs).forEach(mobId => {
    const mobBtn = document.getElementById(mobId);
    if (!mobBtn) return;
    if (mobTabs[mobId] === activeTabId) {
      mobBtn.className = "w-full text-left px-3 py-2 text-xs font-semibold rounded-md bg-red-600 text-white flex items-center justify-between";
    } else {
      mobBtn.className = "w-full text-left px-3 py-2 text-xs font-semibold rounded-md text-slate-300 hover:bg-opsSurface2 flex items-center justify-between";
    }
  });

  const mobMenu = document.getElementById('mobileMenu');
  if (mobMenu) mobMenu.classList.add('hidden');

  if (activeTabId === 'tabDashboard') {
    fetchIncidents();
    fetchTeams();
    fetchMetrics();
  } else if (activeTabId === 'tabBroadcast') {
    fetchBroadcasts();
  }
}

Object.keys(tabs).forEach(tabId => {
  const el = document.getElementById(tabId);
  if (el) el.addEventListener('click', () => switchTab(tabId));
});

// Mobile menu handlers
const mobMap = [
  ['mobTabCitizen', 'tabCitizen'],
  ['mobTabDashboard', 'tabDashboard'],
  ['mobTabBroadcast', 'tabBroadcast'],
  ['mobTabDrills', 'tabDrills']
];
mobMap.forEach(([mobId, targetTabId]) => {
  const el = document.getElementById(mobId);
  if (el) el.addEventListener('click', () => switchTab(targetTabId));
});

const mobileMenuBtn = document.getElementById('mobileMenuBtn');
if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => {
    const mobMenu = document.getElementById('mobileMenu');
    if (mobMenu) mobMenu.classList.toggle('hidden');
  });
}

// Category radio sync with hidden category select
document.querySelectorAll('input[name="catRadio"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    const select = document.getElementById('category');
    if (select) select.value = e.target.value;
  });
});

// Language Switcher
const langSelect = document.getElementById('langSelect');
if (langSelect) {
  langSelect.addEventListener('change', (e) => {
    currentLang = e.target.value;
    applyTranslations();
    showToast(`Interface language switched to ${e.target.options[e.target.selectedIndex].text}`, 'info');
  });
}

function applyTranslations() {
  const t = TRANSLATIONS[currentLang] || TRANSLATIONS.en;
  const ids = [
    ['txtSosTitle', t.sosTitle],
    ['txtSosSubtitle', t.sosSubtitle],
    ['lblFormCategory', t.catLabel],
    ['lblFormDesc', t.descLabel],
    ['lblFormPeople', t.peopleLabel],
    ['lblFormVulnerable', t.vulLabel],
    ['lblFormLoc', t.locLabel],
    ['lblFormPhone', t.phoneLabel],
    ['btnSubmitText', t.submitText]
  ];
  ids.forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

// Online/Offline detection
window.addEventListener('online', () => {
  const b = document.getElementById('offlineBanner');
  if (b) b.classList.add('hidden');
  showToast('Network restored! Synchronizing cached offline reports...', 'success');
  syncOfflineSOSQueue();
});
window.addEventListener('offline', () => {
  const b = document.getElementById('offlineBanner');
  if (b) b.classList.remove('hidden');
  showToast('Operating offline. Reports will queue on device.', 'warning');
});

// Detect Geolocation
const btnGetLocation = document.getElementById('btnGetLocation');
if (btnGetLocation) {
  btnGetLocation.addEventListener('click', () => {
    if (navigator.geolocation) {
      btnGetLocation.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting...';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          document.getElementById('latitude').value = pos.coords.latitude.toFixed(4);
          document.getElementById('longitude').value = pos.coords.longitude.toFixed(4);
          document.getElementById('addressText').value = `GPS Fix: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
          btnGetLocation.innerHTML = '<i class="fa-solid fa-circle-check text-opsEmerald"></i> Coordinates Set';
          showToast('GPS coordinates locked successfully.', 'success');
        },
        (err) => {
          btnGetLocation.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Detect Geolocation';
          showToast('GPS auto-detect unavailable. Manual input active.', 'warning');
        }
      );
    }
  });
}

// Submit SOS Form
const sosForm = document.getElementById('sosForm');
if (sosForm) {
  sosForm.addEventListener('submit', async (e) => {
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

    if (!navigator.onLine) {
      const queue = getOfflineQueue();
      queue.push(payload);
      saveOfflineQueue(queue);
      showToast('Offline Mode: SOS saved securely on device. Auto-sync will trigger on connection.', 'warning');
      showSosStatus({ ...payload, id: 'LOCAL-QUEUED', status: 'PENDING_SYNC' });
      return;
    }

    try {
      const submitBtn = document.getElementById('btnSubmitSOS');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>COMMITTING TRANSACTION...</span>';
      }

      const res = await fetch('/api/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span id="btnSubmitText">SEND EMERGENCY SOS NOW</span>';
      }

      if (res.ok) {
        localStorage.setItem('alertnet_active_sos_key', idempotencyKey);
        activeReportKey = idempotencyKey;
        showToast('SOS received and committed durably to command queue!', 'success');
        showSosStatus(data.report);
        startPollingActiveStatus();
      } else {
        showToast('Error submitting SOS: ' + (data.error || 'Server error'), 'error');
      }
    } catch (err) {
      const queue = getOfflineQueue();
      queue.push(payload);
      saveOfflineQueue(queue);
      showToast('Network timeout. SOS saved offline and will auto-sync.', 'warning');
      showSosStatus({ ...payload, id: 'LOCAL-QUEUED', status: 'PENDING_SYNC' });
    }
  });
}

function showSosStatus(report) {
  const formContainer = document.getElementById('sosFormContainer');
  if (formContainer) formContainer.classList.add('hidden');
  const card = document.getElementById('sosStatusCard');
  if (card) card.classList.remove('hidden');

  document.getElementById('sosReportId').textContent = 'ID: ' + report.id;
  document.getElementById('sosStatusText').textContent = report.status;
  document.getElementById('sosReportCat').textContent = report.category;
  document.getElementById('sosReportLoc').textContent = `${report.latitude}, ${report.longitude}`;
  document.getElementById('sosReportTeam').textContent = report.team_name || 'Assessing incoming emergency sector...';
  document.getElementById('sosReportTeamStatus').textContent = report.status;

  // Timeline Step Indicators
  const sReceived = document.getElementById('stepReceived');
  const sReview = document.getElementById('stepReview');
  const sAssigned = document.getElementById('stepAssigned');
  const sEnRoute = document.getElementById('stepEnRoute');

  const baseInactive = 'p-2 rounded bg-opsCanvas text-slate-500 border border-opsBorder';
  const baseActive = 'p-2 rounded bg-amber-950/80 text-amber-400 border border-amber-800 font-bold';
  const baseSuccess = 'p-2 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 font-bold';

  if (sReceived) sReceived.className = baseSuccess;
  if (sReview) sReview.className = (report.status !== 'PENDING_SYNC' && report.status !== 'RECEIVED') ? baseSuccess : baseActive;
  if (sAssigned) sAssigned.className = (report.status === 'TEAM_ASSIGNED' || report.status === 'TEAM_EN_ROUTE' || report.status === 'RESOLVED') ? baseSuccess : baseInactive;
  if (sEnRoute) sEnRoute.className = (report.status === 'TEAM_EN_ROUTE' || report.status === 'RESOLVED') ? baseSuccess : baseInactive;
}

const btnNewSOS = document.getElementById('btnNewSOS');
if (btnNewSOS) {
  btnNewSOS.addEventListener('click', () => {
    localStorage.removeItem('alertnet_active_sos_key');
    activeReportKey = null;
    document.getElementById('sosStatusCard').classList.add('hidden');
    document.getElementById('sosFormContainer').classList.remove('hidden');
    document.getElementById('sosForm').reset();
  });
}

// Auto Sync Offline Queue
async function syncOfflineSOSQueue() {
  const queue = getOfflineQueue();
  if (queue.length === 0) return;

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
    showToast('All cached offline SOS reports successfully committed to server.', 'success');
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
    document.getElementById('mTotalSOS').textContent = data.totalSOS.toLocaleString();
    document.getElementById('mCritical').textContent = data.criticalIncidents.toLocaleString();
    document.getElementById('mUrgent').textContent = data.urgentIncidents.toLocaleString();
    document.getElementById('mInfo').textContent = data.informationalIncidents.toLocaleString();
    document.getElementById('mUnassigned').textContent = data.unassignedIncidents.toLocaleString();
    document.getElementById('mActiveTeams').textContent = data.activeRescueTeams.toLocaleString();
    document.getElementById('mAvailableTeams').textContent = data.availableRescueTeams.toLocaleString();

    // Nav badge
    const badge = document.getElementById('navIncidentBadge');
    if (badge) {
      if (data.criticalIncidents > 0) {
        badge.textContent = data.criticalIncidents + ' Critical';
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  } catch (e) {}
}

async function fetchIncidents() {
  try {
    const res = await fetch('/api/incidents');
    const incidents = await res.json();
    const tbody = document.getElementById('incidentsTableBody');
    tbody.innerHTML = '';

    if (incidents.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-6 text-center text-slate-400 font-mono-tabular">
            <i class="fa-solid fa-circle-check text-opsEmerald text-lg mb-2 block"></i>
            NO ACTIVE CRITICAL BREACHES RECORDED IN SECTOR
          </td>
        </tr>
      `;
      return;
    }

    incidents.forEach(inc => {
      const tr = document.createElement('tr');
      tr.className = "hover:bg-opsCanvas/70 transition border-b border-opsBorder/60";

      const sevColor = inc.severity === 'CRITICAL' ? 'bg-red-950/90 text-red-400 border-red-800' :
                       (inc.severity === 'URGENT' ? 'bg-amber-950/90 text-amber-400 border-amber-800' : 'bg-blue-950/90 text-opsSky border-blue-800');

      let needs = [];
      try { needs = JSON.parse(inc.extracted_needs || '[]'); } catch (e) {}

      tr.innerHTML = `
        <td class="p-3 font-bold font-mono-tabular">
          <span class="px-2 py-0.5 rounded text-[10px] border ${sevColor} tracking-wider">
            ${inc.severity}
          </span>
        </td>
        <td class="p-3">
          <p class="font-bold text-slate-100">${inc.category}</p>
          <p class="text-[10px] text-slate-400 font-mono-tabular mt-0.5">${inc.address_hint}</p>
          <div class="flex flex-wrap gap-1 mt-1.5">
            ${needs.map(n => `<span class="bg-opsSurface3 text-[9px] font-mono-tabular px-1.5 py-0.2 rounded text-slate-300 border border-opsBorder">${n}</span>`).join('')}
          </div>
        </td>
        <td class="p-3 font-mono-tabular font-extrabold text-sm text-slate-100">${inc.priority_score}</td>
        <td class="p-3 text-slate-300 font-mono-tabular">${inc.report_count} clustered</td>
        <td class="p-3">
          ${inc.team_name ? `<span class="text-opsEmerald font-semibold flex items-center gap-1.5"><i class="fa-solid fa-circle-dot text-[8px]"></i> ${inc.team_name}</span>` : '<span class="text-orange-400 font-mono-tabular italic">Unassigned</span>'}
        </td>
        <td class="p-3 text-right space-x-1 font-mono-tabular">
          <button onclick="overrideSeverityPrompt('${inc.id}')" class="bg-opsSurface2 hover:bg-opsSurface3 text-slate-300 border border-opsBorder px-2.5 py-1 rounded text-[10px] transition cursor-pointer">
            Override
          </button>
          ${inc.status !== 'RESOLVED' ? `
            <button onclick="resolveIncident('${inc.id}')" class="bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded text-[10px] transition cursor-pointer">
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
      div.className = "bg-opsCanvas border border-opsBorder p-3 rounded-lg flex items-center justify-between text-xs hover:border-opsBorderLight transition";
      
      const isAvail = t.status === 'AVAILABLE';
      const statusBadge = isAvail ? 'text-opsEmerald bg-emerald-950/80 border-emerald-800' : 'text-amber-400 bg-amber-950/80 border-amber-800';

      div.innerHTML = `
        <div>
          <p class="font-bold text-slate-100 flex items-center gap-1.5">
            <span>${t.name}</span>
            <span class="text-[9px] font-mono-tabular text-slate-400">(${t.capacity} Divers)</span>
          </p>
          <p class="text-[10px] text-slate-400 font-mono-tabular mt-0.5">${t.leader_name} &bull; ${t.zone}</p>
        </div>
        <div class="flex items-center space-x-2 font-mono-tabular">
          <span class="text-[9px] px-1.5 py-0.5 rounded border ${statusBadge}">${t.status}</span>
          ${isAvail ? `
            <button onclick="promptAssignTeam('${t.id}')" class="bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white px-2.5 py-1 rounded text-[10px] font-bold shadow-sm cursor-pointer">
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
      showToast(`Team assigned successfully to incident ${incId}!`, 'success');
      fetchIncidents();
      fetchTeams();
      fetchMetrics();
    } else {
      showToast(`Assignment Rejected: ${data.error}`, 'error');
    }
  } catch (e) {
    showToast('Failed to contact server.', 'error');
  }
};

window.resolveIncident = async function(incidentId) {
  if (!confirm("Confirm resolution for incident " + incidentId + "? This will free assigned units.")) return;
  try {
    await fetch(`/api/incidents/${incidentId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED' })
    });
    showToast('Incident marked as RESOLVED. Team returned to ready reserve.', 'success');
    fetchIncidents();
    fetchTeams();
    fetchMetrics();
  } catch (e) {}
};

window.overrideSeverityPrompt = async function(incidentId) {
  const newSev = prompt("Enter override severity (CRITICAL, URGENT, INFORMATIONAL):");
  if (!newSev) return;
  const reason = prompt("Enter operational justification:");
  try {
    await fetch(`/api/incidents/${incidentId}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ severity: newSev.toUpperCase(), reason })
    });
    showToast(`Severity overridden to ${newSev.toUpperCase()}`, 'warning');
    fetchIncidents();
  } catch (e) {}
};

const btnRefreshIncidents = document.getElementById('btnRefreshIncidents');
if (btnRefreshIncidents) {
  btnRefreshIncidents.addEventListener('click', () => {
    fetchIncidents();
    fetchTeams();
    fetchMetrics();
    showToast('Incident queue and fleet status refreshed.', 'info');
  });
}

// ---------------- BROADCAST & FAN-OUT LOGIC ----------------

const broadcastForm = document.getElementById('broadcastForm');
if (broadcastForm) {
  broadcastForm.addEventListener('submit', async (e) => {
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
        showToast(`Broadcast Dispatched: ${data.totalTargetDeliveries.toLocaleString()} jobs across SMS, Push & Email!`, 'success');
        fetchBroadcasts();
      } else {
        showToast('Broadcast dispatch failed: ' + data.error, 'error');
      }
    } catch (e) {
      showToast('Network error while dispatching broadcast.', 'error');
    }
  });
}

const btnSeedResidents = document.getElementById('btnSeedResidents');
if (btnSeedResidents) {
  btnSeedResidents.addEventListener('click', async () => {
    if (!confirm("Generate and seed 100,000 synthetic residents in database for high-throughput broadcast demonstration?")) return;
    showToast('Seeding 100,000 synthetic residents...', 'info');
    try {
      const res = await fetch('/api/seed/residents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 100000 })
      });
      const data = await res.json();
      showToast(`Success! Database has ${data.residentCount.toLocaleString()} residents ready.`, 'success');
    } catch (e) {
      showToast('Error seeding residents.', 'error');
    }
  });
}

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
      div.className = "bg-opsCanvas border border-opsBorder p-3.5 rounded-lg text-xs hover:border-opsBorderLight transition";
      div.innerHTML = `
        <div class="flex justify-between font-bold text-slate-100">
          <span>${c.title}</span>
          <span class="text-amber-400 font-mono-tabular">${c.status}</span>
        </div>
        <p class="text-[10px] text-slate-400 font-mono-tabular mt-1">Zone: ${c.zone} &bull; Target Residents: ${c.total_residents.toLocaleString()}</p>
        <div class="flex space-x-4 text-[10px] font-mono-tabular mt-2 text-slate-300">
          <span>SMS: <b class="text-opsSky">${c.sms_count.toLocaleString()}</b></span>
          <span>Push: <b class="text-purple-400">${c.push_count.toLocaleString()}</b></span>
          <span>Email: <b class="text-amber-400">${c.email_count.toLocaleString()}</b></span>
        </div>
      `;
      list.appendChild(div);
    });
  } catch (e) {}
}

const btnRefreshBroadcasts = document.getElementById('btnRefreshBroadcasts');
if (btnRefreshBroadcasts) btnRefreshBroadcasts.addEventListener('click', fetchBroadcasts);

// ---------------- FAILURE SIMULATION DRILLS ----------------

let simState = { SMS: false, EMAIL: false };

const toggleSmsFailure = document.getElementById('toggleSmsFailure');
if (toggleSmsFailure) {
  toggleSmsFailure.addEventListener('click', async () => {
    simState.SMS = !simState.SMS;
    await fetch('/api/simulation/failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'SMS', enabled: simState.SMS })
    });

    const txt = document.getElementById('txtSmsStatus');
    const badge = document.getElementById('smsStatusBadge');

    if (simState.SMS) {
      txt.textContent = "OUTAGE ACTIVE";
      txt.className = "text-xs font-mono-tabular text-red-500 font-bold";
      toggleSmsFailure.textContent = "Restore Gateway";
      badge.textContent = "SIMULATED OUTAGE &bull; RETRYING";
      badge.className = "text-[10px] font-mono-tabular px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 mt-2 inline-block font-bold";
      showToast('SMS Gateway outage simulated. Push & Email running unaffected.', 'warning');
    } else {
      txt.textContent = "Online";
      txt.className = "text-xs font-mono-tabular text-opsEmerald";
      toggleSmsFailure.textContent = "Simulate Outage";
      badge.textContent = "ACTIVE &bull; 100% HEALTHY";
      badge.className = "text-[10px] font-mono-tabular px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 mt-2 inline-block";
      showToast('SMS Gateway restored to healthy state.', 'success');
    }
  });
}

const toggleEmailFailure = document.getElementById('toggleEmailFailure');
if (toggleEmailFailure) {
  toggleEmailFailure.addEventListener('click', async () => {
    simState.EMAIL = !simState.EMAIL;
    await fetch('/api/simulation/failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'EMAIL', enabled: simState.EMAIL })
    });

    const txt = document.getElementById('txtEmailStatus');
    const badge = document.getElementById('emailStatusBadge');

    if (simState.EMAIL) {
      txt.textContent = "OUTAGE ACTIVE";
      txt.className = "text-xs font-mono-tabular text-red-500 font-bold";
      toggleEmailFailure.textContent = "Restore Gateway";
      badge.textContent = "SIMULATED OUTAGE &bull; RETRYING";
      badge.className = "text-[10px] font-mono-tabular px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 mt-2 inline-block font-bold";
      showToast('Email SMTP failure simulated. Routing to retry and DLQ.', 'warning');
    } else {
      txt.textContent = "Online";
      txt.className = "text-xs font-mono-tabular text-opsEmerald";
      toggleEmailFailure.textContent = "Simulate Outage";
      badge.textContent = "ACTIVE &bull; 100% HEALTHY";
      badge.className = "text-[10px] font-mono-tabular px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 mt-2 inline-block";
      showToast('Email Gateway restored to healthy state.', 'success');
    }
  });
}

const btnInstanceProbe = document.getElementById('btnInstanceProbe');
if (btnInstanceProbe) {
  btnInstanceProbe.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      document.getElementById('instanceProbeResult').textContent = `Active: ${data.instanceId} (${data.status})`;
      showToast(`Stateless Node Probe: Handled by ${data.instanceId}`, 'info');
    } catch (e) {
      document.getElementById('instanceProbeResult').textContent = "Probe Failed";
    }
  });
}

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

// Initial metrics load
fetchMetrics();
