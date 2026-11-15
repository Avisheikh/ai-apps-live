-- AI Apps Live — Seed Data v1 (migration 0002_seed.sql)
-- Strictly registry & data sources only. No metric values!

-- ───────────── Seed Apps (10 Tracked Apps) ─────────────
INSERT INTO apps (id, slug, display_name, vendor, apple_app_id, apple_identity_status, trends_label, status_page_url, local_icon, is_active, sort_order, created_at, updated_at) VALUES
(1, 'chatgpt', 'ChatGPT', 'OpenAI OpCo, LLC', '6448311069', 'UNCONFIRMED', NULL, 'https://status.openai.com', NULL, 1, 10, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(2, 'claude', 'Claude', 'Anthropic PBC', '6473753684', 'UNCONFIRMED', NULL, 'https://status.anthropic.com', NULL, 1, 20, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(3, 'gemini', 'Google Gemini', 'Google LLC', '6477489729', 'UNCONFIRMED', NULL, NULL, NULL, 1, 30, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(4, 'deepseek', 'DeepSeek', 'DeepSeek', NULL, 'UNCONFIRMED', NULL, NULL, NULL, 1, 40, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(5, 'perplexity', 'Perplexity', 'Perplexity AI, Inc.', NULL, 'UNCONFIRMED', NULL, NULL, NULL, 1, 50, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(6, 'grok', 'Grok', 'xAI', NULL, 'UNCONFIRMED', NULL, NULL, NULL, 1, 60, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(7, 'copilot', 'Microsoft Copilot', 'Microsoft Corporation', NULL, 'UNCONFIRMED', NULL, NULL, NULL, 1, 70, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(8, 'character-ai', 'Character.AI', 'Character Technologies, Inc.', NULL, 'UNCONFIRMED', NULL, NULL, NULL, 1, 80, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(9, 'poe', 'Poe', 'Quora, Inc.', NULL, 'UNCONFIRMED', NULL, NULL, NULL, 1, 90, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(10, 'meta-ai', 'Meta AI', 'Meta Platforms, Inc.', NULL, 'UNCONFIRMED', NULL, NULL, NULL, 1, 100, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z');

-- ───────────── Seed Data Sources ─────────────
INSERT INTO data_sources (id, key, name, kind, base_url, terms_url, license_note, enabled, disabled_reason, poll_interval_seconds, stale_after_seconds, created_at, updated_at) VALUES
(1, 'apple_rss', 'Apple App Store RSS', 'AUTOMATIC', 'https://rss.marketingtools.apple.com', NULL, 'Source: Apple App Store charts', 1, NULL, 1800, 86400, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(2, 'google_trends_csv', 'Google Trends CSV', 'MANUAL_IMPORT', 'https://trends.google.com/trends/', 'https://support.google.com/trends/answer/4365538', 'Data source: Google Trends (https://www.google.com/trends)', 1, NULL, NULL, 1209600, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(3, 'company_disclosure', 'Company Official Disclosures', 'MANUAL_ENTRY', 'manual', NULL, 'Official primary source statements', 1, NULL, NULL, 15552000, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(4, 'statuspage', 'Vendor Statuspage JSON', 'AUTOMATIC', 'https://status.openai.com', NULL, 'Vendor status pages', 0, 'Optional module disabled by default', 120, 600, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z'),
(5, 'cloudflare_radar', 'Cloudflare Radar Top Services', 'AUTOMATIC', 'https://api.cloudflare.com/client/v4/radar/', NULL, 'CC BY-NC 4.0 (non-commercial)', 0, 'Optional module disabled by default', 21600, 172800, '2026-11-15T00:00:00.000Z', '2026-11-15T00:00:00.000Z');

-- ───────────── Seed Source Health ─────────────
INSERT INTO source_health (source_id, state, last_attempt_at, last_success_at, last_source_updated_at, consecutive_failures, last_error, observed_update_interval_seconds, updated_at) VALUES
(1, 'UNKNOWN', NULL, NULL, NULL, 0, NULL, NULL, '2026-11-15T00:00:00.000Z'),
(2, 'UNKNOWN', NULL, NULL, NULL, 0, NULL, NULL, '2026-11-15T00:00:00.000Z'),
(3, 'UNKNOWN', NULL, NULL, NULL, 0, NULL, NULL, '2026-11-15T00:00:00.000Z'),
(4, 'DISABLED', NULL, NULL, NULL, 0, NULL, NULL, '2026-11-15T00:00:00.000Z'),
(5, 'DISABLED', NULL, NULL, NULL, 0, NULL, NULL, '2026-11-15T00:00:00.000Z');

-- ───────────── Seed Metric Controls ─────────────
INSERT INTO metric_controls (metric_key, enabled, reason, updated_by, updated_at) VALUES
('APP_STORE_RANK', 1, 'Core metric enabled', 'SYSTEM', '2026-11-15T00:00:00.000Z'),
('SEARCH_INTEREST', 1, 'Core metric enabled', 'SYSTEM', '2026-11-15T00:00:00.000Z'),
('OFFICIAL_USERS', 1, 'Core metric enabled', 'SYSTEM', '2026-11-15T00:00:00.000Z'),
('CONCURRENT_USERS', 0, 'No public legitimate source exists in v1 (locked off)', 'SYSTEM', '2026-11-15T00:00:00.000Z'),
('SERVICE_STATUS', 0, 'Optional module disabled by default', 'SYSTEM', '2026-11-15T00:00:00.000Z'),
('DNS_POPULARITY', 0, 'Optional module disabled by default', 'SYSTEM', '2026-11-15T00:00:00.000Z');

-- ───────────── Seed Default Settings ─────────────
INSERT INTO settings (key, value_json, updated_at) VALUES
('apple_rss_scopes', '["us/top-free/100"]', '2026-11-15T00:00:00.000Z'),
('trends_verified_real', 'false', '2026-11-15T00:00:00.000Z');
