'use strict';

const SIGNAL_TYPES = {
  acquisition_target: { label: 'Likely Acquisition Target', icon: 'fa-solid fa-crosshairs', color: 'violet', baseImpact: 85 },
  merger: { label: 'Merger', icon: 'fa-solid fa-handshake', color: 'indigo', baseImpact: 90 },
  acquiring_company: { label: 'Acquiring Another Company', icon: 'fa-solid fa-building-circle-arrow-right', color: 'blue', baseImpact: 80 },
  major_product_release: { label: 'Major Product Release', icon: 'fa-solid fa-rocket', color: 'teal', baseImpact: 65 },
  unusual_revenue_gain: { label: 'Unusual Revenue Gain', icon: 'fa-solid fa-arrow-trend-up', color: 'green', baseImpact: 70 },
  unusual_revenue_loss: { label: 'Unusual Revenue Loss', icon: 'fa-solid fa-arrow-trend-down', color: 'red', baseImpact: 72 },
  other_strategic_move: { label: 'Other Strategic Move', icon: 'fa-solid fa-chess-knight', color: 'slate', baseImpact: 50 }
};

const SEVERITY_META = {
  critical: { label: 'Critical', badge: 'sev-critical' },
  high: { label: 'High', badge: 'sev-high' },
  medium: { label: 'Medium', badge: 'sev-medium' },
  low: { label: 'Low', badge: 'sev-low' }
};

const STATUS_META = {
  new: { label: 'New', badge: 'st-new' },
  reviewed: { label: 'Reviewed', badge: 'st-reviewed' },
  confirmed: { label: 'Confirmed', badge: 'st-confirmed' },
  dismissed: { label: 'Dismissed', badge: 'st-dismissed' },
  merged: { label: 'Merged', badge: 'st-merged' }
};

const SOURCE_STATUS_META = {
  ok: { label: 'OK', badge: 'st-confirmed', icon: 'fa-solid fa-circle-check' },
  error: { label: 'Error', badge: 'sev-critical', icon: 'fa-solid fa-circle-exclamation' },
  not_configured: { label: 'Not configured', badge: 'st-dismissed', icon: 'fa-solid fa-plug-circle-xmark' },
  skipped: { label: 'Skipped', badge: 'st-merged', icon: 'fa-solid fa-forward' },
  rate_limited: { label: 'Rate limited', badge: 'sev-medium', icon: 'fa-solid fa-hourglass-half' },
  robots_blocked: { label: 'Robots blocked', badge: 'sev-medium', icon: 'fa-solid fa-robot' },
  never_run: { label: 'Never run', badge: 'st-new', icon: 'fa-solid fa-clock' }
};

function signalLabel(type) {
  return (SIGNAL_TYPES[type] && SIGNAL_TYPES[type].label) || type;
}

function signalIcon(type) {
  return (SIGNAL_TYPES[type] && SIGNAL_TYPES[type].icon) || 'fa-solid fa-signal';
}

function signalColor(type) {
  return (SIGNAL_TYPES[type] && SIGNAL_TYPES[type].color) || 'slate';
}

function pad(n) { return String(n).padStart(2, '0'); }

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtDateTime(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDate(value) {
  const d = toDate(value);
  if (!d) return '—';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtDateInput(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function timeAgo(value) {
  const d = toDate(value);
  if (!d) return '—';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function fmtDuration(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}

function truncate(text, len = 160) {
  const str = String(text == null ? '' : text);
  return str.length > len ? `${str.slice(0, len - 1)}…` : str;
}

function titleCase(str) {
  return String(str || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

module.exports = {
  SIGNAL_TYPES,
  SEVERITY_META,
  STATUS_META,
  SOURCE_STATUS_META,
  signalLabel,
  signalIcon,
  signalColor,
  fmtDateTime,
  fmtDate,
  fmtDateInput,
  timeAgo,
  fmtDuration,
  truncate,
  titleCase
};
