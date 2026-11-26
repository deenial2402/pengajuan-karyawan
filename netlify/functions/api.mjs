import { getStore } from '@netlify/blobs';
import ExcelJS from 'exceljs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { getUsers } from '../lib/sheets.mjs';
import { sign, verify } from '../lib/session.mjs';
import { readAll, appendOne, updateOne, LABEL } from '../lib/history.mjs';

const BACKEND_ROLES = ['tl', 'admin', 'superadmin'];
const TYPES = ['cuti', 'sakit', 'tukar', 'tambah', 'izin'];
const RANGE_TYPES = ['cuti', 'sakit']; // hanya ini yang boleh rentang tanggal
const T = { cuti: 'Cuti', sakit: 'Sakit', tukar: 'Tukar Shift', tambah: 'Tambah Hari Kerja', izin: 'Berhalangan Hadir' };
const ACT = { approve: 'menyetujui', reject: 'menolak', check: 'sudah memeriksa', return: 'mengembalikan' };
const TZ = 'Asia/Makassar';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Aturan perpindahan status. Sama dengan validasi di Apps Script.
const RULES = {
  approve: { from: 'menunggu_tl', to: 'disetujui_tl', roles: ['tl', 'superadmin'] },
  reject: { from: 'menunggu_tl', to: 'ditolak_tl', roles: ['tl', 'superadmin'], note: true },
  check: { from: 'disetujui_tl', to: 'selesai', roles: ['admin', 'superadmin'] },
  return: { from: 'disetujui_tl', to: 'dikembalikan', roles: ['admin', 'superadmin'], note: true },
};

const photoStore = () => getStore('pengajuan-foto');
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
const fail = (m, s = 400) => json({ error: m }, s);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const fmtTime = (iso) => new Intl.DateTimeFormat('id-ID', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const pub = (u) => ({ id: u.id, ops: u.ops, name: u.name, role: u.role, active: u.active });
const safeEq = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

async function auth(req) {
  const id = verify((req.headers.get('authorization') || '').replace(/^Bearer /, ''));
  if (!id) return null;
  // Data pengguna selalu diambil ulang dari spreadsheet, jadi perubahan level/aktif langsung berlaku.
  const u = (await getUsers()).find((x) => x.id.toLowerCase() === id.toLowerCase());
  return u && u.active ? u : null;
}

// Pemilik selalu boleh melihat pengajuannya. scope "team" menambah akses sesuai userlevel.
function canSee(u, r, scope) {
  if (r.uid === u.id) return true;
  if (scope === 'mine') return false;
  return BACKEND_ROLES.includes(u.role);
}

async function visible(u, scope) {
  return (await readAll())
    .filter((r) => canSee(u, r, scope))
    .sort((a, b) => b.created.localeCompare(a.created));
}

async function login(req) {
  const { id = '', pin = '' } = await req.json().catch(() => ({}));
  const key = String(id).trim().toLowerCase();
  if (!key) return fail('ID wajib diisi', 400);
  const u = (await getUsers()).find(
    (x) => x.id.toLowerCase() === key || (x.ops && x.ops.toLowerCase() === key)
  );
  if (!u || !u.active || !u.pin || !safeEq(u.pin, String(pin))) return fail('ID atau password salah', 401);
  return json({ token: sign(u.id), user: pub(u) });
}

async function listRequests(u, url) {
  const scope = url.searchParams.get('scope') === 'team' ? 'team' : 'mine';
  if (scope === 'team' && !BACKEND_ROLES.includes(u.role)) return fail('Akses ditolak', 403);
  return json({ requests: await visible(u, scope) });
}

async function createRequest(u, req) {
  const b = await req.json().catch(() => null);
  if (!b || !TYPES.includes(b.type)) return fail('Jenis pengajuan tidak valid');

  const from = String(b.from || '');
  const to = RANGE_TYPES.includes(b.type) ? String(b.to || from) : from;
  if (!DATE.test(from) || !DATE.test(to)) return fail('Tanggal tidak valid');
  if (from < today()) return fail('Tanggal tidak boleh sebelum hari ini');
  if (to < from) return fail('Tanggal selesai harus sama atau setelah tanggal mulai');

  const note = String(b.note || '').trim();
  if (!note) return fail('Alasan wajib diisi');

  const shift = Number(b.shift) || 1;
  const shift2 = b.type === 'tukar' ? Number(b.shift2) || null : null;
  const partner = String(b.partner || '').trim();
  if (b.type === 'tukar' && (!partner || !shift2 || shift2 === shift)) return fail('Lengkapi rekan dan shift tujuan');

  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 3) : [];
  for (const p of photos) {
    if (typeof p !== 'string' || !p.startsWith('data:image/jpeg;base64,') || p.length > 1_500_000) {
      return fail('Foto tidak valid atau terlalu besar');
    }
  }

  // Nama dan Ops ID diambil dari spreadsheet Users, bukan dari browser.
  const rec = {
    id: randomUUID(),
    created: new Date().toISOString(),
    uid: u.id,
    name: u.name,
    ops: u.ops,
    type: b.type,
    from,
    to,
    shift,
    shift2,
    partner: partner.slice(0, 120),
    note: note.slice(0, 1000),
    photos: photos.length,
    status: 'menunggu_tl',
    log: [],
  };

  await appendOne(rec);
  if (photos.length) await photoStore().setJSON(`foto:${rec.id}`, photos);
  return json({ request: rec }, 201);
}

async function act(u, req) {
  const { id, action, note = '' } = await req.json().catch(() => ({}));
  const rule = RULES[action];
  if (!rule) return fail('Aksi tidak valid');

  const r = (await readAll()).find((x) => x.id === id);
  if (!r) return fail('Pengajuan tidak ditemukan', 404);

  if (!rule.roles.includes(u.role) || r.status !== rule.from) {
    return fail('Pengajuan ini bukan untuk Anda, atau statusnya sudah berubah', 403);
  }
  const catatan = String(note).trim();
  if (rule.note && !catatan) return fail('Isi catatan untuk menolak atau mengembalikan');

  const at = new Date().toISOString();
  r.status = rule.to;
  r.by = u.id;
  r.at = at;
  r.noteProc = catatan.slice(0, 500);
  r.log.push({ by: u.name, role: u.role, action, note: r.noteProc, at, via: 'backend' });
  await updateOne(r);
  return json({ request: r });
}

async function photos(u, id) {
  const r = (await readAll()).find((x) => x.id === id);
  if (!r || !canSee(u, r, 'team')) return fail('Tidak ditemukan', 404);
  return json((await photoStore().get(`foto:${id}`, { type: 'json' })) || []);
}

async function users(u) {
  if (!BACKEND_ROLES.includes(u.role)) return fail('Akses ditolak', 403);
  return json({ users: (await getUsers()).map(pub) });
}

async function exportXlsx(u, url) {
  if (!BACKEND_ROLES.includes(u.role)) return fail('Akses ditolak', 403);
  const month = url.searchParams.get('month') || 'all';
  const rows = (await visible(u, 'team')).filter((r) => month === 'all' || r.from.startsWith(month));

  const who = `${u.name} · Ops ${u.ops || u.id}`;
  const cols = [
    { h: 'No', w: 6, v: (r, i) => i + 1 },
    { h: 'Dibuat', w: 18, v: (r) => fmtTime(r.created) },
    { h: 'Jenis', w: 18, v: (r) => T[r.type] },
    { h: 'Nama', w: 24, v: (r) => r.name },
    { h: 'Ops ID', w: 12, v: (r) => r.ops },
    { h: 'Mulai', w: 13, v: (r) => r.from },
    { h: 'Selesai', w: 13, v: (r) => r.to },
    { h: 'Shift', w: 22, v: (r) => `Shift ${r.shift}${r.shift2 ? ' → Shift ' + r.shift2 : ''}` },
    { h: 'Rekan', w: 20, v: (r) => r.partner || '' },
    { h: 'Alasan', w: 40, v: (r) => r.note },
    { h: 'Status', w: 26, v: (r) => LABEL[r.status] || r.status },
    { h: 'Riwayat persetujuan', w: 50, v: (r) => r.log.map((l) => `${l.by} ${ACT[l.action] || l.action}${l.note ? ' (' + l.note + ')' : ''}`).join(' | ') },
  ];

  const wb = new ExcelJS.Workbook();
  wb.creator = u.name;
  wb.created = new Date();
  const ws = wb.addWorksheet('Rekap Pengajuan', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 },
  });
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.w));

  // Watermark: judul, baris nama & Ops ID, dan footer di setiap halaman cetak.
  ws.headerFooter = { oddFooter: `&L&8${who.replace(/&/g, '&&')}&R&8Halaman &P / &N` };
  ws.mergeCells(1, 1, 1, cols.length);
  const title = ws.getCell('A1');
  title.value = `Rekap Pengajuan Karyawan — ${month === 'all' ? 'Semua periode' : month}`;
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0F5E63' } };

  ws.mergeCells(2, 1, 2, cols.length);
  const wm = ws.getCell('A2');
  wm.value = `Diunduh oleh ${who} · ${fmtTime(new Date().toISOString())} WITA`;
  wm.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF5D6B6C' } };

  const hr = ws.addRow(cols.map((c) => c.h));
  hr.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F5E63' } };

  rows.forEach((r, i) => {
    const row = ws.addRow(cols.map((c) => c.v(r, i)));
    row.font = { name: 'Arial', size: 10 };
    row.alignment = { vertical: 'top', wrapText: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="rekap-pengajuan-${month}.xlsx"`,
    },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const p = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  const m = req.method;
  try {
    if (p === 'login' && m === 'POST') return await login(req);

    const u = await auth(req);
    if (!u) return fail('Sesi berakhir, silakan masuk lagi', 401);

    if (p === 'me' && m === 'GET') return json({ user: pub(u) });
    if (p === 'requests' && m === 'GET') return await listRequests(u, url);
    if (p === 'requests' && m === 'POST') return await createRequest(u, req);
    if (p === 'act' && m === 'POST') return await act(u, req);
    if (p.startsWith('photos/') && m === 'GET') return await photos(u, decodeURIComponent(p.slice(7)));
    if (p === 'users' && m === 'GET') return await users(u);
    if (p === 'export' && m === 'GET') return await exportXlsx(u, url);

    return fail('Tidak ditemukan', 404);
  } catch (e) {
    console.error(e);
    return fail(e.message || 'Terjadi kesalahan di server', 500);
  }
};

export const config = { path: '/api/*' };
