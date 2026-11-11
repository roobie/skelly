// Debug spawn keys live beside the actors they name, so the shared controls stay valid in a stack without these actors.
local spawn(actor, code) = { id: 'debug.spawn-actor.' + actor, keys: [{ code: code }] };

{
  controls: [
    spawn('runner', 'Numpad1'),
    spawn('crawler', 'Numpad2'),
    spawn('amalgam', 'Numpad4'),
    spawn('acid_zombie', 'Numpad6'),
  ],
}
