// functions/src/index.ts
import {onCall} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";
import fetch from "node-fetch";

admin.initializeApp();

/**
 * Binds the GSM secret OPENAI_API_KEY_DAWDLE_VOICE at deploy/runtime.
 * Make sure you've created it in Secret Manager:
 *   projects/385889051883/secrets/OPENAI_API_KEY_DAWDLE_VOICE
 *
 * And either:
 *   firebase functions:secrets:access OPENAI_API_KEY_DAWDLE_VOICE
 * or set via console and grant the Functions service account access.
 */
const OPENAI_API_KEY_DAWDLE_VOICE = defineSecret("OPENAI_API_KEY_DAWDLE_VOICE");

// Optional: constrain models/voices from server side
const MODEL = "gpt-realtime-2025-08-28"; // your realtime model

/**
 * Callable that mints a short-lived Realtime session (ephemeral key).
 * Client calls this, then uses the returned client_secret to start WebRTC
 * with OpenAI.
 */
export const mintRealtimeSession = onCall(
  {region: "us-central1", secrets: [OPENAI_API_KEY_DAWDLE_VOICE], cors: true},
  async (req) => {
  //   // Enforce Firebase Auth + App Check for production
  //   if (!req.auth) throw new Error("UNAUTHENTICATED");
    if (!req.app) throw new Error("APP_CHECK_REQUIRED");

  //   // Optional: per-user guardrails (rate limits, entitlements, etc.)
  //   const uid = req.auth.uid;
  //   await admin.firestore().runTransaction(async (tx) => {
  //     const ref = admin.firestore().collection("rtLimits").doc(uid);
  //     const now = Date.now(); const WINDOW_MS = 60_000; const CAP = 10;
  //     const snap = await tx.get(ref);
  //     const data = snap.exists ? snap.data() || {count: 0, windowStart: now} :
  //       {count: 0, windowStart: now};
  //     if (now - data.windowStart > WINDOW_MS) {
  //       data.count = 0; data.windowStart = now;
  //     }
  //     if (data.count >= CAP) throw new Error("RATE_LIMIT");
  //     data.count += 1;
  //     tx.set(ref, data);
  //   });

    // Build your default session config (voice, system prompt, tools, etc.)
    const sessionConfig = {
      model: MODEL,
      // you can set a default voice here (e.g., "verse", "alloy",
      // "marin", "cedar" depending on availability)
      // voice: "marin",
      // instructions: "You are Dawdle Voice, keep responses brief and
      // helpful.",
      // turn_detection, input_audio_format, tool config, etc. can also go here.
    };

    // Create ephemeral session with your *server* key
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY_DAWDLE_VOICE.value()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sessionConfig),
    });

    if (!r.ok) {
      const text = await r.text();
      throw new Error(`OPENAI_SESS_ERR: ${r.status} ${text}`);
    }

    const json = await r.json() as any;

    // Return minimal fields the client needs. Typical shape includes a
    // client_secret.
    // Do NOT return your real API key.
    return {
      session: {
        // id: json.id,
        // Ephemeral credential used by the client to authenticate WebRTC
        // with OpenAI:
        client_secret: json?.client_secret?.value,
        // Optionally return voice/model to keep client config in sync:
        model: MODEL,
        // voice: "marin",
        expires_at: json?.client_secret?.expires_at, // helpful for retries
      },
    };
  }
);
