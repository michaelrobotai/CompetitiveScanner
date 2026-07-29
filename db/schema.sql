-- Competitive Radar — recorded schema definition.
-- NOTE: the live platform database is provisioned via ExecuteSQL during the build.
-- This file is the authoritative record and is also usable for local development
-- (see db/migrate.js). Tables are listed in dependency (FK) order.

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','analyst','viewer') NOT NULL DEFAULT 'viewer',
  status ENUM('active','suspended') NOT NULL DEFAULT 'active',
  job_title VARCHAR(120) NULL,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competitors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(160) NOT NULL UNIQUE,
  website VARCHAR(255) NULL,
  linkedin_url VARCHAR(255) NULL,
  ticker VARCHAR(20) NULL,
  industry VARCHAR(120) NULL,
  hq_country VARCHAR(80) NULL,
  size_band ENUM('1-50','51-200','201-1000','1001-5000','5000+','unknown') NOT NULL DEFAULT 'unknown',
  priority ENUM('high','medium','low') NOT NULL DEFAULT 'medium',
  tracking_status ENUM('active','paused','archived') NOT NULL DEFAULT 'active',
  description TEXT NULL,
  tags VARCHAR(255) NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_competitors_status (tracking_status),
  INDEX idx_competitors_priority (priority),
  CONSTRAINT fk_competitors_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS source_connectors (
  id INT AUTO_INCREMENT PRIMARY KEY,
  connector_key VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(60) NOT NULL,
  description VARCHAR(500) NULL,
  auth_type ENUM('none','api_key','oauth','scrape') NOT NULL DEFAULT 'none',
  env_key VARCHAR(80) NULL,
  status ENUM('configured','not_configured','error','disabled') NOT NULL DEFAULT 'not_configured',
  credibility_weight TINYINT NOT NULL DEFAULT 60,
  rate_limit_per_hour INT NOT NULL DEFAULT 60,
  respects_robots TINYINT(1) NOT NULL DEFAULT 1,
  config_json TEXT NULL,
  last_checked_at DATETIME NULL,
  last_error VARCHAR(500) NULL,
  updated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_connectors_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS competitor_sources (
  id INT AUTO_INCREMENT PRIMARY KEY,
  competitor_id INT NOT NULL,
  connector_key VARCHAR(60) NOT NULL,
  label VARCHAR(150) NOT NULL,
  url VARCHAR(500) NULL,
  watch_target ENUM('pricing','product','careers','blog','newsroom','company','executives','news','jobs','funding','filings','reviews','social','other') NOT NULL DEFAULT 'other',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  check_frequency ENUM('daily','weekly','manual') NOT NULL DEFAULT 'daily',
  last_checked_at DATETIME NULL,
  last_status ENUM('ok','error','not_configured','skipped','rate_limited','robots_blocked','never_run') NOT NULL DEFAULT 'never_run',
  last_error VARCHAR(500) NULL,
  last_content_hash VARCHAR(64) NULL,
  consecutive_failures INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sources_competitor (competitor_id),
  INDEX idx_sources_connector (connector_key),
  CONSTRAINT fk_sources_competitor FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scan_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  run_type ENUM('scheduled','manual_all','manual_single','retry') NOT NULL,
  status ENUM('queued','running','completed','partial','failed') NOT NULL DEFAULT 'queued',
  competitor_id INT NULL,
  triggered_by INT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  duration_ms INT NULL,
  competitors_scanned INT NOT NULL DEFAULT 0,
  sources_total INT NOT NULL DEFAULT 0,
  sources_ok INT NOT NULL DEFAULT 0,
  sources_failed INT NOT NULL DEFAULT 0,
  sources_not_configured INT NOT NULL DEFAULT 0,
  sources_skipped INT NOT NULL DEFAULT 0,
  items_collected INT NOT NULL DEFAULT 0,
  signals_created INT NOT NULL DEFAULT 0,
  signals_merged INT NOT NULL DEFAULT 0,
  error_summary TEXT NULL,
  results_json MEDIUMTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_runs_status (status),
  INDEX idx_runs_started (started_at),
  INDEX idx_runs_competitor (competitor_id),
  CONSTRAINT fk_runs_competitor FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE SET NULL,
  CONSTRAINT fk_runs_user FOREIGN KEY (triggered_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS collected_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  competitor_id INT NOT NULL,
  source_id INT NULL,
  scan_run_id INT NULL,
  connector_key VARCHAR(60) NOT NULL,
  source_type VARCHAR(60) NOT NULL,
  title VARCHAR(400) NOT NULL,
  url VARCHAR(600) NULL,
  author VARCHAR(190) NULL,
  excerpt TEXT NULL,
  raw_content MEDIUMTEXT NULL,
  content_hash VARCHAR(64) NOT NULL,
  change_type ENUM('new','changed','unchanged') NOT NULL DEFAULT 'new',
  diff_summary TEXT NULL,
  credibility TINYINT NOT NULL DEFAULT 60,
  published_at DATETIME NULL,
  captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processing_status ENUM('pending','analysed','ignored','error') NOT NULL DEFAULT 'pending',
  signal_type_guess VARCHAR(60) NULL,
  is_mock TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY rule_duplicate_hash (competitor_id, content_hash),
  INDEX idx_items_competitor (competitor_id),
  INDEX idx_items_captured (captured_at),
  INDEX idx_items_run (scan_run_id),
  INDEX idx_items_status (processing_status),
  CONSTRAINT fk_items_competitor FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_source FOREIGN KEY (source_id) REFERENCES competitor_sources(id) ON DELETE SET NULL,
  CONSTRAINT fk_items_run FOREIGN KEY (scan_run_id) REFERENCES scan_runs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS signals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  competitor_id INT NOT NULL,
  scan_run_id INT NULL,
  signal_type ENUM('acquisition_target','merger','acquiring_company','major_product_release','unusual_revenue_gain','unusual_revenue_loss','other_strategic_move') NOT NULL,
  title VARCHAR(300) NOT NULL,
  summary TEXT NULL,
  rationale TEXT NULL,
  confidence TINYINT NOT NULL DEFAULT 0,
  impact TINYINT NOT NULL DEFAULT 0,
  severity ENUM('critical','high','medium','low') NOT NULL DEFAULT 'medium',
  status ENUM('new','reviewed','confirmed','dismissed','merged') NOT NULL DEFAULT 'new',
  dedupe_key VARCHAR(120) NOT NULL,
  merged_into_id INT NULL,
  evidence_count INT NOT NULL DEFAULT 0,
  corroborating_sources INT NOT NULL DEFAULT 1,
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by INT NULL,
  reviewed_at DATETIME NULL,
  review_note TEXT NULL,
  alert_sent TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_signals_competitor (competitor_id),
  INDEX idx_signals_detected (detected_at),
  INDEX idx_signals_type (signal_type),
  INDEX idx_signals_status_conf (status, confidence),
  INDEX idx_signals_dedupe (competitor_id, dedupe_key),
  CONSTRAINT fk_signals_competitor FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
  CONSTRAINT fk_signals_run FOREIGN KEY (scan_run_id) REFERENCES scan_runs(id) ON DELETE SET NULL,
  CONSTRAINT fk_signals_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_signals_merged FOREIGN KEY (merged_into_id) REFERENCES signals(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS signal_evidence (
  id INT AUTO_INCREMENT PRIMARY KEY,
  signal_id INT NOT NULL,
  collected_item_id INT NOT NULL,
  relevance TINYINT NOT NULL DEFAULT 70,
  snippet TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_signal_item (signal_id, collected_item_id),
  INDEX idx_evidence_item (collected_item_id),
  CONSTRAINT fk_evidence_signal FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_item FOREIGN KEY (collected_item_id) REFERENCES collected_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS strategy_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  competitor_id INT NOT NULL UNIQUE,
  positioning TEXT NULL,
  target_segments VARCHAR(400) NULL,
  pricing_model VARCHAR(400) NULL,
  key_products TEXT NULL,
  strengths TEXT NULL,
  weaknesses TEXT NULL,
  recent_moves TEXT NULL,
  threat_level ENUM('critical','high','medium','low') NOT NULL DEFAULT 'medium',
  updated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profile_competitor FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  competitor_id INT NULL,
  signal_id INT NULL,
  author_id INT NULL,
  body TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notes_competitor (competitor_id),
  INDEX idx_notes_signal (signal_id),
  CONSTRAINT fk_notes_competitor FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_signal FOREIGN KEY (signal_id) REFERENCES signals(id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS digest_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  recipient_name VARCHAR(150) NULL,
  recipient_email VARCHAR(190) NOT NULL,
  frequency ENUM('daily','weekly') NOT NULL DEFAULT 'daily',
  send_time VARCHAR(5) NOT NULL DEFAULT '07:15',
  timezone VARCHAR(60) NOT NULL DEFAULT 'UTC',
  min_confidence TINYINT NOT NULL DEFAULT 50,
  categories_json TEXT NULL,
  competitors_json TEXT NULL,
  include_raw_items TINYINT(1) NOT NULL DEFAULT 0,
  instant_alerts TINYINT(1) NOT NULL DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  last_sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_digest_enabled (enabled),
  CONSTRAINT fk_digest_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subscription_id INT NULL,
  channel ENUM('email','in_app') NOT NULL DEFAULT 'email',
  notification_type ENUM('daily_digest','weekly_digest','instant_alert') NOT NULL DEFAULT 'daily_digest',
  recipient VARCHAR(190) NOT NULL,
  subject VARCHAR(300) NULL,
  body_preview TEXT NULL,
  signal_count INT NOT NULL DEFAULT 0,
  status ENUM('sent','failed','skipped','logged_only') NOT NULL DEFAULT 'logged_only',
  error VARCHAR(500) NULL,
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_sent (sent_at),
  CONSTRAINT fk_notif_subscription FOREIGN KEY (subscription_id) REFERENCES digest_subscriptions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  actor_email VARCHAR(190) NULL,
  actor_role VARCHAR(30) NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id VARCHAR(60) NULL,
  entity_label VARCHAR(250) NULL,
  details_json TEXT NULL,
  ip_address VARCHAR(60) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_user (user_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  report_type ENUM('per_competitor','cross_competitor') NOT NULL DEFAULT 'cross_competitor',
  competitor_id INT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  filters_json TEXT NULL,
  summary_json MEDIUMTEXT NULL,
  generated_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reports_created (created_at),
  CONSTRAINT fk_reports_competitor FOREIGN KEY (competitor_id) REFERENCES competitors(id) ON DELETE SET NULL,
  CONSTRAINT fk_reports_user FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS app_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(80) NOT NULL UNIQUE,
  setting_value VARCHAR(500) NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'general',
  label VARCHAR(150) NULL,
  description VARCHAR(400) NULL,
  updated_by INT NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
