local recipe = import 'gungen/exports/deadvox.jsonnet';
local things = import 'packages/thing-authoring-tool/exports/deadvox.jsonnet';
local exportFiles = import 'tools/jsonnet/lib/export-files.libsonnet';
{
  "sources": [
    {
      title: 'Gungen authored model exports',
      url: 'https://github.com/roobie/skelly/blob/main/gungen/exports/deadvox.jsonnet',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: exportFiles(recipe),
      changes: 'Original project-built geometry exported from the authored recipe in metres, +x forward and +y up. Cartridge dimensions come from the recipe sources; unsupported internal dimensions remain visual proxies.',
    },

    {
      title: 'Thing tool authored models',
      url: 'https://github.com/roobie/skelly/blob/main/packages/thing-authoring-tool/exports/deadvox.jsonnet',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: exportFiles(things),
      changes: 'Original project-built geometry rebuilt from authored item and part data; masses and appearance belong to the tool source.',
    },
    {
      "title": "The Free Firearm Sound Library — Winchester Model 12",
      "url": "https://opengameart.org/content/the-free-firearm-sound-library",
      "author": "Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney",
      "licence": "CC0-1.0",
      "download": "Prepared SFX Library.7z",
      "files": ["assets/audio/shotgun-model12-01.ogg", "assets/audio/shotgun-model12-02.ogg"],
      "changes": "K_22P near take, single-shot slices 0.82–1.90 s and 7.42–8.50 s. Mono 48 kHz Vorbis q5; float peak normalised to -2 dBFS before encoding; 20 ms tail fade."
    },
    {
      "title": "Gun Reload Sounds — pump rack",
      "url": "https://opengameart.org/content/gun-reload-sounds",
      "author": "SpringySpringo",
      "licence": "CC0-1.0",
      "download": "shotguncock_0.wav",
      "files": ["assets/audio/shotgun-rack-back.ogg", "assets/audio/shotgun-rack-forward.ogg"],
      "changes": "BR-selected rack split at 0.19 s: back 0–0.19, forward 0.19–0.40. Cues at hand start and exported rearward+dwell boundary (0.65 s); no animation stretch. Mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade. Author requests a project link once shipped."
    },
    {
      "title": "Shotgun Reload Sound Effects — individual inserts",
      "url": "https://opengameart.org/content/shotgun-reload-sound-effects",
      "author": "zer0_sol",
      "licence": "CC0-1.0",
      "download": "shotgunsounds.zip",
      "files": ["assets/audio/shotgun-insert-01.ogg", "assets/audio/shotgun-insert-02.ogg"],
      "changes": "First Shell.mp3 0.32–0.90 s and Subsequent Shells.mp3 0.74–1.32 s: one insert, not a whole reload. Starts with each 0.9 s handling job. Mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade. Placeholder candidates; no direct chamber insertion in this slice."
    },
    {
      "title": "Equipment Clicks II — hollow hull landing candidates",
      "url": "https://opengameart.org/content/equipment-clicks-ii",
      "author": "LFA",
      "licence": "CC0-1.0",
      "download": "equipmentclicks.wav",
      "files": [
        "assets/audio/shotgun-hull-01.ogg",
        "assets/audio/shotgun-hull-02.ogg",
        "assets/audio/shotgun-hull-03.ogg"
      ],
      "changes": "Slices 2.34–2.69, 3.75–4.12 and 5.39–5.66 s, hollow plastic click candidates, no metal layer. Placeholder, not a recorded shotshell hull. Mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade."
    },
    {
      "title": "The Free Firearm Sound Library — Tikka T3",
      "url": "https://opengameart.org/content/the-free-firearm-sound-library",
      "author": "Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney",
      "licence": "CC0-1.0",
      "download": "W_29P.wav, Prepared SFX, from the CC0 mirror https://github.com/buddingmonkey/FreeFirearmsSFXLibrary",
      "files": ["assets/audio/gunshot-tikka-01.ogg", "assets/audio/gunshot-tikka-02.ogg"],
      "changes": "W_29P near take (.30-06 bolt rifle), single-shot slices 0.52–1.60 s and 5.60–6.68 s. Mono 48 kHz Vorbis q5; float peak normalised to -2 dBFS before encoding; 20 ms tail fade."
    },
    {
      "title": "The Free Firearm Sound Library — AR-15",
      "url": "https://opengameart.org/content/the-free-firearm-sound-library",
      "author": "Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney",
      "licence": "CC0-1.0",
      "download": "D_32P.wav, Prepared SFX, from the CC0 mirror https://github.com/buddingmonkey/FreeFirearmsSFXLibrary",
      "files": ["assets/audio/gunshot-ar15-01.ogg", "assets/audio/gunshot-ar15-02.ogg"],
      "changes": "D_32P near take, single-shot slices 0.64–1.72 s and 5.59–6.67 s. Mono 48 kHz Vorbis q5; float peak normalised to -2 dBFS before encoding; 20 ms tail fade."
    },
    {
      "title": "The Free Firearm Sound Library — Smith & Wesson 642",
      "url": "https://opengameart.org/content/the-free-firearm-sound-library",
      "author": "Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney",
      "licence": "CC0-1.0",
      "download": "V_27P.wav (Prepared SFX) and V_0, V_1, V_3, V_5, V_7, V_18 (Master Tracks), from the CC0 mirror https://github.com/buddingmonkey/FreeFirearmsSFXLibrary",
      "files": [
        "assets/audio/gunshot-sw642-01.ogg",
        "assets/audio/gunshot-sw642-02.ogg",
        "assets/audio/revolver-crane-open-01.ogg",
        "assets/audio/revolver-crane-close-01.ogg",
        "assets/audio/revolver-eject-01.ogg",
        "assets/audio/revolver-round-insert-01.ogg",
        "assets/audio/revolver-round-insert-02.ogg",
        "assets/audio/revolver-dry-click-01.ogg",
        "assets/audio/revolver-hammer-cock-01.ogg"
      ],
      "changes": "V_27P near take (.38 Special), single-shot slices 0.75–1.83 s and 6.16–7.24 s. Handling cut from the raw takes by waveform and spectrum, not by ear: V_0 1.44–1.72 s crane open, V_1 1.16–1.45 s crane close, V_3 0.74–1.42 s eject, V_18 3.42–3.70 s and 5.18–5.46 s round insert, V_5 1.34–1.75 s dry click, V_7 0.19–0.45 s hammer cock. Mono 48 kHz Vorbis q5; float peak normalised to -2 dBFS before encoding; 20 ms tail fade."
    },
    {
      "title": "Equipment Clicks III",
      "url": "https://opengameart.org/content/equipment-clicks-iii",
      "author": "LFA",
      "licence": "CC0-1.0",
      "download": "equipment_clicks3.wav",
      "files": [
        "assets/audio/rifle-bolt-open-01.ogg",
        "assets/audio/rifle-bolt-close-01.ogg",
        "assets/audio/revolver-case-pick-01.ogg"
      ],
      "changes": "Slices 12.10–12.80 s (bolt-action lift and draw, the bolt open), 12.80–13.72 s (push and turn down, the bolt close) and 7.95–8.20 s (light click, the revolver case pick). Mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade."
    },
    {
      "title": "DSLR Camera Sounds",
      "url": "https://freesound.org/people/Rvgerxini/sounds/571483/",
      "author": "Rvgerxini",
      "licence": "CC0-1.0",
      "download": "571483__rvgerxini__dslr-camera-sounds.mp3",
      "files": [
        "assets/audio/firearm-dry-click-01.ogg",
        "assets/audio/firearm-dry-click-02.ogg",
        "assets/audio/firearm-dry-click-03.ogg",
        "assets/audio/shotgun-dry-click-01.ogg"
      ],
      "changes": "Three isolated short clicks, 2.79–2.90, 6.455–6.565 and 7.45–7.53 s, as a closed-action dry fire, and the heavier click at 4.48–4.64 s as the pump shotgun's; the longer motor runs are left out. Equal L+R downmix, mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade."
    },
    {
      "title": "Huge Explosion",
      "url": "https://freesound.org/people/florianreichelt/sounds/459973/",
      "author": "florianreichelt",
      "licence": "CC0-1.0",
      "download": "459973__florianreichelt__huge-explosion.mp3",
      "files": ["assets/audio/grenade-blast-01.ogg", "assets/audio/grenade-blast-02.ogg"],
      "changes": "The two blasts with their tails, 6.22–7.92 s and 8.18–10.45 s; the quiet lead-in and the late rumble are left out. Equal L+R downmix, mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade."
    },
    {
      "title": "Light wooshes",
      "url": "https://freesound.org/people/florianreichelt/sounds/447806/",
      "author": "florianreichelt",
      "licence": "CC0-1.0",
      "download": "447806__florianreichelt__light-wooshes.wav",
      "files": [
        "assets/audio/melee-swing-light-01.ogg",
        "assets/audio/melee-swing-light-02.ogg",
        "assets/audio/melee-swing-light-03.ogg"
      ],
      "changes": "Three single wooshes, 4.20–4.70, 6.55–7.05 and 8.20–8.80 s, for light blades. Equal L+R downmix, mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade."
    },
    {
      "title": "Whoosh",
      "url": "https://freesound.org/people/qubodup/sounds/60013/",
      "author": "qubodup",
      "licence": "CC0-1.0",
      "download": "60013__qubodup__whoosh.flac",
      "files": ["assets/audio/melee-swing-heavy-01.ogg"],
      "changes": "Whole file, 0–0.426 s, for heavy swings. Equal L+R downmix, mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade."
    },
    {
      "title": "Metal Impact",
      "url": "https://freesound.org/people/Rickplayer/sounds/530486/",
      "author": "Rickplayer",
      "licence": "CC0-1.0",
      "download": "530486__rickplayer__metal-impact.mp3",
      "files": ["assets/audio/melee-hit-metal-01.ogg"],
      "changes": "The strike and its ring, 0.06–0.85 s, as a metal layer on melee hits. Mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade."
    },
    {
      "title": "Hitting metal pole",
      "url": "https://freesound.org/people/colorsCrimsonTears/sounds/531378/",
      "author": "colorsCrimsonTears",
      "licence": "CC0-1.0",
      "download": "531378__colorscrimsontears__hitting-metal-pole.wav",
      "files": ["assets/audio/melee-hit-metal-02.ogg", "assets/audio/melee-hit-metal-03.ogg"],
      "changes": "Single strikes 0.02–0.26 s (ring cut at the next strike) and 1.61–1.82 s (the last), as a metal layer on melee hits. Mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade."
    },
    {
      "title": "Gun Reload Sound Effects",
      "url": "https://opengameart.org/content/gun-reload-sound-effects",
      "author": "BMacZero",
      "licence": "CC0-1.0",
      "download": "clipload1.wav, clipload2.wav",
      "files": ["assets/audio/magazine-clipload-01.ogg", "assets/audio/magazine-clipload-02.ogg"],
      "changes": "Whole files, 0–0.255 s and 0–0.209 s. Mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade."
    },
    {
      "title": "15 vocal male strain/hurt/pain/jump sounds",
      "url": "https://opengameart.org/content/15-vocal-male-strainhurtpainjump-sounds",
      "author": "qubodup",
      "licence": "CC0-1.0",
      "download": "slightscreams.7z",
      "files": [
        "assets/audio/player-hurt-light-01.ogg",
        "assets/audio/player-hurt-light-03.ogg",
        "assets/audio/player-hurt-light-06.ogg",
        "assets/audio/player-hurt-heavy-02.ogg",
        "assets/audio/player-hurt-heavy-05.ogg",
        "assets/audio/player-hurt-heavy-08.ogg",
        "assets/audio/player-strain-09.ogg",
        "assets/audio/player-strain-12.ogg",
        "assets/audio/player-strain-14.ogg"
      ],
      "changes": "Selected nine vocal variants; converted from FLAC to 24 kHz mono Opus in Ogg containers; unused source files excluded"
    },
    {
      "title": "80 CC0 creature SFX",
      "url": "https://opengameart.org/content/80-cc0-creature-sfx",
      "author": "rubberduck",
      "licence": "CC0-1.0",
      "download": "80-CC0-creature-SFX.zip",
      "files": ["assets/audio/shambler-hurt-01.ogg"],
      "changes": "Selected one hurt variant (two more were removed as too high-pitched); converted to 24 kHz mono Opus in Ogg containers; unused source files excluded"
    },
    {
      "title": "80 CC0 RPG SFX",
      "url": "https://opengameart.org/content/80-cc0-rpg-sfx",
      "author": "rubberduck",
      "licence": "CC0-1.0",
      "download": "80-CC0-RPG-SFX.zip",
      "files": [
        "assets/audio/melee-swing-01.ogg",
        "assets/audio/melee-swing-02.ogg",
        "assets/audio/melee-swing-03.ogg",
        "assets/audio/door-open-01.ogg",
        "assets/audio/door-open-02.ogg",
        "assets/audio/door-open-03.ogg",
        "assets/audio/door-close-01.ogg",
        "assets/audio/door-close-02.ogg",
        "assets/audio/door-close-03.ogg"
      ],
      "changes": "Selected three blade, three wood and three metal variants; converted to 24 kHz mono Opus in Ogg containers; unused source files excluded"
    },
    {
      "title": "Zombies Sound Pack",
      "url": "https://opengameart.org/content/zombies-sound-pack",
      "author": "artisticdude",
      "licence": "CC0-1.0",
      "download": "zombies.zip",
      "files": [
        "assets/audio/shambler-idle-01.ogg",
        "assets/audio/shambler-idle-02.ogg",
        "assets/audio/shambler-idle-03.ogg",
        "assets/audio/shambler-alert-04.ogg",
        "assets/audio/shambler-alert-05.ogg",
        "assets/audio/shambler-alert-06.ogg",
        "assets/audio/shambler-attack-07.ogg",
        "assets/audio/shambler-attack-08.ogg",
        "assets/audio/shambler-attack-09.ogg"
      ],
      "changes": "Selected nine zombie vocalizations; converted from WAV to 24 kHz mono Opus in Ogg containers; unused source files excluded"
    },
    {
      "title": "37 hits/punches",
      "url": "https://opengameart.org/content/37-hitspunches",
      "author": "Independent.nu",
      "licence": "CC0-1.0",
      "download": "independent_nu_ljudbank-hits_and_punches.7z",
      "files": [
        "assets/audio/melee-hit-01.ogg",
        "assets/audio/melee-hit-02.ogg",
        "assets/audio/melee-hit-03.ogg",
        "assets/audio/melee-hit-04.ogg",
        "assets/audio/shambler-hit-05.ogg",
        "assets/audio/shambler-hit-06.ogg",
        "assets/audio/shambler-hit-07.ogg"
      ],
      "changes": "Selected seven impact variants; converted from FLAC to 24 kHz mono Opus in Ogg containers; unused source files excluded"
    },
    {
      "title": "Different steps on wood, stone, leaves, gravel and mud",
      "url": "https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud",
      "author": "TinyWorlds",
      "licence": "CC0-1.0",
      "download": "[kdd]DifferentSteps_0.zip",
      "files": [
        "assets/audio/footstep-wood-01.ogg",
        "assets/audio/footstep-wood-02.ogg",
        "assets/audio/footstep-wood-03.ogg",
        "assets/audio/footstep-stone-01.ogg",
        "assets/audio/footstep-leaves-01.ogg",
        "assets/audio/footstep-leaves-02.ogg",
        "assets/audio/footstep-mud-01.ogg"
      ],
      "changes": "Selected wood, stone, leaves and mud steps; converted to mono Opus in Ogg containers; unused gravel sample excluded because the game has no gravel block"
    },
    {
      "title": "Fantozzi's Footsteps (Grass/Sand & Stone)",
      "url": "https://opengameart.org/content/fantozzis-footsteps-grasssand-stone",
      "author": "Fantozzi",
      "licence": "CC0-1.0",
      "download": "Fantozzi-footsteps.7z",
      "files": [
        "assets/audio/footstep-grass-sand-01.ogg",
        "assets/audio/footstep-grass-sand-02.ogg",
        "assets/audio/footstep-grass-sand-03.ogg",
        "assets/audio/footstep-grass-sand-04.ogg",
        "assets/audio/footstep-grass-sand-05.ogg",
        "assets/audio/footstep-grass-sand-06.ogg",
        "assets/audio/footstep-stone-02.ogg",
        "assets/audio/footstep-stone-03.ogg",
        "assets/audio/footstep-stone-04.ogg",
        "assets/audio/footstep-stone-05.ogg",
        "assets/audio/footstep-stone-06.ogg"
      ],
      "changes": "Selected six grass/sand and five stone steps (the source says its sand steps also sound like grass); converted from FLAC to mono Opus in Ogg containers; unused sixth stone sample excluded"
    },
    {
      "title": "100 CC0 SFX #2",
      "url": "https://opengameart.org/content/100-cc0-sfx-2",
      "author": "rubberduck",
      "licence": "CC0-1.0",
      "download": "sfx_100_v2.zip",
      "files": [
        "assets/audio/footstep-mud-02.ogg",
        "assets/audio/footstep-mud-03.ogg",
        "assets/audio/footstep-mud-04.ogg",
        "assets/audio/player-block-full-01.ogg"
      ],
      "changes": "Selected three wet-footstep variations (sfx100v2_footstep_wet_01–03.ogg); converted from stereo 48 kHz Vorbis to mono 48 kHz Opus in Ogg containers without loudness normalization; sfx100v2_misc_36.ogg kept byte-identical as received and renamed player-block-full-01.ogg; unused source effects excluded"
    },
    {
      "title": "Jump Landing Sound",
      "url": "https://opengameart.org/content/jump-landing-sound",
      "author": "MentalSanityOff",
      "licence": "CC0-1.0",
      "download": "jumpland48000.mp3",
      "files": ["assets/audio/player-landing-hard-01.ogg"],
      "changes": "Converted the 48 kHz MP3 source to mono Opus in an Ogg container"
    },
    {
      "title": "Cursor pack",
      "url": "https://opengameart.org/content/cursor-pack",
      "author": "Ivan Voirol",
      "licence": "CC0-1.0",
      "download": "cursor.png",
      "files": ["assets/cursors/cursor.png"],
      "changes": "Kept the standard top-left pointer arrow and pointing-hand sprites from cursor.png; trimmed to their silhouettes for a white difference-blended game cursor"
    },
    {
      "title": "3 Melee Sounds",
      "url": "https://opengameart.org/content/3-melee-sounds",
      "author": "remaxim",
      "licence": "CC0-1.0",
      "download": "melee.zip",
      "files": ["assets/audio/melee_swing-01.ogg"],
      "changes": "Selected the generic swing recording, derived from qubodup's Swish - bamboo stick weapon swishes; trimmed leading silence, faded the tail, converted to 24 kHz mono Opus in Ogg, and applied loudness normalization plus true-peak limiting (final measured LUFS and true peak are in the d13b report)."
    },
    {
      "title": "Thwack Sounds",
      "url": "https://opengameart.org/content/thwack-sounds",
      "author": "Jordan Irwin (AntumDeluge)",
      "licence": "CC0-1.0",
      "download": "thwack.zip",
      "files": ["assets/audio/door_blocked_close-01.ogg"],
      "changes": "Converted the selected PCM WAV; trimmed leading silence, faded the tail, converted to 24 kHz mono Opus in Ogg, and applied loudness normalization plus true-peak limiting (final measured LUFS and true peak are in the d13b report)."
    },
    {
      "title": "75 CC0 Breaking/Falling/Hit SFX",
      "url": "https://opengameart.org/content/75-cc0-breaking-falling-hit-sfx",
      "author": "rubberduck",
      "licence": "CC0-1.0",
      "download": "brk.zip",
      "files": [
        "assets/audio/item_drop_wood-01.ogg",
        "assets/audio/item_drop_wood-02.ogg",
        "assets/audio/pouch_take-01.ogg",
        "assets/audio/melee_hit_fist-01.ogg"
      ],
      "changes": "Selected two wooden item-drop clips, a pouch-handling clip, and a placeholder fist hit; trimmed leading silence, faded tails, converted to 24 kHz mono Opus in Ogg, and applied loudness normalization plus true-peak limiting (final measured LUFS and true peak are in the d13b report). The fist-hit placeholder is wired to the live and restored melee-action path when the fists profile is active."
    },
    {
      "title": "BR csound gunshot synthesis",
      "url": null,
      "author": "BR",
      "licence": "NONE",
      "download": null,
      "files": [
        "assets/audio/gunshot-akm-01.ogg",
        "assets/audio/gunshot-akm-02.ogg",
        "assets/audio/gunshot-akm-pbs1-01.ogg",
        "assets/audio/gunshot-akm-pbs1-02.ogg"
      ],
      "changes": "BR's original synthetic csound shots. Trimmed trailing silence only, then converted from 48 kHz 24-bit stereo WAV to 48 kHz stereo Opus in Ogg without gain processing."
    },
    {
      "title": "BR M4 shot synthesis",
      "url": null,
      "author": "BR",
      "licence": "CC0-1.0",
      "download": "m4sup1_single_sc_field_v2.wav",
      "files": ["assets/audio/gunshot-m4-suppressed-01.ogg"],
      "changes": "BR's original synthesised suppressed M4 shot. Trimmed trailing silence only, then converted from 48 kHz 16-bit stereo WAV to 48 kHz stereo Opus in Ogg without gain processing."
    },
    {
      "title": "Project-built low-poly hand-tool and content stand-ins",
      "url": "https://github.com/roobie/skelly",
      "author": "Skelly contributors",
      "licence": "CC0-1.0",
      "download": null,
      "files": [
        "assets/models/lamp_oil_bottle.glb",
        "assets/models/glass_shards.glb",
        "assets/models/wood_offcut.glb",
        "assets/models/rubber_strip.glb",
        "assets/models/circuit_board.glb",
        "assets/models/glass_lens.glb",
        "assets/models/cloth_bundle.glb",
        "assets/models/stab_vest.glb",
        "assets/models/riot_helmet.glb",
        "assets/models/riot_helmet_view.glb",
        "assets/models/night_vision_goggles.glb",
        "assets/models/sewing_kit.glb",
        "assets/models/broken_toaster.glb",
        "assets/models/table_fan.glb",
        "assets/models/cracked_phone.glb",
        "assets/models/broken_clock.glb",
        "assets/models/electrical_repair_kit.glb",
        "assets/models/glass_bulb.glb",
        "assets/models/glowstick.glb",
        "assets/models/paper_sheet.glb",
        "assets/models/folded_note.glb",
        "assets/models/notebook.glb"
      ],
      "changes": "Built from primitive meshes for readable ground-pile silhouettes; no external asset source or texture is used."
    },
    {
      "title": "Heartbeat Sounds",
      "url": "https://opengameart.org/content/heartbeat-sounds",
      "author": "bart",
      "licence": "CC0-1.0",
      "download": null,
      "files": ["assets/audio/heartbeat-slow-beat.ogg", "assets/audio/heartbeat-fast-beat.ogg"],
      "changes": "Converted the dry slow and fast recordings to mono Opus in Ogg containers; excluded the reverb variants; peak-normalized the existing recordings with gain only (slow +10.9 dB, fast +11 dB) to about −1 dBFS"
    },
    {
      "title": "BR project-recorded nope voice",
      "url": "https://github.com/roobie/skelly",
      "author": "BR",
      "licence": "CC0-1.0",
      "download": null,
      "files": ["assets/audio/player-nope-01.ogg"],
      "changes": "Recorded by BR for the project; converted from 48 kHz stereo PCM WAV to 48 kHz mono Opus in an Ogg container without gain processing."
    }
  ]
}
