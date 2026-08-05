'use client';

/**
 * Ticket attachments — the actual bytes of a booking confirmation, kept
 * entirely on this device.
 *
 * Plans live in localStorage as JSON; a PDF or a phone photo does not belong
 * there — base64 would bloat it by a third, and a handful of tickets would
 * blow a quota the rest of the app assumes is free. IndexedDB holds the
 * actual Blob, keyed by plan id; the Plan record itself only ever carries the
 * small `ticket` metadata stub defined in lib/plans.ts, so every existing
 * synchronous read of a Plan stays synchronous and cheap.
 *
 * There is nowhere this could upload to — W2W is a static export with no
 * server behind it — so "never leaves the device" is not a setting here,
 * it is the simple absence of a network call anywhere in this file.
 */

const DB_NAME = 'w2w-tickets';
const DB_VERSION = 1;
const STORE = 'tickets';

/** A file past this is almost always the wrong file, not a real ticket. */
export const MAX_TICKET_BYTES = 10 * 1024 * 1024;

export interface TicketMeta {
  filename: string;
  type: string;
  size: number;
  addedAt: string;
}

interface TicketRecord extends TicketMeta {
  planId: string;
  blob: Blob;
}

export class TicketStorageError extends Error {}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new TicketStorageError('Ticket storage is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'planId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new TicketStorageError('Could not open ticket storage.'));
  });
}

/**
 * Shrink a phone photo before storing it.
 *
 * A ticket is legible at a fraction of a modern camera's native resolution —
 * 1600px on the long edge is generous for a QR code or a barcode — so this is
 * what keeps ten saved tickets from meaningfully denting anyone's device
 * storage. HEIC and anything else the browser cannot decode into a bitmap is
 * stored as-is rather than failing the attach outright.
 */
async function downscaleImage(file: File): Promise<Blob> {
  const MAX_EDGE = 1600;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1) {
    bitmap.close();
    return file;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const resized = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82),
  );
  return resized ?? file;
}

/** Store a ticket for a plan, replacing whatever was there before. */
export async function saveTicket(planId: string, file: File): Promise<TicketMeta> {
  if (file.size > MAX_TICKET_BYTES) {
    throw new TicketStorageError(
      `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB — tickets are capped at 10 MB.`,
    );
  }
  const isImage = file.type.startsWith('image/');
  const isPdf = file.type === 'application/pdf';
  if (!isImage && !isPdf) {
    throw new TicketStorageError('Tickets can be a PDF or an image.');
  }

  const blob = isImage ? await downscaleImage(file) : file;
  const meta: TicketMeta = {
    filename: file.name,
    type: blob.type || file.type,
    size: blob.size,
    addedAt: new Date().toISOString(),
  };

  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const record: TicketRecord = { planId, blob, ...meta };
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(
          tx.error?.name === 'QuotaExceededError'
            ? new TicketStorageError('Not enough space on this device for another ticket.')
            : (tx.error ?? new TicketStorageError('Could not save the ticket.')),
        );
    });
  } finally {
    db.close();
  }
  return meta;
}

/** Read a ticket back out, for viewing. Null if this plan never got one. */
export async function getTicket(planId: string): Promise<{ blob: Blob; meta: TicketMeta } | null> {
  const db = await openDb();
  try {
    const record = await new Promise<TicketRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(planId);
      req.onsuccess = () => resolve(req.result as TicketRecord | undefined);
      req.onerror = () => reject(req.error ?? new TicketStorageError('Could not read the ticket.'));
    });
    if (!record) return null;
    const { blob, filename, type, size, addedAt } = record;
    return { blob, meta: { filename, type, size, addedAt } };
  } finally {
    db.close();
  }
}

/**
 * Remove a ticket. Called whenever its plan is removed, so a ticket never
 * outlives the plan it belongs to.
 *
 * Best-effort on purpose: a leftover blob for a plan that no longer exists
 * costs storage, not correctness, and is not worth surfacing an error for
 * from what is, in every call site, a background cleanup step.
 */
export async function deleteTicket(planId: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(planId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // See doc comment — this is allowed to fail silently.
  }
}
