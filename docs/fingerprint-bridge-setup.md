# Fingerprint Bridge — Setup Guide for Course Reps

This guide explains how to set up the local fingerprint bridge on the course rep's Android device so that **Fingerprint Blitz** attendance sessions work in Presensys.

---

## How It Works

```
Presensys (browser) ←── ws://localhost:8080 ──── Bridge Script (Termux)
                                                       ↑
                                                   Android logcat
                                                   (BiometricService)
```

The bridge script runs a WebSocket server inside Termux on the course rep's phone.  It tails the Android system log (`logcat`) for fingerprint authentication events from the hardware biometric layer and forwards each scan's unique ID to the Presensys browser tab in real-time.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Android 8.0+ | Required for the BiometricService log format |
| Physical fingerprint sensor | The phone must have a fingerprint hardware module |
| Termux app | Install from [F-Droid](https://f-droid.org/packages/com.termux/) (recommended) or Google Play |
| Node.js ≥ 18 | Installed via Termux |
| Developer Options enabled | See Step 1 |

---

## Step-by-Step Setup

### Step 1 — Enable Developer Options on the Android Phone

1. Open **Settings → About phone**
2. Tap **Build number** seven (7) times until "You are now a developer!" appears
3. Go back to **Settings → System → Developer options** (location varies by manufacturer)
4. Enable **USB debugging** (needed for logcat access)

> **Note:** USB debugging only needs to be enabled once.  You do **not** need a USB cable for Presensys — this just unlocks the logcat interface.

---

### Step 2 — Install Termux

1. Download Termux from [F-Droid](https://f-droid.org/packages/com.termux/)
2. Open Termux and grant storage permission if prompted

---

### Step 3 — Install Node.js and the `ws` Package

Inside Termux, run:

```bash
pkg update -y
pkg install -y nodejs
npm install ws
```

---

### Step 4 — Copy the Bridge Script

The script is located at `scripts/fingerprint-bridge.js` in the Presensys repository.

**Option A** — Via USB file transfer:
Copy `scripts/fingerprint-bridge.js` to `/sdcard/` on the phone, then inside Termux:
```bash
cp /sdcard/fingerprint-bridge.js ~/fingerprint-bridge.js
```

**Option B** — Download directly (if you have network access in Termux):
```bash
curl -o ~/fingerprint-bridge.js https://<your-presensys-domain>/scripts/fingerprint-bridge.js
```

---

### Step 5 — Run the Bridge

Inside Termux:

```bash
node ~/fingerprint-bridge.js
```

You should see:

```
[bridge] WebSocket server listening on ws://localhost:8080
[bridge] Waiting for fingerprint events from logcat…
```

> Keep the Termux window running throughout the attendance session.  You can use a Termux wake-lock to prevent Android from killing it: tap the Termux notification → **Acquire wakelock**.

---

### Step 6 — Open Presensys on the Same Device

1. Open Chrome (or any Chromium-based browser) on the **same phone**
2. Navigate to your Presensys URL (e.g. `http://localhost:5173` for a local dev build, or your hosted URL)
3. Start an attendance session, choose **Fingerprint Blitz** — the bridge status indicator should turn green

---

## Step 7 — Enroll Student Fingerprints

Before the first Fingerprint Blitz session, each student's fingerprint ID must be captured and saved to their record:

1. Go to **Students** in Presensys
2. Tap a student's card to open their detail panel
3. Tap **Register Fingerprint**
4. Ensure the bridge is running; when prompted, have the student place their finger on the sensor
5. Tap **Save Fingerprint**

Repeat for every student in the course.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Red "Bridge offline" banner | Ensure `node fingerprint-bridge.js` is running in Termux |
| No match after scan | Student's fingerprint has not been enrolled yet |
| logcat exits immediately | Enable USB Debugging in Developer Options |
| `logcat: not found` in Termux | Run `pkg install android-tools` |
| WebSocket connection refused | Another app may be using port 8080 — kill it or change `PORT` in the script |

---

## Security Notes

- The bridge only listens on `127.0.0.1` (localhost) — it is **not** accessible from the network
- It reads raw fingerprint HAL IDs, not biometric templates — no biometric data leaves the device
- The bridge should be stopped after each attendance session
