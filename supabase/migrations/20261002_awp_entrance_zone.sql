-- AWP 2026 performs at エントランス交流ゾーン, not the park centroid.
-- Google Maps place /g/11ty6fzg9q (PJVW+9R 練馬区). Multiple event_venues rows can be added later for other stages.

update public.event_venues
set
  name_ja = '練馬城址公園',
  name_en = 'Nerima Joshi Park',
  blurb_ja = 'エントランス交流ゾーン',
  blurb_en = 'Entrance Exchange Zone',
  lat = 35.7434302,
  lng = 139.6470773
where id = 'nerima-joshi-park';
