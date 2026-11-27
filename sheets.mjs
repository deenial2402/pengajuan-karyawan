// Akses Google Sheets memakai service account.
// - Spreadsheet Users (SHEET_ID): hanya dibaca. Kolom: A ID Login | B Ops ID | C Nama | D Userlevel | E Password | F Aktif | G Jenis (Operator / Reguler)
// - Spreadsheet Riwayat (HISTORY_SHEET_ID): dibaca dan ditulis. Satu tab per jenis pengajuan (Cuti, Sakit, Tukar Tanggal, Tambah Hari Kerja, Izin).
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets'; // baca & tulis
const TTL = 60_000; // cache daftar pengguna 60 detik

let tokenCache = { token: null, exp: 0 };
let usersCache = { at: 0, rows: null };

const b64u = (x) => Buffer.from(x).toString('base64url');

async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;

  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}');
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON belum diatur di Netlify');

  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: sa.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(sa.private_key).toString('base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${head}.${claim}.${sig}`,
    }),
  });
  const d = await res.json();
  if (!res.ok) throw new Error('Gagal login ke Google: ' + (d.error_description || d.error));

  tokenCache = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return d.access_token;
}

async function sheetsFetch(path, init = {}) {
  const token = await accessToken();
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(init.headers || {}) },
  });
  const d = await res.json();
  if (!res.ok) throw new Error('Google Sheets: ' + (d.error?.message || res.status));
  return d;
}

const enc = encodeURIComponent;

/** Membaca rentang, mengembalikan array baris (string). */
export async function readRange(spreadsheetId, range) {
  const d = await sheetsFetch(`${spreadsheetId}/values/${enc(range)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
  return (d.values || []).map((row) => row.map((c) => (c == null ? '' : String(c))));
}

/** Membaca beberapa rentang sekaligus (satu panggilan API). */
export async function readRanges(spreadsheetId, ranges) {
  const qs = ranges.map((r) => 'ranges=' + enc(r)).join('&');
  const d = await sheetsFetch(`${spreadsheetId}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`);
  return (d.valueRanges || []).map((v) => (v.values || []).map((row) => row.map((c) => (c == null ? '' : String(c)))));
}

/** Menambah baris di bawah tabel. RAW agar teks tidak diubah otomatis (mis. tanggal). */
export async function appendRows(spreadsheetId, range, rows) {
  return sheetsFetch(`${spreadsheetId}/values/${enc(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    body: JSON.stringify({ values: rows }),
  });
}

/** Menimpa satu rentang yang sudah ditentukan. */
export async function updateRange(spreadsheetId, range, rows) {
  return sheetsFetch(`${spreadsheetId}/values/${enc(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: rows }),
  });
}

/** Daftar pengguna dari spreadsheet Users. */
export async function getUsers() {
  if (usersCache.rows && Date.now() - usersCache.at < TTL) return usersCache.rows;

  const id = process.env.SHEET_ID;
  const tab = process.env.SHEET_TAB || 'Users';
  if (!id) throw new Error('SHEET_ID belum diatur di Netlify');

  const values = await readRange(id, `${tab}!A2:G`);
  const rows = values
    .filter((r) => String(r[0] || '').trim())
    .map((r) => ({
      id: String(r[0]).trim(),
      ops: String(r[1] || '').trim(),
      name: String(r[2] || '').trim(),
      role: String(r[3] || 'karyawan').trim().toLowerCase(),
      pin: String(r[4] || '').trim(),
      active: String(r[5] || 'Ya').trim().toLowerCase() !== 'tidak',
      // Kosong atau tidak dikenali dianggap Reguler, agar akses tidak hilang karena kolom belum diisi.
      kind: String(r[6] || '').trim().toLowerCase() === 'operator' ? 'operator' : 'reguler',
    }));

  usersCache = { at: Date.now(), rows };
  return rows;
}
