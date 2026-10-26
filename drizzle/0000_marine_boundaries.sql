CREATE TABLE `marine_boundaries` (
  `user_id` text NOT NULL,
  `name` text NOT NULL,
  `fingerprint` text NOT NULL,
  `edits_json` text NOT NULL,
  `revision` integer NOT NULL DEFAULT 1,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`user_id`, `name`)
);
