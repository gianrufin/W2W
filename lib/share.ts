'use client';

/**
 * Share a screening.
 *
 * The Web Share API is preferred because it hands off to whatever the person
 * actually uses — Messenger, Viber, SMS — rather than the one channel a
 * bespoke share menu could guess at. Where it is unavailable (most desktop
 * browsers), the fallback copies the same text to the clipboard: the intent
 * ("send this to someone") survives even where the OS sheet does not.
 *
 * The shared link is always the app's own URL, never a deep link into map
 * state the export has nowhere to route — see the `?cinema=` handling in
 * discovery-shell for the one exception, which this always includes.
 */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'unsupported';

export async function shareScreening(params: {
  title: string;
  text: string;
  url: string;
}): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share(params);
      return 'shared';
    } catch (err) {
      // AbortError is the person closing the OS share sheet — not a failure.
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
      // Any other failure (permissions, an unsupported combination of fields)
      // falls through to the clipboard below rather than going silent.
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(`${params.text}\n${params.url}`);
      return 'copied';
    } catch {
      // Clipboard permission denied — nothing left to try.
    }
  }

  return 'unsupported';
}
