// Riwayat pengajuan disimpan di tab "Pengajuan" pada spreadsheet riwayat (HISTORY_SHEET_ID).
// Status di sheet memakai label yang mudah dibaca; di aplikasi dipetakan ke kunci internal.
import { readRange, appendRows, updateRange } from './sheets.mjs';

const TAB = process.env.HISTORY_TAB || 'Pengajuan';
const LASTCOL = 'R';

export const LABEL = {
  menunggu_tl: 'Menunggu TL',
  disetujui_tl: 'Menunggu Admin',
  selesai: 'Selesai',
  ditolak_tl: 'Ditolak TL',
  dikembalikan: 'Dikembalikan',
};
const KEY = Object.fromEntries(Object.entries(LABEL).map(([k, v]) => [v, k]));

// Urutan kolom A..R harus sama dengan header di sheet.
const toRow = (r) => [
  r.id, r.created, r.type, r.uid, r.ops, r.name, r.from, r.to,
  r.shift, r.shift2 ?? '', r.partner ?? '', r.note, r.photos ?? 0,
  LABEL[r.status] || r.status,
  r.by ?? '', r.at ?? '', r.noteProc ?? '',
  JSON.stringify(r.log || []),
];

const fromRow = (row, rowNo) => {
  const c = (i) => row[i] ?? '';
  let log = [];
  try { log = JSON.parse(c(17) || '[]'); } catch { log = []; }
  return {
    rowNo,
    id: c(0),
    created: c(1),
    type: c(2),
    uid: c(3),
    ops: c(4),
    name: c(5),
    from: c(6),
    to: c(7),
    shift: Number(c(8)) || null,
    shift2: null,
    partner: c(10),
    note: c(11),
    photos: Number(c(12)) || 0,
    status: KEY[c(13)] || 'menunggu_tl',
    by: c(14),
    at: c(15),
    noteProc: c(16),
    log,
  };
};

const sheetId = () => {
  const id = process.env.HISTORY_SHEET_ID;
  if (!id) throw new Error('HISTORY_SHEET_ID belum diatur di Netlify');
  return id;
};

/** Semua pengajuan, termasuk nomor baris di sheet (dipakai untuk update). */
export async function readAll() {
  const rows = await readRange(sheetId(), `${TAB}!A2:${LASTCOL}`);
  return rows
    .map((row, i) => fromRow(row, i + 2))
    .filter((r) => r.id);
}

export async function appendOne(rec) {
  return appendRows(sheetId(), `${TAB}!A:${LASTCOL}`, [toRow(rec)]);
}

export async function updateOne(rec) {
  return updateRange(sheetId(), `${TAB}!A${rec.rowNo}:${LASTCOL}${rec.rowNo}`, [toRow(rec)]);
}
