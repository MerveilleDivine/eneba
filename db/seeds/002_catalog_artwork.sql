-- Original demo artwork. Update only the unchanged, known fixture covers.
-- No inventory, offers, orders or previously applied seed files are modified.
UPDATE marketplace.products AS product
SET cover_url = artwork.cover_url
FROM (VALUES
  ('10000000-0000-4000-8000-000000000001'::uuid, '/images/covers/solar-drift.webp'),
  ('10000000-0000-4000-8000-000000000002'::uuid, '/images/covers/the-last-outpost.webp'),
  ('10000000-0000-4000-8000-000000000003'::uuid, '/images/covers/neon-circuit.webp'),
  ('10000000-0000-4000-8000-000000000004'::uuid, '/images/covers/wild-frontier.webp'),
  ('10000000-0000-4000-8000-000000000005'::uuid, '/images/covers/echoes-of-orion.webp'),
  ('10000000-0000-4000-8000-000000000006'::uuid, '/images/covers/ironbound.webp'),
  ('10000000-0000-4000-8000-000000000007'::uuid, '/images/covers/tides-of-aether.webp'),
  ('10000000-0000-4000-8000-000000000008'::uuid, '/images/covers/midnight-protocol.webp'),
  ('10000000-0000-4000-8000-000000000009'::uuid, '/images/covers/pixel-odyssey.webp'),
  ('10000000-0000-4000-8000-000000000010'::uuid, '/images/covers/starfall-tactics.webp'),
  ('10000000-0000-4000-8000-000000000011'::uuid, '/images/covers/frostline.webp'),
  ('10000000-0000-4000-8000-000000000012'::uuid, '/images/covers/beyond-the-vale.webp'),
  ('10000000-0000-4000-8000-000000000013'::uuid, '/images/covers/skyline-racer.webp'),
  ('10000000-0000-4000-8000-000000000014'::uuid, '/images/covers/emberlight.webp'),
  ('10000000-0000-4000-8000-000000000015'::uuid, '/images/covers/deep-signal.webp'),
  ('10000000-0000-4000-8000-000000000016'::uuid, '/images/covers/lunar-legacy.webp')
) AS artwork(id, cover_url)
WHERE product.id = artwork.id
  AND product.cover_url = '/images/demo-cover.svg';
