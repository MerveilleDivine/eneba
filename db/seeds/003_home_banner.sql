-- Only correct the original demo banner when its fields have not been customized.
-- Keep applied seeds immutable; never modify inventory, offers, or orders.
UPDATE marketplace.homepage_banners
SET link_href = '/catalog'
WHERE id = '50000000-0000-4000-8000-000000000001'
  AND link_href = '/store';

UPDATE marketplace.homepage_banners
SET image_url = '/images/banners/discover-world.svg'
WHERE id = '50000000-0000-4000-8000-000000000001'
  AND image_url = '/images/demo-cover.svg';
