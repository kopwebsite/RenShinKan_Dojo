-- Download taxonomy is additive so existing published assets and historical
-- storage references remain intact.
ALTER TABLE download_assets ADD COLUMN category_label TEXT NOT NULL DEFAULT 'Reference';
ALTER TABLE download_assets ADD COLUMN rank_label TEXT NOT NULL DEFAULT '';

UPDATE download_assets
SET category_label = 'AAT registration/application',
    rank_label = ''
WHERE id = 'download-aat-membership-2026';

UPDATE download_assets
SET category_label = 'Examination forms and syllabi',
    rank_label = '10th Kyu through Shodan-Ho'
WHERE id = 'download-aikido-grading-2026';

CREATE INDEX IF NOT EXISTS idx_download_assets_category
  ON download_assets(published, category_label, sort_order, id);
