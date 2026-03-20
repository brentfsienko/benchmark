-- Remove Volunteer Park challenge and set Green Lake trial schedule

-- Remove the legacy Volunteer Park challenge from challenge listings
DELETE FROM challenges
WHERE id = 'challenge-vp-summer-launch';

-- Make Green Lake challenge active for trial window:
-- start today, end at end of April (current year)
UPDATE challenges
SET
  starts_at = CURRENT_DATE::timestamptz,
  ends_at = (make_date(EXTRACT(YEAR FROM CURRENT_DATE)::int, 4, 30)::timestamptz + interval '23 hours 59 minutes 59 seconds'),
  is_active = TRUE
WHERE id = 'challenge-gl-summer-2025';
