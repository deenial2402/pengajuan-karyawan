import { getStore } from '@netlify/blobs';
import ExcelJS from 'exceljs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { getUsers } from '../lib/sheets.mjs';
import { sign, verify } from '../lib/session.mjs';
import { readAll, appendOne, updateOne, LABEL, ConflictError } from '../lib/history.mjs';

const BACKEND_ROLES = ['tl', 'admin', 'superadmin'];
const TYPES = ['cuti', 'sakit', 'tukar', 'tambah', 'izin'];
const RANGE_TYPES = ['cuti', 'sakit']; // hanya ini yang boleh rentang tanggal
const SHIFT_TYPES = ['sakit', 'izin']; // hanya ini yang memakai shift
const OPERATOR_TYPES = ['cuti', 'sakit']; // Operator hanya boleh Cuti dan Sakit
const T = { cuti: 'Cuti', sakit: 'Sakit', tukar: 'Tukar Tanggal', tambah: 'Tambah Hari Kerja', izin: 'Izin' };
const ACT = { approve: 'menyetujui', reject: 'menolak', check: 'sudah memeriksa', return: 'mengembalikan', cancel: 'membatalkan' };
const TZ = 'Asia/Jakarta'; // WIB (GMT+7)
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Aturan perpindahan status. Sama dengan validasi di Apps Script.
const RULES = {
  approve: { from: 'menunggu_tl', to: 'disetujui_tl', roles: ['tl', 'superadmin'] },
  reject: { from: 'menunggu_tl', to: 'ditolak_tl', roles: ['tl', 'superadmin'], note: true },
  check: { from: 'disetujui_tl', to: 'selesai', roles: ['admin', 'superadmin'] },
  return: { from: 'disetujui_tl', to: 'dikembalikan', roles: ['admin', 'superadmin'], note: true },
};

const photoStore = () => getStore('pengajuan-foto');
const jadwalStore = () => getStore('jadwal');
const JADWAL_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const JADWAL_MAX = 4 * 1024 * 1024;
const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
const fail = (m, s = 400) => json({ error: m }, s);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const fmtTime = (iso) => new Intl.DateTimeFormat('id-ID', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const pub = (u) => ({ id: u.id, ops: u.ops, name: u.name, role: u.role, kind: u.kind, active: u.active });
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
  if (u.kind === 'operator' && !OPERATOR_TYPES.includes(b.type)) return fail('Jenis pengajuan ini tidak tersedia untuk akun Anda', 403);

  const from = String(b.from || '');
  if (!DATE.test(from)) return fail('Tanggal tidak valid');

  let to = from;
  if (RANGE_TYPES.includes(b.type)) to = String(b.to || from);
  if (b.type === 'tukar') {
    // Tukar tanggal: tanggal kerja yang ditukar (from) dan tanggal pengganti (to). Tidak memakai shift.
    to = String(b.to || '');
    if (!DATE.test(to)) return fail('Isi tanggal pengganti');
    if (to === from) return fail('Tanggal pengganti harus berbeda dari tanggal yang ditukar');
  }
  if (!DATE.test(to)) return fail('Tanggal tidak valid');
  if (from < today() || to < today()) return fail('Tanggal tidak boleh sebelum hari ini');
  if (b.type !== 'tukar' && to < from) return fail('Tanggal selesai harus sama atau setelah tanggal mulai');

  const note = String(b.note || '').trim();
  if (!note) return fail('Alasan wajib diisi');

  // Shift hanya untuk Sakit dan Berhalangan Hadir.
  const shift = SHIFT_TYPES.includes(b.type) ? Number(b.shift) : null;
  if (SHIFT_TYPES.includes(b.type) && ![1, 2, 3].includes(shift)) return fail('Pilih shift');

  const photos = Array.isArray(b.photos) ? b.photos.slice(0, 3) : [];
  for (const p of photos) {
    if (typeof p !== 'string' || !p.startsWith('data:image/jpeg;base64,') || p.length > 1_500_000) {
      return fail('Foto tidak valid atau terlalu besar');
    }
  }

  if (b.type === 'sakit' && photos.length < 1) return fail('Foto surat dokter wajib dilampirkan untuk Sakit');

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
    shift2: null,
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

  const r = (await readAll({ fresh: true })).find((x) => x.id === id);
  if (!r) return fail('Pengajuan tidak ditemukan', 404);

  if (!rule.roles.includes(u.role) || r.status !== rule.from) {
    return fail('Pengajuan ini bukan untuk Anda, atau statusnya sudah berubah', 403);
  }
  const catatan = String(note).trim();
  if (rule.note && !catatan) return fail('Isi catatan untuk menolak atau mengembalikan');

  const at = new Date().toISOString();
  r.status = rule.to;
  r.by = u.name;
  r.at = at;
  r.noteProc = catatan.slice(0, 500);
  r.log.push({ by: u.name, role: u.role, action, note: r.noteProc, at, via: 'backend' });
  try {
    await updateOne(r, rule.from);
  } catch (e) {
    if (e instanceof ConflictError) return fail('Pengajuan ini baru saja diproses orang lain. Muat ulang halaman.', 409);
    throw e;
  }
  return json({ request: r });
}

// Karyawan membatalkan pengajuannya sendiri selama masih menunggu Team Leader.
async function cancel(u, req) {
  const { id } = await req.json().catch(() => ({}));
  const r = (await readAll({ fresh: true })).find((x) => x.id === id);
  if (!r) return fail('Pengajuan tidak ditemukan', 404);
  if (r.uid !== u.id) return fail('Hanya pemilik pengajuan yang bisa membatalkan', 403);
  if (r.status !== 'menunggu_tl') return fail('Pengajuan sudah diproses, tidak bisa dibatalkan', 409);

  const at = new Date().toISOString();
  r.status = 'dibatalkan';
  r.by = u.name;
  r.at = at;
  r.noteProc = 'Dibatalkan oleh karyawan';
  r.log.push({ by: u.name, role: u.role, action: 'cancel', note: '', at, via: 'frontend' });
  try {
    await updateOne(r, 'menunggu_tl');
  } catch (e) {
    if (e instanceof ConflictError) return fail('Pengajuan ini baru saja diproses Team Leader, tidak bisa dibatalkan.', 409);
    throw e;
  }
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

// ---------- Jadwal: file PDF/foto dari Backend, bisa diunduh Frontend ----------
async function jadwalList() {
  const st = jadwalStore();
  const { blobs } = await st.list({ prefix: 'm:' });
  const items = (await Promise.all(blobs.map((b) => st.get(b.key, { type: 'json' }))))
    .filter(Boolean)
    .sort((a, b) => b.created.localeCompare(a.created));
  return json({ items });
}

async function jadwalCreate(u, req) {
  if (!BACKEND_ROLES.includes(u.role)) return fail('Akses ditolak', 403);
  const b = await req.json().catch(() => null);
  if (!b) return fail('Data tidak valid');
  const title = String(b.title || '').trim().slice(0, 120);
  if (!title) return fail('Isi judul jadwal');
  const mime = String(b.mime || '');
  if (!JADWAL_MIME.includes(mime)) return fail('Format harus PDF atau foto');
  const prefix = `data:${mime};base64,`;
  const data = String(b.data || '');
  if (!data.startsWith(prefix)) return fail('File tidak valid');
  const base64 = data.slice(prefix.length);
  const size = Math.floor((base64.length * 3) / 4);
  if (size > JADWAL_MAX) return fail('Ukuran file maksimal 4 MB');

  const id = randomUUID();
  const meta = {
    id, title, mime, size,
    name: String(b.name || 'jadwal').slice(0, 160),
    created: new Date().toISOString(),
    by: u.name,
  };
  const st = jadwalStore();
  await st.setJSON(`m:${id}`, meta);
  await st.set(`d:${id}`, base64);
  return json({ item: meta }, 201);
}

async function jadwalFile(id) {
  const st = jadwalStore();
  const meta = await st.get(`m:${id}`, { type: 'json' });
  if (!meta) return fail('Tidak ditemukan', 404);
  const base64 = await st.get(`d:${id}`, { type: 'text' });
  if (!base64) return fail('Berkas tidak ditemukan', 404);
  const safe = meta.name.replace(/[^\w.\- ]/g, '_');
  return new Response(Buffer.from(base64, 'base64'), {
    headers: { 'content-type': meta.mime, 'content-disposition': `attachment; filename="${safe}"` },
  });
}

async function jadwalDelete(u, id) {
  if (!BACKEND_ROLES.includes(u.role)) return fail('Akses ditolak', 403);
  const st = jadwalStore();
  await st.delete(`m:${id}`);
  await st.delete(`d:${id}`);
  return json({ ok: true });
}

async function exportXlsx(u, url) {
  if (!BACKEND_ROLES.includes(u.role)) return fail('Akses ditolak', 403);
  const month = url.searchParams.get('month') || 'all';
  const rows = (await visible(u, 'team')).filter((r) => month === 'all' || r.from.startsWith(month));

  const opsTxt = /^ops/i.test(String(u.ops || u.id)) ? String(u.ops || u.id) : `Ops ${u.ops || u.id}`;
  const who = `${u.name} · ${opsTxt}`;
  const cols = [
    { h: 'No', w: 6, v: (r, i) => i + 1 },
    { h: 'Dibuat', w: 18, v: (r) => fmtTime(r.created) },
    { h: 'Jenis', w: 18, v: (r) => T[r.type] },
    { h: 'Nama', w: 24, v: (r) => r.name },
    { h: 'Ops ID', w: 12, v: (r) => r.ops },
    { h: 'Tanggal / ditukar', w: 14, v: (r) => r.from },
    { h: 'Sampai / pengganti', w: 16, v: (r) => r.to },
    { h: 'Shift', w: 14, v: (r) => (r.shift ? `Shift ${r.shift}` : '-') },
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
  title.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFEE4D2D' } };

  ws.mergeCells(2, 1, 2, cols.length);
  const wm = ws.getCell('A2');
  wm.value = `Diunduh oleh ${who} · ${fmtTime(new Date().toISOString())} WIB`;
  wm.font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF5D6B6C' } };

  const hr = ws.addRow(cols.map((c) => c.h));
  hr.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEE4D2D' } };

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
    if (p === 'cancel' && m === 'POST') return await cancel(u, req);
    if (p.startsWith('photos/') && m === 'GET') return await photos(u, decodeURIComponent(p.slice(7)));
    if (p === 'users' && m === 'GET') return await users(u);
    if (p === 'export' && m === 'GET') return await exportXlsx(u, url);
    if (p === 'jadwal' && m === 'GET') return await jadwalList();
    if (p === 'jadwal' && m === 'POST') return await jadwalCreate(u, req);
    if (p.startsWith('jadwal/') && m === 'GET') return await jadwalFile(decodeURIComponent(p.slice(7)));
    if (p.startsWith('jadwal/') && m === 'DELETE') return await jadwalDelete(u, decodeURIComponent(p.slice(7)));

    return fail('Tidak ditemukan', 404);
  } catch (e) {
    console.error(e);
    return fail(e.message || 'Terjadi kesalahan di server', 500);
  }
};

export const config = { path: '/api/*' };
