-- Versioned merchandising copy refresh for the original seed fixtures only.
-- Do not rewrite applied seeds or touch inventory, offers, users or orders.
-- Preserve anything a maintainer has independently customized.

UPDATE marketplace.products AS product
SET description = listing.description,
    activation_instructions = CASE product.platform
      WHEN 'steam' THEN 'In Steam, open Games > Activate a Product on Steam and follow the prompts.'
      WHEN 'xbox' THEN 'On your Xbox console or in the Microsoft Store, choose Redeem and follow the prompts.'
      WHEN 'playstation' THEN 'In PlayStation Store, select Redeem Codes and follow the prompts.'
      WHEN 'nintendo' THEN 'In Nintendo eShop, choose Enter Code and follow the prompts.'
      ELSE 'Follow the redemption instructions for the platform shown.'
    END
FROM (VALUES
  ('solar-drift', 'Pilot a sleek craft through solar storms, forgotten stations and shimmering asteroid fields. Every route hides a new discovery.'),
  ('the-last-outpost', 'The frontier is holding by a thread. Gather supplies, fortify your base and lead the last defenders through the night.'),
  ('neon-circuit', 'Race through a glowing metropolis of rooftop shortcuts and razor-sharp turns. Speed is everything, and precision wins.'),
  ('wild-frontier', 'Venture beyond the mapped trails into sweeping valleys and untamed wilderness. Shape your journey with every choice.'),
  ('echoes-of-orion', 'A mysterious signal leads you across the Orion arm. Explore distant worlds and uncover the story behind its origin.'),
  ('ironbound', 'Forge alliances and command the battlefield in a kingdom divided by war. Every decision carries a cost.'),
  ('tides-of-aether', 'Sail above the clouds to discover floating islands, ancient ruins and the secrets hidden beyond the storm.'),
  ('midnight-protocol', 'Infiltrate a city that never sleeps. Stay ahead of rival operatives and expose the conspiracy before sunrise.'),
  ('pixel-odyssey', 'Leap through colorful worlds filled with clever puzzles, hidden paths and surprises around every corner.'),
  ('starfall-tactics', 'Lead a specialist squad through demanding missions where positioning, teamwork and timing decide the outcome.'),
  ('frostline', 'Cross an unforgiving frozen landscape. Manage scarce resources, find shelter and survive the journey ahead.'),
  ('beyond-the-vale', 'Follow an ancient path into a mist-covered land of forgotten kingdoms, curious allies and untold legends.'),
  ('skyline-racer', 'Take on the city''s fastest drivers through tunnels, bridges and late-night streets. Make every corner count.'),
  ('emberlight', 'Carry the last flame through a world of shadows. Explore forgotten places and stand against the darkness.'),
  ('deep-signal', 'An impossible transmission draws you into the depths. Piece together clues as the mystery grows around you.'),
  ('lunar-legacy', 'Explore a lunar frontier shaped by old discoveries and new ambitions. Build your path among abandoned observatories and distant horizons.')
) AS listing(slug, description)
WHERE product.slug = listing.slug
  AND product.active
  AND product.description = 'A fictional game used to demonstrate the marketplace. No redeemable game license is sold.'
  AND product.activation_instructions = 'Nonredeemable demo key. This code cannot be activated on any real gaming platform.';

UPDATE marketplace.homepage_banners
SET subheading = 'Great games, exciting worlds and more ways to find your next favorite.'
WHERE id = '50000000-0000-4000-8000-000000000001'
  AND subheading = 'An unofficial marketplace with fictional games and demo keys.';
