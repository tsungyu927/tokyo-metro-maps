import zhTw from './zh-TW.json';

export type AppLocale = typeof zhTw;

export const locale: AppLocale = zhTw;

/**
 * Formats a locale template string by replacing `{key}` placeholders.
 */
export function formatMessage(
  template: string,
  params: Record<string, string | number>
): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    result = result.replaceAll(`{${key}}`, String(value));
  }
  return result;
}

/**
 * Resolves a dot-delimited translation key from the loaded locale dictionary.
 */
export function resolveLocaleKey(key: string): string {
  const parts = key.split('.');
  let current: unknown = locale;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof current === 'string' ? current : key;
}

