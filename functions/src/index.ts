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

    // Build your default session config (voice, system prompt, tools, etc.)
    const sessionConfig = {
      model: MODEL,
      voice: "echo",
      modalities: ["text", "audio"],
      instructions: "You are a helpful AI assistant for the Dawdle productivity app. Be friendly, encouraging, and supportive. Help users stay focused and motivated.",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      input_audio_transcription: {
        enabled: true,
        model: "whisper-1"
      },
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500
      },
      tools: [],
      tool_choice: "auto",
      temperature: 0.8,
      max_response_output_tokens: "inf"
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
        expires_at: json?.client_secret?.expires_at, // helpful for retries
      },
    };
  }
);
