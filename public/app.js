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
    setTimeout(() => {
      if (leafletMap) leafletMap.invalidateSize();
    }, 150);
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

// Detect Geolocation with high-accuracy GNSS/GPS
const btnGetLocation = document.getElementById('btnGetLocation');
if (btnGetLocation) {
  btnGetLocation.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('Geolocation API not supported by browser. Manual input active.', 'warning');
      return;
    }

    btnGetLocation.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting GNSS...';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        const acc = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null;

        document.getElementById('latitude').value = lat;
        document.getElementById('longitude').value = lon;
        document.getElementById('accuracyMeters').value = acc || '';
        document.getElementById('locationSource').value = 'device_gnss';

        const statusBadge = document.getElementById('gpsStatusBadge');
        if (statusBadge) {
          statusBadge.classList.remove('hidden');
          document.getElementById('gpsStatusText').innerHTML = '<i class="fa-solid fa-satellite text-opsEmerald mr-1"></i> Device Position Locked';
          document.getElementById('gpsAccuracyText').textContent = acc ? `± ${acc}m` : 'High Accuracy';
        }

        document.getElementById('addressText').value = `GPS Fix: ${lat}, ${lon} (±${acc || '?'}m)`;
        btnGetLocation.innerHTML = '<i class="fa-solid fa-circle-check text-opsEmerald"></i> Position Locked';
        showToast(`Device position locked: ${lat}, ${lon} (±${acc || '?'}m). Compatible with GNSS/NavIC.`, 'success');
      },
      (err) => {
        btnGetLocation.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Detect Geolocation';
        document.getElementById('locationSource').value = 'manual';
        const statusBadge = document.getElementById('gpsStatusBadge');
        if (statusBadge) statusBadge.classList.add('hidden');

        if (err.code === 1) {
          showToast('Location permission denied. Please enter manual coordinates or address.', 'warning');
        } else if (err.code === 2) {
          showToast('GPS position unavailable. Operating in manual location fallback mode.', 'warning');
        } else {
          showToast('Location acquisition timed out. Manual input active.', 'warning');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
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
      accuracyMeters: parseFloat(document.getElementById('accuracyMeters').value) || null,
      locationSource: document.getElementById('locationSource').value || 'manual',
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

let activeStatusInterval = null;

// Polling active SOS status for citizen
function startPollingActiveStatus() {
  if (activeStatusInterval) {
    clearInterval(activeStatusInterval);
    activeStatusInterval = null;
  }
  if (!activeReportKey) return;
  activeStatusInterval = setInterval(async () => {
    if (!activeReportKey) {
      if (activeStatusInterval) clearInterval(activeStatusInterval);
      return;
    }
    try {
      const res = await fetch('/api/sos/' + activeReportKey);
      if (res.ok) {
        const data = await res.json();
        showSosStatus(data);
      }
    } catch (e) {}
  }, 3000);
}

// ---------------- COMMAND CENTER LOGIC & GIS MAPPING ----------------

let leafletMap = null;
let mapMarkersLayer = null;
let cachedIncidents = [];
let cachedTeams = [];
let activeTrackingWatchId = null;
let trackedTeamId = null;

function initLeafletMap() {
  if (leafletMap) return;
  const mapContainer = document.getElementById('incidentMap');
  if (!mapContainer) return;

  try {
    // Initial center on Hyderabad Flood Operations Coordinates [17.3850, 78.4867]
    leafletMap = L.map('incidentMap', {
      center: [17.3850, 78.4867],
      zoom: 12,
      zoomControl: true
    });

    // Standard OpenStreetMap tiles (free, reliable, respects tile usage policy)
    const osmLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    });

    osmLayer.on('tileerror', (error) => {
      console.warn('[Map Tile Warning] An OSM map tile could not be loaded; check internet connectivity.', error);
    });

    osmLayer.addTo(leafletMap);

    mapMarkersLayer = L.layerGroup().addTo(leafletMap);
  } catch (mapInitErr) {
    console.error('[Leaflet Initialization Error]', mapInitErr);
    mapContainer.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center p-4 text-center text-slate-400 font-mono-tabular">
        <i class="fa-solid fa-triangle-exclamation text-amber-500 text-2xl mb-2"></i>
        <p class="text-xs text-white font-bold">Tactical Map Failed to Load</p>
        <p class="text-[10px] text-slate-400 mt-1">Verify browser WebGL or internet connection for OpenStreetMap tiles.</p>
      </div>
    `;
  }
}

function renderMapMarkers(incidents, teams) {
  if (!leafletMap || !mapMarkersLayer) {
    initLeafletMap();
    if (!leafletMap || !mapMarkersLayer) return;
  }

  mapMarkersLayer.clearLayers();
  const bounds = [];

  // 1. Render Incident markers with severity shapes & status
  (incidents || []).forEach(inc => {
    const lat = parseFloat(inc.latitude || inc.center_lat);
    const lon = parseFloat(inc.longitude || inc.center_lon);
    if (isNaN(lat) || isNaN(lon) || lat === 0 || lon === 0) return;

    bounds.push([lat, lon]);

    const isAssigned = Boolean(inc.assigned_team_id);
    const isResolved = inc.status === 'RESOLVED';
    const isCritical = inc.severity === 'CRITICAL';
    const isUrgent = inc.severity === 'URGENT';
    const color = isResolved ? '#10B981' : (isCritical ? '#EF4444' : (isUrgent ? '#F59E0B' : '#0EA5E9'));
    const shapeBorder = isResolved ? 'border-2 border-emerald-300' : (isCritical ? 'border-2 border-red-200' : 'border border-white');
    const badgeText = isResolved ? '✓' : (isCritical ? 'CRIT' : (isUrgent ? 'URG' : 'INFO'));
    const pulseClass = (!isResolved && isCritical) ? 'radar-ping' : '';

    const iconHtml = `
      <div style="position:relative; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Incident: ${inc.id} (${inc.status})">
        <span class="${pulseClass}" style="position:absolute; inset:0; border-radius:9999px; background:${color}; opacity:0.6;"></span>
        <div style="position:relative; width:18px; height:18px; border-radius:${isResolved ? '9999px' : (isCritical ? '4px' : '9999px')}; background:${color}; display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px ${color};" class="${shapeBorder}">
          <span style="font-size:7px; font-weight:900; color:#ffffff; font-family:monospace;">${badgeText}</span>
        </div>
        ${isAssigned && !isResolved ? '<span style="position:absolute; -top:2px; -right:2px; width:7px; height:7px; background:#10B981; border:1px solid #fff; border-radius:9999px;"></span>' : ''}
      </div>
    `;

    const customIcon = L.divIcon({
      html: iconHtml,
      className: 'leaflet-incident-marker',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const marker = L.marker([lat, lon], { icon: customIcon });

    let needs = [];
    try { needs = JSON.parse(inc.extracted_needs || '[]'); } catch (e) {}

    const popupHtml = `
      <div style="font-family:sans-serif; min-width:240px; color:#f1f5f9; background:#0B1325; padding:10px; border-radius:8px; border:1px solid #1F2E52; box-shadow:0 10px 25px rgba(0,0,0,0.7);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; border-bottom:1px solid #1F2E52; padding-bottom:4px;">
          <span style="font-size:10px; font-weight:bold; padding:2px 6px; border-radius:4px; background:${isResolved ? '#064e3b' : (isCritical ? '#7f1d1d' : '#78350f')}; color:${color};">
            ${isResolved ? '[RESOLVED ✓]' : `[${inc.severity}] ${badgeText}`}
          </span>
          <span style="font-size:9px; font-family:monospace; color:#94a3b8;">${inc.id}</span>
        </div>
        <div style="font-size:12px; font-weight:bold; color:#ffffff;">${inc.category || 'Emergency Incident'}</div>
        <div style="font-size:11px; color:#94a3b8; margin-top:2px;">📍 ${inc.address_hint || 'Hyderabad Area'}</div>
        <div style="font-size:10px; color:#64748b; font-family:monospace; margin-top:1px;">Coords: ${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
        <div style="font-size:11px; margin-top:5px; color:#cbd5e1;">
          Reports Grouped: <b>${inc.report_count || 1}</b> &bull; Priority: <b>${inc.priority_score || 'N/A'}</b>
        </div>
        ${needs.length ? `<div style="display:flex; flex-wrap:wrap; gap:3px; margin-top:6px;">${needs.map(n => `<span style="font-size:9px; background:#162342; border:1px solid #1F2E52; padding:1px 4px; border-radius:3px; color:#cbd5e1;">${n}</span>`).join('')}</div>` : ''}
        <div style="margin-top:6px; font-size:11px; padding:4px 6px; border-radius:4px; background:#101B33; border:1px solid #1F2E52;">
          Status: <b class="${isResolved ? 'text-opsEmerald' : ''}">${inc.status}</b>
          ${isResolved ? (inc.updated_at ? `<br><span style="font-size:10px; color:#64748b;">Resolved: ${new Date(inc.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>` : '') : (inc.team_name ? `<br><span style="color:#10B981; font-weight:bold;">Unit: ${inc.team_name}</span>` : '<br><span style="color:#f97316;">⚠️ Unassigned</span>')}
        </div>
        <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">
          ${!isResolved && !inc.assigned_team_id ? `
            <button onclick="handleFindNearestTeam('${inc.id}')" style="background:#dc2626; color:#ffffff; font-size:10px; font-weight:bold; padding:4px 8px; border-radius:4px; border:none; cursor:pointer;">
              <i class="fa-solid fa-compass mr-1"></i> Nearest Team
            </button>
            <button onclick="openAssignModal('${inc.id}', null)" style="background:#0284c7; color:#ffffff; font-size:10px; font-weight:bold; padding:4px 8px; border-radius:4px; border:none; cursor:pointer;">
              Deploy
            </button>
          ` : ''}
          ${!isResolved ? `
            <button onclick="resolveIncident('${inc.id}')" style="background:#065f46; color:#a7f3d0; font-size:10px; font-weight:bold; padding:4px 8px; border-radius:4px; border:none; cursor:pointer;">
              Resolve
            </button>
          ` : `
            <span style="font-size:10px; font-weight:bold; color:#10B981; padding:3px 6px; background:#064e3b; border-radius:4px; border:1px solid #047857;">
              <i class="fa-solid fa-circle-check mr-1"></i> Resolved & Archived
            </span>
            <button onclick="reopenIncident('${inc.id}')" style="background:#1e293b; color:#94a3b8; font-size:9px; padding:3px 6px; border-radius:4px; border:1px solid #334155; cursor:pointer;">
              Reopen
            </button>
          `}
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml);
    marker.on('click', () => {
      // Highlight/scroll to incident in table
      const row = document.getElementById(`incRow-${inc.id}`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('bg-opsSurface3');
        setTimeout(() => row.classList.remove('bg-opsSurface3'), 2000);
      }
    });

    mapMarkersLayer.addLayer(marker);

    // 1.5km cluster boundary circle
    const circle = L.circle([lat, lon], {
      color: color,
      fillColor: color,
      fillOpacity: 0.08,
      radius: 1500,
      weight: 1,
      dashArray: '3, 6'
    });
    mapMarkersLayer.addLayer(circle);
  });

  // 2. Render Rescue Team markers
  (teams || []).forEach(t => {
    const tLat = parseFloat(t.latitude);
    const tLon = parseFloat(t.longitude);
    if (isNaN(tLat) || isNaN(tLon) || tLat === 0 || tLon === 0) return;

    bounds.push([tLat, tLon]);

    const isAvailable = t.status === 'AVAILABLE';
    const isEnRoute = t.status === 'EN_ROUTE';
    const teamColor = isAvailable ? '#10B981' : (isEnRoute ? '#F59E0B' : '#64748B');

    let caps = [];
    try { caps = typeof t.capabilities === 'string' ? JSON.parse(t.capabilities || '[]') : (t.capabilities || []); } catch (e) {}

    const teamIconHtml = `
      <div style="position:relative; width:26px; height:26px; display:flex; align-items:center; justify-content:center; cursor:pointer;" title="Rescue Unit: ${t.name}">
        <div style="width:20px; height:20px; border-radius:9999px; background:#101B33; border:2px solid ${teamColor}; display:flex; align-items:center; justify-content:center; box-shadow:0 0 8px ${teamColor};">
          <i class="fa-solid fa-truck-medical" style="font-size:9px; color:${teamColor};"></i>
        </div>
        ${isAvailable ? '<span style="position:absolute; bottom:0; right:0; width:6px; height:6px; background:#10B981; border-radius:9999px;"></span>' : ''}
      </div>
    `;

    const teamIcon = L.divIcon({
      html: teamIconHtml,
      className: 'leaflet-team-marker',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const teamMarker = L.marker([tLat, tLon], { icon: teamIcon });

    const teamPopupHtml = `
      <div style="font-family:sans-serif; min-width:230px; color:#f1f5f9; background:#0B1325; padding:10px; border-radius:8px; border:1px solid #1F2E52; box-shadow:0 10px 25px rgba(0,0,0,0.7);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <span style="font-size:10px; font-weight:bold; padding:2px 6px; border-radius:4px; background:${isAvailable ? '#064e3b' : '#78350f'}; color:${teamColor};">
            ${t.status}
          </span>
          <span style="font-size:9px; font-family:monospace; color:#94a3b8;">${t.id}</span>
        </div>
        <div style="font-size:12px; font-weight:bold; color:#ffffff;">${t.name}</div>
        <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${t.leader_name || 'Commander'} &bull; ${t.zone}</div>
        <div style="font-size:10px; color:#64748b; font-family:monospace; margin-top:2px;">
          Category: <b>${t.category || 'General Disaster Response'}</b>
        </div>
        <div style="font-size:10px; color:#64748b; font-family:monospace;">
          Source: ${t.location_source === 'device_gnss' ? '🛰️ Live Device GNSS' : '📍 Manually Registered'}
        </div>
        <div style="font-size:10px; color:#64748b; font-family:monospace;">
          Last Fix: ${t.last_location_update ? new Date(t.last_location_update).toLocaleTimeString() : 'Static'}
        </div>
        <div style="margin-top:6px;">
          <span style="font-size:10px; color:#94a3b8;">Capabilities:</span>
          <div style="display:flex; flex-wrap:wrap; gap:3px; margin-top:3px;">
            ${caps.map(c => `<span style="font-size:8px; background:#162342; border:1px solid #1F2E52; padding:1px 4px; border-radius:3px; color:#38bdf8;">${c}</span>`).join('')}
          </div>
        </div>
        <div style="margin-top:8px; display:flex; gap:6px;">
          ${isAvailable ? `
            <button onclick="openAssignModal(null, '${t.id}')" style="background:#0284c7; color:#ffffff; font-size:10px; font-weight:bold; padding:4px 8px; border-radius:4px; border:none; cursor:pointer;">
              Deploy Unit
            </button>
          ` : ''}
          <button onclick="startTeamLiveTracking('${t.id}')" style="background:#1e293b; color:#cbd5e1; font-size:10px; padding:4px 8px; border-radius:4px; border:1px solid #334155; cursor:pointer;">
            <i class="fa-solid fa-satellite-dish mr-1"></i> Track Live
          </button>
        </div>
      </div>
    `;

    teamMarker.bindPopup(teamPopupHtml);
    mapMarkersLayer.addLayer(teamMarker);
  });

  // Auto-fit bounds if we have points
  if (bounds.length > 0 && leafletMap) {
    try {
      leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    } catch (e) {}
  }
}

// Assignment Modal Handlers
window.openAssignModal = function(preselectedIncidentId = null, preselectedTeamId = null) {
  const modal = document.getElementById('assignModal');
  const incSelect = document.getElementById('modalIncidentSelect');
  const teamSelect = document.getElementById('modalTeamSelect');
  if (!modal || !incSelect || !teamSelect) return;

  incSelect.innerHTML = '';
  teamSelect.innerHTML = '';

  const activeIncidents = cachedIncidents.filter(i => i.status !== 'RESOLVED');
  if (activeIncidents.length === 0) {
    incSelect.innerHTML = '<option value="">No open incidents requiring deployment</option>';
  } else {
    activeIncidents.forEach(inc => {
      const opt = document.createElement('option');
      opt.value = inc.id;
      opt.textContent = `[${inc.severity}] ${inc.category} - ${inc.id} (${inc.address_hint || 'Hyderabad'})`;
      if (preselectedIncidentId && inc.id === preselectedIncidentId) opt.selected = true;
      incSelect.appendChild(opt);
    });
  }

  const availableTeams = cachedTeams.filter(t => t.status === 'AVAILABLE');
  if (availableTeams.length === 0) {
    teamSelect.innerHTML = '<option value="">No rescue teams currently AVAILABLE</option>';
  } else {
    availableTeams.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = `${t.name} (${t.capacity} divers) - ${t.zone} [${t.leader_name}]`;
      if (preselectedTeamId && t.id === preselectedTeamId) opt.selected = true;
      teamSelect.appendChild(opt);
    });
  }

  modal.classList.remove('hidden');
};

window.closeAssignModal = function() {
  const modal = document.getElementById('assignModal');
  if (modal) modal.classList.add('hidden');
};

const assignModalForm = document.getElementById('assignModalForm');
if (assignModalForm) {
  assignModalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const incId = document.getElementById('modalIncidentSelect').value;
    const teamId = document.getElementById('modalTeamSelect').value;

    if (!incId || !teamId) {
      showToast('Please select both an incident and an available rescue team.', 'warning');
      return;
    }

    try {
      const res = await fetch(`/api/incidents/${incId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, requestedBy: 'Commander_Modal' })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Deployment confirmed! Unit assigned to incident ${incId}.`, 'success');
        closeAssignModal();
        fetchIncidents();
        fetchTeams();
        fetchMetrics();
      } else {
        showToast(`Deployment Rejected: ${data.error || 'Conflict or invalid assignment'}`, 'error');
      }
    } catch (err) {
      showToast('Network error while assigning unit.', 'error');
    }
  });
}

async function fetchIncidents() {
  try {
    const res = await fetch('/api/incidents');
    const incidents = await res.json();
    cachedIncidents = Array.isArray(incidents) ? incidents : [];
    const tbody = document.getElementById('incidentsTableBody');
    tbody.innerHTML = '';

    if (cachedIncidents.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="p-6 text-center text-slate-400 font-mono-tabular">
            <i class="fa-solid fa-circle-check text-opsEmerald text-lg mb-2 block"></i>
            NO ACTIVE CRITICAL BREACHES RECORDED IN SECTOR
          </td>
        </tr>
      `;
      renderMapMarkers([], cachedTeams);
      return;
    }

    cachedIncidents.forEach(inc => {
      const tr = document.createElement('tr');
      tr.id = `incRow-${inc.id}`;
      const isResolved = inc.status === 'RESOLVED';
      tr.className = isResolved 
        ? "bg-opsBase/50 opacity-80 hover:opacity-100 transition border-b border-opsBorder/40" 
        : "hover:bg-opsCanvas/70 transition border-b border-opsBorder/60";

      const sevColor = isResolved
        ? 'bg-emerald-950/90 text-emerald-400 border-emerald-800'
        : (inc.severity === 'CRITICAL' 
            ? 'bg-red-950/90 text-red-400 border-red-800' 
            : (inc.severity === 'URGENT' 
                ? 'bg-amber-950/90 text-amber-400 border-amber-800' 
                : 'bg-blue-950/90 text-opsSky border-blue-800'));

      let needs = [];
      try { needs = JSON.parse(inc.extracted_needs || '[]'); } catch (e) {}

      // Format resolution or updated timestamp
      let resolvedTimeStr = '';
      if (isResolved && inc.updated_at) {
        try {
          const d = new Date(inc.updated_at);
          resolvedTimeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {}
      }

      tr.innerHTML = `
        <td class="p-3 font-bold font-mono-tabular">
          ${isResolved ? `
            <span class="px-2 py-0.5 rounded text-[10px] border border-emerald-800 bg-emerald-950/90 text-emerald-300 tracking-wider flex items-center gap-1 w-max">
              <i class="fa-solid fa-circle-check text-[10px] text-opsEmerald"></i>
              <span>RESOLVED ✓</span>
            </span>
          ` : `
            <span class="px-2 py-0.5 rounded text-[10px] border ${sevColor} tracking-wider">
              ${inc.severity}
            </span>
          `}
        </td>
        <td class="p-3">
          <div class="flex items-center gap-2">
            <p class="font-bold text-slate-100 ${isResolved ? 'line-through text-slate-400' : ''}">${inc.category}</p>
            ${isResolved && resolvedTimeStr ? `<span class="text-[10px] text-emerald-400 font-mono-tabular bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-900/60">Resolved at ${resolvedTimeStr}</span>` : ''}
          </div>
          <p class="text-[10px] text-slate-400 font-mono-tabular mt-0.5">${inc.address_hint}</p>
          <div class="flex flex-wrap gap-1 mt-1.5">
            ${needs.map(n => `<span class="bg-opsSurface3 text-[9px] font-mono-tabular px-1.5 py-0.2 rounded text-slate-300 border border-opsBorder">${n}</span>`).join('')}
          </div>
        </td>
        <td class="p-3 font-mono-tabular font-extrabold text-sm ${isResolved ? 'text-slate-500' : 'text-slate-100'}">${inc.priority_score}</td>
        <td class="p-3 text-slate-300 font-mono-tabular">${inc.report_count} clustered</td>
        <td class="p-3">
          ${isResolved ? `
            <span class="text-opsEmerald font-semibold text-xs flex items-center gap-1.5 font-mono-tabular">
              <i class="fa-solid fa-check-double text-[10px]"></i> Case Closed
            </span>
          ` : (inc.team_name ? `<span class="text-opsEmerald font-semibold flex items-center gap-1.5"><i class="fa-solid fa-circle-dot text-[8px]"></i> ${inc.team_name}</span>` : '<span class="text-orange-400 font-mono-tabular italic">Unassigned</span>')}
        </td>
        <td class="p-3 text-right space-x-1 font-mono-tabular">
          ${isResolved ? `
            <div class="inline-flex items-center gap-2">
              <span class="bg-emerald-950 text-emerald-400 border border-emerald-800 px-2.5 py-1 rounded text-[10px] font-bold flex items-center gap-1">
                <i class="fa-solid fa-circle-check text-xs"></i>
                <span>RESOLVED</span>
              </span>
              <button onclick="reopenIncident('${inc.id}')" class="bg-opsSurface2 hover:bg-opsSurface3 text-slate-400 hover:text-slate-200 border border-opsBorder px-2 py-1 rounded text-[10px] transition cursor-pointer" title="Reopen incident if new emergencies develop">
                Reopen
              </button>
            </div>
          ` : `
            ${!inc.assigned_team_id ? `
              <button onclick="handleFindNearestTeam('${inc.id}')" class="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm cursor-pointer" title="Nearest suitable team matching mandatory capabilities">
                <i class="fa-solid fa-compass mr-0.5"></i> Nearest
              </button>
              <button onclick="openAssignModal('${inc.id}', null)" class="bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white px-2 py-1 rounded text-[10px] font-bold shadow-sm cursor-pointer">
                Deploy
              </button>
            ` : ''}
            <button onclick="overrideSeverityPrompt('${inc.id}')" class="bg-opsSurface2 hover:bg-opsSurface3 text-slate-300 border border-opsBorder px-2.5 py-1 rounded text-[10px] transition cursor-pointer">
              Override
            </button>
            <button onclick="resolveIncident('${inc.id}')" class="bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 px-2.5 py-1 rounded text-[10px] transition cursor-pointer">
              Resolve
            </button>
          `}
        </td>
      `;
      tbody.appendChild(tr);
    });

    renderMapMarkers(cachedIncidents, cachedTeams);
  } catch (e) {}
}

async function fetchTeams() {
  try {
    const res = await fetch('/api/teams');
    const teams = await res.json();
    cachedTeams = Array.isArray(teams) ? teams : [];
    const list = document.getElementById('teamsList');
    list.innerHTML = '';

    cachedTeams.forEach(t => {
      const div = document.createElement('div');
      div.className = "bg-opsCanvas border border-opsBorder p-3 rounded-lg flex flex-col space-y-2 text-xs hover:border-opsBorderLight transition";
      
      const isAvail = t.status === 'AVAILABLE';
      const statusBadge = isAvail ? 'text-opsEmerald bg-emerald-950/80 border-emerald-800' : 'text-amber-400 bg-amber-950/80 border-amber-800';

      let caps = [];
      try { caps = typeof t.capabilities === 'string' ? JSON.parse(t.capabilities || '[]') : (t.capabilities || []); } catch (e) {}

      div.innerHTML = `
        <div class="flex items-start justify-between">
          <div>
            <p class="font-bold text-slate-100 flex items-center gap-1.5">
              <span>${t.name}</span>
              <span class="text-[9px] font-mono-tabular text-slate-400">(${t.capacity} Pers)</span>
            </p>
            <p class="text-[10px] text-slate-400 font-mono-tabular mt-0.5">${t.leader_name} &bull; ${t.zone}</p>
            <p class="text-[9px] text-opsSky font-mono-tabular mt-0.5">${t.category || 'General Disaster'}</p>
          </div>
          <div class="flex flex-col items-end space-y-1 font-mono-tabular">
            <span class="text-[9px] px-1.5 py-0.5 rounded border ${statusBadge}">${t.status}</span>
            ${isAvail ? `
              <button onclick="openAssignModal(null, '${t.id}')" class="bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-500 hover:to-sky-500 text-white px-2 py-0.5 rounded text-[10px] font-bold shadow-sm cursor-pointer">
                Deploy
              </button>
            ` : ''}
          </div>
        </div>

        <div class="flex flex-wrap gap-1">
          ${caps.map(c => `<span class="bg-opsBase text-[8px] font-mono-tabular px-1 py-0.2 rounded text-slate-300 border border-opsBorder">${c}</span>`).join('')}
        </div>

        <div class="pt-1.5 border-t border-opsBorder/60 flex items-center justify-between text-[10px] font-mono-tabular text-slate-400">
          <span class="flex items-center gap-1">
            ${t.latitude && t.longitude ? `<i class="fa-solid fa-location-dot text-opsEmerald"></i> ${parseFloat(t.latitude).toFixed(2)}, ${parseFloat(t.longitude).toFixed(2)}` : '<span class="text-slate-500">No Coords</span>'}
          </span>
          <button onclick="startTeamLiveTracking('${t.id}')" class="text-opsSky hover:text-white flex items-center gap-1 text-[9px] cursor-pointer">
            <i class="fa-solid fa-satellite-dish"></i>
            <span>${trackedTeamId === t.id ? 'Tracking Live...' : 'Live GPS'}</span>
          </button>
        </div>
      `;
      list.appendChild(div);
    });

    renderMapMarkers(cachedIncidents, cachedTeams);
  } catch (e) {}
}

window.promptAssignTeam = async function(teamId) {
  openAssignModal(null, teamId);
};

window.resolveIncident = async function(incidentId) {
  if (!confirm("Confirm resolution for incident " + incidentId + "? This will free assigned units.")) return;
  try {
    const res = await fetch(`/api/incidents/${incidentId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'RESOLVED' })
    });
    if (res.ok) {
      showToast(`Incident ${incidentId} marked as RESOLVED. Units freed to ready reserve.`, 'success');
      fetchIncidents();
      fetchTeams();
      fetchMetrics();
    } else {
      const data = await res.json();
      showToast(`Resolution error: ${data.error || 'Failed to update'}`, 'error');
    }
  } catch (e) {
    showToast('Network error while resolving incident.', 'error');
  }
};

window.reopenIncident = async function(incidentId) {
  if (!confirm("Reopen incident " + incidentId + " back to active queue?")) return;
  try {
    const res = await fetch(`/api/incidents/${incidentId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'OPEN' })
    });
    if (res.ok) {
      showToast(`Incident ${incidentId} reopened and restored to active response queue.`, 'info');
      fetchIncidents();
      fetchTeams();
      fetchMetrics();
    } else {
      const data = await res.json();
      showToast(`Error reopening incident: ${data.error || 'Failed to update'}`, 'error');
    }
  } catch (e) {
    showToast('Network error while reopening incident.', 'error');
  }
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

// ---------------- RESCUE FLEET & INTELLIGENT ASSIGNMENT LOGIC ----------------

// Modal: Add Rescue Team Handlers
window.openAddTeamModal = function() {
  const modal = document.getElementById('addTeamModal');
  if (!modal) return;
  const randSuffix = Math.random().toString(36).substring(2, 7);
  document.getElementById('newTeamId').value = `team-custom-${randSuffix}`;
  document.getElementById('newTeamLat').value = (17.3850 + (Math.random() - 0.5) * 0.08).toFixed(4);
  document.getElementById('newTeamLon').value = (78.4867 + (Math.random() - 0.5) * 0.08).toFixed(4);
  modal.classList.remove('hidden');
};

window.closeAddTeamModal = function() {
  const modal = document.getElementById('addTeamModal');
  if (modal) modal.classList.add('hidden');
};

const btnCaptureTeamLocation = document.getElementById('btnCaptureTeamLocation');
if (btnCaptureTeamLocation) {
  btnCaptureTeamLocation.addEventListener('click', () => {
    if (!navigator.geolocation) {
      showToast('Geolocation API not supported by browser. Manual coordinates retained.', 'warning');
      return;
    }

    btnCaptureTeamLocation.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Reading GNSS...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        document.getElementById('newTeamLat').value = pos.coords.latitude.toFixed(6);
        document.getElementById('newTeamLon').value = pos.coords.longitude.toFixed(6);
        document.getElementById('newTeamAccuracy').value = pos.coords.accuracy ? Math.round(pos.coords.accuracy) : '';
        document.getElementById('newTeamLocSource').value = 'device_gnss';
        document.getElementById('newTeamLocNote').textContent = `Source: Device GNSS Position Locked (±${Math.round(pos.coords.accuracy || 10)}m)`;
        document.getElementById('newTeamLocNote').className = 'text-[10px] text-opsEmerald font-bold';
        btnCaptureTeamLocation.innerHTML = '<i class="fa-solid fa-check text-opsEmerald"></i> Device Locked';
        showToast('Rescue Unit coordinates locked from Device GNSS sensor.', 'success');
      },
      (err) => {
        btnCaptureTeamLocation.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Capture Device GPS';
        document.getElementById('newTeamLocSource').value = 'manual';
        document.getElementById('newTeamLocNote').textContent = 'Source: Manual coordinate fallback';
        showToast('GPS unavailable. Manual coordinate entry active.', 'warning');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

const addTeamForm = document.getElementById('addTeamForm');
if (addTeamForm) {
  addTeamForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const selectedCaps = Array.from(document.querySelectorAll('input[name="teamCaps"]:checked')).map(cb => cb.value);
    if (selectedCaps.length === 0) {
      showToast('Validation Error: Select at least one operational capability.', 'warning');
      return;
    }

    const payload = {
      id: document.getElementById('newTeamId').value,
      name: document.getElementById('newTeamName').value,
      leaderName: document.getElementById('newTeamLeader').value,
      phone: document.getElementById('newTeamPhone').value,
      category: document.getElementById('newTeamCategory').value,
      capacity: parseInt(document.getElementById('newTeamCapacity').value) || 10,
      zone: document.getElementById('newTeamZone').value,
      capabilities: selectedCaps,
      latitude: parseFloat(document.getElementById('newTeamLat').value) || null,
      longitude: parseFloat(document.getElementById('newTeamLon').value) || null,
      accuracyMeters: parseFloat(document.getElementById('newTeamAccuracy').value) || null,
      locationSource: document.getElementById('newTeamLocSource').value || 'manual'
    };

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Team [${payload.name}] successfully registered in fleet!`, 'success');
        closeAddTeamModal();
        addTeamForm.reset();
        fetchTeams();
        fetchMetrics();
      } else {
        showToast(`Registration Failed: ${data.error}`, 'error');
      }
    } catch (err) {
      showToast('Network error while registering team.', 'error');
    }
  });
}

// Live Location Tracking for Rescue Units
window.startTeamLiveTracking = function(teamId) {
  if (activeTrackingWatchId !== null) {
    navigator.geolocation.clearWatch(activeTrackingWatchId);
    activeTrackingWatchId = null;
    if (trackedTeamId === teamId) {
      trackedTeamId = null;
      showToast(`Live tracking stopped for team ${teamId}.`, 'info');
      fetchTeams();
      return;
    }
  }

  if (!navigator.geolocation) {
    showToast('Browser Geolocation not supported on this terminal.', 'warning');
    return;
  }

  trackedTeamId = teamId;
  showToast(`Starting high-accuracy GNSS live tracking for team ${teamId}...`, 'info');

  activeTrackingWatchId = navigator.geolocation.watchPosition(
    async (pos) => {
      try {
        const res = await fetch(`/api/teams/${teamId}/location`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: pos.coords.accuracy,
            source: 'device_gnss'
          })
        });
        if (res.ok) {
          fetchTeams(); // Refreshes markers on map with live coordinates
        }
      } catch (e) {}
    },
    (err) => {
      showToast(`Live tracking error: ${err.message}. Stopped tracking.`, 'warning');
      if (activeTrackingWatchId) {
        navigator.geolocation.clearWatch(activeTrackingWatchId);
        activeTrackingWatchId = null;
        trackedTeamId = null;
      }
      fetchTeams();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );

  fetchTeams();
};

// Find Nearest Suitable Team Handler
window.handleFindNearestTeam = async function(incidentId) {
  try {
    const res = await fetch(`/api/incidents/${incidentId}/nearest-team`);
    const data = await res.json();

    if (!res.ok) {
      showToast(`Nearest Search Failed: ${data.error}`, 'error');
      return;
    }

    if (data.status === 'SUITABLE_TEAM_FOUND') {
      const team = data.recommendedTeam;
      const isCritical = data.incidentSeverity === 'CRITICAL';
      const isUrgent = data.incidentSeverity === 'URGENT';

      const promptMsg = `NEAREST SUITABLE RESCUE ASSET IDENTIFIED:
--------------------------------------------------
Incident: ${incidentId} [${data.incidentSeverity}]
Mandatory Capabilities: ${data.requiredCapabilities.join(', ')}
Recommended Team: ${team.name} (${team.id})
Category: ${team.category}
Straight-Line Distance: ${team.distanceKm !== null ? team.distanceKm + ' km' : 'Location Unregistered'}
Selection Reason: ${data.selectionReason}

${isCritical ? 'CRITICAL INCIDENT: Confirm immediate dispatch?' : (isUrgent ? 'URGENT INCIDENT: Require Commander confirmation to assign unit.' : 'INFORMATIONAL: Confirm assignment?')}`;

      if (confirm(promptMsg)) {
        const assignRes = await fetch(`/api/incidents/${incidentId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId: team.id, requestedBy: 'Commander_Nearest_Finder' })
        });
        const assignData = await assignRes.json();
        if (assignRes.ok) {
          showToast(`Unit ${team.name} successfully assigned to incident ${incidentId}!`, 'success');
          fetchIncidents();
          fetchTeams();
          fetchMetrics();
        } else {
          showToast(`Assignment Rejected: ${assignData.error}`, 'error');
        }
      }
    } else if (data.status === 'NO_SUITABLE_TEAM') {
      alert(`NO SUITABLE TEAM AVAILABLE\n\nNo available team currently possesses the mandatory capabilities: [${(data.requiredCapabilities || []).join(', ')}].\nIncident remains unassigned awaiting commander review or asset mobilization.`);
    } else if (data.status === 'UNKNOWN_REQUIREMENTS') {
      alert(`COMMANDER REVIEW REQUIRED\n\nIncident emergency requirements are ambiguous or unregistered. Manual commander review required before dispatch.`);
    } else {
      showToast(`${data.message || data.status}`, 'info');
    }
  } catch (err) {
    showToast('Failed to calculate nearest suitable team.', 'error');
  }
};

// Global Action: Auto-Assign All Critical Incidents
const btnAutoAssignCritical = document.getElementById('btnAutoAssignCritical');
if (btnAutoAssignCritical) {
  btnAutoAssignCritical.addEventListener('click', async () => {
    if (!confirm('EXECUTE AUTOMATIC ALLOCATION:\n\nThis will atomically assign all open unassigned CRITICAL incidents to their nearest suitable available rescue team.\nProceed?')) return;

    btnAutoAssignCritical.disabled = true;
    btnAutoAssignCritical.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>PROCESSING...</span>';

    try {
      const res = await fetch('/api/incidents/auto-assign-critical', { method: 'POST' });
      const data = await res.json();

      let summary = `AUTO-ASSIGN COMPLETE:\n- Total Evaluated: ${data.totalEvaluated}\n- Successfully Assigned: ${data.assigned.length}\n- No Suitable Team Available: ${data.noSuitableTeam.length}\n- Requires Commander Review: ${data.requiresReview.length}\n- Concurrency/Locked Failures: ${data.failed.length}`;
      alert(summary);

      fetchIncidents();
      fetchTeams();
      fetchMetrics();
    } catch (e) {
      showToast('Auto-assign execution failed.', 'error');
    } finally {
      btnAutoAssignCritical.disabled = false;
      btnAutoAssignCritical.innerHTML = '<i class="fa-solid fa-bolt-lightning text-xs"></i> <span>AUTO-ASSIGN CRITICAL</span>';
    }
  });
}

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
