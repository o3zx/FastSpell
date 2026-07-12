/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Custom corrections are stored in DataStore instead of plugin settings:
// settings.json is one file shared by every Discord branch (stable/PTB/canary),
// and each running instance rewrites the whole file on any settings change, so
// pairs added in one client silently vanish when another client writes.

import * as DataStore from "@api/DataStore";
import { useEffect, useState } from "@webpack/common";

const KEY = "FastSpell_customCorrections";

let corrections: Record<string, string> = {};
const listeners = new Set<() => void>();

function emit() {
    listeners.forEach(l => l());
}

export function getCustomCorrections() {
    return corrections;
}

/** Loads persisted pairs, merging in (and persisting) any passed-in legacy pairs. */
export async function loadCustomCorrections(migrateFrom?: Record<string, string>) {
    const stored = await DataStore.get<Record<string, string>>(KEY);
    corrections = { ...migrateFrom, ...stored };
    if (migrateFrom && Object.keys(migrateFrom).length > 0)
        await DataStore.set(KEY, corrections);
    emit();
}

export function addCustomCorrection(from: string, to: string) {
    corrections = { ...corrections, [from]: to };
    DataStore.set(KEY, corrections);
    emit();
}

export function removeCustomCorrection(from: string) {
    const next = { ...corrections };
    delete next[from];
    corrections = next;
    DataStore.set(KEY, corrections);
    emit();
}

export function useCustomCorrections() {
    const [value, setValue] = useState(corrections);
    useEffect(() => {
        const cb = () => setValue(getCustomCorrections());
        listeners.add(cb);
        cb();
        return () => void listeners.delete(cb);
    }, []);
    return value;
}
