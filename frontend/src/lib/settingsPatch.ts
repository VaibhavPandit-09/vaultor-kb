export type SettingsPatch = { [key: string]: unknown };
const object = (v: unknown): v is SettingsPatch => !!v && typeof v === 'object' && !Array.isArray(v);
/** Missing keys explicitly clear a leaf. Unchanged leaves never leave the client. */
export function settingsDiff(previous: unknown, next: unknown): SettingsPatch {
  const a = object(previous) ? previous : {}, b = object(next) ? next : {}, result: SettingsPatch = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[key]) === JSON.stringify(b[key])) continue;
    result[key] = object(b[key]) ? settingsDiff(a[key], b[key]) : b[key] ?? null;
  }
  return result;
}
export function mergeSettingsPatch(base: SettingsPatch, patch: SettingsPatch): SettingsPatch {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = object(value) ? mergeSettingsPatch(object(result[key]) ? result[key] : {}, value) : value;
  }
  return result;
}
export function combineSettingsPatches(base: SettingsPatch, patch: SettingsPatch): SettingsPatch {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) result[key] = object(value) ? combineSettingsPatches(object(result[key]) ? result[key] : {}, value) : value;
  return result;
}
