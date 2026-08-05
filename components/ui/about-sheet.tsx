'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X, Coffee, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * About W2W — one quiet entry point instead of several scattered ones.
 *
 * The support ask lives here rather than as its own floating button. A tip
 * jar on first paint reads as a solicitation before anyone has gotten any
 * value from the app; tucked behind an `ⓘ` that looks exactly like the
 * filters and theme buttons next to it, it only reaches someone curious
 * enough to tap it — which, going by every app that does this well, is also
 * exactly the person who is likely to actually use it.
 *
 * It also carries the disclosures that have nowhere else to live in an app
 * with no settings screen: what the data is, how fresh it is, and — since
 * analytics were added — that they exist at all.
 */
export function AboutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="pointer-events-auto fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="About W2W"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] w-full max-w-xl flex-col rounded-t-4xl border-t border-hairline bg-card shadow-float"
          >
            <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
              <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-hairline" aria-hidden />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-label text-[10px] uppercase tracking-widest text-brand">
                    About
                  </p>
                  <h2 className="font-title mt-1 text-[20px] font-bold text-ink">
                    Where, When, What 2 Watch
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-1 -mt-1 shrink-0 rounded-full p-2 text-muted transition hover:bg-surface hover:text-ink active:scale-95"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 text-[13px] leading-relaxed text-muted">
                W2W is a one-person passion project — every cinema chain, every
                festival, and the map that ties them together, built because
                the information already existed and just wasn&rsquo;t in one
                place. There is no company behind it and no funding, which is
                the honest reason the section below exists.
              </p>

              {/* The tip. Not a button that shouts — a card that answers the
                  question once someone has decided to ask it. */}
              <div className="mt-5 rounded-3xl border border-brand/25 bg-brandsoft/30 p-4">
                <div className="flex items-center gap-2 text-brand">
                  <Coffee className="h-4 w-4" />
                  <span className="font-label text-[12px] font-semibold uppercase tracking-wide">
                    Buy me a coffee
                  </span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  If W2W saved you a wasted trip to a sold-out showing, a small
                  tip keeps the scrapers running and the map accurate. Never
                  required — the app stays free either way.
                </p>

                <div className="mt-3 flex items-center gap-3">
                  {/* QR codes need a genuine white quiet zone to stay scannable,
                      so this stays a fixed light card in both themes rather
                      than following the surface token. */}
                  <div className="shrink-0 overflow-hidden rounded-2xl border border-hairline bg-white p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="support-qr.jpg"
                      alt="GoTyme / InstaPay QR code to send a tip"
                      className="h-24 w-24 object-contain"
                    />
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted">
                    Scan with any InstaPay-enabled banking app — GCash, Maya, or
                    your bank&rsquo;s own scanner.
                  </p>
                </div>
              </div>

              <dl className="mt-5 space-y-3 border-t border-hairline pt-4">
                <InfoRow label="Data">
                  Scraped directly from each chain&rsquo;s own booking systems and
                  refreshed daily. No listing is invented — an empty result means
                  nothing is actually on, not that the app gave up looking.
                </InfoRow>
                <InfoRow label="Your data">
                  Location is used only to sort cinemas by distance and is never
                  sent anywhere beyond that calculation. Saved cinemas, plans, and
                  any ticket you attach to one live in this browser only — W2W is
                  a static site with no server to upload a file to, even if it
                  wanted to. Anonymous usage analytics (page views, not your
                  location, plans, or tickets) help spot what is broken.
                </InfoRow>
              </dl>

              <a
                href="https://github.com/gianrufin/W2W"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'font-label mt-5 inline-flex items-center gap-1.5 text-[12px] text-muted transition hover:text-ink',
                )}
              >
                Source on GitHub
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-label text-[10px] font-semibold uppercase tracking-widest text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-[12px] leading-relaxed text-muted">{children}</dd>
    </div>
  );
}
