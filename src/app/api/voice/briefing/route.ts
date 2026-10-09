import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

interface VoiceBriefingRequest {
    text?: string;
    voice?: string;
}

function normalizeFoundryBaseUrl(candidate?: string): string | null {
    if (!candidate) return null;

    const trimmed = candidate.trim();
    if (!trimmed) return null;

    let normalized = trimmed.replace(/\/+$/g, "");
    if (normalized.endsWith("/responses")) {
        normalized = normalized.slice(0, -"/responses".length);
    }
    if (normalized.endsWith("/chat/completions")) {
        normalized = normalized.slice(0, -"/chat/completions".length);
    }

    return normalized;
}

function resolveFoundrySpeechModel(configuredModel?: string): string {
    const explicitModel = configuredModel?.trim();
    const candidates = new Set<string>();

    if (explicitModel) {
        candidates.add(explicitModel);
    }

    const fallbackModel = process.env.FOUNDRY_TTS_MODEL?.trim() || process.env.FOUNDRY_MODEL?.trim();
    if (fallbackModel) {
        candidates.add(fallbackModel);
    }

    for (const candidate of [
        "gpt-4o-mini-audio-preview-2024-12-17",
        "gpt-4o-mini-audio-preview",
        "gpt-4o-mini-tts-2025-12-15",
        "gpt-4o-mini-tts",
    ]) {
        if (!candidates.has(candidate)) {
            candidates.add(candidate);
        }
    }

    return Array.from(candidates).find((candidate) => /tts|audio/i.test(candidate)) ?? "gpt-4o-mini-audio-preview-2024-12-17";
}

function resolveSpeechVoice(voice?: string): string {
    const provided = (voice ?? "").trim();
    if (!provided) {
        return process.env.FOUNDRY_TTS_VOICE?.trim() || "alloy";
    }

    const normalized = provided.toLowerCase();
    if (normalized === "ash") {
        return "alloy";
    }

    return provided;
}

function extractAudioPayload(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    const visit = (node: unknown): string | null => {
        if (!node || typeof node !== "object") {
            return null;
        }

        if (Array.isArray(node)) {
            for (const item of node) {
                const candidate = visit(item);
                if (candidate) {
                    return candidate;
                }
            }
            return null;
        }

        const record = node as Record<string, unknown>;
        if (typeof record.data === "string" && record.format === "mp3") {
            return record.data;
        }

        if (typeof record.audio === "object" && record.audio) {
            const audio = record.audio as Record<string, unknown>;
            if (typeof audio.data === "string") {
                return audio.data;
            }
            if (typeof audio.base64 === "string") {
                return audio.base64;
            }
            if (typeof audio.content === "string") {
                return audio.content;
            }
        }

        if (typeof record.output_audio === "object" && record.output_audio) {
            const outputAudio = record.output_audio as Record<string, unknown>;
            if (typeof outputAudio.data === "string") {
                return outputAudio.data;
            }
            if (typeof outputAudio.base64 === "string") {
                return outputAudio.base64;
            }
        }

        for (const value of Object.values(record)) {
            const candidate = visit(value);
            if (candidate) {
                return candidate;
            }
        }

        return null;
    };

    return visit(payload);
}

async function synthesizeWithFoundry(text: string, voice: string) {
    const baseUrl = normalizeFoundryBaseUrl(
        process.env.FOUNDRY_ENDPOINT ?? process.env.OPENAI_BASE_URL,
    );
    const apiKey = process.env.FOUNDRY_API_KEY ?? process.env.OPENAI_API_KEY;
    const model = resolveFoundrySpeechModel(process.env.FOUNDRY_TTS_MODEL ?? process.env.FOUNDRY_MODEL);

    if (!baseUrl || !apiKey) {
        return null;
    }

    const headers = {
        "Content-Type": "application/json",
        "api-key": apiKey,
        Authorization: `Bearer ${apiKey}`,
    };

    const speechResponse = await fetch(`${baseUrl}/audio/speech`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            input: text,
            voice,
            response_format: "mp3",
        }),
    });

    if (speechResponse.ok) {
        const arrayBuffer = await speechResponse.arrayBuffer();
        return {
            arrayBuffer,
            mimeType: speechResponse.headers.get("content-type") || "audio/mpeg",
        };
    }

    const responsePayload = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            input: text,
            modalities: ["text", "audio"],
            audio: {
                voice,
                format: "mp3",
            },
        }),
    });

    if (!responsePayload.ok) {
        throw new Error(`Foundry speech failed with ${responsePayload.status}`);
    }

    const parsedPayload = (await responsePayload.json()) as Record<string, unknown>;
    const audioContent = extractAudioPayload(parsedPayload);
    if (!audioContent) {
        throw new Error("Foundry responses payload did not include audio content");
    }

    const arrayBuffer = Buffer.from(audioContent, "base64");
    return {
        arrayBuffer: arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength),
        mimeType: responsePayload.headers.get("content-type") || "audio/mpeg",
    };
}

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    try {
        const body = (await request.json()) as VoiceBriefingRequest;
        const text = (body.text ?? "").toString().trim();
        const voice = resolveSpeechVoice((body.voice ?? "").toString().trim());

        if (!text) {
            return NextResponse.json({ ok: false, error: "No text provided" }, { status: 400 });
        }

        const result = await synthesizeWithFoundry(text, voice);
        if (!result) {
            return NextResponse.json({ ok: false, error: "No speech provider configured" }, { status: 503 });
        }

        return new NextResponse(result.arrayBuffer, {
            status: 200,
            headers: {
                "Content-Type": result.mimeType,
                "Cache-Control": "no-store",
                "Content-Disposition": 'inline; filename="briefing.mp3"',
            },
        });
    } catch (error) {
        console.error("Voice briefing failed", error);
        return NextResponse.json({ ok: false, error: "Speech synthesis unavailable" }, { status: 502 });
    }
}
