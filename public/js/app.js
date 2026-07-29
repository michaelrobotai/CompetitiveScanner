/* Competitive Radar — small progressive-enhancement helpers.
   Server-rendered app: JS only adds convenience, never gates functionality. */
(function () {
  'use strict';

  function onReady(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  onReady(function () {
    // Sidebar toggle (mobile)
    var burger = document.querySelector('[data-rad-burger]');
    var sidebar = document.querySelector('.rad-sidebar');
    if (burger && sidebar) {
      burger.addEventListener('click', function () { sidebar.classList.toggle('open'); });
    }

    // Confirm destructive actions
    document.querySelectorAll('form[data-confirm]').forEach(function (form) {
      form.addEventListener('submit', function (ev) {
        if (!window.confirm(form.getAttribute('data-confirm'))) ev.preventDefault();
      });
    });

    // Auto-submit filter forms on select change
    document.querySelectorAll('form[data-autosubmit] select, form[data-autosubmit] input[type="date"]').forEach(function (el) {
      el.addEventListener('change', function () { el.form.submit(); });
    });

    // Demo account quick-fill on the login screen
    document.querySelectorAll('[data-demo-email]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var email = document.getElementById('email');
        var pass = document.getElementById('password');
        if (email) email.value = btn.getAttribute('data-demo-email');
        if (pass) pass.value = btn.getAttribute('data-demo-password');
        if (pass) pass.focus();
      });
    });

    // Long-running scan buttons: show progress state
    document.querySelectorAll('form[data-busy]').forEach(function (form) {
      form.addEventListener('submit', function () {
        var btn = form.querySelector('button[type="submit"]');
        if (!btn || btn.disabled) return;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>' + (form.getAttribute('data-busy') || 'Working…');
      });
    });

    // Auto-dismiss flash messages
    document.querySelectorAll('.rad-flash[data-autohide]').forEach(function (el) {
      window.setTimeout(function () {
        el.style.transition = 'opacity .4s';
        el.style.opacity = '0';
        window.setTimeout(function () { el.remove(); }, 420);
      }, 7000);
    });

    // Toggle inline edit panels
    document.querySelectorAll('[data-toggle-target]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = document.getElementById(btn.getAttribute('data-toggle-target'));
        if (!target) return;
        target.hidden = !target.hidden;
      });
    });

    // Select-all checkbox helper (category toggles)
    document.querySelectorAll('[data-check-all]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var scope = document.querySelector(btn.getAttribute('data-check-all'));
        if (!scope) return;
        var boxes = scope.querySelectorAll('input[type="checkbox"]');
        var allOn = Array.prototype.every.call(boxes, function (b) { return b.checked; });
        boxes.forEach(function (b) { b.checked = !allOn; });
      });
    });
  });
}());
