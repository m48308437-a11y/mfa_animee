/* =========================================================
   MFA SHARED CLIENT LIBRARY
   Single source of truth for: auth token, helpers, toasts,
   the login/register modal, and the notifications bell.
   Every public page includes this before its own script.
========================================================= */

const MFA = (function(){

  const TOKEN_KEY = 'mfa_token';
  const USER_KEY  = 'mfa_user';

  /* ---------- basic helpers ---------- */

  function faNumber(value){
    return String(value ?? '')
      .replace(/0/g,'۰').replace(/1/g,'۱').replace(/2/g,'۲')
      .replace(/3/g,'۳').replace(/4/g,'۴').replace(/5/g,'۵')
      .replace(/6/g,'۶').replace(/7/g,'۷').replace(/8/g,'۸')
      .replace(/9/g,'۹');
  }

  function escapeHtml(value){
    return String(value ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function safeScore(value){
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function posterStyle(poster){
    if(!poster) return '';
    const clean = String(poster).replace(/\\/g,'\\\\').replace(/"/g,'\\"');
    return `background-image:url("${clean}")`;
  }

  function formatDate(value){
    if(!value) return '';
    const date = new Date(String(value).replace(' ','T'));
    if(Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fa-IR',{ year:'numeric', month:'long', day:'numeric' }).format(date);
  }

  /* ---------- auth/token ---------- */

  function getToken(){
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setSession(token, user){
    localStorage.setItem(TOKEN_KEY, token);
    if(user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession(){
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function getUser(){
    try{
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    }catch{
      return null;
    }
  }

  function isLoggedIn(){
    return !!getToken();
  }

  function authHeaders(json){
    const headers = {};
    const token = getToken();
    if(token) headers.Authorization = `Bearer ${token}`;
    if(json) headers['Content-Type'] = 'application/json';
    return headers;
  }

  /* central fetch wrapper: handles 401 by clearing session */
  async function api(path, options = {}){
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        ...authHeaders(options.body !== undefined),
        ...(options.headers || {})
      }
    });

    let data = {};
    try{ data = await response.json(); }catch{}

    if(response.status === 401){
      clearSession();
      updateAuthUI();
      throw new Error(data.error || 'نشست شما منقضی شده است، دوباره وارد شوید.');
    }

    if(!response.ok){
      throw new Error(data.error || 'خطا در ارتباط با سرور');
    }

    return data;
  }

  /* ---------- toasts ---------- */

  function ensureToastContainer(){
    let el = document.getElementById('toastContainer');
    if(!el){
      el = document.createElement('div');
      el.className = 'toast-container';
      el.id = 'toastContainer';
      document.body.appendChild(el);
    }
    return el;
  }

  function toast(message, type = 'success'){
    const container = ensureToastContainer();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(()=> el.remove(), 3500);
  }

  /* ---------- auth modal (login/register) ---------- */

  function wireAuthModal(){
    const authModal = document.getElementById('authModal');
    if(!authModal) return;

    const closeBtn = document.getElementById('authModalClose');
    const message = document.getElementById('authModalMessage');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authButton = document.getElementById('authButton');

    function open(){
      message.textContent = '';
      authModal.classList.add('show');
      document.body.classList.add('modal-open');
    }
    function close(){
      authModal.classList.remove('show');
      document.body.classList.remove('modal-open');
    }

    closeBtn?.addEventListener('click', close);
    authModal.addEventListener('click', e=>{ if(e.target === authModal) close(); });
    document.addEventListener('keydown', e=>{
      if(e.key === 'Escape' && authModal.classList.contains('show')) close();
    });

    document.querySelectorAll('.modal-tab').forEach(tab=>{
      tab.addEventListener('click', ()=>{
        document.querySelectorAll('.modal-tab').forEach(t=>t.classList.remove('active'));
        tab.classList.add('active');
        message.textContent = '';
        const isLogin = tab.dataset.tab === 'login';
        loginForm.style.display = isLogin ? 'block' : 'none';
        registerForm.style.display = isLogin ? 'none' : 'block';
      });
    });

    loginForm?.addEventListener('submit', async e=>{
      e.preventDefault();
      message.textContent = 'در حال ورود...';
      try{
        const data = await api('/login', {
          method:'POST',
          body: JSON.stringify({
            username: document.getElementById('loginUsername').value.trim(),
            password: document.getElementById('loginPassword').value
          })
        });
        setSession(data.token, data.user);
        close();
        updateAuthUI();
        loginForm.reset();
        document.dispatchEvent(new CustomEvent('mfa:login'));
      }catch(err){
        message.textContent = err.message || 'خطا در ورود';
      }
    });

    registerForm?.addEventListener('submit', async e=>{
      e.preventDefault();
      message.textContent = 'در حال ثبت‌نام...';
      try{
        await api('/register', {
          method:'POST',
          body: JSON.stringify({
            username: document.getElementById('registerUsername').value.trim(),
            password: document.getElementById('registerPassword').value
          })
        });
        registerForm.reset();
        document.querySelector('.modal-tab[data-tab="login"]')?.click();
        message.textContent = 'ثبت‌نام موفق بود؛ حالا وارد شو.';
      }catch(err){
        message.textContent = err.message || 'خطا در ثبت‌نام';
      }
    });

    authButton?.addEventListener('click', ()=>{
      if(isLoggedIn()){
        clearSession();
        updateAuthUI();
        toast('از حساب خارج شدی.');
        document.dispatchEvent(new CustomEvent('mfa:logout'));
      }else{
        open();
      }
    });

    window.MFA_openAuthModal = open;
  }

  function updateAuthUI(){
    const authButton = document.getElementById('authButton');
    const dashLink = document.getElementById('dashboardLink');
    if(authButton){
      authButton.textContent = isLoggedIn() ? 'خروج' : 'ورود / ثبت‌نام';
    }
    if(dashLink){
      dashLink.style.display = isLoggedIn() ? '' : 'none';
    }
  }

  /* ---------- notifications bell ---------- */

  async function wireNotifications(){
    const bellBtn = document.getElementById('notifBell');
    if(!bellBtn) return;

    const dot = document.getElementById('notifDot');
    const panel = document.getElementById('notifPanel');

    async function refresh(){
      if(!isLoggedIn()){
        dot?.classList.remove('show');
        return;
      }
      try{
        const data = await api('/notifications');
        const items = data.data || [];
        const unread = items.filter(n => !n.read).length;
        dot?.classList.toggle('show', unread > 0);
        if(panel){
          panel.innerHTML = items.length
            ? items.slice(0,10).map(n => `
                <div class="notif-item">
                  ${escapeHtml(n.message)}
                  <div class="notif-date">${formatDate(n.created_at)}</div>
                </div>
              `).join('')
            : `<div class="notif-item">اعلانی وجود ندارد.</div>`;
        }
      }catch{
        /* silent — notifications are non-critical */
      }
    }

    bellBtn.addEventListener('click', async ()=>{
      panel?.classList.toggle('show');
      if(panel?.classList.contains('show')){
        try{
          await api('/notifications/read', { method:'POST' });
        }catch{}
        dot?.classList.remove('show');
      }
    });

    document.addEventListener('click', e=>{
      if(panel && !panel.contains(e.target) && e.target !== bellBtn && !bellBtn.contains(e.target)){
        panel.classList.remove('show');
      }
    });

    refresh();
    document.addEventListener('mfa:login', refresh);
  }

  /* ---------- mobile nav (optional hook) ---------- */

  function wireMobileMenu(){
    const btn = document.getElementById('mobileMenuBtn');
    const nav = document.getElementById('mobileNav');
    if(!btn || !nav) return;
    btn.addEventListener('click', ()=> nav.classList.toggle('open'));
  }

  /* ---------- scroll reveal ---------- */

  function wireReveal(){
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const els = document.querySelectorAll('.reveal');
    if(!els.length) return;
    const observer = new IntersectionObserver(entries=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold:.15 });
    els.forEach(el => observer.observe(el));
  }

  /* ---------- init (call on every page) ---------- */

  function init(){
    wireAuthModal();
    updateAuthUI();
    wireNotifications();
    wireMobileMenu();
    wireReveal();
  }

  return {
    faNumber, escapeHtml, safeScore, posterStyle, formatDate,
    getToken, setSession, clearSession, getUser, isLoggedIn,
    api, toast, updateAuthUI, init
  };

})();

document.addEventListener('DOMContentLoaded', MFA.init);
