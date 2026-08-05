/* ============================================
   Chally — Dashboard interactions
   ============================================ */

// Animate bars on load
window.addEventListener('load', () => {
  document.querySelectorAll('.bar').forEach((bar, i) => {
    const h = bar.getAttribute('data-h');
    setTimeout(() => { bar.style.height = h + '%'; }, 100 + i * 70);
  });
});

// Mobile sidebar toggle
const mobileMenu = document.getElementById('mobileMenu');
const sidebar = document.getElementById('sidebar');
if (mobileMenu && sidebar) {
  mobileMenu.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 780 &&
        !sidebar.contains(e.target) &&
        !mobileMenu.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

// Active nav highlight
document.querySelectorAll('.side-nav a').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.side-nav a').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
  });
});
