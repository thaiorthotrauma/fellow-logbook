// Stand-in for @supabase/supabase-js, used only by the screenshot harness.
// Keeps an in-memory `cases` table so the real app is fully interactive
// (log / edit / delete / export) with no backend. Nothing here ships.

import { SAMPLE_FELLOW, SAMPLE_STAFF, fellowCaseRows, staffCaseRows } from './sampleData';

type Row = Record<string, unknown>;

const params = new URLSearchParams(window.location.search);
const mock = params.get('mock') ?? 'fellow';

const cases: Row[] = mock === 'staff' ? [] : fellowCaseRows();

/** Placeholder tiles standing in for a case's uploaded films — deliberately
 *  labelled graphics, not radiographs. */
const imageStore = new Map<string, string>();

function placeholderTile(label: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 1100;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#243036');
  grad.addColorStop(1, '#0f171b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 6;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = '600 54px "IBM Plex Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, canvas.width / 2, canvas.height / 2 - 20);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '400 38px "IBM Plex Sans", sans-serif';
  ctx.fillText('sample image', canvas.width / 2, canvas.height / 2 + 46);
  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
}

for (const [id, label] of [
  ['img-preop-ap', 'Pre-op AP'],
  ['img-preop-lat', 'Pre-op lateral'],
  ['img-postop-ap', 'Post-op AP'],
] as const) {
  imageStore.set(id, placeholderTile(label));
}

const ok = (data: unknown) => ({ data, error: null });

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private pending: Row[] | Row | null = null;
  private matchId: string | null = null;
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';

  constructor(private readonly table: string) {}

  select() {
    return this;
  }
  order() {
    return this;
  }
  eq(_col: string, value: string) {
    this.matchId = value;
    return this;
  }
  insert(row: Row) {
    this.op = 'insert';
    this.pending = row;
    return this;
  }
  update(row: Row) {
    this.op = 'update';
    this.pending = row;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  private resolve(): unknown {
    if (this.table === 'fellow') return mock === 'staff' ? null : SAMPLE_FELLOW;
    if (this.table !== 'cases') return null;

    if (this.op === 'insert') {
      const row = this.pending as Row;
      cases.push(row);
      return row;
    }
    if (this.op === 'update') {
      const i = cases.findIndex(c => c.id === this.matchId);
      const merged = { ...cases[i], ...(this.pending as Row) };
      cases[i] = merged;
      return merged;
    }
    if (this.op === 'delete') {
      const i = cases.findIndex(c => c.id === this.matchId);
      if (i >= 0) cases.splice(i, 1);
      return null;
    }
    return [...cases];
  }

  maybeSingle() {
    return Promise.resolve(ok(this.resolve()));
  }
  single() {
    return Promise.resolve(ok(this.resolve()));
  }
  then<R1, R2 = never>(
    onFulfilled?: ((v: { data: unknown; error: null }) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(ok(this.resolve())).then(onFulfilled, onRejected);
  }
}

const client = {
  from: (table: string) => new Query(table),

  rpc: (fn: string) => {
    if (fn === 'my_staff_profile') {
      return Promise.resolve(ok(mock === 'staff' ? [SAMPLE_STAFF] : []));
    }
    if (fn === 'staff_institution_cases') {
      return Promise.resolve(ok(mock === 'staff' ? staffCaseRows() : []));
    }
    return Promise.resolve(ok([]));
  },

  auth: {
    getSession: () => Promise.resolve(ok({ session: null })),
    signInAnonymously: () => Promise.resolve(ok({ session: null })),
    signOut: () => Promise.resolve({ error: null }),
  },

  functions: {
    invoke: (name: string, opts?: { body?: Record<string, unknown> }) => {
      const body = opts?.body ?? {};
      if (name === 'drive-images') {
        if (body.action === 'upload') {
          const id = `img-upload-${imageStore.size + 1}`;
          imageStore.set(id, String(body.dataBase64 ?? ''));
          return Promise.resolve(ok({ id }));
        }
        if (body.action === 'get') {
          const stored = imageStore.get(String(body.id));
          if (!stored) return Promise.resolve({ data: null, error: new Error('not found') });
          return Promise.resolve(ok({ contentType: 'image/jpeg', dataBase64: stored }));
        }
        return Promise.resolve(ok({ ok: true }));
      }
      // notify-case / log-error / classify-region: silently no-op, exactly as
      // they do in production when their secrets are unset.
      return Promise.resolve(ok({ ok: true }));
    },
  },
};

export function createClient() {
  return client;
}
