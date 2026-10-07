export function bufferPlaywrightDebugOutput(write) {
  let output = '';
  const callbacks = [];
  return {
    write(chunk, ...args) {
      const encoding = args.find((arg) => typeof arg === 'string');
      const message = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString(encoding);
      if (!message.includes('pw:browser')) {
        return write(chunk, ...args);
      }
      output += message;
      const callback = args.find((arg) => typeof arg === 'function');
      if (callback) {
        callbacks.push(callback);
      }
      return true;
    },
    flush() {
      if (output) {
        write(output);
      }
      output = '';
      for (const callback of callbacks.splice(0)) {
        callback();
      }
    },
    discard() {
      output = '';
      for (const callback of callbacks.splice(0)) {
        callback();
      }
    },
  };
}
