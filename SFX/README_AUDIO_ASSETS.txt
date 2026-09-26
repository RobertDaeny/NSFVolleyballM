V71 HYBRID VENUE AUDIO ASSET MAP

Replaceable assets: keep the same relative path + filename + .ogg format and the game code does not need changes.

ambience/
  gym.ogg                 stadium main ambience
  underground_crowd.ogg   underground crowd bed
  warehouse.ogg           warehouse main ambience
  furnace.ogg             furnace/factory main ambience
  moon.ogg                moon main ambience (empty/desolate choice)
  ferry_sea.ogg           ferry sea bed
  rooftop_wind.ogg        rooftop main key
  rooftop_traffic_a/b.ogg muffled city traffic bed
  ice_wind.ogg            ice main ambience
  rain_gentle.ogg         rain venue main key

venue/
  ferry_wood_creaks.ogg   random ship deck creaks
  gym_basketball_a/b.ogg  sparse distant gym detail
  underground_boo.ogg     sparse underground boo accent
  seagulls.ogg            normal bird calls (death sound remains procedural)
  ufo_enter.ogg           UFO entrance
  ufo_exit.ogg            UFO departure/release

incidents/
  rain_surge.ogg          heavy-rain event layer, dissolve in/out
  thunderstorm_intro.ogg  lightning-event intro layer
  wind_gust.ogg           strong wind incident
  blizzard.ogg            blizzard incident
  giant_wave.ogg          wave body first
  giant_wave_impact.ogg   metal impact; this moment triggers ship tilt
  thunder_01..04.ogg      randomized lightning one-shots

Source/master WAV files are intentionally NOT included in the release package.

V72 additions
- ambience/beach_waves.ogg : beach main ambience
- incidents/gas_leak_long.ogg + gas_leak_loop.ogg : warehouse PIPE_LEAK; factory OVERHEAT at lower gain
- incidents/roof_crash.ogg + roof_debris.ogg : warehouse roof break impact
- incidents/electric_sparkles.ogg : THUNDER_STRIKE warning before strike
All persistent ambience loops use overlapping cross-dissolve playback in code. Replace files with same path/name/format to swap assets without code changes.
