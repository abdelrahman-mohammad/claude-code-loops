type Settings = Record<string, unknown>;
type HookEntry = { matcher?: string; hooks: unknown[] };

/**
 * Deep-merge two .claude/settings.json objects.
 * - Hook arrays are concatenated (skip duplicates by serialized comparison)
 * - Permission arrays are unioned with dedup
 * - Scalars prefer existing values
 */
export function mergeSettings(existing: Settings, incoming: Settings): Settings {
  const merged = structuredClone(existing);

  // Merge hooks
  const incomingHooks = incoming.hooks as Record<string, HookEntry[]> | undefined;
  if (incomingHooks) {
    if (!merged.hooks) merged.hooks = {};
    const mergedHooks = merged.hooks as Record<string, HookEntry[]>;

    for (const [event, hookGroups] of Object.entries(incomingHooks)) {
      if (!mergedHooks[event]) {
        mergedHooks[event] = hookGroups;
      } else {
        for (const hookGroup of hookGroups) {
          const serialized = JSON.stringify(hookGroup.hooks);
          const exists = mergedHooks[event].some(
            (h) => JSON.stringify(h.hooks) === serialized,
          );
          if (!exists) {
            mergedHooks[event].push(hookGroup);
          }
        }
      }
    }
  }

  // Merge permissions
  const incomingPerms = incoming.permissions as Record<string, string[]> | undefined;
  if (incomingPerms) {
    if (!merged.permissions) merged.permissions = {};
    const mergedPerms = merged.permissions as Record<string, string[]>;

    for (const key of ["allow", "deny"] as const) {
      if (incomingPerms[key]) {
        mergedPerms[key] = [
          ...new Set([...(mergedPerms[key] ?? []), ...incomingPerms[key]]),
        ];
      }
    }
  }

  // Copy other top-level keys that don't exist in existing
  for (const [key, value] of Object.entries(incoming)) {
    if (key !== "hooks" && key !== "permissions" && !(key in merged)) {
      merged[key] = value;
    }
  }

  return merged;
}
