/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { classes } from "@utils/misc";
import { IconComponent, PluginNative } from "@utils/types";
import { insertTextIntoChatInputBox } from "@utils/discord";
import { MediaEngineStore, showToast, Toasts, useEffect, useRef, useState } from "@webpack/common";

import { settings } from "./settings";

const Native = VencordNative.pluginHelpers.FastSpell as PluginNative<typeof import("./native")>;

export const MicIcon: IconComponent = ({ height = 20, width = 20, className }) => (
    <svg viewBox="0 0 24 24" height={height} width={width} className={className}>
        <path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2Z" />
    </svg>
);

function getProviderConfig() {
    const { sttProvider, sttApiKey, sttModel, sttCustomUrl, sttTranslateModel } = settings.store;
    switch (sttProvider) {
        case "openai":
            return { baseUrl: "https://api.openai.com/v1", model: sttModel || "whisper-1", apiKey: sttApiKey, translateModel: sttTranslateModel || "gpt-4o-mini" };
        case "custom":
            return { baseUrl: sttCustomUrl, model: sttModel, apiKey: sttApiKey, translateModel: sttTranslateModel };
        default:
            return { baseUrl: "https://api.groq.com/openai/v1", model: sttModel || "whisper-large-v3-turbo", apiKey: sttApiKey, translateModel: sttTranslateModel || "llama-3.3-70b-versatile" };
    }
}

export const SpeechChatBarButton: ChatBarButtonFactory = ({ isMainChat }) => {
    const [recording, setRecording] = useState(false);
    const [busy, setBusy] = useState(false);
    const recordingRef = useRef(false);
    recordingRef.current = recording;

    // If the user switches channels mid-recording, stop and discard.
    useEffect(() => () => {
        if (recordingRef.current) {
            try {
                DiscordNative.nativeModules.requireModule("discord_voice").stopLocalAudioRecording(() => { });
            } catch { }
        }
    }, []);

    if (!isMainChat || IS_WEB) return null;

    function start() {
        const { apiKey, baseUrl, model } = getProviderConfig();
        if (!apiKey) {
            showToast("FastSpell: set your speech-to-text API key in the plugin settings first (free key at console.groq.com)", Toasts.Type.FAILURE);
            return;
        }
        if (!baseUrl || !model) {
            showToast("FastSpell: custom provider needs both a base url and a model in the plugin settings", Toasts.Type.FAILURE);
            return;
        }

        let discordVoice: any;
        try {
            discordVoice = DiscordNative.nativeModules.requireModule("discord_voice");
        } catch {
            showToast("FastSpell: voice recording is only available on the Discord desktop app", Toasts.Type.FAILURE);
            return;
        }

        discordVoice.startLocalAudioRecording(
            {
                echoCancellation: true,
                noiseCancellation: true,
                deviceId: MediaEngineStore.getInputDeviceId()
            },
            (success: boolean) => {
                if (success) setRecording(true);
                else showToast("FastSpell: failed to start recording (check your microphone)", Toasts.Type.FAILURE);
            }
        );
    }

    function stop() {
        const discordVoice = DiscordNative.nativeModules.requireModule("discord_voice");
        discordVoice.stopLocalAudioRecording(async (filePath: string) => {
            setRecording(false);
            if (!filePath) {
                showToast("FastSpell: recording failed", Toasts.Type.FAILURE);
                return;
            }

            setBusy(true);
            try {
                const { apiKey, baseUrl, model, translateModel } = getProviderConfig();
                const res = await Native.transcribeRecording({
                    filePath,
                    apiKey,
                    baseUrl,
                    model,
                    language: settings.store.sttLanguage.trim()
                });

                if (!res.ok) {
                    showToast("FastSpell: " + (res.error ?? "transcription failed"), Toasts.Type.FAILURE);
                    return;
                }
                if (!res.text) {
                    showToast("FastSpell: didn't catch that — no speech detected", Toasts.Type.MESSAGE);
                    return;
                }

                let text = res.text;
                const targetLanguage = settings.store.sttTranslateTo.trim();
                if (targetLanguage) {
                    if (!translateModel) {
                        showToast("FastSpell: set a translation model in the plugin settings to use speech translation with a custom provider", Toasts.Type.FAILURE);
                    } else {
                        const translated = await Native.translateText({ apiKey, baseUrl, model: translateModel, text, targetLanguage });
                        if (translated.ok && translated.text) text = translated.text;
                        else showToast("FastSpell: translation failed, inserting what you said instead — " + (translated.error ?? "unknown error"), Toasts.Type.FAILURE);
                    }
                }

                insertTextIntoChatInputBox(text + " ");
            } finally {
                setBusy(false);
            }
        });
    }

    const tooltip = busy
        ? settings.store.sttTranslateTo.trim() ? "Transcribing & translating..." : "Transcribing..."
        : recording
            ? "Stop recording & insert text"
            : "Voice typing (speech-to-text)";

    return (
        <ChatBarButton
            tooltip={tooltip}
            onClick={() => {
                if (busy) return;
                if (recording) stop();
                else start();
            }}
        >
            <MicIcon
                className={classes(
                    "vc-fastspell-mic",
                    recording ? "vc-fastspell-mic-recording" : undefined,
                    busy ? "vc-fastspell-mic-busy" : undefined
                )}
            />
        </ChatBarButton>
    );
};
