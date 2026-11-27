// Riwayat pengajuan: satu tab per jenis pengajuan di spreadsheet riwayat (HISTORY_SHEET_ID).
// Tab: Cuti, Sakit, Tukar Tanggal, Tambah Hari Kerja, Izin. Waktu di sheet memakai WIB (GMT+7).
// Kolom tiap tab: Dibuat (WIB) | Ops ID | Nama | [kolom khusus jenis] | Alasan | Jumlah Foto | Status |
//   Diproses oleh | Waktu Proses (WIB) | Catatan Proses | ID Login | ID Pengajuan | Riwayat (JSON, UTC)
import { getStore } from '@netlify/blobs';
import { readRange, readRanges, appendRows, updateRange } from './sheets.mjs';

const TZ = 'Asia/Jakarta';
const TTL = 60_000; // cache maksimal 60 detik; otomatis dibuang saat ada tulisan baru

export const LABEL = {
  menunggu_tl: 'Menunggu TL',
  disetujui_tl: 'Menunggu Admin',
  selesai: 'Selesai',
  ditolak_tl: 'Ditolak TL',
  dikembalikan: 'Dikembalikan',
  dibatalkan: 'Dibatalkan',
};
const KEY = Object.fromEntries(Object.entries(LABEL).map(([k, v]) => [v, k]));

// Kolom khusus per jenis (di antara Nama dan Alasan).
export const LAYOUT = {
  cuti: { tab: 'Cuti', mid: ['from', 'to', 'days'] },
  sakit: { tab: 'Sakit', mid: ['from', 'to', 'days', 'shift'] },
  tukar: { tab: 'Tukar Tanggal', mid: ['from', 'to'] },
  tambah: { tab: 'Tambah Hari Kerja', mid: ['from'] },
  izin: { tab: 'Izin', mid: ['from', 'shift'] },
};
const TYPES = Object.keys(LAYOUT);

export class ConflictError extends Error {}

const colLetter = (i) => String.fromCharCode(65 + i); // maksimal kolom P
const lastCol = (type) => colLetter(11 + LAYOUT[type].mid.length);
const idx = (type) => {
  const n = LAYOUT[type].mid.length;
  return { note: 3 + n, photos: 4 + n, status: 5 + n, by: 6 + n, at: 7 + n, noteProc: 8 + n, uid: 9 + n, id: 10 + n, log: 11 + n };
};

const wib = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
};
const fromWib = (s) => {
  if (!s) return '';
  const d = new Date(String(s).trim().replace(' ', 'T') + '+07:00');
  return isNaN(d) ? '' : d.toISOString();
};
// Jaga-jaga bila sel diubah manual dan Google Sheets mengubahnya menjadi angka tanggal (serial).
const isSerial = (v) => /^\d{4,6}(\.\d+)?$/.test(String(v).trim());
const serialStr = (v, withTime) => {
  const iso = new Date(Math.round((Number(v) - 25569) * 864e5)).toISOString();
  return withTime ? `${iso.slice(0, 10)} ${iso.slice(11, 19)}` : iso.slice(0, 10);
};
const dateCell = (v) => (isSerial(v) ? serialStr(v, false) : String(v ?? '').trim());
const timeCell = (v) => (isSerial(v) ? serialStr(v, true) : v);

const dayCount = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1;

const toRow = (r) => {
  const v = { from: r.from, to: r.to, days: dayCount(r.from, r.to), shift: r.shift ?? '' };
  return [
    wib(r.created), r.ops, r.name,
    ...LAYOUT[r.type].mid.map((k) => v[k]),
    r.note, r.photos ?? 0, LABEL[r.status] || r.status,
    r.by ?? '', wib(r.at), r.noteProc ?? '',
    r.uid, r.id, JSON.stringify(r.log || []),
  ];
};

const fromRow = (type, row, rowNo) => {
  const c = (i) => row[i] ?? '';
  const ix = idx(type);
  const mid = Object.fromEntries(LAYOUT[type].mid.map((k, i) => [k, k === 'from' || k === 'to' ? dateCell(c(3 + i)) : c(3 + i)]));
  let log = [];
  try { log = JSON.parse(c(ix.log) || '[]'); } catch { log = []; }
  return {
    rowNo, type,
    id: c(ix.id),
    created: fromWib(timeCell(c(0))),
    uid: c(ix.uid),
    ops: c(1),
    name: c(2),
    from: mid.from,
    to: mid.to || mid.from,
    shift: Number(mid.shift) || null,
    shift2: null,
    partner: '',
    note: c(ix.note),
    photos: Number(c(ix.photos)) || 0,
    status: KEY[c(ix.status)] || 'menunggu_tl',
    by: c(ix.by),
    at: fromWib(timeCell(c(ix.at))),
    noteProc: c(ix.noteProc),
    log,
  };
};

const sheetId = () => {
  const id = process.env.HISTORY_SHEET_ID;
  if (!id) throw new Error('HISTORY_SHEET_ID belum diatur di Netlify');
  return id;
};

// ---------- Cache pendek. Versi disimpan di Netlify Blobs agar semua instance ikut tahu ada perubahan ----------
let cache = { at: 0, ver: null, rows: null };
const meta = () => getStore('pengajuan-meta');
async function version() {
  try { return (await meta().get('ver')) || '0'; } catch { return null; }
}
async function bump() {
  cache = { at: 0, ver: null, rows: null };
  try { await meta().set('ver', `${Date.now()}-${Math.random()}`); } catch { /* cache tetap kedaluwarsa sendiri */ }
}
const clone = (rows) => rows.map((r) => ({ ...r, log: [...r.log] }));

/** Semua pengajuan dari kelima tab. fresh:true selalu membaca langsung dari sheet. */
export async function readAll({ fresh = false } = {}) {
  const ver = await version();
  if (!fresh && cache.rows && ver !== null && ver === cache.ver && Date.now() - cache.at < TTL) return clone(cache.rows);

  const ranges = TYPES.map((t) => `'${LAYOUT[t].tab}'!A2:${lastCol(t)}`);
  const res = await readRanges(sheetId(), ranges);
  const rows = res
    .flatMap((vals, i) => vals.map((row, j) => fromRow(TYPES[i], row, j + 2)))
    .filter((r) => r.id);
  cache = { at: Date.now(), ver, rows };
  return clone(rows);
}

export async function appendOne(rec) {
  const L = LAYOUT[rec.type];
  const out = await appendRows(sheetId(), `'${L.tab}'!A:${lastCol(rec.type)}`, [toRow(rec)]);
  await bump();
  return out;
}

/** Menimpa satu baris. expectStatus: status yang diharapkan masih tertulis di sheet (cegah dua orang memproses bersamaan). */
export async function updateOne(rec, expectStatus) {
  const L = LAYOUT[rec.type];
  const last = lastCol(rec.type);
  const range = `'${L.tab}'!A${rec.rowNo}:${last}${rec.rowNo}`;
  if (expectStatus) {
    const cur = (await readRange(sheetId(), range))[0] || [];
    const ix = idx(rec.type);
    if (String(cur[ix.id] ?? '') !== rec.id || KEY[cur[ix.status]] !== expectStatus) {
      cache = { at: 0, ver: null, rows: null };
      throw new ConflictError('Status pengajuan sudah berubah');
    }
  }
  const out = await updateRange(sheetId(), range, [toRow(rec)]);
  await bump();
  return out;
}
