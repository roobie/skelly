local recipe = import 'packages/gun-authoring-tool/exports/deadvox.jsonnet';
local things = import '../exports/things.jsonnet';
local exportFiles = import 'tools/jsonnet/lib/export-files.libsonnet';
{
  sources: [
    {
      title: 'Gungen authored model exports',
      url: 'https://github.com/roobie/skelly/blob/main/packages/gun-authoring-tool/exports/deadvox.jsonnet',
      author: 'Skelly contributors',
      licence: 'CC0-1.0',
      download: null,
      files: exportFiles(recipe),
      changes: 'Original project-built geometry exported from the authored recipe in metres, +x forward and +y up. Cartridge dimensions come from the recipe sources; unsupported internal dimensions remain visual proxies.',
    },
    {
      title: 'Thing tool authored models',
      url: 'https://github.com/roobie/skelly/blob/main/packages/mods/skelly.firearms/exports/things.jsonnet',
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
      "title": "Gun Reload Sound Effects",
      "url": "https://opengameart.org/content/gun-reload-sound-effects",
      "author": "BMacZero",
      "licence": "CC0-1.0",
      "download": "clipload1.wav, clipload2.wav",
      "files": ["assets/audio/magazine-clipload-01.ogg", "assets/audio/magazine-clipload-02.ogg"],
      "changes": "Whole files, 0–0.255 s and 0–0.209 s. Mono 48 kHz Vorbis q5, float peak -2 dBFS, 20 ms tail fade."
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
  ],
}
