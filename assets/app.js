/* Helper bersama untuk Frontend (/) dan Backend (/backend/). */
const App = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const SH = { 1: '00:00–09:00', 2: '08:00–17:00', 3: '16:00–01:00' };
  const T = { cuti: 'Cuti', sakit: 'Sakit', tukar: 'Tukar Tanggal', tambah: 'Tambah Hari Kerja', izin: 'Berhalangan Hadir' };
  const ST = {
    menunggu_tl: ['Menunggu Team Leader', 'wait'],
    disetujui_tl: ['Menunggu pemeriksaan Admin', 'info'],
    selesai: ['Selesai', 'ok'],
    ditolak_tl: ['Ditolak Team Leader', 'bad'],
    dikembalikan: ['Dikembalikan Admin', 'bad'],
  };
  const ACT = { approve: 'menyetujui', reject: 'menolak', check: 'sudah memeriksa', return: 'mengembalikan' };
  const ROLE = { karyawan: 'Karyawan', tl: 'Team Leader', admin: 'Admin', superadmin: 'Superadmin' };
  const BACKEND_ROLES = ['tl', 'admin', 'superadmin'];

  const fd = (d) => new Date(d + 'T00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date());
  const shiftTag = (n) => (n ? `<span class="sh sh${n}">Shift ${n}</span> <span class="meta">${SH[n] || ''}</span>` : '');
  const when = (r) => (r.type === 'tukar' ? `${fd(r.from)} ⇄ ${fd(r.to)}` : r.to !== r.from ? `${fd(r.from)} – ${fd(r.to)}` : fd(r.from));

  const S = {
    tok: localStorage.getItem('pk_tok'),
    user: JSON.parse(localStorage.getItem('pk_user') || 'null'),
  };

  function toast(m) {
    const t = $('#toast');
    t.textContent = m;
    t.className = 'show';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (t.className = ''), 2600);
  }

  function saveSession(tok, user) {
    S.tok = tok;
    S.user = user;
    localStorage.setItem('pk_tok', tok);
    localStorage.setItem('pk_user', JSON.stringify(user));
  }

  function logout() {
    localStorage.removeItem('pk_tok');
    localStorage.removeItem('pk_user');
    location.reload();
  }

  async function api(path, body) {
    const r = await fetch('/api/' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (S.tok || '') },
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401 && S.tok && path !== 'login') {
      logout();
      throw new Error(d.error || 'Sesi berakhir');
    }
    if (!r.ok) throw new Error(d.error || 'Gagal, coba lagi');
    return d;
  }

  // Watermark diagonal berisi Nama & Ops ID, tampil di atas konten tapi tidak bisa diklik.
  function watermark(u) {
    if (!u) return;
    const txt = `${u.name} · Ops ${u.ops || u.id}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="170"><text x="18" y="104" transform="rotate(-24 170 85)" font-family="Arial,sans-serif" font-size="15" font-weight="700" fill="rgba(238,77,45,0.10)">${esc(txt)}</text></svg>`;
    let el = document.getElementById('wm');
    if (!el) {
      el = document.createElement('div');
      el.id = 'wm';
      document.body.appendChild(el);
    }
    el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  return { S, $, esc, fd, today, shiftTag, when, toast, api, saveSession, logout, watermark, SH, T, ST, ACT, ROLE, BACKEND_ROLES };
})();
