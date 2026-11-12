# AlertNet Judge Demonstration Guide

This guide walks through live evaluation of all 12 challenge criteria in 5 minutes.

---

### Step 1: Open the Application
Navigate to `http://localhost:4000` in your web browser.

### Step 2: Citizen SOS Flow
1. Select language (English, हिंदी, or తెలుగు).
2. Choose **Emergency Type** (e.g., *Trapped in Flood Water*).
3. Type description:
   - Hindi test: `पानी छत तक पहुँच गया है, 3 लोग डूबे हैं तुरंत मदद भेजो`
   - English test: `Submerged ground floor, children trapped on terrace`
4. Click **Detect GPS** or accept coordinates.
5. Click **SEND EMERGENCY SOS NOW**.
6. Notice the instant durable response and real-time status card.

### Step 3: Offline Queue Demonstration
1. In Chrome DevTools &rarr; Network Tab, select **Offline**.
2. Submit another emergency SOS.
3. Observe prompt notifying the report has been queued locally in offline storage.
4. Switch Network back to **Online**.
5. Observe the offline banner disappear and automatic background sync.

### Step 4: Command Center & Incident Triage
1. Click **Command Center** tab in top navigation.
2. Observe live counter statistics: Total SOS, Critical Incidents, Active Teams.
3. Review the Live Incidents Queue:
   - Notice the AI Multilingual Triage has marked the incident as **CRITICAL**.
   - Notice extracted needs: `TRAPPED_PERSONS`, `CHILDREN_IN_DANGER`.
   - Emergency Priority Score is calculated automatically.
4. Click **Assign** on an available rescue team (e.g. *NDRF Alpha 1*).
5. Attempt to assign *NDRF Alpha 1* to another incident &rarr; System refuses duplicate assignment.
6. Test **Override** &rarr; Change severity to URGENT with commander rationale.

### Step 5: Warning Broadcasts & 100k Simulator
1. Click **Warning Broadcasts** tab.
2. Click **Seed 100,000 Synthetic Residents**.
3. Choose Zone & Alert details, then click **DISPATCH 300,000 ALERT JOBS**.
4. Observe the live counters for SMS, Push Notifications, and Email updating independently.

### Step 6: Failure Simulation Drill
1. Click **Failure Drills** tab.
2. Click **Simulate Outage** on SMS Provider.
3. Dispatch another broadcast.
4. Observe that Push and Email deliver without any delay, while SMS jobs queue and retry with exponential backoff.
