/* Helper bersama Frontend (/) dan Backend (/backend/): bahasa, tema, API, sesi, dan watermark. */
const App = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (s) => document.querySelector(s);
  const SH = { 1: '00:00–09:00', 2: '08:00–17:00', 3: '16:00–01:00' };
  const BACKEND_ROLES = ['tl', 'admin', 'superadmin'];
  const ST_CLS = { menunggu_tl: 'wait', disetujui_tl: 'info', selesai: 'ok', ditolak_tl: 'bad', dikembalikan: 'bad', dibatalkan: 'mut' };

  const DICT = {
    id: {
      app_name: 'Palangka Raya DC',
      login_sub_fe: 'Masuk dengan ID atau Ops ID dan password.',
      login_sub_be: 'Khusus Team Leader, Admin, dan Superadmin.',
      login_id: 'ID atau Ops ID', password: 'Password', login_btn: 'Masuk', logout: 'Keluar',
      tab_work: 'Work Permit', tab_hist: 'Histori', tab_sched: 'Jadwal', tab_tutorial: 'Tutorial',
      tab_queue: 'Antrian', tab_all: 'Semua', tab_recap: 'Rekap', tab_users: 'Pengguna',
      backend: 'Backend', frontend: 'Frontend',
      theme_light: 'Terang', theme_dark: 'Gelap', lang_switch: 'Ganti bahasa',
      type_cuti: 'Cuti', type_sakit: 'Sakit', type_tukar: 'Tukar Tanggal', type_tambah: 'Tambah Hari Kerja', type_izin: 'Izin',
      hint_cuti: 'Libur pada rentang tanggal', hint_sakit: 'Tidak masuk karena sakit', hint_tukar: 'Tukar tanggal kerja dengan tanggal pengganti', hint_tambah: 'Menambah hari kerja', hint_izin: 'Tidak bisa hadir pada shift tertentu',
      start: 'Mulai', end: 'Sampai', date: 'Tanggal', shift: 'Shift',
      swap_from: 'Tanggal kerja yang ditukar', swap_to: 'Tanggal pengganti', swap_hint: 'Tanggal kerja Anda diganti ke tanggal pengganti.',
      reason_leave: 'Alasan cuti', complaint: 'Keluhan', reason: 'Alasan',
      photo_doctor: 'Foto surat dokter', photo_support: 'Foto pendukung', photo_hint: '(opsional, maks. 3)',
      upload_photo: 'Unggah foto', btn_send: 'Kirim', btn_download: 'Unduh', btn_delete: 'Hapus', btn_upload: 'Unggah',
      view_photos: 'Lihat {n} foto', close_hint: 'Ketuk untuk menutup',
      st_menunggu_tl: 'Menunggu Approval Team Leader', st_disetujui_tl: 'Menunggu Validasi Admin', st_selesai: 'Selesai', st_ditolak_tl: 'Ditolak Team Leader', st_dikembalikan: 'Dikembalikan Admin',
      act_approve: 'menyetujui', act_reject: 'menolak', act_check: 'sudah memvalidasi', act_return: 'mengembalikan',
      btn_approve: 'Setujui', btn_reject: 'Tolak', btn_check: 'Validasi', btn_return: 'Kembalikan',
      note_optional: 'Catatan (opsional)', note_required: 'Catatan (wajib jika menolak atau mengembalikan)', note_needed: 'Isi catatan dulu',
      empty_hist: 'Belum ada pengajuan. Mulai dari tab Work Permit.',
      empty_queue: 'Tidak ada pengajuan yang perlu tindakan.', empty_all: 'Belum ada pengajuan.', empty_search: 'Tidak ada pengajuan yang cocok.',
      search_ph: 'Cari nama, Ops ID, jenis, status, tanggal (YYYY-MM-DD)…',
      sched_title: 'Judul jadwal', sched_file: 'File (PDF atau foto, maks. 4 MB)', sched_upload: 'Unggah jadwal',
      sched_empty: 'Belum ada jadwal.', uploaded_on: 'Diunggah', sched_ok: 'Jadwal diunggah', sched_deleted: 'Jadwal dihapus', sched_confirm: 'Hapus jadwal ini?',
      err_same_date: 'Tanggal pengganti harus berbeda dari tanggal yang ditukar',
      err_file_big: 'File lebih dari 4 MB', err_no_access: 'Akun ini tidak punya akses Backend. Gunakan Frontend.',
      toast_sent: 'Terkirim', toast_saved: 'Tersimpan', toast_downloaded: 'Berkas diunduh', toast_recap: 'Rekap diunduh',
      no_photo: 'Tidak ada foto', rekap_title: 'Rekap', month: 'Bulan', export_month: 'Ekspor bulan ini', export_all: 'Ekspor semua',
      recap_note: 'Sakit dan Izin dihitung per shift. Cuti dihitung per hari tanpa shift. Pengajuan yang ditolak, dikembalikan, atau dibatalkan tidak dihitung.',
      recap_nodata: 'Tidak ada data pada bulan ini.', recap_none: 'Belum ada', hari_orang: 'hari-orang',
      cuti_per_hari: 'Dihitung per hari, tidak per shift', per_tanggal: 'Per tanggal', date_col: 'Tanggal',
      users_note: 'Akun, password, dan userlevel dikelola di spreadsheet. Ubah di sana, lalu tunggu sekitar satu menit.',
      nonaktif: 'Nonaktif', no_data: 'Belum ada data.', rejected_note: 'Ditolak',
      ops_label: 'Ops', rekan: 'Rekan', uploaded: 'Diunggah', by: 'oleh',
      role_karyawan: 'Karyawan', role_tl: 'Team Leader', role_admin: 'Admin', role_superadmin: 'Superadmin',
      queue_title: 'Antrian persetujuan', all_title: 'Semua pengajuan', new_request: 'Work Permit',
      sched_head: 'Jadwal', sched_hint: 'Jadwal diunggah oleh Backend. Anda bisa mengunduh berkas PDF atau foto untuk memeriksa jadwal.',
      rel_cuti: 'Cuti', rel_izin: 'Izin',
      st_dibatalkan: 'Dibatalkan', act_cancel: 'membatalkan', btn_cancel: 'Batalkan pengajuan',
      cancel_confirm: 'Batalkan pengajuan ini?', toast_cancelled: 'Pengajuan dibatalkan',
      photo_hint_req: '(wajib, maks. 3)', err_photo_sick: 'Foto surat dokter wajib dilampirkan',
      flt_all_status: 'Semua status', flt_all_type: 'Semua jenis', flt_from: 'Dari tanggal', flt_to: 'Sampai tanggal',
      flt_today: 'Hari ini', flt_week: 'Minggu ini', flt_reset: 'Reset filter', flt_count: '{n} pengajuan',
    },
    en: {
      app_name: 'Palangka Raya DC',
      login_sub_fe: 'Sign in with your ID or Ops ID and password.',
      login_sub_be: 'For Team Leaders, Admins, and Superadmins only.',
      login_id: 'ID or Ops ID', password: 'Password', login_btn: 'Sign in', logout: 'Sign out',
      tab_work: 'Work Permit', tab_hist: 'History', tab_sched: 'Schedule', tab_tutorial: 'Tutorial',
      tab_queue: 'Queue', tab_all: 'All', tab_recap: 'Recap', tab_users: 'Users',
      backend: 'Backend', frontend: 'Frontend',
      theme_light: 'Light', theme_dark: 'Dark', lang_switch: 'Change language',
      type_cuti: 'Leave', type_sakit: 'Sick Leave', type_tukar: 'Date Swap', type_tambah: 'Extra Workday', type_izin: 'Permission',
      hint_cuti: 'Leave over a date range', hint_sakit: 'Unable to work due to illness', hint_tukar: 'Swap a workday with a replacement date', hint_tambah: 'Add a workday', hint_izin: 'Unable to attend a specific shift',
      start: 'Start', end: 'End', date: 'Date', shift: 'Shift',
      swap_from: 'Workday to swap', swap_to: 'Replacement date', swap_hint: 'Your workday will move to the replacement date.',
      reason_leave: 'Leave reason', complaint: 'Complaint', reason: 'Reason',
      photo_doctor: 'Doctor’s note photo', photo_support: 'Supporting photo', photo_hint: '(optional, max 3)',
      upload_photo: 'Upload photo', btn_send: 'Submit', btn_download: 'Download', btn_delete: 'Delete', btn_upload: 'Upload',
      view_photos: 'View {n} photo(s)', close_hint: 'Tap to close',
      st_menunggu_tl: 'Waiting Team Leader Approval', st_disetujui_tl: 'Waiting Admin Validation', st_selesai: 'Completed', st_ditolak_tl: 'Rejected by Team Leader', st_dikembalikan: 'Returned by Admin',
      act_approve: 'approved', act_reject: 'rejected', act_check: 'validated', act_return: 'returned',
      btn_approve: 'Approve', btn_reject: 'Reject', btn_check: 'Validate', btn_return: 'Return',
      note_optional: 'Note (optional)', note_required: 'Note (required to reject or return)', note_needed: 'Please add a note first',
      empty_hist: 'No requests yet. Start from the Work Permit tab.',
      empty_queue: 'Nothing needs action.', empty_all: 'No requests yet.', empty_search: 'No matching requests.',
      search_ph: 'Search name, Ops ID, type, status, date (YYYY-MM-DD)…',
      sched_title: 'Schedule title', sched_file: 'File (PDF or photo, max 4 MB)', sched_upload: 'Upload schedule',
      sched_empty: 'No schedule yet.', uploaded_on: 'Uploaded', sched_ok: 'Schedule uploaded', sched_deleted: 'Schedule deleted', sched_confirm: 'Delete this schedule?',
      err_same_date: 'Replacement date must differ from the workday to swap',
      err_file_big: 'File is larger than 4 MB', err_no_access: 'This account has no Backend access. Use the Frontend.',
      toast_sent: 'Submitted', toast_saved: 'Saved', toast_downloaded: 'File downloaded', toast_recap: 'Recap downloaded',
      no_photo: 'No photos', rekap_title: 'Recap', month: 'Month', export_month: 'Export this month', export_all: 'Export all',
      recap_note: 'Sick Leave and Permission are counted per shift. Leave is counted per day without shift. Rejected, returned, and cancelled requests are not counted.',
      recap_nodata: 'No data this month.', recap_none: 'None yet', hari_orang: 'person-days',
      cuti_per_hari: 'Counted per day, not per shift', per_tanggal: 'By date', date_col: 'Date',
      users_note: 'Accounts, passwords, and user levels are managed in the spreadsheet. Change them there; updates take about a minute.',
      nonaktif: 'Inactive', no_data: 'No data yet.', rejected_note: 'Rejected',
      ops_label: 'Ops', rekan: 'Partner', uploaded: 'Uploaded', by: 'by',
      role_karyawan: 'Employee', role_tl: 'Team Leader', role_admin: 'Admin', role_superadmin: 'Superadmin',
      queue_title: 'Approval queue', all_title: 'All requests', new_request: 'Work Permit',
      sched_head: 'Schedule', sched_hint: 'Schedules are uploaded by the Backend. Download the PDF or photo to check your schedule.',
      rel_cuti: 'Leave', rel_izin: 'Permission',
      st_dibatalkan: 'Cancelled', act_cancel: 'cancelled', btn_cancel: 'Cancel request',
      cancel_confirm: 'Cancel this request?', toast_cancelled: 'Request cancelled',
      photo_hint_req: '(required, max 3)', err_photo_sick: 'Doctor’s note photo is required',
      flt_all_status: 'All statuses', flt_all_type: 'All types', flt_from: 'From date', flt_to: 'To date',
      flt_today: 'Today', flt_week: 'This week', flt_reset: 'Reset filters', flt_count: '{n} request(s)',
    },
  };

  const prefs = {
    lang: localStorage.getItem('pk_lang') || 'id',
    theme: localStorage.getItem('pk_theme') || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  };
  const t = (k, v = {}) => (DICT[prefs.lang][k] ?? DICT.id[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const applyPrefs = () => { document.documentElement.dataset.theme = prefs.theme; document.documentElement.lang = prefs.lang; };
  applyPrefs();
  function toggleLang() { prefs.lang = prefs.lang === 'id' ? 'en' : 'id'; localStorage.setItem('pk_lang', prefs.lang); applyPrefs(); }
  function toggleTheme() { prefs.theme = prefs.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('pk_theme', prefs.theme); applyPrefs(); }
  const prefsBar = () => `<div class="prefs">
    <button type="button" class="ghost sm" onclick="App.toggleLang();render()" aria-label="${t('lang_switch')}">${prefs.lang === 'id' ? 'EN' : 'ID'}</button>
    <button type="button" class="ghost sm" onclick="App.toggleTheme();render()">${prefs.theme === 'dark' ? t('theme_light') : t('theme_dark')}</button></div>`;

  const locale = () => (prefs.lang === 'en' ? 'en-GB' : 'id-ID');
  const fd = (d) => new Date(d + 'T00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());
  const shiftTag = (n) => (n ? `<span class="sh sh${n}">${t('shift')} ${n}</span> <span class="meta">${SH[n] || ''}</span>` : '');
  const when = (r) => (r.type === 'tukar' ? `${fd(r.from)} ⇄ ${fd(r.to)}` : r.to !== r.from ? `${fd(r.from)} – ${fd(r.to)}` : fd(r.from));
  const typeName = (k) => t('type_' + k);
  const stLabel = (k) => t('st_' + k);
  const actLabel = (a) => t('act_' + a);
  const roleName = (r) => t('role_' + r);

  const S = {
    tok: localStorage.getItem('pk_tok'),
    user: JSON.parse(localStorage.getItem('pk_user') || 'null'),
  };

  function toast(m) {
    const el = $('#toast');
    el.textContent = m;
    el.className = 'show';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (el.className = ''), 2600);
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

  async function api(path, body, opts = {}) {
    const r = await fetch('/api/' + path, {
      method: opts.method || (body ? 'POST' : 'GET'),
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

  /** Mengunduh berkas (jadwal) dengan header login. */
  async function download(id, name) {
    const r = await fetch('/api/jadwal/' + encodeURIComponent(id), { headers: { authorization: 'Bearer ' + S.tok } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Gagal mengunduh');
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = name || 'jadwal';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /** Watermark diagonal berisi Nama & Ops ID. */
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

  const svg = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    moon: svg('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'),
    out: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
  };

  /** Menu pop up kiri (drawer) + header. Dipakai Frontend dan Backend. */
  const openMenu = () => document.body.classList.add('menu-open');
  const closeMenu = () => document.body.classList.remove('menu-open');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  function shell({ u, items, active, link, badge = 0 }) {
    const nav = items.map((i) => `<button type="button" class="nav-item ${active === i.k ? 'on' : ''}" onclick="App.closeMenu();go('${i.k}')">${esc(i.label)}${i.badge ? `<span class="pill">${i.badge}</span>` : ''}</button>`).join('');
    return `<header class="top">
      <button type="button" class="menu-btn" onclick="App.openMenu()" aria-label="Menu"><span></span><span></span><span></span>${badge ? `<i class="dot">${badge}</i>` : ''}</button>
      <div class="who-top"><b>${esc(u.name)}</b><small>Ops ${esc(u.ops || '-')} · ${roleName(u.role)}</small></div>
      <div class="hbtns">
        <button type="button" class="icon-btn" onclick="App.toggleTheme();render()" aria-label="${prefs.theme === 'dark' ? t('theme_light') : t('theme_dark')}" title="${prefs.theme === 'dark' ? t('theme_light') : t('theme_dark')}">${prefs.theme === 'dark' ? ICON.sun : ICON.moon}</button>
        <button type="button" class="icon-btn" onclick="App.logout()" aria-label="${t('logout')}" title="${t('logout')}">${ICON.out}</button>
      </div>
    </header>
    <div id="scrim" onclick="App.closeMenu()"></div>
    <aside id="drawer" aria-label="Menu">
      <div class="d-head"><b>${esc(u.name)}</b><small>Ops ${esc(u.ops || '-')} · ${roleName(u.role)}</small></div>
      <nav class="d-nav">${nav}</nav>
      <div class="d-foot">
        <button type="button" class="ghost sm" onclick="App.toggleLang();render()" aria-label="${t('lang_switch')}">${prefs.lang === 'id' ? 'English (EN)' : 'Bahasa Indonesia (ID)'}</button>
        ${link ? `<a class="ghost sm" href="${link.href}">${link.label}</a>` : ''}
      </div>
    </aside>`;
  }

  return {
    openMenu, closeMenu, shell,
    S, $, esc, fd, today, shiftTag, when, toast, api, download, saveSession, logout, watermark,
    t, typeName, stLabel, actLabel, roleName, prefsBar, toggleLang, toggleTheme, prefs,
    SH, ST_CLS, BACKEND_ROLES,
  };
})();
